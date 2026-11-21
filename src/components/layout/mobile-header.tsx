"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SidebarBrand, SidebarChrome } from "./app-sidebar";
import type { NavSection } from "./nav-items";

/**
 * Tablet and mobile get the same navigation as desktop, presented as a drawer.
 * State is component state (not persisted) so a reload always starts closed.
 */
export function MobileNav({ sections, schoolName, academicYearLabel, active }: { sections: readonly NavSection[]; schoolName: string; academicYearLabel: string | null; active?: string }) {
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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <SidebarBrand />
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
              <SidebarChrome sections={sections} schoolName={schoolName} academicYearLabel={academicYearLabel} active={active} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
