import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/attendance",
  useSearchParams: () => new URLSearchParams(""),
}));

import { AttendanceFilterBar } from "./attendance-filters";
import type { AttendanceWorkspaceData } from "./attendance-workspace";

/**
 * The bar, rendered as markup, with no occurrences to list.
 *
 * The workspace is reduced to the two things the bar reads — the grade it is scoped to
 * and the options it offers — because a filter bar's markup is a function of nothing
 * else, and building a whole day's worth of slots to render four inputs would be
 * fixture for its own sake.
 */
function workspace(overrides: Partial<AttendanceWorkspaceData> = {}): AttendanceWorkspaceData {
  return {
    businessDate: "2026-11-28",
    timezone: "Asia/Tehran",
    serverNow: "2026-11-28T06:00:00.000Z",
    slots: [],
    slot: null,
    students: [],
    recordedCount: 0,
    filterOptions: {
      grades: [{ id: "g1", name: "پایه دهم" }, { id: "g2", name: "پایه یازدهم" }],
      classrooms: [{ id: "c1", name: "کامپیوتر - دهم" }],
      periods: [{ id: "p1", ordinal: 1 }, { id: "p2", ordinal: 2 }],
    },
    totalSlotCount: 4,
    daySlotCount: 4,
    activeSlotCount: 0,
    gradeScopeId: "g1",
    activeOnly: false,
    ...overrides,
  };
}

function render() {
  return renderToStaticMarkup(createElement(AttendanceFilterBar, { workspace: workspace(), view: "day" as const }));
}

describe("AttendanceFilterBar", () => {
  it("draws every filter as the same control", () => {
    const html = render();
    // Four fields, four text inputs: the grade and the status are pickers now rather
    // than native selects, which is what makes the four the same kind of thing.
    expect(html.match(/<input/g)).toHaveLength(4);
    expect(html).not.toContain("<select");
    for (const label of ["پایه", "کلاس", "زنگ", "وضعیت ثبت"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it("states the current grade and the clear option for the filters that have one", () => {
    const html = render();
    // The grade's own name is what the field shows, because a scope is always set.
    expect(html).toContain('value="پایه دهم"');
    // The clear option is named in the field when nothing is chosen, so an unset
    // filter says what it is doing instead of looking empty.
    expect(html).toContain('value="همه کلاس‌های این پایه"');
    expect(html).toContain('value="همه زنگ‌ها"');
    expect(html).toContain('value="همه وضعیت‌ها"');
  });

  it("carries no hints or descriptions on any filter", () => {
    const html = render();
    // The option-level hints the old picker showed beside "all" are gone, and nothing
    // else describes a filter in prose.
    expect(html).not.toContain("نمایش زنگ‌های همه کلاس‌ها");
    expect(html).not.toContain("نمایش زنگ‌های همه نوبت‌ها");
    expect(html).not.toContain("نمایش زنگ‌های همه کلاس‌های این پایه");
    // The only remaining prose in the bar is the clear action, which is a control
    // rather than a hint, and it is absent while no filter is set.
    expect(html).not.toContain("پاک کردن فیلترها");
  });
});
