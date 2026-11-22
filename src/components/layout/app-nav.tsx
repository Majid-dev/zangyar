"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavSection } from "./nav-items";
import { NavIcon } from "./nav-icon";

/**
 * The active item is the longest href that is the current path or one of its
 * ancestors, so nested routes such as /students/new keep highlighting /students
 * without also highlighting /academics.
 */
function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeHref(pathname: string, sections: readonly NavSection[]) {
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.disabled || !item.href.startsWith("/")) continue;
      if (!isActiveHref(pathname, item.href)) continue;
      if (best === null || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

export function AppNav({ sections, onNavigate, active }: { sections: readonly NavSection[]; onNavigate?: () => void; active?: string }) {
  const pathname = usePathname();
  const currentHref = active ?? activeHref(pathname, sections);

  return (
    <nav className="space-y-7" aria-label="ناوبری اصلی">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 text-[11px] font-bold text-muted">{section.label}</p>
          <div className="mt-2 space-y-1">
            {section.items.map((item) => {
              const isActive = !item.disabled && item.href === currentHref;
              if (item.disabled) {
                return (
                  <span
                    key={item.label}
                    aria-disabled="true"
                    className="flex min-h-10 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm font-bold text-muted/60"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center text-primary/70" aria-hidden="true"><NavIcon name={item.icon} /></span>
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${isActive ? "bg-primary text-white [&_svg]:text-white" : "text-muted hover:bg-sage/60 hover:text-primary"}`}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center text-primary/70" aria-hidden="true"><NavIcon name={item.icon} /></span>
                  {item.label}
                  {item.attention ? <span className="ms-auto size-2 rounded-full bg-accent" aria-label="نیازمند توجه" /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
