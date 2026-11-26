import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import {
  academicYears,
  classrooms,
  schoolMemberships,
  schoolOperatingDays,
  schoolPeriods,
  schoolSettings,
  subjects,
  teacherWeeklyHourRequirements,
  timetableEntries,
  users,
} from "@/lib/db/schema";
import { summarizeTeacherHours, DEFAULT_OPERATING_DAYS, type TeacherHourSummary } from "./week";

/**
 * The school's timetable shape: its shift, its rotation anchor, and the weekdays
 * it operates on.
 *
 * Read as one object because callers always need all three together — a page that
 * knows the shift but not the operating days cannot say whether a date is
 * schedulable, and the shift resolution itself takes the pair. `activeAcademicYearStartDate`
 * is carried alongside because it is the default the rotation anchor falls back to
 * when a rotating school has not chosen one.
 */
export type SchoolTimetableSettings = {
  shiftType: "MORNING" | "AFTERNOON" | "ROTATING";
  rotationBaseDate: string | null;
  operatingDays: number[];
  /** Whether the school has actually saved a week, as opposed to being shown the default. */
  operatingDaysConfigured: boolean;
  attendanceSubmissionMinutes: number;
  activeAcademicYearStartDate: string | null;
};

export async function getSchoolTimetableSettings(context: ActiveSchoolMembership): Promise<SchoolTimetableSettings> {
  const [settings] = await getDb().select().from(schoolSettings).where(eq(schoolSettings.schoolId, context.schoolId)).limit(1);
  const [days, activeYears] = await Promise.all([
    getDb().select({ dayOfWeek: schoolOperatingDays.dayOfWeek }).from(schoolOperatingDays)
      .where(eq(schoolOperatingDays.schoolId, context.schoolId))
      .orderBy(asc(schoolOperatingDays.dayOfWeek)),
    getDb().select({ startDate: academicYears.startDate }).from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), eq(academicYears.status, "ACTIVE")))
      .limit(1),
  ]);
  const [activeYear] = activeYears;
  return {
    // A school that has never opened the settings page has no row; defaulting to a
    // morning week is what makes the first save a real save rather than a no-op
    // against a phantom configuration.
    shiftType: settings?.shiftType ?? "MORNING",
    rotationBaseDate: settings?.rotationBaseDate ?? null,
    // No saved operating days means the school has not chosen its week yet, so the
    // ordinary Saturday-to-Wednesday week is offered pre-checked. A school that has
    // saved a week keeps exactly what it saved — the operating-day schema requires
    // at least one day, so an empty set can only ever mean "never configured". The
    // two are reported separately because a caller that needs to know whether the
    // school is *open* must not be satisfied by the default it is merely being shown.
    operatingDays: days.length > 0 ? days.map((row) => row.dayOfWeek) : [...DEFAULT_OPERATING_DAYS],
    operatingDaysConfigured: days.length > 0,
    attendanceSubmissionMinutes: settings?.attendanceSubmissionMinutes ?? 0,
    activeAcademicYearStartDate: activeYear?.startDate ?? null,
  };
}

export async function listSchoolPeriods(context: ActiveSchoolMembership) {
  return getDb().select().from(schoolPeriods)
    .where(eq(schoolPeriods.schoolId, context.schoolId))
    .orderBy(asc(schoolPeriods.ordinal));
}

export type TimetableEntryRow = {
  entry: typeof timetableEntries.$inferSelect;
  period: typeof schoolPeriods.$inferSelect;
  subject: typeof subjects.$inferSelect;
  classroom: typeof classrooms.$inferSelect;
  teacherName: string;
};

/**
 * The timetable for one academic year, optionally narrowed to one classroom.
 *
 * Teacher names are joined rather than left as ids because every rendering of a
 * timetable is a human reading it, and a second lookup per row would be work done
 * once per caller instead of once per query.
 *
 * One row per teaching hour, ordered by weekday, period, and hour within the
 * period, so a caller that wants to draw a grid can group consecutive rows of the
 * same period and get its two hours in the order they happen. Rows of one period
 * belong to the same cell, which is why the ordering puts them adjacent rather than
 * leaving the caller to match them up.
 */
