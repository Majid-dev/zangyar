import "server-only";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { getSchoolBusinessDate } from "@/lib/date";
import { academicYears, attendanceRecords, attendanceSessions, classTeachers, classrooms } from "@/lib/db/schema";
import { listEffectiveClassroomStudentsForContext } from "@/features/students/queries";

import { submitAttendanceSchema, type SubmitAttendanceInput } from "./schema";

async function assertTeacherAssignment(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], context: ActiveSchoolMembership, classroomId: string, businessDate: string) {
  if (context.role === "SCHOOL_ADMIN") return;
  const [assignment] = await tx.select({ id: classTeachers.id }).from(classTeachers).where(and(
    eq(classTeachers.schoolId, context.schoolId), eq(classTeachers.classroomId, classroomId), eq(classTeachers.teacherMembershipId, context.membershipId), eq(classTeachers.status, "ACTIVE"), lte(classTeachers.startDate, businessDate), or(isNull(classTeachers.endDate), sql`${classTeachers.endDate} > ${businessDate}`),
  )).limit(1);
  if (!assignment) throw new Error("Teacher is not assigned to this classroom for this date.");
}

export async function submitAttendanceForContext(context: ActiveSchoolMembership, rawInput: SubmitAttendanceInput) {
  const input = submitAttendanceSchema.parse(rawInput);
  const expectedDate = getSchoolBusinessDate(context.school.timezone);
  if (context.role === "TEACHER" && input.businessDate !== expectedDate) throw new Error("Teachers can only submit attendance for today.");

  return getDb().transaction(async (tx) => {
    await assertTeacherAssignment(tx, context, input.classroomId, input.businessDate);
    const [classroom] = await tx.select({ classroom: classrooms, academicYear: academicYears }).from(classrooms).innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId))).where(and(eq(classrooms.id, input.classroomId), eq(classrooms.schoolId, context.schoolId), eq(classrooms.status, "ACTIVE"), eq(academicYears.status, "ACTIVE"))).limit(1);
    if (!classroom) throw new Error("Classroom is not available.");

    const roster = await listEffectiveClassroomStudentsForContext(context, { classroomId: input.classroomId, businessDate: input.businessDate });
    const rosterByEnrollment = new Map(roster.map((row) => [row.enrollment.id, row]));
    if (input.records.some((record) => !rosterByEnrollment.has(record.enrollmentId))) throw new Error("Attendance includes a student outside the effective classroom roster.");

    const [session] = await tx.insert(attendanceSessions).values({ schoolId: context.schoolId, classroomId: input.classroomId, academicYearId: classroom.academicYear.id, businessDate: input.businessDate, sessionKind: "DAILY", createdByMembershipId: context.membershipId }).onConflictDoUpdate({ target: [attendanceSessions.schoolId, attendanceSessions.classroomId, attendanceSessions.businessDate, attendanceSessions.sessionKind], set: { updatedAt: new Date() } }).returning();
    if (!session) throw new Error("Attendance session could not be created.");

    const existing = await tx.select().from(attendanceRecords).where(and(eq(attendanceRecords.schoolId, context.schoolId), eq(attendanceRecords.attendanceSessionId, session.id), inArray(attendanceRecords.enrollmentId, input.records.map((record) => record.enrollmentId))));
    const existingByEnrollment = new Map(existing.map((record) => [record.enrollmentId, record]));
    const saved = [];
    for (const record of input.records) {
      const previous = existingByEnrollment.get(record.enrollmentId);
      const [savedRecord] = await tx.insert(attendanceRecords).values({ schoolId: context.schoolId, attendanceSessionId: session.id, enrollmentId: record.enrollmentId, classroomId: input.classroomId, status: record.status, recordedByMembershipId: context.membershipId }).onConflictDoUpdate({ target: [attendanceRecords.schoolId, attendanceRecords.attendanceSessionId, attendanceRecords.enrollmentId], set: { status: record.status, recordedByMembershipId: context.membershipId, updatedAt: new Date() } }).returning();
      saved.push(savedRecord);
      if (previous && previous.status !== record.status) await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "ATTENDANCE_CORRECTED", entityType: "ATTENDANCE_RECORD", entityId: savedRecord.id, metadata: { previousStatus: previous.status, status: record.status, businessDate: input.businessDate } });
    }
    return { session, records: saved };
  });
}

export async function submitAttendance(options: { headers: Headers; input: SubmitAttendanceInput }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return submitAttendanceForContext(context, options.input);
}
