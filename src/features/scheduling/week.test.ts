import { describe, expect, it } from "vitest";

import {
  academicWeekIndex,
  academicWeekNumber,
  isMorningRotationWeek,
  isSchoolOperatingDay,
  resolveApplicableShift,
  resolveAttendanceRotationTeacher,
  resolvePeriodTimes,
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

describe("academicWeekIndex", () => {
  it("counts whole school weeks from the academic year's own first week", () => {
    // 2026-09-23 is a Wednesday, so the opening school week begins Saturday
    // 2026-09-19 — the anchor is snapped to the week the year opens in.
    expect(academicWeekIndex("2026-09-23", "2026-09-19")).toBe(0);
    expect(academicWeekIndex("2026-09-23", "2026-09-23")).toBe(0);
    expect(academicWeekIndex("2026-09-23", "2026-09-26")).toBe(1);
    expect(academicWeekIndex("2026-09-23", "2026-11-21")).toBe(9);
  });

  it("does not reset at a calendar year boundary", () => {
    // A year crossing into January keeps counting: 1405 opens in September, so by
    // January the index is large and positive rather than wrapping to zero. This is
    // the reset the school week numbering is chosen to avoid.
    const acrossNewYear = academicWeekIndex("2026-09-23", "2027-01-09");
    expect(acrossNewYear).toBeGreaterThan(15);
    // Parity is preserved across the boundary: two weeks apart share a parity.
    expect(academicWeekIndex("2026-09-23", "2027-01-23") - acrossNewYear).toBe(2);
  });

  it("is negative before the year opens, so dates earlier still alternate in step", () => {
    // 2026-09-12 and 2026-09-05 are the two Saturdays before the year opens. Their
    // negative indices keep the same parity the pattern has after the anchor.
    expect(academicWeekIndex("2026-09-23", "2026-09-12")).toBe(-1);
    expect(academicWeekIndex("2026-09-23", "2026-09-05")).toBe(-2);
  });

  it("numbers weeks from one for the interface", () => {
    expect(academicWeekNumber("2026-09-23", "2026-09-19")).toBe(1);
    expect(academicWeekNumber("2026-09-23", "2026-11-21")).toBe(10);
  });
});

describe("resolveAttendanceRotationTeacher", () => {
  const rotation = { baseTeacherMembershipId: "first", partnerTeacherMembershipId: "second" };

  it("gives the base week to the teacher who holds the period's first hour", () => {
    expect(resolveAttendanceRotationTeacher(rotation, "2026-09-23", "2026-09-19")).toBe("first");
    expect(resolveAttendanceRotationTeacher(rotation, "2026-09-23", "2026-09-26")).toBe("second");
  });

  it("alternates every week and keeps the whole week with one teacher", () => {
    // Every day of one school week resolves to the same teacher, so the period is
    // never split between the two within a week.
    for (const date of ["2026-11-21", "2026-11-22", "2026-11-25"]) {
      expect(resolveAttendanceRotationTeacher(rotation, "2026-09-23", date)).toBe("second");
    }
    expect(resolveAttendanceRotationTeacher(rotation, "2026-09-23", "2026-11-28")).toBe("first");
  });

  it("returns null for a period that does not alternate", () => {
    expect(resolveAttendanceRotationTeacher(null, "2026-09-23", "2026-11-21")).toBeNull();
  });

  it("alternates backwards from the anchor rather than inverting", () => {
    // One week before the year opens is the partner's, two weeks before is the
    // base teacher's — the same order the pattern continues forward.
    expect(resolveAttendanceRotationTeacher(rotation, "2026-09-23", "2026-09-12")).toBe("second");
    expect(resolveAttendanceRotationTeacher(rotation, "2026-09-23", "2026-09-05")).toBe("first");
  });
});

describe("resolvePeriodTimes", () => {
  const rotatingPeriod = {
    startTime: "08:00:00",
    endTime: "10:00:00",
    afternoonStartTime: "13:00:00",
    afternoonEndTime: "15:00:00",
  };

  it("uses the shift the date is in", () => {
    expect(resolvePeriodTimes(rotatingPeriod, "MORNING")).toEqual({ startTime: "08:00:00", endTime: "10:00:00" });
    expect(resolvePeriodTimes(rotatingPeriod, "AFTERNOON")).toEqual({ startTime: "13:00:00", endTime: "15:00:00" });
  });

  it("falls back to the opening times when no afternoon schedule is stated", () => {
    // A rotating school that has not entered an afternoon schedule runs the opening
    // one rather than an undefined set of times.
    const noAfternoon = { ...rotatingPeriod, afternoonStartTime: null, afternoonEndTime: null };
    expect(resolvePeriodTimes(noAfternoon, "AFTERNOON")).toEqual({ startTime: "08:00:00", endTime: "10:00:00" });
  });

  it("is indifferent to the shift for a fixed school", () => {
    const fixed = { startTime: "08:00:00", endTime: "10:00:00", afternoonStartTime: null, afternoonEndTime: null };
    expect(resolvePeriodTimes(fixed, "MORNING")).toEqual(resolvePeriodTimes(fixed, "AFTERNOON"));
  });
});
