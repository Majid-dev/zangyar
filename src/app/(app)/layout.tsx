import { redirect } from "next/navigation";

import { getSchoolContext, SchoolContextError } from "@/features/shell/route-access";
import { getAppShellContext } from "@/features/shell/queries";
import { accessStateFor } from "@/components/layout/access-state";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Public routes such as "/" and "/login" stay outside this group. Everything
 * under (app) is authenticated, so session, school membership, and sidebar
 * chrome are resolved once here instead of being repeated inside every page.
 *
 * A visitor without a session is redirected to the login surface instead of
 * being shown an in-context denial, because they have nothing to act on yet.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getSchoolContext();
  } catch (error) {
    const reason = error instanceof SchoolContextError ? error.reason : "NO_SCHOOL";
    if (reason === "UNAUTHENTICATED") redirect("/login");
    return accessStateFor(reason);
  }

  const shell = await getAppShellContext(context);

  return <AppShell context={shell}>{children}</AppShell>;
}
