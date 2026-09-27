/**
 * Addis full-day social source eligibility — FE mirror of approved backend rule.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canOfferGroupUp,
  canOfferOpenPlan,
  canOfferPairUp,
  hasValidRecurrenceDays,
} from "../pairUpEligibility";
import { HOME_EVENT_TIMEZONE } from "../homeFeedConstants";

const base = {
  postId: "post-1",
  status: "published" as const,
  visibility: "public",
  authorIsPrivate: false,
};

/** Addis local midnight for calendar day D → previous UTC 21:00. */
function addisMidnightIso(addisDay: string): string {
  const [y, m, d] = addisDay.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d, 0, 0, 0) - 3 * 60 * 60 * 1000;
  return new Date(utc).toISOString();
}

describe("canOfferOpenPlan / experience Duo", () => {
  it("allows Place with no date and no location fields", () => {
    expect(
      canOfferOpenPlan({
        ...base,
        postType: "experience",
      })
    ).toBe(true);
  });

  it("rejects hangout for Open Plan", () => {
    expect(
      canOfferOpenPlan({
        ...base,
        postType: "hangout",
      })
    ).toBe(false);
  });
});

describe("canOfferPairUp / hangout Duo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows hangout with upcoming selected_dates (location irrelevant)", () => {
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: ["2099-06-01T12:00:00.000Z"],
      })
    ).toBe(true);
  });

  it("hides hangout with empty selected_dates (date gate, not location)", () => {
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [],
      })
    ).toBe(false);
  });

  it("hides ended hangout (past selected_dates only)", () => {
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: ["2020-01-01T12:00:00.000Z"],
      })
    ).toBe(false);
  });

  it("allows recurring hangout with valid recurrence_days", () => {
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: true,
        selectedDates: null,
        recurrenceDays: ["FR"],
      })
    ).toBe(true);
  });

  it("rejects experience for Pair Up", () => {
    expect(
      canOfferPairUp({
        ...base,
        postType: "experience",
        selectedDates: ["2099-06-01T12:00:00.000Z"],
      })
    ).toBe(false);
  });

  it("keeps date-only eligible after Addis midnight on the same day (known failure)", () => {
    // Failure capture: selected Addis 2026-09-10 00:00, tap 03:25 Addis.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:25:40.026Z"));
    expect(HOME_EVENT_TIMEZONE).toBe("Africa/Addis_Ababa");
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: ["2026-09-09T21:00:00.000Z"],
      })
    ).toBe(true);
  });

  it("keeps explicit-time eligible after start time on the same Addis day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:25:40.026Z")); // 03:25 Addis
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        // 01:00 Addis on 2026-09-10 — already past at tap, same calendar day
        selectedDates: ["2026-09-09T22:00:00.000Z"],
      })
    ).toBe(true);
  });

  it("rejects previous Addis calendar day only", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:25:40.026Z"));
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [addisMidnightIso("2026-09-09")],
      })
    ).toBe(false);
  });

  it("treats exact Addis midnight as the start of that calendar day", () => {
    vi.useFakeTimers();
    // One ms before Addis 2026-09-10 midnight → still 2026-09-09
    vi.setSystemTime(new Date("2026-09-09T20:59:59.999Z"));
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [addisMidnightIso("2026-09-10")],
      })
    ).toBe(true);

    vi.setSystemTime(new Date("2026-09-09T21:00:00.000Z"));
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [addisMidnightIso("2026-09-10")],
      })
    ).toBe(true);
  });

  it("uses Addis social rule independent of a non-Addis wall clock day", () => {
    vi.useFakeTimers();
    // 2026-09-09 22:00 in New York is still 2026-09-10 05:00 Addis.
    vi.setSystemTime(new Date("2026-09-10T02:00:00.000Z"));
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [addisMidnightIso("2026-09-10")],
      })
    ).toBe(true);
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [addisMidnightIso("2026-09-09")],
      })
    ).toBe(false);
  });

  it("keeps multi-date eligible when any occurrence is today-or-later Addis", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:25:40.026Z"));
    expect(
      canOfferPairUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: [
          addisMidnightIso("2026-09-09"),
          addisMidnightIso("2026-09-10"),
        ],
      })
    ).toBe(true);
  });
});

describe("canOfferGroupUp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows experience with no date/location", () => {
    expect(
      canOfferGroupUp({
        ...base,
        postType: "experience",
      })
    ).toBe(true);
  });

  it("allows hangout with upcoming date (no location check)", () => {
    expect(
      canOfferGroupUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: ["2099-06-01T12:00:00.000Z"],
      })
    ).toBe(true);
  });

  it("hides hangout with no selected_dates", () => {
    expect(
      canOfferGroupUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: null,
      })
    ).toBe(false);
  });

  it("preserves draft / non-public / private-author guards", () => {
    expect(
      canOfferGroupUp({
        ...base,
        postType: "experience",
        status: "draft",
      })
    ).toBe(false);
    expect(
      canOfferGroupUp({
        ...base,
        postType: "experience",
        visibility: "followers",
      })
    ).toBe(false);
    expect(
      canOfferGroupUp({
        ...base,
        postType: "experience",
        authorIsPrivate: true,
      })
    ).toBe(false);
  });

  it("shares Addis full-day hangout date rule with Duo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:25:40.026Z"));
    expect(
      canOfferGroupUp({
        ...base,
        postType: "hangout",
        isRecurring: false,
        selectedDates: ["2026-09-09T21:00:00.000Z"],
      })
    ).toBe(true);
  });
});

describe("hasValidRecurrenceDays", () => {
  it("accepts MO..SU codes", () => {
    expect(hasValidRecurrenceDays(["mo", "FR"])).toBe(true);
    expect(hasValidRecurrenceDays([])).toBe(false);
    expect(hasValidRecurrenceDays(["XX"])).toBe(false);
  });
});
