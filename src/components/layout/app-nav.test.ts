import { describe, expect, it } from "vitest";

import { activeHref } from "./app-nav";
import { navigationForRole } from "./nav-items";

const adminSections = navigationForRole("SCHOOL_ADMIN");
const teacherSections = navigationForRole("TEACHER");

function labels(sections: ReturnType<typeof navigationForRole>) {
  return sections.flatMap((section) => section.items.map((item) => item.label));
}

describe("navigationForRole", () => {
  it("shows school-management items to School Admins", () => {
    expect(labels(adminSections)).toContain("دانش‌آموزان");
    expect(labels(adminSections)).toContain("کلاس‌ها");
    expect(labels(adminSections)).toContain("ساختار آموزشی");
  });

  it("hides School Admin only routes from Teachers but keeps attendance", () => {
    const teacherLabels = labels(teacherSections);
    expect(teacherLabels).not.toContain("دانش‌آموزان");
    expect(teacherLabels).not.toContain("کلاس‌ها");
    expect(teacherLabels).not.toContain("ساختار آموزشی");
    expect(teacherLabels).toContain("حضور و غیاب");
    expect(teacherLabels).toContain("داشبورد");
  });

  it("keeps disabled placeholders instead of dropping items when role is unknown", () => {
    const unknown = labels(navigationForRole(null));
    expect(unknown).toContain("فعالیت‌های کلاسی");
    expect(unknown).not.toContain("دانش‌آموزان");
  });

  it("never leaves an empty section", () => {
    for (const sections of [adminSections, teacherSections, navigationForRole(null)]) {
      expect(sections.every((section) => section.items.length > 0)).toBe(true);
    }
  });
});

describe("activeHref", () => {
  it("matches an exact route", () => {
    expect(activeHref("/dashboard", adminSections)).toBe("/dashboard");
  });

  it("keeps the parent highlighted on nested routes", () => {
    expect(activeHref("/students/new", adminSections)).toBe("/students");
    expect(activeHref("/students/9f1c", adminSections)).toBe("/students");
  });

  it("prefers the longest matching href", () => {
    expect(activeHref("/academics/classrooms", adminSections)).toBe("/academics/classrooms");
    expect(activeHref("/academics", adminSections)).toBe("/academics");
    expect(activeHref("/academics/years", adminSections)).toBe("/academics");
  });

  it("does not match a partial segment", () => {
    expect(activeHref("/students-archive", adminSections)).toBeNull();
  });

  it("ignores disabled placeholders", () => {
    expect(activeHref("/activities", adminSections)).toBeNull();
  });
});
