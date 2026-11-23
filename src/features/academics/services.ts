import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { writeAuditEvent } from "@/lib/audit";
import { requireSchoolRole } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { assertAcademicYearTransition, assertSchoolStatusTransition } from "./policy";

import {
  academicYears,
  classTeachers,
  classrooms,
  enrollments,
  grades,
  schoolSettings,
  schools,
  schoolMemberships,
  subjects,
} from "@/lib/db/schema";

import {
  archiveCatalogItemSchema,
  assignTeacherSchema,
  createAcademicYearSchema,
  createClassroomSchema,
  createGradeSchema,
  createSubjectSchema,
  transitionAcademicYearSchema,
  updateSchoolConfigurationSchema,
  updateSchoolStatusSchema,
  type ArchiveCatalogItemInput,
  type AssignTeacherInput,
  type CreateAcademicYearInput,
  type CreateClassroomInput,
  type CreateGradeInput,
  type CreateSubjectInput,
  type TransitionAcademicYearInput,
  type UpdateSchoolConfigurationInput,
  type UpdateSchoolStatusInput,
} from "./schema";

function assertDateRange(startDate: string, endDate: string) {
  if (startDate >= endDate) {
    throw new Error("Academic year end date must be after its start date.");
  }
}

async function requireOperationalAdmin(headers: Headers) {
  const context = await requireSchoolRole({ headers, roles: ["SCHOOL_ADMIN"] });
  if (context.school.status !== "ACTIVE") {
    throw new Error("School is not operational.");
  }
  return context;
}

export async function updateSchoolConfiguration(options: {
  headers: Headers;
  input: UpdateSchoolConfigurationInput;
}) {
  const context = await requireOperationalAdmin(options.headers);
  const input = updateSchoolConfigurationSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [school] = await tx
      .update(schools)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schools.id, context.schoolId))
      .returning();

    await tx.insert(schoolSettings).values({ schoolId: context.schoolId }).onConflictDoNothing();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "SCHOOL_CONFIGURATION_UPDATED",
      entityType: "SCHOOL",
      entityId: context.schoolId,
      metadata: { name: input.name, timezone: input.timezone },
    });

    return school;
  });
}

export async function updateSchoolStatus(options: { headers: Headers; input: UpdateSchoolStatusInput }) {
  const context = await requireSchoolRole({
    headers: options.headers,
    schoolId: options.input.schoolId,
    roles: ["SCHOOL_ADMIN"],
  });
  const input = updateSchoolStatusSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [currentSchool] = await tx.select().from(schools).where(eq(schools.id, context.schoolId)).limit(1);
    if (!currentSchool) throw new Error("School not found.");
    assertSchoolStatusTransition(currentSchool.status, input.status);

    const [school] = await tx
      .update(schools)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(schools.id, context.schoolId))
      .returning();

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "SCHOOL_STATUS_CHANGED",
      entityType: "SCHOOL",
      entityId: context.schoolId,
      metadata: { status: input.status },
    });

    return school;
  });
}

export async function createAcademicYear(options: { headers: Headers; input: CreateAcademicYearInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = createAcademicYearSchema.parse(options.input);
  assertDateRange(input.startDate, input.endDate);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [year] = await tx.insert(academicYears).values({ schoolId: context.schoolId, ...input }).returning();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "ACADEMIC_YEAR_CREATED",
      entityType: "ACADEMIC_YEAR",
      entityId: year.id,
      metadata: { code: year.code, startDate: year.startDate, endDate: year.endDate },
    });
    return year;
  });
}

