import "server-only";

import { and, count, countDistinct, eq } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { classrooms, enrollments, schoolMemberships, students } from "@/lib/db/schema";
import { getSchoolBusinessDate } from "@/lib/date";
import {
  getAttendanceSummaryForContext,
  listAttendanceSlotsForContext,
  type AttendanceSlot,
  type AttendanceSummary,
} from "@/features/attendance/queries";
import { resolveAttendanceWindow, type AttendanceOccurrenceState } from "@/features/attendance/window";
import { teacherClassroomAccessCondition } from "@/features/scheduling/policy";

/**
 * The dashboard, in two shapes.
 *
 * An administrator and a teacher open the same screen with different questions, and
 * the difference is not decoration: the admin is asking whether the school's day is
 * being recorded at all, and the teacher is asking which of their own periods they
 * owe a register for. Serving both from one read would mean either showing a teacher
 * school-wide figures they have no business ranking themselves against, or showing an
 * admin one classroom's worth of a school they are responsible for. So the split is
 * made here, on the role the membership already carries, and the result is a union
 * the page narrows on — a teacher's payload has no school-wide field to render by
 * mistake, because the field is not there.
 *
 * Both shapes are built from the same role-scoped slot list the attendance page uses,
 * which already excludes any period the week has not handed to the asking teacher.
 * Nothing here re-derives responsibility, shifts, or deadlines: those live in
 * `listAttendanceSlotsForContext` and `resolveAttendanceWindow`, and the dashboard
 * only counts what they returned — so it cannot report an occurrence the register
 * would refuse to open.
 */

export type DashboardSlotSummary = {
  classroomId: string;
  periodId: string;
  classroomName: string;
  periodOrdinal: number;
  subjectNames: string[];
  startTime: string;
  endTime: string;
  state: AttendanceOccurrenceState;
  sessionId: string | null;
  /** True when the week alternates this period with another teacher. */
  rotates: boolean;
  teacherName: string;
  nextWeekTeacherName: string | null;
};

/** One occurrence the reader still owes something for, most urgent first. */
export type DashboardAttentionItem = {
  classroomId: string;
  periodId: string;
  classroomName: string;
  periodOrdinal: number;
  state: AttendanceOccurrenceState;
  detail: string;
};

/** Figures that only make sense for someone responsible for the whole school. */
export type SchoolOverview = {
  classroomCount: number;
  studentCount: number;
  teacherCount: number;
  submittedCount: number;
  pendingCount: number;
  missingCount: number;
};

/** Figures that are a teacher's own, over the occurrences the week gave them. */
export type TeacherOverview = {
  classroomCount: number;
  /** Distinct students across the classes this teacher holds an hour in. */
  studentCount: number;
  assignedPeriodCount: number;
  submittedPeriodCount: number;
  pendingPeriodCount: number;
  missingPeriodCount: number;
  /** Periods this teacher holds this week that alternate with another teacher. */
  rotatingPeriodCount: number;
};

export type DashboardData = {
  schoolName: string;
  date: string;
  attendance: AttendanceSummary;
  slots: DashboardSlotSummary[];
  attention: DashboardAttentionItem[];
  /** Present for a School Admin; null for a teacher. */
  overview: SchoolOverview | null;
  /** Present for a teacher; null for a School Admin. */
  teacherOverview: TeacherOverview | null;
};

/** The window state of a slot, resolved for the asking role. */
function stateOf(slot: AttendanceSlot, now: Date, role: ActiveSchoolMembership["role"]) {
  return resolveAttendanceWindow({
    now,
    periodStartAt: slot.periodStartAt,
    periodEndAt: slot.periodEndAt,
    submissionDeadlineAt: slot.submissionDeadlineAt,
    hasSession: slot.sessionId !== null,
    sessionClosed: slot.sessionClosed,
    role,
  }).state;
}

const URGENCY: Record<AttendanceOccurrenceState, number> = {
  EXPIRED: 0,
  GRACE: 1,
  OPEN: 2,
  UPCOMING: 3,
  SUBMITTED: 4,
  CLOSED: 5,
};

/**
 * The occurrences worth putting in front of the reader, most urgent first.
 *
 * Urgency is the window state rather than the hour, because a period past its
 * deadline is a problem now and one not yet begun is just the shape of the day —
 * ordering by clock time would put a settled morning above an overdue one. Only
 * occurrences still owed are listed; a submitted register is what the count beside it
 * is for, and repeating all of them would bury the ones that need an action.
 */
function attentionFrom(slots: readonly { slot: AttendanceSlot; state: AttendanceOccurrenceState }[]): DashboardAttentionItem[] {
  return slots
    .filter((entry) => URGENCY[entry.state] <= URGENCY.OPEN)
    .sort((left, right) => URGENCY[left.state] - URGENCY[right.state] || left.slot.startTime.localeCompare(right.slot.startTime))
    .slice(0, 6)
    .map(({ slot, state }) => ({
      classroomId: slot.classroomId,
      periodId: slot.periodId,
      classroomName: slot.classroomName,
      periodOrdinal: slot.periodOrdinal,
      state,
      detail: state === "EXPIRED"
        ? `بدون ثبت و گذشته از مهلت`
        : state === "GRACE"
          ? `داخل مهلت ثبت`
          : state === "OPEN"
            ? `همین حالا قابل ثبت`
            : `هنوز آغاز نشده`,
    }));
}