export async function listTimetableForContext(
  context: ActiveSchoolMembership,
  options: { academicYearId?: string; classroomId?: string } = {},
): Promise<TimetableEntryRow[]> {
  const teacherMembership = alias(schoolMemberships, "teacher_membership");
  const teacherProfile = alias(users, "teacher_user");

  const rows = await getDb().select({
    entry: timetableEntries,
    period: schoolPeriods,
    subject: subjects,
    classroom: classrooms,
    teacherName: teacherProfile.name,
  }).from(timetableEntries)
    .innerJoin(schoolPeriods, and(
      eq(schoolPeriods.id, timetableEntries.periodId),
      eq(schoolPeriods.schoolId, context.schoolId),
    ))
    .innerJoin(subjects, and(eq(subjects.id, timetableEntries.subjectId), eq(subjects.schoolId, context.schoolId)))
    .innerJoin(classrooms, and(eq(classrooms.id, timetableEntries.classroomId), eq(classrooms.schoolId, context.schoolId)))
    .innerJoin(teacherMembership, and(
      eq(teacherMembership.id, timetableEntries.teacherMembershipId),
      eq(teacherMembership.schoolId, context.schoolId),
    ))
    .innerJoin(teacherProfile, eq(teacherProfile.id, teacherMembership.userId))
    .where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.status, "ACTIVE"),
      options.academicYearId ? eq(timetableEntries.academicYearId, options.academicYearId) : undefined,
      options.classroomId ? eq(timetableEntries.classroomId, options.classroomId) : undefined,
    ))
    .orderBy(asc(timetableEntries.dayOfWeek), asc(schoolPeriods.ordinal), asc(timetableEntries.hourIndex));

  return rows.map((row) => ({
    entry: row.entry,
    period: row.period,
    subject: row.subject,
    classroom: row.classroom,
    teacherName: row.teacherName,
  }));
}

/**
 * Active academic years for scheduling, excluding the ones that can no longer be
 * edited. A closed year is history; its timetable stays readable through explicit
 * historical queries rather than appearing in every picker.
 */
export async function listSchedulableAcademicYears(context: ActiveSchoolMembership) {
  return getDb().select().from(academicYears)
    .where(and(eq(academicYears.schoolId, context.schoolId), inArray(academicYears.status, ["DRAFT", "ACTIVE"])))
    .orderBy(asc(academicYears.startDate));
}

export async function listTeacherHourRequirementsForContext(context: ActiveSchoolMembership, academicYearId: string) {
  return getDb().select().from(teacherWeeklyHourRequirements)
    .where(and(
      eq(teacherWeeklyHourRequirements.schoolId, context.schoolId),
      eq(teacherWeeklyHourRequirements.academicYearId, academicYearId),
    ));
}

/**
 * Assigned versus required weekly hours for every teacher in a year.
 *
 * The totals come from the timetable rather than from a stored counter, so the
 * report cannot drift from the schedule it describes: adding an assignment changes
 * the answer immediately, with nothing to keep in step. The arithmetic itself is
 * in `summarizeTeacherHours`, which is pure and unit-tested.
 */
export async function getTeacherHourReportForContext(
  context: ActiveSchoolMembership,
  academicYearId: string,
): Promise<TeacherHourSummary[]> {
  const [entries, requirements] = await Promise.all([
    // One row per assignment, so the teacher id alone is what the summary needs:
    // each row is one hour, which is why nothing else is selected.
    getDb().select({ teacherMembershipId: timetableEntries.teacherMembershipId }).from(timetableEntries)
      .where(and(
        eq(timetableEntries.schoolId, context.schoolId),
        eq(timetableEntries.academicYearId, academicYearId),
        eq(timetableEntries.status, "ACTIVE"),
      )),
    listTeacherHourRequirementsForContext(context, academicYearId),
  ]);

  return summarizeTeacherHours(entries, new Map(requirements.map((row) => [row.teacherMembershipId, row.requiredWeeklyHours])));
}

export async function getTeacherHourReport(options: { headers: Headers; academicYearId: string }) {
  const context = await requireSchoolAccess({ headers: options.headers, schoolId: undefined });
  return getTeacherHourReportForContext(context, options.academicYearId);
}

/**
 * Everything the timetable grid needs for one classroom, in one read.
 *
 * Assembled here rather than in the page because the parts have to agree: the
 * teacher list is filtered to those the school has recorded mandatory hours for, the
 * assigned map and the busy map are keyed the same way the grid's cells are, and a
 * disagreement between any two of them would show an admin a schedule that is not
 * the one the server would save. Keeping the shaping in one function is what makes
 * "the grid cannot offer a teacher the service would refuse" a property of the
 * query rather than a coincidence of two lists being built the same way.
 *
 * `teacherBusyElsewhere` is read across the whole school for the year, not just this
 * classroom, because a clash is only a clash when it is in another class: the grid
 * marks the cells where the currently chosen teacher is already teaching somewhere
 * else, which is the one conflict it can know about before the request is sent.
 */
