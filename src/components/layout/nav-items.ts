import type { SchoolRole } from "@/lib/auth/authorization-core";

export type NavIconName = "dashboard" | "students" | "classrooms" | "academics" | "attendance" | "activities" | "notifications";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  roles?: readonly SchoolRole[];
  disabled?: boolean;
  attention?: boolean;
};

export type NavSection = { label: string; items: readonly NavItem[] };

const SCHOOL_NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "نمای کلی",
    items: [{ href: "/dashboard", label: "داشبورد", icon: "dashboard" }],
  },
  {
    label: "مدیریت مدرسه",
    items: [
      { href: "/students", label: "دانش‌آموزان", icon: "students", roles: ["SCHOOL_ADMIN"] },
      { href: "/academics/classrooms", label: "کلاس‌ها", icon: "classrooms", roles: ["SCHOOL_ADMIN"] },
      { href: "/academics", label: "ساختار آموزشی", icon: "academics", roles: ["SCHOOL_ADMIN"] },
    ],
  },
  {
    label: "عملیات روزانه",
    items: [
      { href: "/attendance", label: "حضور و غیاب", icon: "attendance", roles: ["SCHOOL_ADMIN", "TEACHER"], attention: true },
      { href: "#activities", label: "فعالیت‌های کلاسی", icon: "activities", disabled: true },
      { href: "#notifications", label: "اطلاع‌رسانی", icon: "notifications", disabled: true },
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
