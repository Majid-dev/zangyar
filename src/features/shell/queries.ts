import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears } from "@/lib/db/schema";
import { navigationForRole } from "@/components/layout/nav-items";
import type { AppShellContext } from "@/components/layout/app-shell";

/**
 * Sidebar chrome data (school name, active academic year, permitted items).
 * Resolved once per request from the verified membership context so individual
 * pages do not repeat the lookup.
 */
export async function getAppShellContext(context: ActiveSchoolMembership): Promise<AppShellContext> {
  const years = await getDb()
    .select({ name: academicYears.name, code: academicYears.code, status: academicYears.status, startDate: academicYears.startDate })
    .from(academicYears)
    .where(and(eq(academicYears.schoolId, context.schoolId), inArray(academicYears.status, ["ACTIVE", "DRAFT", "CLOSED"])))
    .orderBy(asc(academicYears.startDate));

  const activeYear = years.find((year) => year.status === "ACTIVE") ?? years.at(-1) ?? null;

  return {
    schoolName: context.school.name,
    academicYearLabel: activeYear?.name ?? null,
    sections: navigationForRole(context.role),
  };
}

export async function getAppShellContextFromHeaders(headers: Headers) {
  const context = await requireSchoolAccess({ headers });
  return getAppShellContext(context);
}
