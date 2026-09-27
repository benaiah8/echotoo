/**
 * Future date bound helpers — Phase 2B.1 shared panel.
 */

import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  clampFutureDate,
  dateToDobParts,
  daysInMonth,
  dobPartsToDate,
  getFutureDatePickerBounds,
  isDateWithinFutureBounds,
  startOfLocalDay,
} from "./futureDateBounds";
import { clampDobParts } from "./profileDob";

describe("futureDateBounds", () => {
  it("getFutureDatePickerBounds spans today to +12 months", () => {
    const now = new Date(2026, 8, 6); // Sep 6 2026
    const { minDate, maxDate } = getFutureDatePickerBounds(now);
    expect(minDate).toEqual(new Date(2026, 8, 6));
    expect(maxDate).toEqual(new Date(2027, 8, 6));
  });

  it("addMonthsClamped handles month-end overflow", () => {
    expect(addMonthsClamped(new Date(2026, 0, 31), 1)).toEqual(
      new Date(2026, 1, 28)
    );
  });

  it("clampFutureDate pulls past dates up to min", () => {
    const minDate = new Date(2026, 8, 6);
    const maxDate = new Date(2027, 8, 6);
    const clamped = clampFutureDate(new Date(2026, 0, 1), minDate, maxDate);
    expect(startOfLocalDay(clamped)).toEqual(minDate);
  });

  it("clampFutureDate pulls far-future dates down to max", () => {
    const minDate = new Date(2026, 8, 6);
    const maxDate = new Date(2027, 8, 6);
    const clamped = clampFutureDate(new Date(2030, 0, 1), minDate, maxDate);
    expect(startOfLocalDay(clamped)).toEqual(maxDate);
  });

  it("month-length clamp keeps Feb 29 → Feb 28 on non-leap", () => {
    const parts = clampDobParts(
      { year: 2026, month: 2, day: 29 },
      "2026-01-01",
      "2027-12-31"
    );
    expect(parts).toEqual({ year: 2026, month: 2, day: 28 });
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("dateToDobParts / dobPartsToDate round-trip", () => {
    const d = new Date(2026, 10, 15);
    expect(dobPartsToDate(dateToDobParts(d))).toEqual(d);
  });

  it("isDateWithinFutureBounds", () => {
    const minDate = new Date(2026, 8, 6);
    const maxDate = new Date(2027, 8, 6);
    expect(isDateWithinFutureBounds(new Date(2026, 8, 6), minDate, maxDate)).toBe(
      true
    );
    expect(isDateWithinFutureBounds(new Date(2026, 8, 5), minDate, maxDate)).toBe(
      false
    );
  });
});
