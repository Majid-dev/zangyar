import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { getSchoolBusinessDate } from "@/lib/date";
import { academicYears, classrooms, enrollments, guardians, studentGuardians, students } from "@/lib/db/schema";

import { requireStudentManagementAccess } from "./policy";
import { normalizeAdmissionNumber, normalizeMobile, normalizeNationalId } from "./normalization";
import {
  closeEnrollmentSchema,
  createEnrollmentSchema,
  createAndLinkGuardianSchema,
  createGuardianSchema,
  createStudentSchema,
  linkGuardianSchema,
  registerStudentSchema,
  transitionGuardianSchema,
  transitionStudentSchema,
  transferEnrollmentSchema,
  updateGuardianSchema,
  updateStudentGuardianSchema,
  updateStudentSchema,
  type CloseEnrollmentInput,
  type CreateAndLinkGuardianInput,
  type CreateEnrollmentInput,
  type CreateGuardianInput,
  type CreateStudentInput,
  type LinkGuardianInput,
  type RegisterStudentInput,
  type TransitionGuardianInput,
  type TransitionStudentInput,
  type TransferEnrollmentInput,
  type UpdateGuardianInput,
  type UpdateStudentGuardianInput,
  type UpdateStudentInput,
} from "./schema";

function databaseConflict(error: unknown, fallback: string): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new Error("A record with these unique values already exists.");
    if (code === "23P01") throw new Error("Enrollment dates overlap an existing enrollment.");
  }
  throw error instanceof Error ? error : new Error(fallback);
}

async function assertEnrollmentResources(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], schoolId: string, input: { studentId: string; academicYearId: string; classroomId: string }) {
  const [student] = await tx.select().from(students).where(and(eq(students.id, input.studentId), eq(students.schoolId, schoolId))).limit(1);
  if (!student || student.status !== "ACTIVE") throw new Error("Student is not available for enrollment.");

  const [academicYear] = await tx.select().from(academicYears).where(and(eq(academicYears.id, input.academicYearId), eq(academicYears.schoolId, schoolId))).limit(1);
  if (!academicYear || academicYear.status !== "ACTIVE") throw new Error("Only an active academic year is available for enrollment.");

  const [classroom] = await tx.select().from(classrooms).where(and(eq(classrooms.id, input.classroomId), eq(classrooms.schoolId, schoolId))).limit(1);
  if (!classroom || classroom.status === "ARCHIVED" || classroom.academicYearId !== academicYear.id) throw new Error("Classroom is not available in this academic year.");

  return { student, academicYear, classroom };
}

async function assertNoEnrollmentOverlap(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], schoolId: string, input: { studentId: string; academicYearId: string; startDate: string; endDate: string | null; excludeId?: string }) {
  const candidates = await tx.select({ id: enrollments.id, startDate: enrollments.startDate, endDate: enrollments.endDate }).from(enrollments).where(and(
    eq(enrollments.schoolId, schoolId),
    eq(enrollments.studentId, input.studentId),
    eq(enrollments.academicYearId, input.academicYearId),
    input.excludeId ? undefined : eq(enrollments.status, "ACTIVE"),
    input.excludeId ? undefined : undefined,
    input.excludeId ? undefined : undefined,
    input.excludeId ? undefined : undefined,
  ));

  if (candidates.some((candidate) => candidate.id !== input.excludeId && input.startDate < (candidate.endDate ?? "9999-12-31") && candidate.startDate < (input.endDate ?? "9999-12-31"))) {
    throw new Error("Enrollment dates overlap an existing enrollment.");
  }
}

async function operationalContext(headers: Headers) {
  return requireStudentManagementAccess(headers);
}

