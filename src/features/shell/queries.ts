import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { requireSchoolAccess, type ActiveSchoolMembership } from "@/lib/auth/authorization";
import { getDb } from "@/lib/db";
import { academicYears } from "@/lib/db/schema";
import { navigationForRole } from "@/components/layout/nav-items";
import type { AppShellContext } from "@/components/layout/app-shell";
import { getAccountProfileForContext } from "@/features/account/queries";
import { joinDisplayName, nameInitials, roleLabel, switchableSchools } from "@/features/account/profile";

/**
 * Sidebar chrome data (school name, active academic year, permitted items, and
 * the signed-in identity).
 *
 * Resolved once per request from the verified membership context so individual
 * pages do not repeat the lookup, and so the profile menu is assembled from the
 * same context every other server read uses — it can therefore never offer a
 * school the request was not authorized for.
 */
export async function getAppShellContext(context: ActiveSchoolMembership): Promise<AppShellContext> {
  const [years, account] = await Promise.all([
    getDb()
      .select({ name: academicYears.name, code: academicYears.code, status: academicYears.status, startDate: academicYears.startDate })
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, context.schoolId), inArray(academicYears.status, ["ACTIVE", "DRAFT", "CLOSED"])))
      .orderBy(asc(academicYears.startDate)),
    // The identity the menu shows is the same one the settings page edits, so the
    // two read it through one function rather than formatting a name twice.
    getAccountProfileForContext(context),
  ]);

  const activeYear = years.find((year) => year.status === "ACTIVE") ?? years.at(-1) ?? null;
  const name = joinDisplayName(account.firstName, account.lastName);

  return {
    schoolName: context.school.name,
    academicYearLabel: activeYear?.name ?? null,
    sections: navigationForRole(context.role),
    profile: {
      name,
      roleLabel: roleLabel(account.role),
      initials: nameInitials(name),
      activeSchoolId: account.activeSchool.id,
      activeSchoolName: account.activeSchool.name,
      schools: switchableSchools(account.role, account.schools),
    },
  };
}

export async function getAppShellContextFromHeaders(headers: Headers) {
  const context = await requireSchoolAccess({ headers });
  return getAppShellContext(context);
}