export async function transitionAcademicYear(options: { headers: Headers; input: TransitionAcademicYearInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = transitionAcademicYearSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [currentYear] = await tx
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.id, input.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .limit(1);
    if (!currentYear) throw new Error("Academic year not found.");
    assertAcademicYearTransition(currentYear.status, input.status);

    // Compare-and-set on the status we just observed, so a concurrent request can
    // never overwrite a newer decision with a stale one.
    const [year] = await tx
      .update(academicYears)
      .set({ status: input.status, closedAt: input.status === "CLOSED" ? new Date() : null, updatedAt: new Date() })
      .where(and(
        eq(academicYears.id, input.academicYearId),
        eq(academicYears.schoolId, context.schoolId),
        eq(academicYears.status, currentYear.status),
      ))
      .returning();
    if (!year) throw new Error("Academic year status changed concurrently.");

    // The sweep runs only on a real transition into CLOSED. CLOSED -> CLOSED is a
    // legal no-op the policy allows for retries, so gating on the observed status
    // keeps a repeat closure from re-auditing an operation that already happened.
    // The ACTIVE predicate on the enrollments makes the close idempotent anyway:
    // a second pass simply matches nothing.
    if (input.status === "CLOSED" && currentYear.status !== "CLOSED") {
      // Active enrollments end with their academic year. GREATEST guards the
      // date-order check if legacy data starts after the year end; terminal
      // enrollments are excluded by the status predicate and keep their history.
      const closedEnrollments = await tx
        .update(enrollments)
        .set({
          status: "ARCHIVED",
          endDate: sql`GREATEST(${enrollments.startDate}, ${currentYear.endDate}::date)`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(enrollments.schoolId, context.schoolId),
          eq(enrollments.academicYearId, currentYear.id),
          eq(enrollments.status, "ACTIVE"),
        ))
        .returning({ id: enrollments.id, endDate: enrollments.endDate });

      await writeAuditEvent(tx, {
        schoolId: context.schoolId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "ACADEMIC_YEAR_ENROLLMENTS_CLOSED",
        entityType: "ACADEMIC_YEAR",
        entityId: year.id,
        metadata: { enrollmentCount: closedEnrollments.length, closedAt: currentYear.endDate },
      });
    }

    await writeAuditEvent(tx, {
      schoolId: context.schoolId,
      actorUserId: context.userId,
      actorMembershipId: context.membershipId,
      action: "ACADEMIC_YEAR_STATUS_CHANGED",
      entityType: "ACADEMIC_YEAR",
      entityId: year.id,
      metadata: { status: year.status },
    });
    return year;
  });
}

export async function createGrade(options: { headers: Headers; input: CreateGradeInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = createGradeSchema.parse(options.input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [grade] = await tx.insert(grades).values({ schoolId: context.schoolId, ...input }).returning();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId,
      action: "GRADE_CREATED", entityType: "GRADE", entityId: grade.id, metadata: { code: grade.code },
    });
    return grade;
  });
}

export async function createSubject(options: { headers: Headers; input: CreateSubjectInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = createSubjectSchema.parse(options.input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [subject] = await tx.insert(subjects).values({ schoolId: context.schoolId, ...input }).returning();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId,
      action: "SUBJECT_CREATED", entityType: "SUBJECT", entityId: subject.id, metadata: { code: subject.code },
    });
    return subject;
  });
}

export async function archiveGrade(options: { headers: Headers; input: ArchiveCatalogItemInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = archiveCatalogItemSchema.parse(options.input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [grade] = await tx.update(grades).set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(eq(grades.id, input.itemId), eq(grades.schoolId, context.schoolId))).returning();
    if (!grade) throw new Error("Grade not found.");
    await writeAuditEvent(tx, {
      schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId,
      action: "GRADE_ARCHIVED", entityType: "GRADE", entityId: grade.id, metadata: { code: grade.code },
    });
    return grade;
  });
}

export async function archiveSubject(options: { headers: Headers; input: ArchiveCatalogItemInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = archiveCatalogItemSchema.parse(options.input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [subject] = await tx.update(subjects).set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(eq(subjects.id, input.itemId), eq(subjects.schoolId, context.schoolId))).returning();
    if (!subject) throw new Error("Subject not found.");
    await writeAuditEvent(tx, {
      schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId,
      action: "SUBJECT_ARCHIVED", entityType: "SUBJECT", entityId: subject.id, metadata: { code: subject.code },
    });
    return subject;
  });
}