export async function registerStudent(options: { headers: Headers; input: RegisterStudentInput }) {
  const context = await operationalContext(options.headers);
  const input = registerStudentSchema.parse(options.input);
  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      const [student] = await tx.insert(students).values({
        schoolId: context.schoolId,
        admissionNumber: normalizeAdmissionNumber(input.student.admissionNumber),
        firstName: input.student.firstName,
        lastName: input.student.lastName,
        nationalId: normalizeNationalId(input.student.nationalId),
        birthDate: input.student.birthDate,
      }).returning();

      const linkedGuardians: Array<typeof studentGuardians.$inferSelect> = [];
      for (const entry of input.guardians) {
        let guardian: typeof guardians.$inferSelect | undefined;
        const normalizedMobile = normalizeMobile(entry.normalizedMobile);
        if (normalizedMobile) {
          [guardian] = await tx.select().from(guardians).where(and(eq(guardians.schoolId, context.schoolId), eq(guardians.normalizedMobile, normalizedMobile), eq(guardians.status, "ACTIVE"))).limit(1);
        }
        if (!guardian) {
          [guardian] = await tx.insert(guardians).values({ schoolId: context.schoolId, firstName: entry.firstName, lastName: entry.lastName, normalizedMobile, email: entry.email }).returning();
        } else {
          // Keep matching sibling contact stable. Fill missing optional details,
          // but do not overwrite an existing contact with a different name/email.
          const changes = {
            email: guardian.email ?? entry.email ?? undefined,
            updatedAt: new Date(),
          };
          [guardian] = await tx.update(guardians).set(changes).where(and(eq(guardians.id, guardian.id), eq(guardians.schoolId, context.schoolId))).returning();
        }
        const [relationship] = await tx.insert(studentGuardians).values({ schoolId: context.schoolId, studentId: student.id, guardianId: guardian.id, relationshipType: entry.relationshipType, isPrimary: entry.isPrimary, receivesSms: entry.receivesSms, isEmergency: entry.isEmergency }).returning();
        linkedGuardians.push(relationship);
      }

      let enrollment: typeof enrollments.$inferSelect | null = null;
      if (input.enrollment) {
        await assertEnrollmentResources(tx, context.schoolId, { studentId: student.id, academicYearId: input.enrollment.academicYearId, classroomId: input.enrollment.classroomId });
        await validateEnrollmentDates(tx, context.schoolId, input.enrollment);
        await assertNoEnrollmentOverlap(tx, context.schoolId, { studentId: student.id, academicYearId: input.enrollment.academicYearId, startDate: input.enrollment.startDate, endDate: input.enrollment.endDate });
        [enrollment] = await tx.insert(enrollments).values({ schoolId: context.schoolId, studentId: student.id, ...input.enrollment }).returning();
      }

      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_REGISTERED", entityType: "STUDENT", entityId: student.id, metadata: { guardianCount: linkedGuardians.length, enrollmentId: enrollment?.id ?? null } });
      return { student, guardians: linkedGuardians, enrollment };
    });
  } catch (error) {
    return databaseConflict(error, "Student registration could not be completed.");
  }
}

export async function createStudent(options: { headers: Headers; input: CreateStudentInput }) {
  const context = await operationalContext(options.headers);
  const input = createStudentSchema.parse(options.input);
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [student] = await tx.insert(students).values({
        schoolId: context.schoolId,
        admissionNumber: normalizeAdmissionNumber(input.admissionNumber),
        firstName: input.firstName,
        lastName: input.lastName,
        nationalId: normalizeNationalId(input.nationalId),
        birthDate: input.birthDate,
      }).returning();
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_CREATED", entityType: "STUDENT", entityId: student.id, metadata: { admissionNumber: student.admissionNumber } });
      return student;
    });
  } catch (error) { return databaseConflict(error, "Student could not be created."); }
}

export async function updateStudent(options: { headers: Headers; input: UpdateStudentInput }) {
  const context = await operationalContext(options.headers);
  const input = updateStudentSchema.parse(options.input);
  const { studentId, ...changes } = input;
  try {
    return await getDb().transaction(async (tx) => {
      const [student] = await tx.update(students).set({
        ...changes,
        admissionNumber: changes.admissionNumber ? normalizeAdmissionNumber(changes.admissionNumber) : undefined,
        nationalId: changes.nationalId === undefined ? undefined : normalizeNationalId(changes.nationalId),
        updatedAt: new Date(),
      }).where(and(eq(students.id, studentId), eq(students.schoolId, context.schoolId))).returning();
      if (!student) throw new Error("Student not found.");
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_UPDATED", entityType: "STUDENT", entityId: student.id });
      return student;
    });
  } catch (error) { return databaseConflict(error, "Student could not be updated."); }
}

