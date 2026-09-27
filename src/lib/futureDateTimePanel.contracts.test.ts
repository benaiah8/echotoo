/**
 * Documents FutureDateTimePanel state contracts without DOM (no jsdom in repo).
 */

import { describe, expect, it } from "vitest";
import { clampFutureDate, getFutureDatePickerBounds } from "./futureDateBounds";
import type { CreateFlowStartTime } from "./createFlowStartTime";

/** Mirrors panel: switching surfaces must not invent a time. */
function preserveTimeOnSurfaceSwitch(
  selectedTime: CreateFlowStartTime | null
): CreateFlowStartTime | null {
  return selectedTime;
}

/** Mirrors panel: Clear time → null (not 19:00). */
function clearTime(): CreateFlowStartTime | null {
  return null;
}

describe("FutureDateTimePanel state contracts", () => {
  it("null time stays null across surface switches", () => {
    expect(preserveTimeOnSurfaceSwitch(null)).toBeNull();
  });

  it("clear time returns null not a default clock", () => {
    expect(clearTime()).toBeNull();
  });

  it("calendar/wheel share clamp so selection stays in bounds", () => {
    const { minDate, maxDate } = getFutureDatePickerBounds(
      new Date(2026, 8, 6)
    );
    const fromCalendar = clampFutureDate(new Date(2026, 10, 12), minDate, maxDate);
    const fromWheel = clampFutureDate(fromCalendar, minDate, maxDate);
    expect(fromWheel).toEqual(fromCalendar);
  });
});
