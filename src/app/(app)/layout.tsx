import { getSchoolContext, SchoolContextError } from "@/features/shell/route-access";
import { getAppShellContext } from "@/features/shell/queries";
import { accessStateFor } from "@/components/layout/access-state";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Public routes such as "/" stay outside this group. Everything under (app) is
 * authenticated, so session, school membership, and sidebar chrome are resolved
 * once here instead of being repeated inside every page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await getSchoolContext();
  } catch (error) {
    return accessStateFor(error instanceof SchoolContextError ? error.reason : "NO_SCHOOL");
  }

  const shell = await getAppShellContext(context);

  return <AppShell context={shell}>{children}</AppShell>;
}