export async function transitionStudent(options: { headers: Headers; input: TransitionStudentInput }) {
  const context = await operationalContext(options.headers);
  const input = transitionStudentSchema.parse(options.input);
  return getDb().transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(and(eq(students.id, input.studentId), eq(students.schoolId, context.schoolId))).limit(1);
    if (!student) throw new Error("Student not found.");
    const [updatedStudent] = await tx.update(students).set({ status: input.status, updatedAt: new Date() }).where(and(eq(students.id, input.studentId), eq(students.schoolId, context.schoolId))).returning();

    if (input.status !== "ACTIVE") {
      // Use the school's business date, not the server's UTC date, so a withdrawal
      // near midnight in Tehran cannot close enrollments a day early or late.
      const today = getSchoolBusinessDate(context.school.timezone);
      const closedEnrollments = await tx.update(enrollments).set({ status: "ARCHIVED", endDate: sql`GREATEST(${enrollments.startDate}, ${today}::date)`, updatedAt: new Date() }).where(and(
        eq(enrollments.schoolId, context.schoolId),
        eq(enrollments.studentId, student.id),
        eq(enrollments.status, "ACTIVE"),
      )).returning({ id: enrollments.id, endDate: enrollments.endDate });
      for (const enrollment of closedEnrollments) {
        await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "ENROLLMENT_CLOSED", entityType: "ENROLLMENT", entityId: enrollment.id, metadata: { endDate: enrollment.endDate, reason: "STUDENT_STATUS_CHANGED" } });
      }
    }

    await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_STATUS_CHANGED", entityType: "STUDENT", entityId: student.id, metadata: { previousStatus: student.status, status: updatedStudent.status } });
    return updatedStudent;
  });
}

export async function createGuardian(options: { headers: Headers; input: CreateGuardianInput }) {
  const context = await operationalContext(options.headers);
  const input = createGuardianSchema.parse(options.input);
  try {
    return await getDb().transaction(async (tx) => {
      const [guardian] = await tx.insert(guardians).values({ schoolId: context.schoolId, firstName: input.firstName, lastName: input.lastName, normalizedMobile: normalizeMobile(input.normalizedMobile), email: input.email }).returning();
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "GUARDIAN_CREATED", entityType: "GUARDIAN", entityId: guardian.id });
      return guardian;
    });
  } catch (error) { return databaseConflict(error, "Guardian could not be created."); }
}

export async function updateGuardian(options: { headers: Headers; input: UpdateGuardianInput }) {
  const context = await operationalContext(options.headers);
  const input = updateGuardianSchema.parse(options.input);
  const { guardianId, ...changes } = input;
  try {
    return await getDb().transaction(async (tx) => {
      const [guardian] = await tx.update(guardians).set({ ...changes, normalizedMobile: changes.normalizedMobile === undefined ? undefined : normalizeMobile(changes.normalizedMobile), email: changes.email === undefined ? undefined : changes.email, updatedAt: new Date() }).where(and(eq(guardians.id, guardianId), eq(guardians.schoolId, context.schoolId))).returning();
      if (!guardian) throw new Error("Guardian not found.");
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "GUARDIAN_UPDATED", entityType: "GUARDIAN", entityId: guardian.id });
      return guardian;
    });
  } catch (error) { return databaseConflict(error, "Guardian could not be updated."); }
}

export async function transitionGuardian(options: { headers: Headers; input: TransitionGuardianInput }) {
  const context = await operationalContext(options.headers);
  const input = transitionGuardianSchema.parse(options.input);
  return getDb().transaction(async (tx) => {
    const [guardian] = await tx.update(guardians).set({ status: input.status, updatedAt: new Date() }).where(and(eq(guardians.id, input.guardianId), eq(guardians.schoolId, context.schoolId))).returning();
    if (!guardian) throw new Error("Guardian not found.");
    await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "GUARDIAN_STATUS_CHANGED", entityType: "GUARDIAN", entityId: guardian.id, metadata: { status: guardian.status } });
    return guardian;
  });
}

