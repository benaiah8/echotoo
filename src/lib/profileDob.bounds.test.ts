/**
 * DOB bounds regression — Profile DOB defaults must stay past-only / 13+.
 */

import { describe, expect, it } from "vitest";
import { getDobPickerBounds, parseDateOnly } from "./profileDob";

describe("profileDob bounds regression", () => {
  it("maxDate is today minus 13 years", () => {
    const { maxDate } = getDobPickerBounds();
    const max = parseDateOnly(maxDate)!;
    const now = new Date();
    const expectedYear = now.getFullYear() - 13;
    expect(max.year).toBe(expectedYear);
    expect(max.month).toBe(now.getMonth() + 1);
    expect(max.day).toBe(now.getDate());
  });

  it("minDate is not after 1900-01-01 floor", () => {
    const { minDate } = getDobPickerBounds();
    const min = parseDateOnly(minDate)!;
    expect(min.year).toBeGreaterThanOrEqual(1900);
  });
});
