import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JalaliDatePicker } from "./jalali-date-picker";

/**
 * Renders the picker on the server to verify the contract every consumer relies
 * on: the visible control shows Jalali, while the submitted value is Gregorian
 * ISO in a hidden input. Hooks with side effects (the popup) are not exercised.
 */
function render(props: Parameters<typeof JalaliDatePicker>[0]) {
  return renderToStaticMarkup(createElement(JalaliDatePicker, props));
}

function hiddenValue(html: string) {
  const match = /<input type="hidden" name="[^"]*" value="([^"]*)"/.exec(html);
  return match ? match[1] : null;
}

describe("JalaliDatePicker", () => {
  it("submits Gregorian ISO while displaying Jalali", () => {
    const html = render({ name: "startDate", defaultValue: "2026-11-21" });
    expect(hiddenValue(html)).toBe("2026-11-21");
    expect(html).toContain("۱۴۰۵/۰۸/۳۰");
    expect(html).not.toContain('value="2026-11-21" type="text"');
  });

  it("starts empty when no value is given", () => {
    const html = render({ name: "endDate" });
    expect(hiddenValue(html)).toBe("");
  });

  it("keeps the submitted field name stable for form parsing", () => {
    expect(render({ name: "birthDate" })).toContain('name="birthDate"');
  });

  it("shows the live Gregorian equivalent so the operator can confirm conversion", () => {
    const html = render({ name: "startDate", defaultValue: "2026-03-21" });
    expect(html).toContain("2026-03-21");
    expect(html).toContain("۱۴۰۵/۰۱/۰۱");
  });

  it("does not throw on a malformed stored value and submits nothing", () => {
    const html = render({ name: "startDate", defaultValue: "not-a-date" });
    expect(hiddenValue(html)).toBe("");
  });
});
