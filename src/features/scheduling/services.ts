import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { requireSchoolRole, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import {
  academicYears,
  attendanceRecords,
  attendanceSessions,
  classrooms,
  schoolMemberships,
  schoolOperatingDays,
  schoolPeriods,
  schoolSettings,
  subjects,
  teacherWeeklyHourRequirements,
  timetableEntries,
} from "@/lib/db/schema";
import { OUTSTANDING_HOURS_MESSAGE } from "@/features/teachers/hours";

import {
  clearTimetableHoursSchema,
  deletePeriodSchema,
  assignTimetableHoursSchema,
  setTeacherWeeklyHoursSchema,
  schoolShiftSettingsSchema,
  upsertPeriodSchema,
  type SchoolShiftSettingsInput,
  type ClearTimetableHoursInput,
  type DeletePeriodInput,
  type AssignTimetableHoursInput,
  type SetTeacherWeeklyHoursInput,
  type UpsertPeriodInput,
} from "./schema";

type SchedulingTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function requireSchedulingAdmin(headers: Headers): Promise<ActiveSchoolMembership> {
  const context = await requireSchoolRole({ headers, roles: ["SCHOOL_ADMIN"] });
  if (context.school.status !== "ACTIVE") throw new Error("مدرسه در وضعیت فعال نیست.");
  return context;
}

/**
 * A teacher who may be given periods: an active `TEACHER` membership whose
 * mandatory weekly hours are recorded.
 *
 * The hours check is what makes "a teacher without mandatory hours is not eligible
 * for timetable assignment" a property of this service rather than a convention:
 * every path that writes an assignment goes through here. The requirement is read
 * for the assignment's own academic year, because that is the year the obligation
 * was agreed for — a teacher configured for last year is not configured for this
 * one.
 */
async function assertSchedulableTeacher(
  tx: SchedulingTransaction,
  input: { schoolId: string; academicYearId: string; membershipId: string },
) {
  const [teacher] = await tx.select({ id: schoolMemberships.id }).from(schoolMemberships).where(and(
    eq(schoolMemberships.id, input.membershipId),
    eq(schoolMemberships.schoolId, input.schoolId),
    eq(schoolMemberships.role, "TEACHER"),
    eq(schoolMemberships.status, "ACTIVE"),
  )).limit(1);
  if (!teacher) throw new Error("دبیر انتخاب‌شده در این مدرسه فعال نیست.");

  const [requirements] = await tx.select({ requiredWeeklyHours: teacherWeeklyHourRequirements.requiredWeeklyHours })
    .from(teacherWeeklyHourRequirements)
    .where(and(
      eq(teacherWeeklyHourRequirements.schoolId, input.schoolId),
      eq(teacherWeeklyHourRequirements.academicYearId, input.academicYearId),
      eq(teacherWeeklyHourRequirements.teacherMembershipId, input.membershipId),
    ))
    .limit(1);
  if (!(requirements && requirements.requiredWeeklyHours > 0)) throw new Error(OUTSTANDING_HOURS_MESSAGE);
}

/** The school's settings row, created on first read so a fresh school can configure itself. */
async function ensureSettings(tx: SchedulingTransaction, schoolId: string) {
  const [existing] = await tx.select().from(schoolSettings).where(eq(schoolSettings.schoolId, schoolId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(schoolSettings).values({ schoolId }).returning();
  return created;
}

/**
 * Saves the school's shift configuration and operating days.
 *
 * One write, because the two are one decision: which days the school is open is
 * part of what "a morning school" means for scheduling, and saving them apart
 * would let a date be briefly schedulable under the old week. The operating-day
 * set is replaced wholesale rather than merged, so unchecking a day actually
 * removes it.
 *
 * Refused when it would invalidate the timetable already built against it: a
 * period can only be scheduled on a day the school operates, and an assignment
 * names a weekday, so dropping a day that has assignments would leave rows that
 * contradict the new configuration. The admin is told which day, rather than
 * discovering the conflict later on every date that falls on it.
 */
export async function updateSchoolShiftSettings(options: { headers: Headers; input: SchoolShiftSettingsInput }) {
  const context = await requireSchedulingAdmin(options.headers);
  const input = parseShiftSettings(options.input);

  return getDb().transaction(async (tx) => {
    await ensureSettings(tx, context.schoolId);
    const currentDays = await tx.select({ dayOfWeek: schoolOperatingDays.dayOfWeek }).from(schoolOperatingDays)
      .where(eq(schoolOperatingDays.schoolId, context.schoolId));
    const removedDays = currentDays.map((row) => row.dayOfWeek).filter((day) => !input.operatingDays.includes(day));

    if (removedDays.length > 0) {
      const inUse = await tx.select({ dayOfWeek: timetableEntries.dayOfWeek }).from(timetableEntries).where(and(
        eq(timetableEntries.schoolId, context.schoolId),
        eq(timetableEntries.status, "ACTIVE"),
        inArray(timetableEntries.dayOfWeek, removedDays),
      )).limit(1);
      if (inUse.length > 0) {
        throw new Error("روزی که در برنامه هفتگی استفاده شده را نمی‌توان از روزهای فعالیت حذف کرد.");
      }
      // An attendance session also names a date that must fall on an operating day,
      // so a day with any recorded history stays closed to removal too.
      const hasSessions = await tx.select({ id: attendanceSessions.id }).from(attendanceSessions)
        .where(eq(attendanceSessions.schoolId, context.schoolId)).limit(1);
      if (hasSessions.length > 0 && removedDays.length > 0) {
        throw new Error("تا زمانی که حضور و غیاب ثبت شده است، روزهای فعالیت قابل کاهش نیستند.");
      }
    }

    const [settings] = await tx.update(schoolSettings)
      .set({
        shiftType: input.shiftType,
        rotationBaseDate: input.shiftType === "ROTATING" ? input.rotationBaseDate ?? null : null,
        updatedAt: new Date(),
      })
      .where(eq(schoolSettings.schoolId, context.schoolId))
      .returning();

    await tx.delete(schoolOperatingDays).where(eq(schoolOperatingDays.schoolId, context.schoolId));
    await tx.insert(schoolOperatingDays).values(
      [...new Set(input.operatingDays)].sort((left, right) => left - right).map((dayOfWeek) => ({ schoolId: context.schoolId, dayOfWeek })),
    );

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "SCHOOL_TIMETABLE_SETTINGS_UPDATED",
      entityType: "SCHOOL_SETTINGS",
      entityId: context.schoolId,
      metadata: { shiftType: settings.shiftType, rotationBaseDate: settings.rotationBaseDate, operatingDays: input.operatingDays },
    });

    return settings;
  });
}

/** Parsed here so the base-date pairing rule is applied by the schema that declares it. */
function parseShiftSettings(input: SchoolShiftSettingsInput) {
  return schoolShiftSettingsSchema.parse(input);
}

/**
 * Creates or updates one period of the school day.
 *
 * The ordinal is assigned here rather than accepted, because the ordering is the
 * day's own structure and not an administrator's input: a new period goes after
 * the last one, and an edit keeps its position. Overlap is refused outright — a
 * period's end has to precede the next one's start — so the submission deadline,
 * which is measured from a period's end, always refers to one period.
 */
export async function upsertPeriod(options: { headers: Headers; input: UpsertPeriodInput }) {
  const context = await requireSchedulingAdmin(options.headers);
  const input = upsertPeriodSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const existingPeriods = await tx.select().from(schoolPeriods).where(eq(schoolPeriods.schoolId, context.schoolId))
      .orderBy(asc(schoolPeriods.ordinal));

    const conflicting = existingPeriods.find((period) => period.id !== input.periodId
      && input.startTime < period.endTime && period.startTime < input.endTime);
    if (conflicting) throw new Error(`این بازه زمانی با زنگ ${conflicting.ordinal} هم‌پوشانی دارد.`);

    if (input.periodId) {
      const existing = existingPeriods.find((period) => period.id === input.periodId);
      if (!existing) throw new Error("زنگ انتخاب‌شده پیدا نشد.");
      const [period] = await tx.update(schoolPeriods)
        .set({ startTime: input.startTime, endTime: input.endTime, updatedAt: new Date() })
        .where(and(eq(schoolPeriods.id, existing.id), eq(schoolPeriods.schoolId, context.schoolId)))
        .returning();
      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "SCHOOL_PERIOD_UPDATED",
        entityType: "SCHOOL_PERIOD",
        entityId: period.id,
        metadata: { ordinal: period.ordinal, startTime: period.startTime, endTime: period.endTime },
      });
      return period;
    }

    const nextOrdinal = existingPeriods.reduce((highest, period) => Math.max(highest, period.ordinal), 0) + 1;
    const [period] = await tx.insert(schoolPeriods).values({
      schoolId: context.schoolId,
      ordinal: nextOrdinal,
      startTime: input.startTime,
      endTime: input.endTime,
    }).returning();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "SCHOOL_PERIOD_CREATED",
      entityType: "SCHOOL_PERIOD",
      entityId: period.id,
      metadata: { ordinal: period.ordinal, startTime: period.startTime, endTime: period.endTime },
    });
    return period;
  });
}