/**
 * School-wide figures, each a real count over the school's own rows.
 *
 * Every one is a query rather than a stored number, for the same reason the
 * assigned-hours report reads the timetable: a counter kept beside the data is a
 * second source of truth that drifts the first time a path forgets to update it.
 * "Teacher" counts active teacher memberships, which is the set that can actually be
 * scheduled and can sign in — a suspended or pending membership is not a teacher the
 * school currently has.
 *
 * The three occurrence counts are read off the resolved windows rather than from the
 * sessions table, because "missing" is not the absence of a row: it is the absence of
 * a row on an occurrence whose deadline has passed, which only the resolver knows.
 */
async function getSchoolOverview(context: ActiveSchoolMembership, resolved: readonly { state: AttendanceOccurrenceState }[]): Promise<SchoolOverview> {
  const db = getDb();
  const [classroomRows, studentRows, teacherRows] = await Promise.all([
    db.select({ value: count() }).from(classrooms).where(and(eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"))),
    db.select({ value: count() }).from(students).where(and(eq(students.schoolId, context.schoolId), eq(students.status, "ACTIVE"))),
    db.select({ value: count() }).from(schoolMemberships).where(and(
      eq(schoolMemberships.schoolId, context.schoolId),
      eq(schoolMemberships.role, "TEACHER"),
      eq(schoolMemberships.status, "ACTIVE"),
    )),
  ]);
  return {
    classroomCount: Number(classroomRows[0]?.value ?? 0),
    studentCount: Number(studentRows[0]?.value ?? 0),
    teacherCount: Number(teacherRows[0]?.value ?? 0),
    submittedCount: resolved.filter((entry) => entry.state === "SUBMITTED" || entry.state === "CLOSED").length,
    pendingCount: resolved.filter((entry) => entry.state === "OPEN" || entry.state === "GRACE").length,
    missingCount: resolved.filter((entry) => entry.state === "EXPIRED").length,
  };
}

/**
 * A teacher's own figures, each scoped by the same condition that grants them access.
 *
 * The class and student counts reuse `teacherClassroomAccessCondition` — the single
 * statement of "a teacher's claim to a class is a timetable hour in it" — rather than
 * restating it, so a teacher's dashboard and their roster access cannot disagree about
 * which classes are theirs. The period counts come from the slot list, so they are
 * already filtered to the weeks the rotation names this teacher.
 */
async function getTeacherOverview(context: ActiveSchoolMembership, resolved: readonly { slot: AttendanceSlot; state: AttendanceOccurrenceState }[]): Promise<TeacherOverview> {
  const db = getDb();
  const [classroomRows, studentRows] = await Promise.all([
    db.select({ value: countDistinct(classrooms.id) }).from(classrooms).where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
      teacherClassroomAccessCondition(context),
    )),
    db.select({ value: countDistinct(enrollments.studentId) })
      .from(enrollments)
      .innerJoin(students, and(eq(students.id, enrollments.studentId), eq(students.schoolId, context.schoolId), eq(students.status, "ACTIVE")))
      .innerJoin(classrooms, and(eq(classrooms.id, enrollments.classroomId), eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE")))
      .where(and(
        eq(enrollments.schoolId, context.schoolId),
        eq(enrollments.status, "ACTIVE"),
        teacherClassroomAccessCondition(context),
      )),
  ]);
  return {
    classroomCount: Number(classroomRows[0]?.value ?? 0),
    studentCount: Number(studentRows[0]?.value ?? 0),
    assignedPeriodCount: resolved.length,
    submittedPeriodCount: resolved.filter((entry) => entry.state === "SUBMITTED" || entry.state === "CLOSED").length,
    pendingPeriodCount: resolved.filter((entry) => entry.state === "OPEN" || entry.state === "GRACE").length,
    missingPeriodCount: resolved.filter((entry) => entry.state === "EXPIRED").length,
    rotatingPeriodCount: resolved.filter((entry) => entry.slot.rotates).length,
  };
}

export async function getDashboardDataForContext(context: ActiveSchoolMembership): Promise<DashboardData> {
  const date = getSchoolBusinessDate(context.school.timezone);
  const now = new Date();
  const [attendance, slots] = await Promise.all([
    getAttendanceSummaryForContext(context),
    listAttendanceSlotsForContext(context, date),
  ]);
  const resolved = slots.map((slot) => ({ slot, state: stateOf(slot, now, context.role) }));

  const [overview, teacherOverview] = await Promise.all([
    context.role === "SCHOOL_ADMIN" ? getSchoolOverview(context, resolved) : null,
    context.role === "TEACHER" ? getTeacherOverview(context, resolved) : null,
  ]);

  return {
    schoolName: context.school.name,
    date,
    attendance,
    slots: resolved.map(({ slot, state }) => ({
      classroomId: slot.classroomId,
      periodId: slot.periodId,
      classroomName: slot.classroomName,
      periodOrdinal: slot.periodOrdinal,
      subjectNames: slot.subjectNames,
      startTime: slot.startTime,
      endTime: slot.endTime,
      state,
      sessionId: slot.sessionId,
      rotates: slot.rotates,
      teacherName: slot.teacherName,
      nextWeekTeacherName: slot.nextWeekTeacherName,
    })),
    attention: attentionFrom(resolved),
    overview,
    teacherOverview,
  };
}

export async function getDashboardData(options: { headers: Headers }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getDashboardDataForContext(context);
}