export async function getTimetableGridForContext(
  context: ActiveSchoolMembership,
  options: { classroomId: string; academicYearId: string },
) {
  const [entries, requirements, teacherRows, subjectRows, periods, classes] = await Promise.all([
    listTimetableForContext(context, { academicYearId: options.academicYearId }),
    listTeacherHourRequirementsForContext(context, options.academicYearId),
    getDb().select({
      id: schoolMemberships.id,
      userName: users.name,
    }).from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(and(
        eq(schoolMemberships.schoolId, context.schoolId),
        eq(schoolMemberships.role, "TEACHER"),
        eq(schoolMemberships.status, "ACTIVE"),
      ))
      .orderBy(asc(users.name)),
    getDb().select({ id: subjects.id, name: subjects.name }).from(subjects)
      .where(and(eq(subjects.schoolId, context.schoolId), eq(subjects.status, "ACTIVE")))
      .orderBy(asc(subjects.name)),
    getDb().select().from(schoolPeriods).where(eq(schoolPeriods.schoolId, context.schoolId)).orderBy(asc(schoolPeriods.ordinal)),
    getDb().select({ id: classrooms.id, name: classrooms.name }).from(classrooms).where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
    )).orderBy(asc(classrooms.name)),
  ]);

  const requirementByTeacher = new Map(requirements.map((row) => [row.teacherMembershipId, row.requiredWeeklyHours]));
  // A teacher with no recorded figure is not offered at all: the service refuses
  // them, so listing them would be an interface that lies about what it can do.
  const gridTeachers = teacherRows
    .map((teacher) => {
      const requiredWeeklyHours = requirementByTeacher.get(teacher.id) ?? null;
      if (requiredWeeklyHours === null || requiredWeeklyHours <= 0) return null;
      return { id: teacher.id, name: teacher.userName, requiredWeeklyHours, assigned: 0, remaining: requiredWeeklyHours };
    })
    .filter((teacher): teacher is NonNullable<typeof teacher> => teacher !== null);

  const assigned: Record<string, { teacherMembershipId: string; teacherName: string; subjectId: string; subjectName: string }> = {};
  const assignedHoursByTeacher = new Map<string, number>();
  const teacherBusyElsewhere: Record<string, string[]> = {};

  for (const row of entries) {
    const key = `${row.entry.dayOfWeek}:${row.entry.periodId}:${row.entry.hourIndex}`;
    // The grid draws one classroom, but the hours are counted and the clashes
    // detected across the whole year, so an entry in another class still counts
    // toward its teacher's total and still makes that cell busy.
    assignedHoursByTeacher.set(row.entry.teacherMembershipId, (assignedHoursByTeacher.get(row.entry.teacherMembershipId) ?? 0) + 1);
    if (row.entry.classroomId !== options.classroomId) {
      teacherBusyElsewhere[row.entry.teacherMembershipId] ??= [];
      teacherBusyElsewhere[row.entry.teacherMembershipId].push(key);
      continue;
    }
    assigned[key] = {
      teacherMembershipId: row.entry.teacherMembershipId,
      teacherName: row.teacherName,
      subjectId: row.entry.subjectId,
      subjectName: row.subject.name,
    };
  }

  const gridAssignable = gridTeachers.map((teacher) => {
    const assignedWeeklyHours = assignedHoursByTeacher.get(teacher.id) ?? 0;
    return {
      id: teacher.id,
      name: teacher.name,
      requiredWeeklyHours: teacher.requiredWeeklyHours,
      assignedWeeklyHours,
      remainingHours: Math.max(0, teacher.requiredWeeklyHours - assignedWeeklyHours),
    };
  });

  return {
    classroomId: options.classroomId,
    classroomName: classes.find((classroom) => classroom.id === options.classroomId)?.name ?? "",
    academicYearId: options.academicYearId,
    periods: periods.map((period) => ({
      id: period.id,
      ordinal: period.ordinal,
      startTime: period.startTime,
      endTime: period.endTime,
      // The grid is a week's template rather than one shift's day, so a rotating
      // school's header shows both shifts' times; a fixed school's is null and only
      // the opening pair is drawn.
      afternoonStartTime: period.afternoonStartTime,
      afternoonEndTime: period.afternoonEndTime,
    })),
    subjects: subjectRows,
    teachers: gridAssignable,
    assigned,
    teacherBusyElsewhere,
  };
}