/**
 * Deletes a period, but only while nothing depends on it.
 *
 * Deleting is allowed here — unlike a recorded occurrence — because a period is
 * configuration: a mistyped time is a mistake to remove, not history to preserve.
 * Once a timetable assignment points at the period, the row has become part of the
 * school's record and is refused instead.
 */
export async function deletePeriod(options: { headers: Headers; input: DeletePeriodInput }) {
  const context = await requireSchedulingAdmin(options.headers);
  const input = deletePeriodSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const [period] = await tx.select().from(schoolPeriods).where(and(
      eq(schoolPeriods.id, input.periodId),
      eq(schoolPeriods.schoolId, context.schoolId),
    )).limit(1);
    if (!period) throw new Error("زنگ انتخاب‌شده پیدا نشد.");

    const [used] = await tx.select({ id: timetableEntries.id }).from(timetableEntries).where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.periodId, period.id),
    )).limit(1);
    if (used) throw new Error("این زنگ در برنامه هفتگی استفاده شده و قابل حذف نیست.");

    await tx.delete(schoolPeriods).where(and(eq(schoolPeriods.id, period.id), eq(schoolPeriods.schoolId, context.schoolId)));
    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "SCHOOL_PERIOD_DELETED",
      entityType: "SCHOOL_PERIOD",
      entityId: period.id,
      metadata: { ordinal: period.ordinal },
    });
    return { periodId: period.id };
  });
}

