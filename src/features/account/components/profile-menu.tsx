"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/layout/icon";
import type { ShellProfile } from "@/features/account/profile";
import type { ActionState } from "@/lib/actions/result";
import { useSignOut } from "@/features/auth/components/use-sign-out";

import { Avatar } from "./avatar";
import { switchActiveSchoolAction } from "../actions";

/**
 * Renders a bottom sheet into `document.body`.
 *
 * A portal is needed because the trigger sits in a header with `backdrop-blur`,
 * and a filter makes an element the containing block for `position: fixed`
 * descendants — a sheet rendered in place would be positioned against the header
 * and clipped by it.
 *
 * The document is read at render rather than tracked in state: the sheet only
 * mounts after a click, which cannot happen during a server render, so the first
 * client render and the server render agree on rendering nothing.
 */
function SheetPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/**
 * The account control for the authenticated shell.
 *
 * Two renderings of one set of items: a popover anchored to the sidebar on
 * desktop, and a bottom sheet on small screens, where a popover anchored to a
 * narrow header would be clipped and targets would be cramped. Both are the same
 * component so the items, the school switcher, and the sign-out path cannot
 * diverge between layouts.
 *
 * The trigger reports its own state through `aria-expanded` and the panel is
 * labelled by it, so the control is usable from the keyboard: Escape closes and
 * returns focus to the trigger, and the panel traps nothing because it is short
 * enough that Tab simply leaves it.
 */
export function ProfileMenu({ profile, variant }: { profile: ShellProfile; variant: "popover" | "sheet" }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // Focus is deliberately not restored here: the user clicked elsewhere, so
      // pulling focus back to the trigger would fight their interaction.
      close(false);
    }

    window.addEventListener("keydown", onKeyDown);
    // Capture phase, so a click on any other control closes the menu before that
    // control handles it rather than after a navigation has already started.
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
    };
  }, [open, close]);

  // Focus the panel itself rather than its first control: the first control is a
  // school toggle for a teacher who may not want to switch, and moving focus into
  // the list would announce an option instead of the menu.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const panel =
    variant === "popover" ? (
      // Full width of the sidebar's content box, so the panel lines up with the
      // navigation items instead of overhanging them. Anchored to the inline-start
      // edge so it grows inward, away from the viewport edge the sidebar sits
      // against — in RTL that edge is the right, so anchoring to the inline-end
      // would push it off screen. The viewport cap covers a narrow desktop window.
      <div
        id={panelId}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="حساب کاربری"
        className="absolute bottom-[calc(100%+0.5rem)] start-0 z-50 w-full max-w-[calc(100vw-2rem)] origin-bottom rounded-2xl border border-border bg-surface p-2 shadow-[0_18px_44px_rgba(23,59,87,0.16)] outline-none"
      >
        <ProfilePanelContents profile={profile} onNavigate={() => close(false)} />
      </div>
    ) : (
      <SheetPortal>
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/35" aria-hidden="true" />
          <div
            id={panelId}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="حساب کاربری"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-18px_44px_rgba(23,59,87,0.18)] outline-none"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            <ProfilePanelContents profile={profile} onNavigate={() => close(false)} />
          </div>
        </div>
      </SheetPortal>
    );

  return (
    <div className={variant === "popover" ? "relative" : ""}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`حساب کاربری ${profile.name}`}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-3 rounded-xl p-2 text-start transition-colors ${
          open ? "bg-sage/80" : "hover:bg-sage/60"
        }`}
      >
        <Avatar name={profile.name} size={variant === "sheet" ? "sm" : "md"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-primary">{profile.name}</span>
          <span className="block truncate text-[11px] text-muted">{profile.roleLabel}</span>
        </span>
        <Icon
          name="chevron"
          className={`shrink-0 text-muted transition-transform duration-160 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? panel : null}
    </div>
  );
}

function ProfilePanelContents({ profile, onNavigate }: { profile: ShellProfile; onNavigate: () => void }) {
  const [switchState, switchFormAction] = useActionState<ActionState<unknown>, FormData>(switchActiveSchoolAction, null);
  const router = useRouter();
  const pathname = usePathname();
  const { endSession, pending: signingOut } = useSignOut();

  // The server already narrowed this list to the schools worth switching between,
  // so a non-empty list is the whole condition.
  const switchable = profile.schools.length > 0;

  useEffect(() => {
    if (!switchState?.ok) return;
    // The whole page is school-scoped, and the dashboard is the one destination
    // every role may open — a School Admin page would be refused for a membership
    // whose role differs between schools.
    onNavigate();
    if (pathname !== "/dashboard") router.push("/dashboard");
    router.refresh();
  }, [switchState, onNavigate, pathname, router]);

  return (
    <div className="space-y-1">
      {/* Identity is restated inside the panel, because the trigger's own copy is
          hidden behind the panel on the sheet layout. The active school is named
          here too, so the switcher below reads as "currently here". */}
      <div className="flex items-center gap-3 px-2 pb-2 pt-1">
        <Avatar name={profile.name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-primary">{profile.name}</p>
          <p className="truncate text-[11px] text-muted">
            {profile.roleLabel}
            <span aria-hidden="true"> · </span>
            {profile.activeSchoolName}
          </p>
        </div>
      </div>

      <div className="border-t border-border" />

      {switchable ? (
        <SchoolSwitcher profile={profile} state={switchState} action={switchFormAction} />
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-muted">
          <Icon name="building" className="text-primary/70" />
          <span className="truncate">{profile.activeSchoolName}</span>
        </div>
      )}

      <div className="border-t border-border" />

      <Link
        href="/settings"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-muted transition-colors hover:bg-sage/60 hover:text-primary"
      >
        <Icon name="settings" />
        تنظیمات حساب
      </Link>

      <button
        type="button"
        onClick={endSession}
        disabled={signingOut}
        aria-busy={signingOut || undefined}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-start text-sm font-bold text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-wait disabled:opacity-60"
      >
        <Icon name="logout" />
        {signingOut ? "در حال خروج…" : "خروج از حساب"}
      </button>
    </div>
  );
}

/**
 * School selection for a user who belongs to more than one.
 *
 * A radio group of submit buttons rather than a list of links: each option posts
 * the school id to the server, which is the only place that can confirm the user
 * really has a membership there. The active school is not a submit target — it is
 * already selected — but it stays in the group so the current choice is visible
 * where the choice is made.
 */
function SchoolSwitcher({
  profile,
  state,
  action,
}: {
  profile: ShellProfile;
  state: ActionState<unknown>;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="pt-1.5">
      <p className="px-3 pb-1 text-[11px] font-bold text-muted">مدرسه‌ی فعال</p>
      <div role="radiogroup" aria-label="انتخاب مدرسه‌ی فعال" className="space-y-0.5">
        {profile.schools.map((school) => {
          const active = school.id === profile.activeSchoolId;
          return (
            <button
              key={school.id}
              type="submit"
              name="schoolId"
              value={school.id}
              role="radio"
              aria-checked={active}
              disabled={active}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-start text-sm transition-colors ${
                active
                  ? "cursor-default font-bold text-primary"
                  : "text-muted hover:bg-sage/60 hover:text-primary"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-secondary bg-secondary text-white" : "border-border"
                }`}
              >
                {active ? <Icon name="check" className="size-3.5" /> : null}
              </span>
              <span className="truncate">{school.name}</span>
            </button>
          );
        })}
      </div>
      {state && !state.ok ? (
        <p role="alert" className="mx-1 mt-1 rounded-lg bg-danger/10 px-2.5 py-2 text-xs font-bold text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
