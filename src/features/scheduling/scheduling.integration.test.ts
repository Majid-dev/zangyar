import { config } from "dotenv";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  academicYears,
  classrooms,
  grades,
  schoolMemberships,
  schoolOperatingDays,
  schoolPeriods,
  schools,
  subjects,
  teacherWeeklyHourRequirements,
  timetableEntries,
  users,
} from "@/lib/db/schema";
import type { ActiveSchoolMembership } from "@/lib/auth/authorization";
import { assignTimetableHours, clearTimetableHours, setTeacherWeeklyHours } from "./services";
import { getTeacherHourReportForContext, listTimetableForContext } from "./queries";

config({ path: ".env.local" });

const canRun = Boolean(
  process.env.DATABASE_URL &&
  process.env.BETTER_AUTH_SECRET &&
  process.env.BETTER_AUTH_URL &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1",
);

/** A School Admin signed in through Better Auth, so the real authorization path runs. */
async function createAdmin(suffix: string) {
  const auth = (await import("@/lib/auth")).getAuth();
  const email = `phase6-sched-${suffix}-${crypto.randomUUID()}@example.com`;
  const password = "A-secure-password-123!";
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  await auth.handler(new Request(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Phase 6 ${suffix}`, email, password }),
  }));
  const response = await auth.handler(new Request(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  const body = await response.json();
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return {
    id: body.user.id as string,
    headers: new Headers({ cookie: setCookies.map((cookie) => cookie.split(";", 1)[0]).filter(Boolean).join("; ") }),
  };
}

describe.skipIf(!canRun)("persisted Phase 6 timetable assignment", () => {
  let admin: { id: string; headers: Headers };
  let schoolId: string;
  let yearId: string;
  let classroomA: string;
  let classroomB: string;
  let periodOneId: string;
  let periodTwoId: string;
  let mathId: string;
  let scienceId: string;
  let teacherA: string;
  let teacherB: string;
  let idleTeacher: string;
  /** The read context a School Admin acts within, built once the fixtures exist. */
  let context: ActiveSchoolMembership;

  beforeAll(async () => {
    admin = await createAdmin("admin");
    const db = getDb();
    const [school] = await db.insert(schools).values({ slug: `phase6-sched-${crypto.randomUUID()}`, name: "Phase 6 Scheduling" }).returning();
    schoolId = school.id;
    const [membership] = await db.insert(schoolMemberships).values({ schoolId, userId: admin.id, role: "SCHOOL_ADMIN", status: "ACTIVE" }).returning();
    context = { membershipId: membership.id, schoolId, userId: admin.id, role: "SCHOOL_ADMIN", school };
    const [year] = await db.insert(academicYears).values({ schoolId, code: "1405", name: "سال تحصیلی", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    yearId = year.id;
    const [grade] = await db.insert(grades).values({ schoolId, code: "G1", name: "پایه اول" }).returning();
    classroomA = (await db.insert(classrooms).values({ schoolId, academicYearId: yearId, gradeId: grade.id, code: "A", name: "کلاس الف" }).returning())[0].id;
    classroomB = (await db.insert(classrooms).values({ schoolId, academicYearId: yearId, gradeId: grade.id, code: "B", name: "کلاس ب" }).returning())[0].id;
    periodOneId = (await db.insert(schoolPeriods).values({ schoolId, ordinal: 1, startTime: "08:00:00", endTime: "10:00:00" }).returning())[0].id;
    periodTwoId = (await db.insert(schoolPeriods).values({ schoolId, ordinal: 2, startTime: "10:15:00", endTime: "12:15:00" }).returning())[0].id;
    await db.insert(schoolOperatingDays).values([1, 2, 3, 4, 5].map((dayOfWeek) => ({ schoolId, dayOfWeek })));
    mathId = (await db.insert(subjects).values({ schoolId, code: "MATH", name: "ریاضی" }).returning())[0].id;
    scienceId = (await db.insert(subjects).values({ schoolId, code: "SCI", name: "علوم" }).returning())[0].id;

    const teacherUserIds = ["a", "b", "idle"].map((suffix) => `phase6-sched-teacher-${suffix}-${crypto.randomUUID()}`);
    await db.insert(users).values(teacherUserIds.map((id, index) => ({ id, name: `دبیر ${index + 1}`, email: `${id}@example.com`, emailVerified: true })));
    teacherA = (await db.insert(schoolMemberships).values({ schoolId, userId: teacherUserIds[0], role: "TEACHER", status: "ACTIVE" }).returning())[0].id;
    teacherB = (await db.insert(schoolMemberships).values({ schoolId, userId: teacherUserIds[1], role: "TEACHER", status: "ACTIVE" }).returning())[0].id;
    idleTeacher = (await db.insert(schoolMemberships).values({ schoolId, userId: teacherUserIds[2], role: "TEACHER", status: "ACTIVE" }).returning())[0].id;

    // The two assignable teachers have recorded hours; the third deliberately does
    // not, which is what makes them ineligible rather than merely unreported.
    await db.insert(teacherWeeklyHourRequirements).values([
      { schoolId, academicYearId: yearId, teacherMembershipId: teacherA, requiredWeeklyHours: 4 },
      { schoolId, academicYearId: yearId, teacherMembershipId: teacherB, requiredWeeklyHours: 2 },
    ]);
  });

  const hour = (dayOfWeek: number, periodId: string, hourIndex: 1 | 2) => ({ dayOfWeek, periodId, hourIndex });

  it("joins a period's two hours when one teacher and subject fill both", async () => {
    await assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomA, subjectId: mathId, teacherMembershipId: teacherA, hours: [hour(1, periodOneId, 1), hour(1, periodOneId, 2)] },
    });
    const rows = await listTimetableForContext(context, { classroomId: classroomA });
    const firstPeriod = rows.filter((row) => row.period.id === periodOneId);
    expect(firstPeriod).toHaveLength(2);
    expect(firstPeriod.map((row) => row.entry.hourIndex).sort()).toEqual([1, 2]);
    // Both hours name the same teacher and subject, which is what the grid reads as
    // a joined full period rather than as two separate lessons.
    expect(new Set(firstPeriod.map((row) => row.entry.teacherMembershipId))).toEqual(new Set([teacherA]));
    expect(new Set(firstPeriod.map((row) => row.entry.subjectId))).toEqual(new Set([mathId]));
  });

  it("splits a period between two teachers with two different subjects", async () => {
    await assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomA, subjectId: mathId, teacherMembershipId: teacherA, hours: [hour(2, periodTwoId, 1)] },
    });
    await assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomA, subjectId: scienceId, teacherMembershipId: teacherB, hours: [hour(2, periodTwoId, 2)] },
    });
    const rows = await listTimetableForContext(context, { classroomId: classroomA });
    const secondPeriod = rows.filter((row) => row.period.id === periodTwoId);
    expect(secondPeriod).toHaveLength(2);
    const byHour = new Map(secondPeriod.map((row) => [row.entry.hourIndex, row]));
    // The two hours are two different lessons, which the previous single-row model
    // could not express at all.
    expect(byHour.get(1)?.entry).toMatchObject({ teacherMembershipId: teacherA, subjectId: mathId });
    expect(byHour.get(2)?.entry).toMatchObject({ teacherMembershipId: teacherB, subjectId: scienceId });
  });

  it("refuses a teacher who is already teaching that hour in another class", async () => {
    await expect(assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomB, subjectId: mathId, teacherMembershipId: teacherA, hours: [hour(1, periodOneId, 1)] },
    })).rejects.toThrow("کلاس دیگری");
  });

  it("refuses a teacher with no recorded mandatory hours, and one the service cannot verify", async () => {
    await expect(assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomB, subjectId: mathId, teacherMembershipId: idleTeacher, hours: [hour(3, periodOneId, 1)] },
    })).rejects.toThrow("ساعت موظفی");
  });

  it("refuses a teacher from another school even when they hold hours there", async () => {
    // The membership is a real, active teacher with mandatory hours — just not of
    // this school. This is the case the composite foreign key and the active-
    // membership check must both refuse, and the timetable is where a teacher id
    // from a client could otherwise be written into a class.
    const db = getDb();
    const [otherSchool] = await db.insert(schools).values({ slug: `phase6-sched-other-${crypto.randomUUID()}`, name: "Other" }).returning();
    const [otherYear] = await db.insert(academicYears).values({ schoolId: otherSchool.id, code: "1405", name: "سال دیگر", startDate: "2026-09-23", endDate: "2027-06-21", status: "ACTIVE" }).returning();
    const foreignUserId = `phase6-sched-foreign-${crypto.randomUUID()}`;
    await db.insert(users).values({ id: foreignUserId, name: "دبیر مدرسه دیگر", email: `${foreignUserId}@example.com`, emailVerified: true });
    const [foreignMembership] = await db.insert(schoolMemberships).values({ schoolId: otherSchool.id, userId: foreignUserId, role: "TEACHER", status: "ACTIVE" }).returning();
    await db.insert(teacherWeeklyHourRequirements).values({ schoolId: otherSchool.id, academicYearId: otherYear.id, teacherMembershipId: foreignMembership.id, requiredWeeklyHours: 6 });

    await expect(assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomB, subjectId: mathId, teacherMembershipId: foreignMembership.id, hours: [hour(3, periodTwoId, 1)] },
    })).rejects.toThrow("فعال نیست");
  });

  it("refuses an assignment that would exceed the teacher's mandatory hours", async () => {
    // teacherB is owed two hours and already holds one, so giving them two more
    // would take them to three.
    await expect(assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomB, subjectId: scienceId, teacherMembershipId: teacherB, hours: [hour(4, periodOneId, 1), hour(4, periodOneId, 2)] },
    })).rejects.toThrow("بیشتر است");
  });

  it("allows re-saving a teacher's own hour without counting it twice against the limit", async () => {
    // teacherB holds exactly one hour and is owed two. Re-assigning that same hour
    // to a different subject is not a new hour, so the limit must not refuse it —
    // which is the projection the service computes rather than a raw count.
    await assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomA, subjectId: scienceId, teacherMembershipId: teacherB, hours: [hour(2, periodTwoId, 2)] },
    });
    const [row] = await getDb().select().from(timetableEntries).where(and(
      eq(timetableEntries.schoolId, schoolId),
      eq(timetableEntries.classroomId, classroomA),
      eq(timetableEntries.periodId, periodTwoId),
      eq(timetableEntries.hourIndex, 2),
    ));
    expect(row.teacherMembershipId).toBe(teacherB);
    expect(row.subjectId).toBe(scienceId);
  });

  it("counts one hour per assignment in the report", async () => {
    const report = await getTeacherHourReportForContext(context, yearId);
    const byTeacher = new Map(report.map((row) => [row.teacherMembershipId, row]));
    // teacherA holds both hours of period one and the first of period two: three.
    expect(byTeacher.get(teacherA)).toMatchObject({ assignedWeeklyHours: 3, requiredWeeklyHours: 4, difference: -1 });
    expect(byTeacher.get(teacherB)).toMatchObject({ assignedWeeklyHours: 1, requiredWeeklyHours: 2, difference: -1 });
  });

  it("frees a cell when the hours are cleared and stops counting them", async () => {
    await clearTimetableHours({ headers: admin.headers, input: { classroomId: classroomA, hours: [hour(1, periodOneId, 1), hour(1, periodOneId, 2)] } });
    const rows = await listTimetableForContext(context, { classroomId: classroomA });
    expect(rows.filter((row) => row.period.id === periodOneId)).toHaveLength(0);

    const report = await getTeacherHourReportForContext(context, yearId);
    expect(report.find((row) => row.teacherMembershipId === teacherA)).toMatchObject({ assignedWeeklyHours: 1 });
  });

  it("refuses an hour on a day the school does not operate", async () => {
    await expect(assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomB, subjectId: mathId, teacherMembershipId: teacherA, hours: [hour(6, periodOneId, 1)] },
    })).rejects.toThrow("فعالیت ندارد");
  });

  it("lowers a teacher's mandatory hours and allows more assignment as a result", async () => {
    // Correcting the figure is what lifts the limit, so the two must be one path.
    await setTeacherWeeklyHours({ headers: admin.headers, input: { academicYearId: yearId, teacherMembershipId: teacherB, requiredWeeklyHours: 3 } });
    await assignTimetableHours({
      headers: admin.headers,
      input: { academicYearId: yearId, classroomId: classroomB, subjectId: scienceId, teacherMembershipId: teacherB, hours: [hour(3, periodTwoId, 1)] },
    });
    const [row] = await getDb().select().from(timetableEntries).where(and(
      eq(timetableEntries.schoolId, schoolId),
      eq(timetableEntries.classroomId, classroomB),
      eq(timetableEntries.periodId, periodTwoId),
      eq(timetableEntries.hourIndex, 1),
    ));
    expect(row.teacherMembershipId).toBe(teacherB);
  });
});