export async function createAndLinkGuardian(options: { headers: Headers; input: CreateAndLinkGuardianInput }) {
  const context = await operationalContext(options.headers);
  const input = createAndLinkGuardianSchema.parse(options.input);
  const normalizedMobile = normalizeMobile(input.normalizedMobile);

  return getDb().transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(and(eq(students.id, input.studentId), eq(students.schoolId, context.schoolId))).limit(1);
    if (!student) throw new Error("Student not found.");
    let guardian: typeof guardians.$inferSelect | undefined;
    if (normalizedMobile) {
      [guardian] = await tx.select().from(guardians).where(and(eq(guardians.schoolId, context.schoolId), eq(guardians.normalizedMobile, normalizedMobile), eq(guardians.status, "ACTIVE"))).limit(1);
    }
    if (!guardian) {
      [guardian] = await tx.insert(guardians).values({ schoolId: context.schoolId, firstName: input.firstName, lastName: input.lastName, normalizedMobile, email: input.email }).returning();
    }
    if (input.receivesSms && !guardian.normalizedMobile) throw new Error("SMS recipients require a guardian mobile.");
    if (input.isPrimary) await tx.update(studentGuardians).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(studentGuardians.schoolId, context.schoolId), eq(studentGuardians.studentId, student.id)));
    // A guardian already linked to this student is updated rather than inserted:
    // the relationship is unique per (school, student, guardian), so a repeat
    // submission means "change the flags", not "create a second link".
    const [relationship] = await tx.insert(studentGuardians).values({ schoolId: context.schoolId, studentId: student.id, guardianId: guardian.id, relationshipType: input.relationshipType, isPrimary: input.isPrimary, receivesSms: input.receivesSms, isEmergency: input.isEmergency }).onConflictDoUpdate({
      target: [studentGuardians.schoolId, studentGuardians.studentId, studentGuardians.guardianId],
      set: { relationshipType: input.relationshipType, isPrimary: input.isPrimary, receivesSms: input.receivesSms, isEmergency: input.isEmergency, updatedAt: new Date() },
    }).returning();
    await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_GUARDIAN_LINKED", entityType: "STUDENT_GUARDIAN", entityId: `${student.id}:${guardian.id}` });
    return { guardian, relationship };
  });
}

export async function linkGuardian(options: { headers: Headers; input: LinkGuardianInput }) {
  const context = await operationalContext(options.headers);
  const input = linkGuardianSchema.parse(options.input);
  return getDb().transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(and(eq(students.id, input.studentId), eq(students.schoolId, context.schoolId))).limit(1);
    const [guardian] = await tx.select().from(guardians).where(and(eq(guardians.id, input.guardianId), eq(guardians.schoolId, context.schoolId))).limit(1);
    if (!student || !guardian) throw new Error("Student or guardian not found.");
    if (guardian.status !== "ACTIVE") throw new Error("Archived guardians cannot be linked.");
    if (input.receivesSms && !guardian.normalizedMobile) throw new Error("SMS recipients require a guardian mobile.");
    if (input.isPrimary) await tx.update(studentGuardians).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(studentGuardians.schoolId, context.schoolId), eq(studentGuardians.studentId, input.studentId)));
    try {
      const [relationship] = await tx.insert(studentGuardians).values({ schoolId: context.schoolId, ...input }).returning();
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_GUARDIAN_LINKED", entityType: "STUDENT_GUARDIAN", entityId: `${input.studentId}:${input.guardianId}` });
      return relationship;
    } catch (error) { return databaseConflict(error, "Guardian relationship could not be created."); }
  });
}

export async function updateStudentGuardian(options: { headers: Headers; input: UpdateStudentGuardianInput }) {
  const context = await operationalContext(options.headers);
  const input = updateStudentGuardianSchema.parse(options.input);
  return getDb().transaction(async (tx) => {
    const [guardian] = await tx.select().from(guardians).where(and(eq(guardians.id, input.guardianId), eq(guardians.schoolId, context.schoolId))).limit(1);
    if (!guardian) throw new Error("Guardian not found.");
    if (input.receivesSms && !guardian.normalizedMobile) throw new Error("SMS recipients require a guardian mobile.");
    if (input.isPrimary) await tx.update(studentGuardians).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(studentGuardians.schoolId, context.schoolId), eq(studentGuardians.studentId, input.studentId)));
    const [relationship] = await tx.update(studentGuardians).set({ relationshipType: input.relationshipType, isPrimary: input.isPrimary, receivesSms: input.receivesSms, isEmergency: input.isEmergency, updatedAt: new Date() }).where(and(eq(studentGuardians.schoolId, context.schoolId), eq(studentGuardians.studentId, input.studentId), eq(studentGuardians.guardianId, input.guardianId))).returning();
    if (!relationship) throw new Error("Guardian relationship not found.");
    await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "STUDENT_GUARDIAN_UPDATED", entityType: "STUDENT_GUARDIAN", entityId: `${input.studentId}:${input.guardianId}` });
    return relationship;
  });
}