/**
 * Assigns one teacher and one subject to a set of timetable hours.
 *
 * The submission is one teacher, one subject, and the cells the admin selected, so
 * the three shapes the school uses all arrive here: one hour is a single-hour
 * assignment, both hours of a period with the same teacher and subject is a full
 * lesson, and running this twice on a period's two hours with different values is
 * a split. Nothing in this function decides which it is, because the rows are the
 * decision — that is what makes a period whose two hours are two different lessons
 * expressible at all.
 *
 * Every relationship is validated against this school rather than trusted from the
 * form, and the ones the schema cannot express — that the teacher holds an active
 * `TEACHER` membership here with hours recorded, that each weekday is one the
 * school operates on — are checked here so the reported error names the first real
 * problem. The teacher is checked once rather than per hour, because it is one
 * teacher for the whole submission.
 *
 * Two refusals protect facts that must stay true across the whole school, not just
 * this class. A teacher may not be in two classrooms in the same hour, so the
 * selected hours are checked against every other assignment that names them. And a
 * teacher may not exceed their mandatory weekly hours, because the obligation is
 * the school's contract with them: the hours they would hold after this write are
 * totalled and compared with the figure on file, which is what stops a timetable
 * from quietly running someone past what they were hired for.
 */
export async function assignTimetableHours(options: { headers: Headers; input: AssignTimetableHoursInput }) {
  const context = await requireSchedulingAdmin(options.headers);
  const input = assignTimetableHoursSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const [classroom] = await tx.select().from(classrooms).where(and(
      eq(classrooms.id, input.classroomId),
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.academicYearId, input.academicYearId),
      eq(classrooms.status, "ACTIVE"),
    )).limit(1);
    if (!classroom) throw new Error("کلاس انتخاب‌شده در این سال تحصیلی پیدا نشد.");

    const [subject] = await tx.select({ id: subjects.id }).from(subjects).where(and(
      eq(subjects.id, input.subjectId),
      eq(subjects.schoolId, context.schoolId),
      eq(subjects.status, "ACTIVE"),
    )).limit(1);
    if (!subject) throw new Error("درس انتخاب‌شده در این مدرسه فعال نیست.");

    await assertSchedulableTeacher(tx, {
      schoolId: context.schoolId,
      academicYearId: input.academicYearId,
      membershipId: input.teacherMembershipId,
    });

    const hours = dedupeHours(input.hours);

    // The periods and the weekdays are checked together, before anything is
    // written, so a submission naming one unusable cell is refused whole rather
    // than applied in part.
    const periodIds = [...new Set(hours.map((hour) => hour.periodId))];
    const knownPeriods = await tx.select({ id: schoolPeriods.id }).from(schoolPeriods).where(and(
      eq(schoolPeriods.schoolId, context.schoolId),
      inArray(schoolPeriods.id, periodIds),
    ));
    const knownPeriodIds = new Set(knownPeriods.map((period) => period.id));
    if (periodIds.some((periodId) => !knownPeriodIds.has(periodId))) throw new Error("زنگ انتخاب‌شده پیدا نشد.");

    const operatingDays = await tx.select({ dayOfWeek: schoolOperatingDays.dayOfWeek }).from(schoolOperatingDays)
      .where(eq(schoolOperatingDays.schoolId, context.schoolId));
    const openDays = new Set(operatingDays.map((day) => day.dayOfWeek));
    if (hours.some((hour) => !openDays.has(hour.dayOfWeek))) throw new Error("مدرسه در روز انتخاب‌شده فعالیت ندارد.");

    // Only the cells being written are read back, plus the teacher's own hours and
    // the ones already held against them, which is what the two refusals below
    // need. Excluding the target cells from the clash check is what lets an admin
    // re-save the same teacher onto the same cell without a self-conflict.
    const targetEntries = await tx.select().from(timetableEntries).where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.classroomId, classroom.id),
      or(...hours.map((hour) => and(
        eq(timetableEntries.dayOfWeek, hour.dayOfWeek),
        eq(timetableEntries.periodId, hour.periodId),
        eq(timetableEntries.hourIndex, hour.hourIndex),
      ))),
    ));

    // A teacher cannot be in two classes in the same hour. Any other class already
    // holding these hours for this teacher is a clash; the same class's own rows
    // are being replaced, so they are not.
    const sameHourElsewhere = await tx.select({ id: timetableEntries.id }).from(timetableEntries).where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.status, "ACTIVE"),
      eq(timetableEntries.teacherMembershipId, input.teacherMembershipId),
      or(...hours.map((hour) => and(
        eq(timetableEntries.dayOfWeek, hour.dayOfWeek),
        eq(timetableEntries.periodId, hour.periodId),
        eq(timetableEntries.hourIndex, hour.hourIndex),
      ))),
    ));
    if (sameHourElsewhere.some((entry) => !targetEntries.some((target) => target.id === entry.id))) {
      throw new Error("این دبیر در یکی از ساعت‌های انتخاب‌شده کلاس دیگری دارد.");
    }

    // The hours the teacher would hold once this write lands: everything already
    // theirs, minus the target cells that are being reassigned, plus the cells
    // being given. Counting the projection rather than the current state is what
    // makes a re-save of one's own cell not inflate the total.
    await assertWithinMandatoryHours(tx, {
      schoolId: context.schoolId,
      academicYearId: input.academicYearId,
      teacherMembershipId: input.teacherMembershipId,
      releasingEntryIds: targetEntries.map((entry) => entry.id),
      gainingHours: hours.length,
    });

    const saved = [];
    for (const hour of hours) {
      const existing = targetEntries.find((entry) => hourKey(entry) === hourKey(hour));
      const values = {
        academicYearId: input.academicYearId,
        classroomId: classroom.id,
        periodId: hour.periodId,
        dayOfWeek: hour.dayOfWeek,
        hourIndex: hour.hourIndex,
        subjectId: subject.id,
        teacherMembershipId: input.teacherMembershipId,
        status: "ACTIVE" as const,
      };
      const [entry] = existing
        ? await tx.update(timetableEntries)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(timetableEntries.id, existing.id), eq(timetableEntries.schoolId, context.schoolId)))
          .returning()
        : await tx.insert(timetableEntries).values({ schoolId: context.schoolId, ...values }).returning();
      saved.push(entry);
      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: existing ? "TIMETABLE_ENTRY_UPDATED" : "TIMETABLE_ENTRY_CREATED",
        entityType: "TIMETABLE_ENTRY",
        entityId: entry.id,
        metadata: {
          classroomId: entry.classroomId,
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
          hourIndex: entry.hourIndex,
          teacherMembershipId: entry.teacherMembershipId,
          subjectId: entry.subjectId,
        },
      });
    }
    return saved;
  });
}

