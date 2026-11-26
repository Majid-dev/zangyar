import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { getDb } from "@/lib/db";
import { classrooms, timetableEntries } from "@/lib/db/schema";

type QueryDb = ReturnType<typeof getDb>;
type QueryExecutor = Pick<QueryDb, "select">;

/**
 * Whether a teacher has any standing in a classroom.
 *
 * A teacher's claim to a class comes from the timetable: the assignment names them
 * as the teacher of a period's hour, and holding one is what makes the class theirs
 * to read and take a register for. It used to be either that or being named the
 * class's homeroom teacher, but the homeroom column is gone — a relationship no
 * interface could set is not a relationship to authorize on — so this is now the
 * single, sufficient condition.
 *
 * The old `class_teachers` table also carried a date window, which attendance and
 * roster reads consulted per business date. The timetable does not need one: a
 * slot exists inside an academic year, and the year is what bounds it, so the
 * date filter collapsed to "the entry is active". Keeping a second, finer date
 * range here would reintroduce the same question in two places.
 */
export function teacherClassroomAccessCondition(context: { schoolId: string; membershipId: string }) {
  return sql`exists (
    select 1 from ${timetableEntries}
    where ${timetableEntries.schoolId} = ${context.schoolId}
      and ${timetableEntries.classroomId} = ${classrooms.id}
      and ${timetableEntries.status} = 'ACTIVE'
      and ${timetableEntries.teacherMembershipId} = ${context.membershipId}
  )`;
}

export async function assertTeacherHasClassroomAccess(
  context: { schoolId: string; membershipId: string },
  db: QueryExecutor,
  classroomId: string,
) {
  const rows = await db.select({ id: classrooms.id }).from(classrooms)
    .where(and(
      eq(classrooms.schoolId, context.schoolId),
      eq(classrooms.id, classroomId),
      teacherClassroomAccessCondition(context),
    ))
    .limit(1);
  if (rows.length === 0) throw new Error("Teacher is not assigned to this classroom.");
}
