import { describe, expect, it } from "vitest";

import { isAttendancePeriodActive, resolveAttendanceWindow, type AttendanceWindowInput } from "./window";

/**
 * 2026-11-21 is a Saturday, school weekday 1: the period runs 08:00–10:00 Tehran
 * time (UTC+03:30), so its bell is 04:30Z and its end is 06:30Z. The school's grace
 * period is 30 minutes, putting the deadline at 07:00Z.
 */
const PERIOD_START = new Date("2026-11-21T04:30:00.000Z");
const PERIOD_END = new Date("2026-11-21T06:30:00.000Z");
const DEADLINE = new Date("2026-11-21T07:00:00.000Z");

function windowAt(now: string, overrides: Partial<AttendanceWindowInput> = {}) {
  return resolveAttendanceWindow({
    now: new Date(now),
    periodStartAt: PERIOD_START,
    periodEndAt: PERIOD_END,
    submissionDeadlineAt: DEADLINE,
    hasSession: false,
    sessionClosed: false,
    role: "TEACHER",
    ...overrides,
  });
}

describe("resolveAttendanceWindow for a teacher", () => {
  it("reports a period that has not begun as upcoming and refuses it", () => {
    const result = windowAt("2026-11-21T04:00:00.000Z");
    expect(result.state).toBe("UPCOMING");
    expect(result.canSubmit).toBe(false);
    expect(result.blocker).toContain("هنوز آغاز نشده");
  });

  it("opens the moment the period begins", () => {
    const result = windowAt("2026-11-21T04:30:00.000Z");
    expect(result.state).toBe("OPEN");
    expect(result.canSubmit).toBe(true);
    expect(result.blocker).toBeNull();
  });

  it("keeps a period open through its final minute", () => {
    expect(windowAt("2026-11-21T06:30:00.000Z").state).toBe("OPEN");
  });

  it("moves a finished period into its grace window", () => {
    const result = windowAt("2026-11-21T06:31:00.000Z");
    expect(result.state).toBe("GRACE");
    expect(result.withinGrace).toBe(true);
    expect(result.canSubmit).toBe(true);
  });

  it("keeps the grace window open up to the deadline and no further", () => {
    expect(windowAt("2026-11-21T07:00:00.000Z").canSubmit).toBe(true);
    // One second past it the teacher is out of time.
    const late = windowAt("2026-11-21T07:00:01.000Z");
    expect(late.state).toBe("EXPIRED");
    expect(late.canSubmit).toBe(false);
    expect(late.blocker).toContain("مهلت ثبت");
  });

  it("reports a registered occurrence as submitted rather than by the clock", () => {
    // Long past the deadline, but a register exists: the teacher is looking at what
    // was recorded, so "ثبت شده" is the honest answer.
    const result = windowAt("2026-11-22T09:00:00.000Z", { hasSession: true });
    expect(result.state).toBe("SUBMITTED");
    expect(result.canSubmit).toBe(false);
    expect(result.blocker).toContain("مهلت ویرایش");
  });

  it("still refuses a future date even when a register exists", () => {
    // A session for a period that has not happened cannot be corrected; there is
    // nothing true to correct it towards.
    const result = windowAt("2026-11-21T04:00:00.000Z", { hasSession: true });
    expect(result.state).toBe("SUBMITTED");
    expect(result.canSubmit).toBe(false);
    expect(result.blocker).toContain("هنوز آغاز نشده");
  });
});

describe("resolveAttendanceWindow for a School Admin", () => {
  it("allows a correction past the deadline", () => {
    const result = windowAt("2026-11-25T09:00:00.000Z", { role: "SCHOOL_ADMIN" });
    expect(result.canSubmit).toBe(true);
    expect(result.blocker).toBeNull();
    // The state still reports the occurrence honestly, even though the admin may act.
    expect(result.state).toBe("EXPIRED");
  });

  it("is allowed before the period begins, because correcting is not inventing", () => {
    // "Any school date" (ADR-007) has to include the one being prepared; there is no
    // register on a date that has not happened for the freedom to corrupt.
    const result = windowAt("2026-11-21T04:00:00.000Z", { role: "SCHOOL_ADMIN" });
    expect(result.canSubmit).toBe(true);
    expect(result.blocker).toBeNull();
    // The state is still stated honestly: nothing has started yet.
    expect(result.state).toBe("UPCOMING");
  });
});

describe("resolveAttendanceWindow for a closed session", () => {
  it("refuses everyone, admin included", () => {
    for (const role of ["TEACHER", "SCHOOL_ADMIN"] as const) {
      const result = windowAt("2026-11-21T05:00:00.000Z", { hasSession: true, sessionClosed: true, role });
      expect(result.state).toBe("CLOSED");
      expect(result.canSubmit).toBe(false);
      expect(result.blocker).toContain("بسته شده");
    }
  });
});

describe("isAttendancePeriodActive", () => {
  const active = (now: string) => isAttendancePeriodActive({ now: new Date(now), periodStartAt: PERIOD_START, periodEndAt: PERIOD_END });

  it("is false before the bell", () => {
    expect(active("2026-11-21T04:29:00.000Z")).toBe(false);
  });

  it("is true from the bell through the closing bell", () => {
    expect(active("2026-11-21T04:30:00.000Z")).toBe(true);
    expect(active("2026-11-21T05:30:00.000Z")).toBe(true);
    expect(active("2026-11-21T06:30:00.000Z")).toBe(true);
  });

  it("is false once the period has ended, even inside the grace window", () => {
    // The grace period is time to record the register, not time in class, so a
    // period past its closing bell is not one that is in session.
    expect(active("2026-11-21T06:31:00.000Z")).toBe(false);
    expect(active("2026-11-21T07:00:00.000Z")).toBe(false);
  });

  it("does not depend on whether a register exists", () => {
    // The question is about the clock, so it is answered from the instants alone:
    // a registered period and an unregistered one are equally in session at 05:30.
    const at = new Date("2026-11-21T05:30:00.000Z");
    expect(isAttendancePeriodActive({ now: at, periodStartAt: PERIOD_START, periodEndAt: PERIOD_END })).toBe(true);
    expect(windowAt("2026-11-21T05:30:00.000Z", { hasSession: true }).state).toBe("SUBMITTED");
  });
});