/**
 * Archives the assignments holding a set of timetable hours, freeing the cells.
 *
 * Addressed by coordinate rather than by entry id because the admin is clearing
 * cells: at the moment they act they may not know whether a cell holds one
 * assignment or two, and "clear this hour" means the same thing either way. Both
 * hours of a period can be cleared in one call, which is what the grid's
 * clear action sends when the whole period is selected.
 *
 * Archiving rather than deleting, because an attendance session references the
 * assignment: once a lesson has run, the row it ran from is part of the school's
 * record and must stay resolvable. Archiving removes it from every future date's
 * schedule, which is what "this class no longer meets then" actually means.
 */
export async function clearTimetableHours(options: { headers: Headers; input: ClearTimetableHoursInput }) {
  const context = await requireSchedulingAdmin(options.headers);
  const input = clearTimetableHoursSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const [classroom] = await tx.select({ id: classrooms.id }).from(classrooms).where(and(
      eq(classrooms.id, input.classroomId),
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.status, "ACTIVE"),
    )).limit(1);
    if (!classroom) throw new Error("کلاس انتخاب‌شده در این مدرسه پیدا نشد.");

    const hours = dedupeHours(input.hours);
    const targets = await tx.select().from(timetableEntries).where(and(
      eq(timetableEntries.schoolId, context.schoolId),
      eq(timetableEntries.classroomId, classroom.id),
      eq(timetableEntries.status, "ACTIVE"),
      or(...hours.map((hour) => and(
        eq(timetableEntries.dayOfWeek, hour.dayOfWeek),
        eq(timetableEntries.periodId, hour.periodId),
        eq(timetableEntries.hourIndex, hour.hourIndex),
      ))),
    ));
    if (targets.length === 0) return [];

    const archived = await tx.update(timetableEntries)
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(
        eq(timetableEntries.schoolId, context.schoolId),
        inArray(timetableEntries.id, targets.map((entry) => entry.id)),
      ))
      .returning();

    for (const entry of archived) {
      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "TIMETABLE_ENTRY_ARCHIVED",
        entityType: "TIMETABLE_ENTRY",
        entityId: entry.id,
        metadata: {
          classroomId: entry.classroomId,
          dayOfWeek: entry.dayOfWeek,
          periodId: entry.periodId,
          hourIndex: entry.hourIndex,
        },
      });
    }
    return archived;
  });
}

