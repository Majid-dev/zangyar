import Link from "next/link";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AppNav } from "./app-nav";
import type { NavSection } from "./nav-items";

type SidebarChromeProps = {
  sections: readonly NavSection[];
  schoolName: string;
  academicYearLabel: string | null;
  active?: string;
  onNavigate?: () => void;
};

export function SidebarBrand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">ز</span>
      <span>
        <span className="block text-base font-black tracking-tight text-primary">زنگ‌یار</span>
        <span className="block text-[11px] text-muted">مدرسه در جریان</span>
      </span>
    </Link>
  );
}

export function SidebarFooter({ schoolName, academicYearLabel }: { schoolName: string; academicYearLabel: string | null }) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-sage/70 p-3">
        <p className="text-xs font-bold text-primary">{schoolName}</p>
        <p className="mt-1 text-[11px] text-muted">{academicYearLabel ? `سال تحصیلی ${academicYearLabel}` : "سال تحصیلی فعالی ثبت نشده"}</p>
      </div>
      <SignOutButton className="w-full justify-center" />
    </div>
  );
}

export function SidebarChrome({ sections, schoolName, academicYearLabel, active, onNavigate }: SidebarChromeProps) {
  return (
    <>
      <SidebarBrand />
      <div className="mt-9 flex-1 overflow-y-auto">
        <AppNav sections={sections} active={active} onNavigate={onNavigate} />
      </div>
      <SidebarFooter schoolName={schoolName} academicYearLabel={academicYearLabel} />
    </>
  );
}

export function AppSidebar(props: SidebarChromeProps) {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-border bg-surface px-4 py-5 lg:flex"
      aria-label="ناوبری اصلی"
    >
      <SidebarChrome {...props} />
    </aside>
  );
}
