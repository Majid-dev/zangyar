"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ProfileMenu } from "@/features/account/components/profile-menu";
import type { ShellProfile } from "@/features/account/profile";
import { BrandLockup } from "./brand";
import { SidebarBrand, SidebarChrome } from "./app-sidebar";
import type { NavSection } from "./nav-items";

type MobileNavProps = {
  sections: readonly NavSection[];
  schoolName: string;
  academicYearLabel: string | null;
  profile: ShellProfile;
  active?: string;
};

/**
 * Tablet and mobile get the same navigation as desktop, presented as a drawer,
 * plus the account control in the header rather than at the foot of a drawer the
 * user has to open first. Drawer state is component state, not persisted, so a
 * reload always starts closed.
 */
export function MobileNav({ sections, schoolName, academicYearLabel, profile, active }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        {/* The tagline is dropped here rather than wrapped: at 390px it is the widest
            part of the lockup, and a three-line brand block pushed the account
            control and the menu trigger past the viewport edge — which scrolled the
            whole page sideways on every screen, not just this header. The mark and the
            name are what identify the app at this size; the tagline is in the drawer. */}
        <BrandLockup href="/dashboard" size={40} showTagline={false} className="min-w-0" />
        <div className="flex shrink-0 items-center gap-1.5">
          <ProfileMenu profile={profile} variant="sheet" />
          <button
            ref={triggerRef}
            type="button"
            aria-label="باز کردن منوی ناوبری"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(true)}
            className="flex size-10 items-center justify-center rounded-xl text-xl text-primary hover:bg-sage"
          >
            ☰
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="ناوبری اصلی">
          <button type="button" aria-label="بستن منوی ناوبری" onClick={close} className="absolute inset-0 bg-foreground/35" />
          <div id="mobile-navigation" className="absolute inset-y-0 end-0 flex w-[17.5rem] max-w-[85vw] flex-col border-s border-border bg-surface px-4 py-5 shadow-[0_0_40px_rgba(23,59,87,0.18)]">
            <div className="flex items-center justify-between">
              <SidebarBrand />
              <button type="button" aria-label="بستن منوی ناوبری" onClick={close} className="flex size-9 items-center justify-center rounded-xl text-lg text-muted hover:bg-sage">
                ✕
              </button>
            </div>
            <div className="mt-8 flex-1 overflow-y-auto">
              {/* The account control is left out here: it already sits in the
                  header beside this trigger, so repeating it would put two
                  identical controls on one screen. */}
              <SidebarChrome
                sections={sections}
                schoolName={schoolName}
                academicYearLabel={academicYearLabel}
                profile={profile}
                active={active}
                onNavigate={() => setOpen(false)}
                showProfile={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