function hourKey(hour: { dayOfWeek: number; periodId: string; hourIndex: number }) {
  return `${hour.dayOfWeek}:${hour.periodId}:${hour.hourIndex}`;
}

/** Collapses repeated coordinates, so a double-click cannot write the same row twice. */
function dedupeHours<T extends { dayOfWeek: number; periodId: string; hourIndex: number }>(hours: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const hour of hours) {
    const key = hourKey(hour);
    if (!seen.has(key)) seen.set(key, hour);
  }
  return [...seen.values()];
}

/**
 * Refuses a write that would push a teacher past their mandatory weekly hours.
 *
 * The comparison is against the figure the school recorded for this academic year,
 * because that is the obligation the assignment is being made under. A teacher with
 * no recorded figure never reaches here — `assertSchedulableTeacher` has already
 * refused them — so the reading here can treat a missing row as "nothing to check
 * against" rather than as an allowance of zero.
 *
 * The projection is what makes this usable rather than merely strict: an admin
 * correcting a cell they already assigned is not adding an hour, and counting the
 * cells being released before the cells being gained is what keeps a re-save from
 * reading as a violation of a limit the teacher was already within.
 */
async function assertWithinMandatoryHours(
  tx: SchedulingTransaction,
  input: {
    schoolId: string;
    academicYearId: string;
    teacherMembershipId: string;
    releasingEntryIds: readonly string[];
    gainingHours: number;
  },
) {
  const [requirements] = await tx.select({
    requiredWeeklyHours: teacherWeeklyHourRequirements.requiredWeeklyHours,
  }).from(teacherWeeklyHourRequirements).where(and(
    eq(teacherWeeklyHourRequirements.schoolId, input.schoolId),
    eq(teacherWeeklyHourRequirements.academicYearId, input.academicYearId),
    eq(teacherWeeklyHourRequirements.teacherMembershipId, input.teacherMembershipId),
  )).limit(1);
  if (!requirements) return;

  const held = await tx.select({ id: timetableEntries.id }).from(timetableEntries).where(and(
    eq(timetableEntries.schoolId, input.schoolId),
    eq(timetableEntries.academicYearId, input.academicYearId),
    eq(timetableEntries.teacherMembershipId, input.teacherMembershipId),
    eq(timetableEntries.status, "ACTIVE"),
  ));
  const releasing = new Set(input.releasingEntryIds);
  const retained = held.filter((entry) => !releasing.has(entry.id)).length;
  const projected = retained + input.gainingHours;
  if (projected > requirements.requiredWeeklyHours) {
    throw new Error(
      `با این تخصیص، ساعت هفتگی این دبیر به ${projected} می‌رسد که از ساعت موظفی او (${requirements.requiredWeeklyHours}) بیشتر است.`,
    );
  }
}