async function validateEnrollmentDates(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], schoolId: string, input: { academicYearId: string; startDate: string; endDate: string | null }) {
  const [year] = await tx.select().from(academicYears).where(and(eq(academicYears.id, input.academicYearId), eq(academicYears.schoolId, schoolId))).limit(1);
  if (!year || input.startDate < year.startDate || input.startDate >= year.endDate || (input.endDate !== null && (input.endDate <= input.startDate || input.endDate > year.endDate))) throw new Error("Enrollment dates must fit within the academic year.");
}

export async function createEnrollment(options: { headers: Headers; input: CreateEnrollmentInput }) {
  const context = await operationalContext(options.headers);
  const input = createEnrollmentSchema.parse(options.input);
  try {
    return await getDb().transaction(async (tx) => {
      await assertEnrollmentResources(tx, context.schoolId, input);
      await validateEnrollmentDates(tx, context.schoolId, input);
      await assertNoEnrollmentOverlap(tx, context.schoolId, input);
      const [enrollment] = await tx.insert(enrollments).values({ schoolId: context.schoolId, ...input }).returning();
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "ENROLLMENT_CREATED", entityType: "ENROLLMENT", entityId: enrollment.id });
      return enrollment;
    });
  } catch (error) { return databaseConflict(error, "Enrollment could not be created."); }
}

export async function transferEnrollment(options: { headers: Headers; input: TransferEnrollmentInput }) {
  const context = await operationalContext(options.headers);
  const input = transferEnrollmentSchema.parse(options.input);
  try {
    return await getDb().transaction(async (tx) => {
      const [previous] = await tx.select().from(enrollments).where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.schoolId, context.schoolId))).limit(1);
      if (!previous || previous.status !== "ACTIVE") throw new Error("Active enrollment not found.");
      await assertEnrollmentResources(tx, context.schoolId, { studentId: previous.studentId, academicYearId: previous.academicYearId, classroomId: input.classroomId });
      await validateEnrollmentDates(tx, context.schoolId, { academicYearId: previous.academicYearId, startDate: input.startDate, endDate: input.endDate ?? null });
      if (input.startDate <= previous.startDate) throw new Error("Transfer must start after the previous enrollment.");
      await assertNoEnrollmentOverlap(tx, context.schoolId, { studentId: previous.studentId, academicYearId: previous.academicYearId, startDate: input.startDate, endDate: input.endDate ?? null, excludeId: previous.id });
      await tx.update(enrollments).set({ endDate: input.startDate, status: "ARCHIVED", updatedAt: new Date() }).where(and(eq(enrollments.id, previous.id), eq(enrollments.schoolId, context.schoolId)));
      const [next] = await tx.insert(enrollments).values({ schoolId: context.schoolId, studentId: previous.studentId, academicYearId: previous.academicYearId, classroomId: input.classroomId, startDate: input.startDate, endDate: input.endDate ?? null }).returning();
      await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "ENROLLMENT_TRANSFERRED", entityType: "ENROLLMENT", entityId: next.id, metadata: { previousEnrollmentId: previous.id } });
      return next;
    });
  } catch (error) { return databaseConflict(error, "Enrollment transfer could not be completed."); }
}

export async function closeEnrollment(options: { headers: Headers; input: CloseEnrollmentInput }) {
  const context = await operationalContext(options.headers);
  const input = closeEnrollmentSchema.parse(options.input);
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(enrollments).where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.schoolId, context.schoolId))).limit(1);
    if (!current || current.status !== "ACTIVE") throw new Error("Active enrollment not found.");
    if (input.endDate <= current.startDate) throw new Error("Enrollment end date must be after its start date.");
    const [enrollment] = await tx.update(enrollments).set({ endDate: input.endDate, status: "ARCHIVED", updatedAt: new Date() }).where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.schoolId, context.schoolId))).returning();
    await writeAuditEvent(tx, { schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId, action: "ENROLLMENT_CLOSED", entityType: "ENROLLMENT", entityId: enrollment.id, metadata: { endDate: enrollment.endDate } });
    return enrollment;
  });
}
