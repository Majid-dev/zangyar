import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { executeAction } from "./execute";
import { actionFailure, actionSuccess, fieldErrorFor, isActionFailure, isActionSuccess } from "./result";

describe("action result helpers", () => {
  it("narrows success and failure", () => {
    const success = actionSuccess({ id: "1" }, "ذخیره شد");
    const failure = actionFailure("validation", "خطا", { name: ["الزامی است"] });

    expect(isActionSuccess(success)).toBe(true);
    expect(isActionFailure(success)).toBe(false);
    expect(isActionFailure(failure)).toBe(true);
    expect(isActionSuccess(failure)).toBe(false);
  });

  it("treats null state as neither", () => {
    expect(isActionSuccess(null)).toBe(false);
    expect(isActionFailure(null)).toBe(false);
  });

  it("reads the first field error", () => {
    const failure = actionFailure("validation", "خطا", { admissionNumber: ["الزامی است", "تکراری است"] });
    expect(fieldErrorFor(failure, "admissionNumber")).toBe("الزامی است");
    expect(fieldErrorFor(failure, "unknown")).toBeUndefined();
    expect(fieldErrorFor(null, "admissionNumber")).toBeUndefined();
  });
});

describe("executeAction", () => {
  it("returns success data with the message", async () => {
    const result = await executeAction(async () => ({ id: "abc" }), "ثبت شد");
    expect(result).toEqual({ ok: true, data: { id: "abc" }, message: "ثبت شد" });
  });

  it("maps a ZodError to per-field validation errors", async () => {
    const schema = z.object({ name: z.string().min(1, "نام الزامی است"), code: z.string().min(1, "کد الزامی است") });
    const result = await executeAction(async () => schema.parse({ name: "", code: "" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("validation");
    expect(result.fieldErrors?.name).toEqual(["نام الزامی است"]);
    expect(result.fieldErrors?.code).toEqual(["کد الزامی است"]);
  });

  it("translates known domain errors to Persian", async () => {
    const result = await executeAction(async () => {
      throw new Error("Student not found.");
    });
    expect(result).toEqual({ ok: false, kind: "server", message: "دانش‌آموز پیدا نشد." });
  });

  it("classifies unique-violation messages as conflicts", async () => {
    const result = await executeAction(async () => {
      throw new Error("A record with these unique values already exists.");
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("conflict");
    expect(result.message).toBe("رکوردی با این مقادیر تکراری از قبل وجود دارد.");
  });

  it("translates enrollment overlap as a conflict", async () => {
    const result = await executeAction(async () => {
      throw new Error("Enrollment dates overlap an existing enrollment.");
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("conflict");
    expect(result.message).toBe("این بازه با یک ثبت‌نام قبلی هم‌پوشانی دارد.");
  });

  it("never leaks an unmapped internal message", async () => {
    const result = await executeAction(async () => {
      throw new Error("relation \"students\" does not exist at character 42");
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("انجام این عملیات ممکن نشد. لطفاً دوباره تلاش کنید.");
    expect(result.message).not.toContain("students");
  });

  it("handles a thrown non-Error value", async () => {
    const result = await executeAction(async () => {
      throw "boom";
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("خطای غیرمنتظره در انجام عملیات رخ داد.");
  });
});
