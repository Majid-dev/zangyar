import type { ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";
import { MobileHeader } from "./mobile-header";

export function AppShell({ children, active }: { children: ReactNode; active?: string }) {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <AppSidebar active={active} />
      <div className="min-w-0 flex-1">
        <MobileHeader />
        {children}
      </div>
    </div>
  );
}
