import { ProfileMenu } from "@/features/account/components/profile-menu";
import type { ShellProfile } from "@/features/account/profile";
import { BrandLockup } from "./brand";
import { AppNav } from "./app-nav";
import type { NavSection } from "./nav-items";

type SidebarChromeProps = {
  sections: readonly NavSection[];
  schoolName: string;
  academicYearLabel: string | null;
  profile: ShellProfile;
  active?: string;
  onNavigate?: () => void;
  /**
   * Whether the account control belongs at the foot of this chrome.
   *
   * False inside the mobile drawer, where the same control already sits in the
   * header that opened the drawer — two identical controls on one screen would be
   * one too many.
   */
  showProfile?: boolean;
};

export function SidebarBrand() {
  return <BrandLockup href="/dashboard" size={40} className="px-3" />;
}

/**
 * The school the page is scoped to, and its active academic year.
 *
 * Sits above the navigation rather than at the foot: it is the context every item
 * below it is filtered by, so it reads as a heading for the menu instead of as a
 * footnote. It appears exactly once — only here, not also in the footer.
 */
export function SidebarSchoolContext({ schoolName, academicYearLabel }: { schoolName: string; academicYearLabel: string | null }) {
  return (
    <div className="rounded-xl bg-sage/70 px-3 py-2.5">
      <p className="text-xs font-bold text-primary">{schoolName}</p>
      <p className="mt-1 text-[11px] text-muted">{academicYearLabel ? `${academicYearLabel}` : "سال تحصیلی فعالی ثبت نشده"}</p>
    </div>
  );
}

/**
 * Who is signed in, at the foot of the sidebar.
 *
 * The account control is the only thing here now that the school context moved to
 * the top of the menu.
 */
export function SidebarFooter({
  profile,
  showProfile = true,
}: {
  profile: ShellProfile;
  showProfile?: boolean;
}) {
  if (!showProfile) return null;
  return <ProfileMenu profile={profile} variant="popover" />;
}

export function SidebarChrome({ sections, schoolName, academicYearLabel, profile, active, onNavigate, showProfile = true }: SidebarChromeProps) {
  return (
    <>
      <SidebarBrand />
      <div className="mt-6">
        <SidebarSchoolContext schoolName={schoolName} academicYearLabel={academicYearLabel} />
      </div>
      <div className="mt-6 flex-1 overflow-y-auto">
        <AppNav sections={sections} active={active} onNavigate={onNavigate} />
      </div>
      <SidebarFooter profile={profile} showProfile={showProfile} />
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
