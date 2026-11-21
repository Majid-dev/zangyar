import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { attendanceSessions } from "@/lib/db/schema";
import { getAttendanceSummaryForContext, getSchoolBusinessDate, listAttendanceClassroomsForContext, type AttendanceSummary } from "@/features/attendance/queries";

export type DashboardAttentionItem = {
  classroomId: string;
  name: string;
  status: "pending" | "active";
  detail: string;
};

export type DashboardData = {
  schoolName: string;
  date: string;
  attendance: AttendanceSummary;
  attention: DashboardAttentionItem[];
};

export async function getDashboardDataForContext(context: ActiveSchoolMembership): Promise<DashboardData> {
  const date = getSchoolBusinessDate(context.school.timezone);
  const [attendance, classroomRows] = await Promise.all([
    getAttendanceSummaryForContext(context),
    listAttendanceClassroomsForContext(context),
  ]);
  const classroomIds = classroomRows.map(({ classroom }) => classroom.id);
  const sessions = classroomIds.length === 0
    ? []
    : await getDb().select({ classroomId: attendanceSessions.classroomId, status: attendanceSessions.status })
      .from(attendanceSessions)
      .where(and(
        eq(attendanceSessions.schoolId, context.schoolId),
        eq(attendanceSessions.businessDate, date),
        inArray(attendanceSessions.classroomId, classroomIds),
      ));
  const sessionByClassroom = new Map(sessions.map((session) => [session.classroomId, session]));

  return {
    schoolName: context.school.name,
    date,
    attendance,
    attention: classroomRows.slice(0, 5).map(({ classroom }) => {
      const session = sessionByClassroom.get(classroom.id);
      return {
        classroomId: classroom.id,
        name: classroom.name,
        status: session ? "active" : "pending",
        detail: session ? "ثبت حضور انجام شده" : "هنوز ثبت نشده",
      };
    }),
  };
}

export async function getDashboardData(options: { headers: Headers }) {
  const context = await requireSchoolAccess({ headers: options.headers, roles: ["SCHOOL_ADMIN", "TEACHER"] });
  return getDashboardDataForContext(context);
}
