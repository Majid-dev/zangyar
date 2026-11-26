import { describe, expect, it } from "vitest";

import {
  isMorningRotationWeek,
  isSchoolOperatingDay,
  resolveApplicableShift,
  schoolDayOfWeek,
  schoolWeekStart,
  summarizeTeacherHours,
  weeksBetween,
} from "./week";

describe("schoolDayOfWeek", () => {
  it("numbers the school week from Saturday", () => {
    // 2026-11-21 is a Saturday, which opens the school week.
    expect(schoolDayOfWeek("2026-11-21")).toBe(1);
    expect(schoolDayOfWeek("2026-11-22")).toBe(2);
    expect(schoolDayOfWeek("2026-11-26")).toBe(6);
    // Friday closes the week.
    expect(schoolDayOfWeek("2026-11-27")).toBe(7);
    expect(schoolDayOfWeek("2026-11-28")).toBe(1);
  });
});

describe("schoolWeekStart", () => {
  it("snaps every day of a week to the same Saturday", () => {
    for (const date of ["2026-11-21", "2026-11-22", "2026-11-25", "2026-11-27"]) {
      expect(schoolWeekStart(date)).toBe("2026-11-21");
    }
    expect(schoolWeekStart("2026-11-28")).toBe("2026-11-28");
  });

  it("counts whole weeks between starts, signed", () => {
    expect(weeksBetween("2026-11-21", "2026-11-28")).toBe(1);
    expect(weeksBetween("2026-11-21", "2026-12-12")).toBe(3);
    expect(weeksBetween("2026-11-21", "2026-11-14")).toBe(-1);
  });
});

describe("isMorningRotationWeek", () => {
  it("gives the base week to the morning and alternates from there", () => {
    expect(isMorningRotationWeek("2026-11-21", "2026-11-21")).toBe(true);
    expect(isMorningRotationWeek("2026-11-21", "2026-11-25")).toBe(true);
    expect(isMorningRotationWeek("2026-11-21", "2026-11-28")).toBe(false);
    expect(isMorningRotationWeek("2026-11-21", "2026-12-05")).toBe(true);
  });

  it("keeps alternating before the anchor instead of inverting", () => {
    expect(isMorningRotationWeek("2026-11-21", "2026-11-14")).toBe(false);
    expect(isMorningRotationWeek("2026-11-21", "2026-11-07")).toBe(true);
  });
});

describe("resolveApplicableShift", () => {
  it("answers a fixed shift with itself, whatever the date", () => {
    expect(resolveApplicableShift("2026-11-21", { shiftType: "MORNING", rotationBaseDate: null })).toBe("MORNING");
    expect(resolveApplicableShift("2026-11-28", { shiftType: "AFTERNOON", rotationBaseDate: null })).toBe("AFTERNOON");
  });

  it("alternates a rotating school week by week from the anchor", () => {
    const configuration = { shiftType: "ROTATING" as const, rotationBaseDate: "2026-11-21" };
    expect(resolveApplicableShift("2026-11-21", configuration)).toBe("MORNING");
    expect(resolveApplicableShift("2026-11-25", configuration)).toBe("MORNING");
    expect(resolveApplicableShift("2026-11-28", configuration)).toBe("AFTERNOON");
    expect(resolveApplicableShift("2026-12-05", configuration)).toBe("MORNING");
  });

  it("falls back to morning rather than throwing when a rotating row has no anchor", () => {
    // The check constraint requires an anchor, so this is only reachable from a row
    // written before it existed; a live school is more useful than an error page.
    expect(resolveApplicableShift("2026-11-28", { shiftType: "ROTATING", rotationBaseDate: null })).toBe("MORNING");
  });
});

describe("isSchoolOperatingDay", () => {
  it("accepts only the configured weekdays", () => {
    // Saturday through Wednesday.
    const operatingDays = [1, 2, 3, 4, 5];
    expect(isSchoolOperatingDay("2026-11-21", operatingDays)).toBe(true);
    expect(isSchoolOperatingDay("2026-11-25", operatingDays)).toBe(true);
    // Thursday and Friday are closed.
    expect(isSchoolOperatingDay("2026-11-26", operatingDays)).toBe(false);
    expect(isSchoolOperatingDay("2026-11-27", operatingDays)).toBe(false);
  });

  it("treats an unconfigured week as closed on every day", () => {
    expect(isSchoolOperatingDay("2026-11-21", [])).toBe(false);
  });
});

describe("summarizeTeacherHours", () => {
  it("counts one hour per assignment and compares them to the weekly requirement", () => {
    const rows = summarizeTeacherHours(
      [
        { teacherMembershipId: "t1" },
        { teacherMembershipId: "t1" },
        { teacherMembershipId: "t1" },
        { teacherMembershipId: "t1" },
        { teacherMembershipId: "t2" },
      ],
      new Map([["t1", 4], ["t2", 1]]),
    );
    expect(rows).toMatchObject([
      { teacherMembershipId: "t1", assignedWeeklyHours: 4, requiredWeeklyHours: 4, difference: 0, slotCount: 4 },
      { teacherMembershipId: "t2", assignedWeeklyHours: 1, requiredWeeklyHours: 1, difference: 0, slotCount: 1 },
    ]);
  });

  it("gives each of a split period's teachers their own hour", () => {
    // A period split between two teachers is two rows, one each, so each teacher's
    // total counts only the hour they hold.
    const rows = summarizeTeacherHours(
      [
        { teacherMembershipId: "t1" },
        { teacherMembershipId: "t2" },
      ],
      new Map([["t1", 1], ["t2", 1]]),
    );
    expect(rows.every((row) => row.assignedWeeklyHours === 1 && row.difference === 0)).toBe(true);
  });

  it("leaves the difference unknown for a teacher with no stated requirement", () => {
    const [row] = summarizeTeacherHours([{ teacherMembershipId: "t1" }, { teacherMembershipId: "t1" }], new Map());
    expect(row).toMatchObject({ assignedWeeklyHours: 2, requiredWeeklyHours: null, difference: null });
  });

  it("reports a teacher who has a requirement but no assignments", () => {
    const [row] = summarizeTeacherHours([], new Map([["t1", 6]]));
    expect(row).toMatchObject({ teacherMembershipId: "t1", assignedWeeklyHours: 0, requiredWeeklyHours: 6, difference: -6 });
  });
});
