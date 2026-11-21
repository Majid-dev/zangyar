import type { ReactNode } from "react";

import type { NavSection } from "./nav-items";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-header";

export type AppShellContext = {
  schoolName: string;
  academicYearLabel: string | null;
  sections: readonly NavSection[];
};

export function AppShell({ children, active, context }: { children: ReactNode; active?: string; context: AppShellContext }) {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <AppSidebar sections={context.sections} schoolName={context.schoolName} academicYearLabel={context.academicYearLabel} active={active} />
      <div className="min-w-0 flex-1">
        <MobileNav sections={context.sections} schoolName={context.schoolName} academicYearLabel={context.academicYearLabel} active={active} />
        {children}
      </div>
    </div>
  );
}

export function AppPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1440px] p-4 sm:p-6 xl:p-8">{children}</main>;
}