/**
 * Records a teacher's mandatory weekly hours, or corrects an existing figure.
 *
 * Upserted rather than inserted, because the obligation is one number per teacher
 * per academic year: a second call corrects the same fact, and two rows would make
 * "what does this teacher owe" ambiguous. This is the manager's routine edit, and
 * it is deliberately not a scheduling gate: an admin must be able to set the hours
 * that lift the gate.
 */
export async function setTeacherWeeklyHours(options: { headers: Headers; input: SetTeacherWeeklyHoursInput }) {
  const context = await requireSchedulingAdmin(options.headers);
  const input = setTeacherWeeklyHoursSchema.parse(options.input);

  return getDb().transaction(async (tx) => {
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(and(
      eq(academicYears.id, input.academicYearId),
      eq(academicYears.schoolId, context.schoolId),
    )).limit(1);
    if (!year) throw new Error("سال تحصیلی انتخاب‌شده پیدا نشد.");

    const [teacher] = await tx.select({ id: schoolMemberships.id }).from(schoolMemberships).where(and(
      eq(schoolMemberships.id, input.teacherMembershipId),
      eq(schoolMemberships.schoolId, context.schoolId),
      eq(schoolMemberships.role, "TEACHER"),
      eq(schoolMemberships.status, "ACTIVE"),
    )).limit(1);
    if (!teacher) throw new Error("دبیر انتخاب‌شده در این مدرسه فعال نیست.");

    const [requirement] = await tx.insert(teacherWeeklyHourRequirements).values({
      schoolId: context.schoolId,
      academicYearId: input.academicYearId,
      teacherMembershipId: input.teacherMembershipId,
      requiredWeeklyHours: input.requiredWeeklyHours,
    }).onConflictDoUpdate({
      target: [
        teacherWeeklyHourRequirements.schoolId,
        teacherWeeklyHourRequirements.teacherMembershipId,
        teacherWeeklyHourRequirements.academicYearId,
      ],
      set: { requiredWeeklyHours: input.requiredWeeklyHours, updatedAt: new Date() },
    }).returning();

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "TEACHER_WEEKLY_HOURS_SET",
      entityType: "TEACHER_WEEKLY_HOUR_REQUIREMENT",
      entityId: requirement.id,
      metadata: {
        academicYearId: requirement.academicYearId,
        teacherMembershipId: requirement.teacherMembershipId,
        requiredWeeklyHours: requirement.requiredWeeklyHours,
      },
    });
    return requirement;
  });
}

/**
 * How many attendance records each of the given assignments already holds.
 *
 * Exposed for the interface's clear action: an assignment whose register already
 * has records is history, and the admin confirming a clear should be told which
 * cells that applies to rather than discovering it afterwards. Kept as a query
 * rather than folded into the clear transaction because the answer is advisory —
 * the archive itself is unconditional, and the database is still the authority on
 * what exists.
 */
export async function listTimetableEntrySessionCounts(context: ActiveSchoolMembership, entryIds: readonly string[]) {
  if (entryIds.length === 0) return new Map<string, number>();
  const rows = await getDb().select({
    entryId: attendanceSessions.timetableEntryId,
    records: sql<number>`count(${attendanceRecords.id})`,
  }).from(attendanceSessions)
    .leftJoin(attendanceRecords, and(
      eq(attendanceRecords.attendanceSessionId, attendanceSessions.id),
      eq(attendanceRecords.schoolId, context.schoolId),
    ))
    .where(and(
      eq(attendanceSessions.schoolId, context.schoolId),
      inArray(attendanceSessions.timetableEntryId, [...entryIds]),
    ))
    .groupBy(attendanceSessions.timetableEntryId);
  return new Map(rows.map((row) => [row.entryId, Number(row.records)]));
}
