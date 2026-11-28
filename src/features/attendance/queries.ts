import "server-only";

import { and, asc, countDistinct, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears, attendanceRecords, attendanceSessions, classrooms, enrollments, grades, schoolMemberships, schoolPeriods, students, subjects, timetableEntries, users } from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";
import { teacherClassroomAccessCondition } from "@/features/scheduling/policy";
import { getSchoolTimetableSettings } from "@/features/scheduling/queries";
import { academicWeekNumber, resolveApplicableShift, resolveAttendanceRotationTeacher, resolvePeriodTimes, schoolDayOfWeek } from "@/features/scheduling/week";
import { getSchoolBusinessDate, addMinutes, schoolLocalDateTimeToInstant } from "@/lib/date";
import { resolveAttendanceWindow, isAttendancePeriodActive, type AttendanceOccurrenceState } from "./window";
import type { AttendanceSubmissionStatus } from "./schema";

export { getSchoolBusinessDate } from "@/lib/date";

export async function listAttendanceClassroomsForContext(context: ActiveSchoolMembership) {
  const db = getDb();
  if (context.role === "SCHOOL_ADMIN") {
    return db.select({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
      .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .where(and(eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"), eq(academicYears.status, "ACTIVE")))
      .orderBy(asc(classrooms.name));
  }

  return db.selectDistinct({ classroom: classrooms, academicYear: academicYears }).from(classrooms)
    .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    .where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
      eq(academicYears.status, "ACTIVE"),
      teacherClassroomAccessCondition(context),
    ))
    .orderBy(asc(classrooms.name));
}

/**
 * The periods a teacher or class still owes attendance for on a date.
 *
 * Attendance is submitted per period, so the useful question is "which of today's
 * periods are unsubmitted". A period whose two hours are two different teachers and
 * two different subjects is *one* row here, not two: the week hands the whole
 * period to one of them, and that is the register the school takes. A period one
 * teacher holds outright is one row whose teacher is that teacher.
 *
 * Who the week names is resolved here rather than stored, so the answer is always
 * a function of the date being looked at — past, present, or future — and cannot
 * drift from the timetable. For a teacher the row is included only when the week
 * names them, which is what makes the other teacher's day not contain it.
 */
export type AttendanceSlot = {
  classroomId: string;
  classroomName: string;
  /** The class's grade, so an administrator can browse the day one grade at a time. */
  gradeId: string;
  gradeName: string;
  /** The grade's configured order, so the grade picker keeps the school's own sequence. */
  gradeSortOrder: number;
  /** The lesson(s) the period holds, in hour order — one name, or two when split. */
  subjectNames: string[];
  shiftName: string;
  periodId: string;
  periodLabel: string;
  periodOrdinal: number;
  startTime: string;
  endTime: string;
  /** The teacher the week names, or the period's only teacher. */
  teacherMembershipId: string;
  teacherName: string;
  /**
   * The period's *other* teacher — the one who takes it next week, since the two
   * alternate. Null when the period does not rotate.
   *
   * This is deliberately not `teacherIds[1]`: in the partner's own week that index
   * names the teacher already holding the period, so the field would report the
   * reader as their own successor. It is derived as "the teacher who is not this
   * week's", which is the same person in both weeks and therefore the correct answer
   * to "who has it next time".
   */
  nextWeekTeacherMembershipId: string | null;
  nextWeekTeacherName: string | null;
  /** True when the period alternates weekly between two teachers. */
  rotates: boolean;
  /** 1-based week of the academic year this date falls in. */
  academicWeekNumber: number;
  /**
   * The occurrence's window, as instants rather than as a pre-judged state.
   *
   * The start and the end are what the shift this date falls in says the period
   * runs at, resolved to absolute instants in the school's zone, and the deadline
   * is the end plus the school's grace period. They cross to the interface as
   * instants — not as a state word — so the page can re-judge the same occurrence as
   * the clock moves without another read, and can judge it with the *same* function
   * the write path uses (`resolveAttendanceWindow`) rather than with a second copy
   * of the rule.
   */
  periodStartAt: Date;
  periodEndAt: Date;
  /** The stored deadline once a session exists, so a register keeps the deadline it was written to; otherwise the one this date would produce. */
  submissionDeadlineAt: Date;
  sessionId: string | null;
  sessionStatus: "OPEN" | "CLOSED" | null;
  /** Whether the register has been closed. Nothing closes one yet; read so the interface cannot ignore it when something does. */
  sessionClosed: boolean;
};

export async function listAttendanceSlotsForContext(
  context: ActiveSchoolMembership,
  businessDate: string,
  classroomId?: string,
  periodId?: string,
  gradeId?: string,
): Promise<AttendanceSlot[]> {
  const dayOfWeek = schoolDayOfWeek(businessDate);
  const rows = await getDb().select({
    entry: timetableEntries,
    classroom: classrooms,
    grade: grades,
    subject: subjects,
    year: academicYears,
    session: attendanceSessions,
  }).from(timetableEntries)
    .innerJoin(classrooms, and(eq(classrooms.id, timetableEntries.classroomId), eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE")))
    .innerJoin(grades, and(eq(grades.id, classrooms.gradeId), eq(grades.schoolId, context.schoolId), eq(grades.status, "ACTIVE")))
    .innerJoin(subjects, and(eq(subjects.id, timetableEntries.subjectId), eq(subjects.schoolId, context.schoolId)))
    .innerJoin(academicYears, and(eq(academicYears.id, timetableEntries.academicYearId), eq(academicYears.schoolId, context.schoolId)))
    // The session is looked up by period, not by hour: a split period is one
    // register, so both of its hours join the same session and the two rows are
    // collapsed below.
    .leftJoin(attendanceSessions, and(
      eq(attendanceSessions.periodId, timetableEntries.periodId),
      eq(attendanceSessions.classroomId, timetableEntries.classroomId),
      eq(attendanceSessions.schoolId, context.schoolId),
      eq(attendanceSessions.businessDate, businessDate),
    ))
    .where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.status, "ACTIVE"),
      eq(timetableEntries.dayOfWeek, dayOfWeek),
      classroomId ? eq(timetableEntries.classroomId, classroomId) : undefined,
      // Narrowed in the query rather than after grouping, because a period filter is
      // a statement about which scheduled hours exist at all: the rows that survive
      // are the ones the register is built from, so the responsible-teacher and
      // subject resolution below sees only the filtered period's hours.
      periodId ? eq(timetableEntries.periodId, periodId) : undefined,
      // The grade narrows the classes the day is browsed by, not the occurrences
      // within a class, so it is applied to the join's class rather than to the
      // period: a grade is a property of the class and cannot cut a period in half.
      gradeId ? eq(classrooms.gradeId, gradeId) : undefined,
    ));
  const periods = await getDb().select().from(schoolPeriods).where(eq(schoolPeriods.schoolId, context.schoolId));
  const periodById = new Map(periods.map((period) => [period.id, period]));
  const settings = await getSchoolTimetableSettings(context);
  // The shift is a property of the date, not of any one period, so it is resolved
  // once for the whole read rather than inside the loop below — the same answer every
  // time, and a clock read per period is a per-row cost for no extra truth.
  const applicableShift = resolveApplicableShift(businessDate, {
    shiftType: settings.shiftType,
    rotationBaseDate: settings.rotationBaseDate,
  });

  // Group the day's hours into the periods they belong to, so a split period
  // becomes one slot. Keyed by classroom and period because two classes can share a
  // period ordinal.
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.entry.classroomId}:${row.entry.periodId}`;
    const existing = grouped.get(key);
    if (existing) existing.push(row);
    else grouped.set(key, [row]);
  }

  const slots: AttendanceSlot[] = [];
  for (const group of grouped.values()) {
    group.sort((left, right) => left.entry.hourIndex - right.entry.hourIndex);
    const first = group[0];
    const period = periodById.get(first.entry.periodId);
    if (!period) continue;

    // A period rotates only when its hours name two different teachers. Two hours
    // that share one teacher are that teacher's period, and the school's rule for a
    // single-teacher period is that they own it every week.
    const teacherIds = [...new Set(group.map((row) => row.entry.teacherMembershipId))];
    const rotates = teacherIds.length === 2;
    const baseTeacherId = teacherIds[0];
    const rotationTeacherId = resolveAttendanceRotationTeacher(
      rotates ? { baseTeacherMembershipId: baseTeacherId, partnerTeacherMembershipId: teacherIds[1] } : null,
      first.year.startDate,
      businessDate,
    );
    const teacherMembershipId = rotationTeacherId ?? baseTeacherId;
    // The other teacher, which is who takes the period next week — not `teacherIds[1]`.
    // The two are the same only in the base teacher's week; in the partner's own week
    // `teacherIds[1]` *is* the teacher holding it now, so reporting it as "the teacher
    // it alternates with next week" named the reader themselves.
    const otherTeacherId = rotates ? teacherIds.find((id) => id !== teacherMembershipId) ?? null : null;

    // The other teacher sees their class but not this period in their own list: it
    // is not theirs to submit this week.
    if (context.role === "TEACHER" && teacherMembershipId !== context.membershipId) continue;

    const nameByMembership = await resolveMembershipNames(context, [teacherMembershipId, otherTeacherId].filter((id): id is string => Boolean(id)));
    // The times the period actually runs at on this date, from the shift the school
    // is in — so a rotating school's afternoon row shows the afternoon schedule
    // rather than the morning one.
    const periodTimes = resolvePeriodTimes(period, applicableShift);
    // The period's window as absolute instants: the bell, the end, and the end plus
    // the school's grace period. Resolving them here rather than in the component is
    // what keeps the school's zone and its shift in one place — the interface only
    // compares instants, and cannot accidentally read a wall clock as a UTC one.
    const periodStartAt = schoolLocalDateTimeToInstant(businessDate, periodTimes.startTime, context.school.timezone);
    const periodEndAt = schoolLocalDateTimeToInstant(businessDate, periodTimes.endTime, context.school.timezone);
    // An existing register keeps the deadline it was written to, so editing it is
    // judged against the policy in force when it was submitted; a register not yet
    // taken is judged against today's policy.
    const submissionDeadlineAt = first.session?.submissionDeadlineAt
      ?? addMinutes(periodEndAt, settings.attendanceSubmissionMinutes);
    slots.push({
      classroomId: first.classroom.id,
      classroomName: first.classroom.name,
      gradeId: first.grade.id,
      gradeName: first.grade.name,
      gradeSortOrder: first.grade.sortOrder,
      subjectNames: group.map((row) => row.subject.name),
      shiftName: applicableShift === "MORNING" ? "صبح" : "بعدازظهر",
      periodId: period.id,
      periodLabel: String(period.ordinal),
      periodOrdinal: period.ordinal,
      startTime: periodTimes.startTime,
      endTime: periodTimes.endTime,
      teacherMembershipId,
      teacherName: nameByMembership.get(teacherMembershipId) ?? "",
      nextWeekTeacherMembershipId: otherTeacherId,
      nextWeekTeacherName: otherTeacherId ? nameByMembership.get(otherTeacherId) ?? null : null,
      rotates,
      academicWeekNumber: academicWeekNumber(first.year.startDate, businessDate),
      periodStartAt,
      periodEndAt,
      submissionDeadlineAt,
      sessionId: first.session?.id ?? null,
      sessionStatus: first.session?.status ?? null,
      sessionClosed: first.session?.status === "CLOSED",
    });
  }
  return slots.sort(compareSlots);
}

/**
 * The day's order: by bell, then by class name.
 *
 * Named and shared rather than written twice, because the list is re-sorted after an
 * opened register is added back to it, and two copies of an ordering is how a list
 * ends up in two different orders depending on which path built it.
 */
export function compareSlots(left: AttendanceSlot, right: AttendanceSlot): number {
  return left.startTime.localeCompare(right.startTime)
    || left.classroomName.localeCompare(right.classroomName);
}

/**
 * Display names for school memberships.
 *
 * Used for the teachers a slot names and for the administrator who edited a record —
 * both are memberships of this school, and both are being turned into something a
 * person reads. The read is scoped to the school, so a membership id from anywhere
 * else resolves to nothing rather than to a name.
 */
async function resolveMembershipNames(context: ActiveSchoolMembership, membershipIds: readonly string[]) {
  if (membershipIds.length === 0) return new Map<string, string>();
  const rows = await getDb().select({ id: schoolMemberships.id, name: users.name }).from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(and(eq(schoolMemberships.schoolId, context.schoolId), inArray(schoolMemberships.id, [...membershipIds])));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * Everything the attendance page draws for one date: its periods, the one that is
 * open, the class's effective roster, and any statuses already recorded.
 *
 * The existing statuses are read here rather than left to the component because a
 * register that has been taken must open showing what was recorded, not a fresh
 * row of "present" that a teacher could save over yesterday's correction without
 * noticing. They are keyed by enrollment, which is what a record is written
 * against, so the component needs no second mapping.
 *
 * Three ideas are kept apart here, deliberately:
 *
 * - The *scope* is the grade an administrator is browsing, and it is never empty:
 *   a school's day is read a grade at a time, so an unset grade means "the first one
 *   with classes today", not "all of them".
 * - The *filters* narrow within that scope — class, period, and submission status —
 *   and they combine by intersection.
 * - The *open register* is which occurrence's roster is on screen. It is a separate
 *   option rather than the filter pair, because opening a card is asking to look at
 *   one register and must not rewrite the list being browsed.
 *
 * The submission-status filter is applied to the resolved slots rather than in SQL,
 * because it is a fact about the occurrence's window — "missing" means past its
 * deadline unregistered — which is only knowable once the day's slots have been
 * resolved against the shift and this week's rotation. It narrows the *list*, never
 * the class and period options: those are drawn from the unfiltered scope so that
 * choosing a status cannot make the class you were about to pick disappear.
 */
export async function getAttendanceWorkspaceForContext(
  context: ActiveSchoolMembership,
  options: { businessDate?: string; gradeId?: string; periodId?: string; classroomId?: string; submissionStatus?: AttendanceSubmissionStatus; openSlotKey?: string; onlyActivePeriod?: boolean } = {},
) {
  const businessDate = options.businessDate ?? getSchoolBusinessDate(context.school.timezone);
  const timezone = context.school.timezone;
  // The instant the page was resolved at, carried to the interface as an ISO string
  // so the first paint and the hydration paint judge the same clock. The interface
  // then ticks from the browser's own clock; this is only where it starts.
  const serverNow = new Date().toISOString();
  const now = new Date(serverNow);
  // One unfiltered read of the day, for the scope and the pickers, and one narrowed
  // read for the list. Two reads rather than one because the two answer different
  // questions: the pickers describe what the day offers, and the list describes what
  // matches the filters within the chosen grade.
  const daySlots = await listAttendanceSlotsForContext(context, businessDate);
  const allSlots = daySlots ?? [];
  // An administrator always has a grade: theirs, or the first one the day holds —
  // ordered by the school's own grade order, so "first" means first in the structure
  // rather than first in whatever order the rows arrived.
  const gradeScopeId = context.role === "SCHOOL_ADMIN"
    ? options.gradeId ?? firstGradeId(allSlots)
    : null;
  // The grade's own day, before any filter and before the reading of the day narrows
  // to what is in session. This is the denominator the filter bar reports against: it
  // is what the administrator is browsing, and neither a filter nor a view may change
  // it, or the bar would say the day shrank when the reader merely narrowed their view
  // of it. For a teacher the scope is already their own occurrences, so it is the same
  // list.
  const gradeDaySlots = gradeScopeId ? allSlots.filter((slot) => slot.gradeId === gradeScopeId) : allSlots;
  // The narrowed read carries the grade as well as the class and period, so the scope
  // survives a filter. Reading the two in parallel would mean the filtered read did not
  // yet know the scope, and the grade would quietly drop out of the page whenever a
  // class or period filter was also set — which is the fault this ordering prevents.
  const scopedSlots = options.classroomId || options.periodId
    ? await listAttendanceSlotsForContext(context, businessDate, options.classroomId, options.periodId, gradeScopeId ?? undefined)
    : gradeDaySlots;
  const withStatus = options.submissionStatus
    ? scopedSlots.filter((slot) => slotMatchesSubmissionStatus(occurrenceStateFor(slot, now, context.role), options.submissionStatus!))
    : scopedSlots;
  // "Today's schedule" is the periods in session at this minute.
  const isActive = (slot: AttendanceSlot) => isAttendancePeriodActive({ now, periodStartAt: slot.periodStartAt, periodEndAt: slot.periodEndAt });
  // Counted against the grade's whole day rather than against the filtered list, so
  // the reading is "does this grade have a class in session" — a question the class
  // and status filters must not be able to answer "no" to, or an administrator who
  // filtered to one class would be told the school has nothing running.
  const activeSlotCount = gradeDaySlots.filter(isActive).length;
  const activeOnly = options.onlyActivePeriod === true;
  let slots = activeOnly ? withStatus.filter(isActive) : withStatus;
  // An opened register is added back if the reading has hidden it. Asking to look at a
  // particular occurrence is a request for that occurrence, so it must be on screen
  // whatever the reading is — while the reading itself is left alone, because widening
  // it would be a view change the administrator did not ask for. The card reappears in
  // the strip beside the in-session ones, which is what keeps the selection visible
  // rather than open off-list.
  if (options.openSlotKey) {
    const opened = withStatus.find((slot) => slotKeyFor(slot) === options.openSlotKey);
    if (opened && !slots.includes(opened)) slots = [...slots, opened].sort(compareSlots);
  }
  // The open register is found by its own key, and only among what is actually
  // listed: a card that a filter has hidden must not stay open, or the page would
  // show a register the list says is not there. Absent a key the day opens on its
  // first occurrence, which is what a fresh visit to the page should show.
  const selected = options.openSlotKey
    ? slots.find((slot) => slotKeyFor(slot) === options.openSlotKey) ?? null
    : slots[0] ?? null;
  const filterOptions = buildAttendanceFilterOptions(allSlots, gradeScopeId);
  if (!selected) {
    return {
      businessDate, timezone, serverNow, slots, slot: null, students: [] as AttendanceWorkspaceStudent[],
      recordedCount: 0, filterOptions, totalSlotCount: gradeDaySlots.length, gradeScopeId,
      daySlotCount: allSlots.length, activeSlotCount, activeOnly,
    };
  }
  const roster = await listEffectiveClassroomStudentsForContext(context, { classroomId: selected.classroomId, businessDate });
  // The admin-edit pair is read alongside the status so the register can mark the
  // rows the office has changed. The editor's name is resolved separately — only for
  // the rows that have one — because most registers have none and a join per row
  // would be paid for nothing.
  const savedRecords = selected.sessionId
    ? await getDb().select({
      enrollmentId: attendanceRecords.enrollmentId,
      status: attendanceRecords.status,
      note: attendanceRecords.note,
      adminEditedAt: attendanceRecords.adminEditedAt,
      adminEditedByMembershipId: attendanceRecords.adminEditedByMembershipId,
    })
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.schoolId, context.schoolId),
        eq(attendanceRecords.attendanceSessionId, selected.sessionId),
      ))
    : [];
  const editorNames = await resolveMembershipNames(
    context,
    [...new Set(savedRecords.map((record) => record.adminEditedByMembershipId).filter((id): id is string => Boolean(id)))],
  );
  const savedByEnrollment = new Map(savedRecords.map((record) => [record.enrollmentId, record]));
  const students: AttendanceWorkspaceStudent[] = roster.map(({ student, enrollment }) => {
    const saved = savedByEnrollment.get(enrollment.id);
    return {
      id: student.id,
      enrollmentId: enrollment.id,
      name: `${student.firstName} ${student.lastName}`,
      code: student.admissionNumber,
      savedStatus: saved?.status ?? null,
      savedNote: saved?.note ?? null,
      // The tag is the presence of the timestamp, not a separate boolean: one fact,
      // one place. Null means no administrator has ever changed this row.
      adminEditedAt: saved?.adminEditedAt?.toISOString() ?? null,
      adminEditedByName: saved?.adminEditedByMembershipId ? editorNames.get(saved.adminEditedByMembershipId) ?? null : null,
    };
  });
  return {
    businessDate,
    timezone,
    serverNow,
    slots,
    slot: selected,
    students,
    recordedCount: savedRecords.length,
    filterOptions,
    totalSlotCount: gradeDaySlots.length,
    gradeScopeId,
    daySlotCount: allSlots.length,
    activeSlotCount,
    activeOnly,
  };
}

/** The `classroomId:periodId` a card and its register are both addressed by. */
export function slotKeyFor(slot: { classroomId: string; periodId: string }) {
  return `${slot.classroomId}:${slot.periodId}`;
}

/**
 * The first grade the day holds, in the school's own grade order.
 *
 * "First" is the school's order, not the order rows came back in: a grade the
 * structure lists above another is the one an administrator expects to open on, and
 * a query's incidental ordering would make the default drift with the plan.
 */
function firstGradeId(slots: readonly AttendanceSlot[]): string | null {
  let best: AttendanceSlot | null = null;
  for (const slot of slots) {
    if (!best || slot.gradeSortOrder < best.gradeSortOrder || (slot.gradeSortOrder === best.gradeSortOrder && slot.gradeName.localeCompare(best.gradeName) < 0)) best = slot;
  }
  return best?.gradeId ?? null;
}

/** The classes and periods an administrator may filter by, within the chosen grade. */
export type AttendanceFilterOptions = {
  /** Every grade the day holds, so the grade picker can always offer a way back. */
  grades: { id: string; name: string }[];
  classrooms: { id: string; name: string }[];
  periods: { id: string; ordinal: number }[];
};

/**
 * The filter pickers' contents, derived from the day's full register.
 *
 * The grades are drawn from the whole day rather than the chosen scope — a picker
 * that only offered the grade you are already in would be a dead end. The classes
 * and periods are drawn from the chosen grade's own occurrences, because those are
 * the only ones the class picker can meaningfully reach: offering a class from
 * another grade would let an administrator select something their scope excludes and
 * produce an empty list with no way to see why. Both are taken *before* the class and
 * period filters narrow, so choosing a filter cannot make the option you were about
 * to switch to disappear. Each is deduplicated because one class meets in several
 * periods and one period is shared by several classes — the lists are keyed by
 * identity, not by occurrence.
 */
function buildAttendanceFilterOptions(slots: readonly AttendanceSlot[], gradeScopeId: string | null): AttendanceFilterOptions {
  const grades = new Map<string, { name: string; sortOrder: number }>();
  const classrooms = new Map<string, string>();
  const periods = new Map<string, number>();
  for (const slot of slots) {
    if (!grades.has(slot.gradeId)) grades.set(slot.gradeId, { name: slot.gradeName, sortOrder: slot.gradeSortOrder });
    if (gradeScopeId && slot.gradeId !== gradeScopeId) continue;
    classrooms.set(slot.classroomId, slot.classroomName);
    periods.set(slot.periodId, slot.periodOrdinal);
  }
  return {
    grades: [...grades.entries()].map(([id, grade]) => ({ id, name: grade.name, sortOrder: grade.sortOrder }))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map(({ id, name }) => ({ id, name })),
    classrooms: [...classrooms.entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name)),
    periods: [...periods.entries()].map(([id, ordinal]) => ({ id, ordinal })).sort((left, right) => left.ordinal - right.ordinal),
  };
}

/**
 * Which occurrence states a submission-status filter covers.
 *
 * `PENDING` is the one name that covers two states — an occurrence inside its window
 * and one inside its grace period, both of which a register may still be taken for —
 * so the mapping is to a set rather than to a single state. `MISSING` maps to
 * `EXPIRED`, which is an unregistered occurrence whose window closed; an expired one
 * that *was* registered reports as `SUBMITTED` and is therefore not missing. Naming
 * the sets here is what keeps the filter and the badge from disagreeing about which
 * occurrences each word covers.
 */
const SUBMISSION_STATUS_STATES: Record<AttendanceSubmissionStatus, readonly AttendanceOccurrenceState[]> = {
  PENDING: ["OPEN", "GRACE"],
  SUBMITTED: ["SUBMITTED", "CLOSED"],
  MISSING: ["EXPIRED"],
  UPCOMING: ["UPCOMING"],
};

function slotMatchesSubmissionStatus(state: AttendanceOccurrenceState, submissionStatus: AttendanceSubmissionStatus) {
  return SUBMISSION_STATUS_STATES[submissionStatus].includes(state);
}

/** The window state of a slot, resolved for the asking role. */
function occurrenceStateFor(slot: AttendanceSlot, now: Date, role: ActiveSchoolMembership["role"]) {
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

/**
 * A roster row as the register draws it: the student, and whatever was recorded
 * for them in this occurrence, so a correction starts from the truth.
 */
export type AttendanceWorkspaceStudent = {
  id: string;
  enrollmentId: string;
  name: string;
  code: string;
  savedStatus: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;
  savedNote: string | null;
  /** When a School Admin changed this row's status, or null if none ever has. */
  adminEditedAt: string | null;
  /** The administrator who made that change, for the tag's tooltip; null when unknown. */
  adminEditedByName: string | null;
};

export type AttendanceSummary = {
  date: string;
  classroomCount: number;
  studentCount: number;
  counts: Record<"PRESENT" | "ABSENT" | "LATE" | "EXCUSED", number>;
  /** Periods scheduled today that have no session yet. */
  pendingPeriodCount: number;
  periodCount: number;
  /** Periods whose window is open right now, whether or not they are registered. */
  openPeriodCount: number;
  /** Periods that have finished and are still unregistered past their deadline. */
  overduePeriodCount: number;
};

export async function getAttendanceSummaryForContext(context: ActiveSchoolMembership): Promise<AttendanceSummary> {
  const date = getSchoolBusinessDate(context.school.timezone);
  const [slots, classroomRows] = await Promise.all([
    listAttendanceSlotsForContext(context, date),
    listAttendanceClassroomsForContext(context),
  ]);
  const classroomIds = classroomRows.map(({ classroom }) => classroom.id);
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 } as AttendanceSummary["counts"];
  const pendingPeriodCount = slots.filter((slot) => slot.sessionId === null).length;
  // The two figures the dashboard acts on, judged by the same window resolver the
  // register itself uses: how many periods a teacher could take right now, and how
  // many closed unregistered — the ones a School Admin has to go back and fix.
  const windows = slots.map((slot) => resolveAttendanceWindow({
    now: new Date(),
    periodStartAt: slot.periodStartAt,
    periodEndAt: slot.periodEndAt,
    submissionDeadlineAt: slot.submissionDeadlineAt,
    hasSession: slot.sessionId !== null,
    sessionClosed: slot.sessionClosed,
    role: context.role,
  }));
  const openPeriodCount = windows.filter((occurrence) => occurrence.state === "OPEN" || occurrence.state === "GRACE").length;
  const overduePeriodCount = windows.filter((occurrence) => occurrence.state === "EXPIRED").length;
  if (classroomIds.length === 0) {
    return { date, classroomCount: 0, studentCount: 0, counts, pendingPeriodCount: 0, periodCount: 0, openPeriodCount: 0, overduePeriodCount: 0 };
  }

  const rows = await getDb().select({ status: attendanceRecords.status, count: countDistinct(attendanceRecords.id) })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, and(eq(attendanceSessions.id, attendanceRecords.attendanceSessionId), eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date)))
    .where(and(eq(attendanceRecords.schoolId, context.schoolId), inArray(attendanceRecords.classroomId, classroomIds)))
    .groupBy(attendanceRecords.status);
  for (const row of rows) counts[row.status] = Number(row.count);

  // Distinct students who had at least one status recorded today, rather than a
  // sum over periods: a student appears in several periods and must be counted
  // once.
  const [studentTotal] = await getDb().select({ count: countDistinct(enrollments.studentId) })
    .from(enrollments)
    .innerJoin(students, and(eq(students.id, enrollments.studentId), eq(students.schoolId, context.schoolId), eq(students.status, "ACTIVE")))
    .innerJoin(attendanceRecords, and(eq(attendanceRecords.enrollmentId, enrollments.id), eq(attendanceRecords.schoolId, context.schoolId), inArray(attendanceRecords.classroomId, classroomIds)))
    .innerJoin(attendanceSessions, and(eq(attendanceSessions.id, attendanceRecords.attendanceSessionId), eq(attendanceSessions.schoolId, context.schoolId), eq(attendanceSessions.businessDate, date)))
    .where(eq(enrollments.schoolId, context.schoolId));

  return {
    date,
    classroomCount: classroomIds.length,
    studentCount: Number(studentTotal?.count ?? 0),
    counts,
    pendingPeriodCount,
    periodCount: slots.length,
    openPeriodCount,
    overduePeriodCount,
  };
}

export async function getAttendanceWorkspace(options: { headers: Headers; businessDate?: string; gradeId?: string; periodId?: string; classroomId?: string; submissionStatus?: AttendanceSubmissionStatus; openSlotKey?: string; onlyActivePeriod?: boolean }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getAttendanceWorkspaceForContext(context, {
    businessDate: options.businessDate,
    gradeId: options.gradeId,
    periodId: options.periodId,
    classroomId: options.classroomId,
    submissionStatus: options.submissionStatus,
    openSlotKey: options.openSlotKey,
    onlyActivePeriod: options.onlyActivePeriod,
  });
}
