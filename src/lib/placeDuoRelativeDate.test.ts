/**
 * Place Duo relative schedule labels — deterministic local calendar-day math.
 */

import { describe, expect, it } from "vitest";
import {
  formatPlaceDuoRelativeDayLabel,
  formatPlaceDuoScheduleSummary,
  localCalendarDayDiff,
} from "./placeDuoRelativeDate";

/** Local noon on Y-M-D (month is 0-based). */
function localDay(y: number, m: number, d: number): Date {
  return new Date(y, m, d, 12, 0, 0, 0);
}

describe("localCalendarDayDiff", () => {
  it("uses calendar days, not raw 24h ticks across DST-ish local midnights", () => {
    const today = localDay(2026, 8, 6); // Sep 6
    expect(localCalendarDayDiff(today, localDay(2026, 8, 6))).toBe(0);
    expect(localCalendarDayDiff(today, localDay(2026, 8, 7))).toBe(1);
    expect(localCalendarDayDiff(today, localDay(2026, 8, 12))).toBe(6);
  });
});

describe("formatPlaceDuoRelativeDayLabel", () => {
  const today = localDay(2026, 8, 6); // Sunday Sep 6, 2026

  it("today", () => {
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 6), today)).toBe(
      "Today"
    );
  });

  it("tomorrow", () => {
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 7), today)).toBe(
      "Tomorrow"
    );
  });

  it("2–6 days → This {weekday}", () => {
    // Sep 12 2026 is Saturday, +6 days
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 12), today)).toBe(
      "This Saturday"
    );
    // Sep 8 2026 is Tuesday, +2
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 8), today)).toBe(
      "This Tuesday"
    );
  });

  it("7–13 days → Next {weekday}", () => {
    // Sep 13 2026 Sunday = +7
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 13), today)).toBe(
      "Next Sunday"
    );
    // Sep 19 2026 Saturday = +13
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 19), today)).toBe(
      "Next Saturday"
    );
  });

  it("14+ → In N days", () => {
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 25), today)).toBe(
      "In 19 days"
    );
    expect(formatPlaceDuoRelativeDayLabel(localDay(2026, 8, 20), today)).toBe(
      "In 14 days"
    );
  });
});

describe("formatPlaceDuoScheduleSummary", () => {
  const today = localDay(2026, 8, 6);

  it("date-only shows Any time, never a clock from noon stamp", () => {
    const summary = formatPlaceDuoScheduleSummary(
      localDay(2026, 8, 12),
      null,
      today
    );
    expect(summary.primary).toBe("This Saturday");
    expect(summary.secondary).toMatch(/Sat.*Sep.*12/i);
    expect(summary.secondary).toContain("Any time");
    expect(summary.secondary.toLowerCase()).not.toMatch(/\b12:00\b|\bnoon\b/);
    expect(summary.hasExplicitTime).toBe(false);
  });

  it("explicit time shows compact clock", () => {
    const summary = formatPlaceDuoScheduleSummary(
      localDay(2026, 8, 12),
      { hours: 19, minutes: 30 },
      today
    );
    expect(summary.primary).toBe("This Saturday");
    expect(summary.secondary).toMatch(/7:30\s*PM/i);
    expect(summary.secondary).not.toContain("Any time");
    expect(summary.hasExplicitTime).toBe(true);
  });
});
