import { describe, expect, it } from "vitest";

import { hourGateFor, hourGateVerdict, isSchedulable, MAXIMUM_WEEKLY_HOURS, MINIMUM_WEEKLY_HOURS } from "./hours";

describe("isSchedulable", () => {
  it("refuses a teacher with no recorded obligation", () => {
    expect(isSchedulable(null)).toBe(false);
    expect(isSchedulable(undefined)).toBe(false);
  });

  it("refuses zero, which is the same answer as missing", () => {
    // A school that owes nobody any hours has no reason to put them on a
    // timetable, so zero must not open the same gate a real figure does.
    expect(isSchedulable(0)).toBe(false);
  });

  it("accepts any positive figure up to the ceiling", () => {
    expect(isSchedulable(MINIMUM_WEEKLY_HOURS)).toBe(true);
    expect(isSchedulable(18)).toBe(true);
    expect(isSchedulable(MAXIMUM_WEEKLY_HOURS)).toBe(true);
  });

  it("refuses a value that is not a real number", () => {
    expect(isSchedulable(Number.NaN)).toBe(false);
    expect(isSchedulable(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("hourGateVerdict", () => {
  it("reports nothing when the school has no active year", () => {
    // With no year to schedule into, nothing is being withheld, so the teacher is
    // not reported as blocked.
    expect(hourGateVerdict(hourGateFor(null, null))).toBe("NOT_APPLICABLE");
    expect(hourGateVerdict(hourGateFor(null, 12))).toBe("NOT_APPLICABLE");
  });

  it("reports outstanding when the year records nothing usable", () => {
    expect(hourGateVerdict(hourGateFor("year-1", null))).toBe("OUTSTANDING");
    expect(hourGateVerdict(hourGateFor("year-1", 0))).toBe("OUTSTANDING");
  });

  it("reports satisfied only for a positive figure in a real year", () => {
    expect(hourGateVerdict(hourGateFor("year-1", 1))).toBe("SATISFIED");
    expect(hourGateVerdict(hourGateFor("year-1", 24))).toBe("SATISFIED");
  });
});