export async function createClassroom(options: { headers: Headers; input: CreateClassroomInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = createClassroomSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [year] = await tx.select().from(academicYears).where(and(
      eq(academicYears.id, input.academicYearId), eq(academicYears.schoolId, context.schoolId),
    )).limit(1);
    if (!year || year.status === "CLOSED" || year.status === "ARCHIVED") throw new Error("Academic year is not available for classrooms.");

    const [grade] = await tx.select().from(grades).where(and(
      eq(grades.id, input.gradeId), eq(grades.schoolId, context.schoolId),
    )).limit(1);
    if (!grade || grade.status === "ARCHIVED") throw new Error("Grade is not available for classrooms.");

    const [classroom] = await tx.insert(classrooms).values({ schoolId: context.schoolId, ...input }).returning();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId,
      action: "CLASSROOM_CREATED", entityType: "CLASSROOM", entityId: classroom.id,
      metadata: { academicYearId: classroom.academicYearId, gradeId: classroom.gradeId },
    });
    return classroom;
  });
}

export async function assignTeacher(options: { headers: Headers; input: AssignTeacherInput }) {
  const context = await requireOperationalAdmin(options.headers);
  const input = assignTeacherSchema.parse(options.input);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [classroom] = await tx.select({ classroom: classrooms, year: academicYears }).from(classrooms)
      .innerJoin(academicYears, and(eq(academicYears.id, classrooms.academicYearId), eq(academicYears.schoolId, context.schoolId)))
      .where(and(eq(classrooms.id, input.classroomId), eq(classrooms.schoolId, context.schoolId)))
      .limit(1);
    if (!classroom || classroom.classroom.status === "ARCHIVED" || classroom.year.status === "CLOSED" || classroom.year.status === "ARCHIVED") {
      throw new Error("Classroom is not available for teacher assignment.");
    }
    if (input.startDate < classroom.year.startDate || input.startDate >= classroom.year.endDate ||
      (input.endDate && (input.endDate <= input.startDate || input.endDate > classroom.year.endDate))) {
      throw new Error("Teacher assignment dates must fit within the academic year.");
    }

    const [teacher] = await tx.select({ id: schoolMemberships.id }).from(schoolMemberships).where(and(
      eq(schoolMemberships.id, input.teacherMembershipId), eq(schoolMemberships.schoolId, context.schoolId),
      eq(schoolMemberships.role, "TEACHER"), eq(schoolMemberships.status, "ACTIVE"),
    )).limit(1);
    if (!teacher) throw new Error("Teacher membership not found.");

    if (input.subjectId) {
      const [subject] = await tx.select({ id: subjects.id }).from(subjects).where(and(
        eq(subjects.id, input.subjectId), eq(subjects.schoolId, context.schoolId), eq(subjects.status, "ACTIVE"),
      )).limit(1);
      if (!subject) throw new Error("Subject not found.");
    }

    const duplicate = await tx.select({ id: classTeachers.id }).from(classTeachers).where(and(
      eq(classTeachers.schoolId, context.schoolId), eq(classTeachers.classroomId, input.classroomId),
      eq(classTeachers.teacherMembershipId, input.teacherMembershipId),
      input.subjectId ? eq(classTeachers.subjectId, input.subjectId) : isNull(classTeachers.subjectId),
    )).limit(1);
    if (duplicate.length > 0) throw new Error("Teacher is already assigned to this classroom and subject.");

    const [assignment] = await tx.insert(classTeachers).values({ schoolId: context.schoolId, ...input }).returning();
    await writeAuditEvent(tx, {
      schoolId: context.schoolId, actorUserId: context.userId, actorMembershipId: context.membershipId,
      action: "CLASSROOM_TEACHER_ASSIGNED", entityType: "CLASS_TEACHER", entityId: assignment.id,
      metadata: { classroomId: assignment.classroomId, teacherMembershipId: assignment.teacherMembershipId },
    });
    return assignment;
  });
}
