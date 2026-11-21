import type { SchoolRole } from "@/lib/auth/authorization-core";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles?: readonly SchoolRole[];
  disabled?: boolean;
  attention?: boolean;
};

export type NavSection = { label: string; items: readonly NavItem[] };

const SCHOOL_NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "نمای کلی",
    items: [{ href: "/dashboard", label: "داشبورد", icon: "⌂" }],
  },
  {
    label: "مدیریت مدرسه",
    items: [
      { href: "/students", label: "دانش‌آموزان", icon: "◎", roles: ["SCHOOL_ADMIN"] },
      { href: "/academics/classrooms", label: "کلاس‌ها", icon: "▦", roles: ["SCHOOL_ADMIN"] },
      { href: "/academics", label: "ساختار آموزشی", icon: "⌘", roles: ["SCHOOL_ADMIN"] },
    ],
  },
  {
    label: "عملیات روزانه",
    items: [
      { href: "/attendance", label: "حضور و غیاب", icon: "✓", roles: ["SCHOOL_ADMIN", "TEACHER"], attention: true },
      { href: "#activities", label: "فعالیت‌های کلاسی", icon: "✦", disabled: true },
      { href: "#notifications", label: "اطلاع‌رسانی", icon: "◌", disabled: true },
    ],
  },
];

/**
 * Navigation is a presentation concern only: hidden items are still protected by
 * server-side authorization. Role filtering here keeps the shell honest, not secure.
 */
export function navigationForRole(role: SchoolRole | null): NavSection[] {
  return SCHOOL_NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items.filter((item) => {
      if (item.disabled) return true;
      if (!item.roles) return true;
      return role !== null && item.roles.includes(role);
    }),
  })).filter((section) => section.items.length > 0);
}
