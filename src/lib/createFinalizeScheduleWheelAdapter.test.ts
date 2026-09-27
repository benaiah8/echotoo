/**
 * Create schedule wheel focus adapter — multi-date safe working-copy updates.
 */
import { describe, expect, it } from "vitest";
import {
  applyCreateScheduleWheelDateChange,
  getCreateScheduleWheelFocusDate,
  getCreateScheduleWheelTechnicalBounds,
  normalizeScheduleLocalDay,
} from "./createFinalizeScheduleWheelAdapter";

function d(y: number, m: number, day: number, h = 0, min = 0) {
  return new Date(y, m, day, h, min, 0, 0);
}

describe("createFinalizeScheduleWheelAdapter", () => {
  it("0 dates → creates one stamped working date", () => {
    const next = d(2026, 8, 20);
    const out = applyCreateScheduleWheelDateChange([], next, {
      hours: 19,
      minutes: 0,
    });
    expect(out).toHaveLength(1);
    expect(normalizeScheduleLocalDay(out[0]!)).toEqual(
      normalizeScheduleLocalDay(next)
    );
    expect(out[0]!.getHours()).toBe(19);
  });

  it("1 date → replaces only that date", () => {
    const existing = [d(2026, 8, 10, 19, 0)];
    const next = d(2026, 9, 1);
    const out = applyCreateScheduleWheelDateChange(existing, next, {
      hours: 19,
      minutes: 0,
    });
    expect(out).toHaveLength(1);
    expect(normalizeScheduleLocalDay(out[0]!)).toEqual(
      normalizeScheduleLocalDay(next)
    );
    expect(out[0]!.getHours()).toBe(19);
  });

  it("3 dates → replaces only focused/last date", () => {
    const existing = [d(2026, 8, 1), d(2026, 8, 2), d(2026, 8, 3)];
    const next = d(2026, 10, 15);
    const out = applyCreateScheduleWheelDateChange(existing, next, null);
    expect(out).toHaveLength(3);
    expect(normalizeScheduleLocalDay(out[0]!)).toEqual(
      normalizeScheduleLocalDay(existing[0]!)
    );
    expect(normalizeScheduleLocalDay(out[1]!)).toEqual(
      normalizeScheduleLocalDay(existing[1]!)
    );
    expect(normalizeScheduleLocalDay(out[2]!)).toEqual(
      normalizeScheduleLocalDay(next)
    );
  });

  it("focus date uses last working date or today when empty", () => {
    const now = d(2026, 8, 11);
    expect(getCreateScheduleWheelFocusDate([], now)).toEqual(
      normalizeScheduleLocalDay(now)
    );
    const many = [d(2026, 1, 1), d(2026, 2, 2), d(2026, 3, 3)];
    expect(getCreateScheduleWheelFocusDate(many)).toEqual(
      normalizeScheduleLocalDay(many[2]!)
    );
  });

  it("technical bounds are broad and not Duo 12-month horizon", () => {
    const now = d(2026, 8, 11);
    const { minDate, maxDate } = getCreateScheduleWheelTechnicalBounds(now);
    expect(minDate.getFullYear()).toBe(1976);
    expect(maxDate.getFullYear()).toBe(2076);
    const spanMonths =
      (maxDate.getFullYear() - minDate.getFullYear()) * 12 +
      (maxDate.getMonth() - minDate.getMonth());
    expect(spanMonths).toBeGreaterThan(12);
  });
});
