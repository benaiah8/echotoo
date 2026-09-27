import { describe, expect, it } from "vitest";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";
import {
  getMatchedOccurrenceDayKey,
  hasActiveHomeOccurrenceFilter,
  isTrueDefaultAllFeed,
  shouldApplyLegacyFeedDateSort,
} from "./homeMatchedOccurrence";

/** Addis midnight for calendar day D is the previous UTC 21:00. */
function addisMidnightIso(addisDay: string): string {
  const [y, m, d] = addisDay.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d, 0, 0, 0) - 3 * 60 * 60 * 1000;
  return new Date(utc).toISOString();
}

const TUESDAY = "2026-09-08";
const WEDNESDAY = "2026-09-09";
const SATURDAY = "2026-09-12";
const SUNDAY = "2026-09-13";
const WEEK_FROM = "2026-09-08";
const WEEK_TO = "2026-09-13";
const WEEKEND_FROM = "2026-09-12";
const WEEKEND_TO = "2026-09-13";

describe("getMatchedOccurrenceDayKey", () => {
  it("Today+Tomorrow under Today matches Today", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [addisMidnightIso(TUESDAY), addisMidnightIso(WEDNESDAY)],
          is_recurring: false,
        },
        { occursOn: TUESDAY, occursTz: HOME_EVENT_TIMEZONE }
      )
    ).toBe(TUESDAY);
  });

  it("Today+Tomorrow under Tomorrow matches Tomorrow", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [addisMidnightIso(TUESDAY), addisMidnightIso(WEDNESDAY)],
          is_recurring: false,
        },
        { occursOn: WEDNESDAY, occursTz: HOME_EVENT_TIMEZONE }
      )
    ).toBe(WEDNESDAY);
  });

  it("Today+Saturday under This Weekend matches Saturday", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [addisMidnightIso(TUESDAY), addisMidnightIso(SATURDAY)],
          is_recurring: false,
        },
        {
          occursFrom: WEEKEND_FROM,
          occursTo: WEEKEND_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe(SATURDAY);
  });

  it("range returns the earliest occurrence inside the window", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [
            addisMidnightIso("2026-09-10"),
            addisMidnightIso(SATURDAY),
          ],
          is_recurring: false,
        },
        {
          occursFrom: WEEK_FROM,
          occursTo: WEEK_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe("2026-09-10");
  });

  it("ignores past occurrence outside the requested range", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [addisMidnightIso("2026-09-06")],
          is_recurring: false,
        },
        {
          occursFrom: WEEK_FROM,
          occursTo: WEEK_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBeNull();
  });

  it("recurring TU+SA under Tuesday Today matches Tuesday", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: null,
          is_recurring: true,
          recurrence_days: ["TU", "SA"],
        },
        { occursOn: TUESDAY, occursTz: HOME_EVENT_TIMEZONE }
      )
    ).toBe(TUESDAY);
  });

  it("recurring TU+SA under This Weekend matches Saturday", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: null,
          is_recurring: true,
          recurrence_days: ["TU", "SA"],
        },
        {
          occursFrom: WEEKEND_FROM,
          occursTo: WEEKEND_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe(SATURDAY);
  });

  it("Sunday-only under This Weekend matches Sunday", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [addisMidnightIso(SUNDAY)],
          is_recurring: false,
        },
        {
          occursFrom: WEEKEND_FROM,
          occursTo: WEEKEND_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe(SUNDAY);
  });

  it("Saturday+Sunday under This Weekend matches Saturday once", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: [
            addisMidnightIso(SATURDAY),
            addisMidnightIso(SUNDAY),
          ],
          is_recurring: false,
        },
        {
          occursFrom: WEEKEND_FROM,
          occursTo: WEEKEND_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe(SATURDAY);
  });

  it("recurring SU under This Weekend matches Sunday", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: null,
          is_recurring: true,
          recurrence_days: ["SU"],
        },
        {
          occursFrom: WEEKEND_FROM,
          occursTo: WEEKEND_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe(SUNDAY);
  });

  it("recurring SA+SU under This Weekend matches Saturday", () => {
    expect(
      getMatchedOccurrenceDayKey(
        {
          selected_dates: null,
          is_recurring: true,
          recurrence_days: ["SA", "SU"],
        },
        {
          occursFrom: WEEKEND_FROM,
          occursTo: WEEKEND_TO,
          occursTz: HOME_EVENT_TIMEZONE,
        }
      )
    ).toBe(SATURDAY);
  });
});

describe("hasActiveHomeOccurrenceFilter", () => {
  it("is true for occursOn or a complete from/to range", () => {
    expect(hasActiveHomeOccurrenceFilter({ occursOn: TUESDAY })).toBe(true);
    expect(
      hasActiveHomeOccurrenceFilter({
        occursFrom: WEEKEND_FROM,
        occursTo: WEEKEND_TO,
      })
    ).toBe(true);
  });

  it("is false without occurrence params", () => {
    expect(hasActiveHomeOccurrenceFilter({})).toBe(false);
    expect(hasActiveHomeOccurrenceFilter({ occursFrom: WEEKEND_FROM })).toBe(
      false
    );
    expect(hasActiveHomeOccurrenceFilter({ occursTo: WEEKEND_TO })).toBe(false);
  });
});

describe("isTrueDefaultAllFeed", () => {
  it("is true only for unfiltered Home All", () => {
    expect(isTrueDefaultAllFeed({})).toBe(true);
    expect(isTrueDefaultAllFeed({ occursFrom: WEEKEND_FROM })).toBe(true);
    expect(isTrueDefaultAllFeed({ q: "  " })).toBe(true);
    expect(isTrueDefaultAllFeed({ tags: [] })).toBe(true);
  });

  it("is false for search, tags, type, friends, and occurrence filters", () => {
    expect(isTrueDefaultAllFeed({ q: "coffee" })).toBe(false);
    expect(isTrueDefaultAllFeed({ tags: ["music"] })).toBe(false);
    expect(isTrueDefaultAllFeed({ type: "hangout" })).toBe(false);
    expect(isTrueDefaultAllFeed({ type: "experience" })).toBe(false);
    expect(isTrueDefaultAllFeed({ friendsOnly: true })).toBe(false);
    expect(isTrueDefaultAllFeed({ occursOn: TUESDAY })).toBe(false);
    expect(
      isTrueDefaultAllFeed({
        occursFrom: WEEKEND_FROM,
        occursTo: WEEKEND_TO,
      })
    ).toBe(false);
  });
});

describe("shouldApplyLegacyFeedDateSort", () => {
  it("skips the legacy sorter for occursOn or occursFrom+occursTo", () => {
    expect(shouldApplyLegacyFeedDateSort({ occursOn: TUESDAY })).toBe(false);
    expect(
      shouldApplyLegacyFeedDateSort({
        occursFrom: WEEKEND_FROM,
        occursTo: WEEKEND_TO,
      })
    ).toBe(false);
  });

  it("skips the legacy sorter for Events, Places, and Friends", () => {
    expect(shouldApplyLegacyFeedDateSort({ type: "hangout" })).toBe(false);
    expect(shouldApplyLegacyFeedDateSort({ type: "experience" })).toBe(false);
    expect(shouldApplyLegacyFeedDateSort({ friendsOnly: true })).toBe(false);
  });

  it("skips the legacy sorter for true default All (server all_score)", () => {
    expect(shouldApplyLegacyFeedDateSort({})).toBe(false);
    expect(shouldApplyLegacyFeedDateSort({ occursFrom: WEEKEND_FROM })).toBe(
      false
    );
  });

  it("keeps the legacy sorter for search/tags All Feed", () => {
    expect(shouldApplyLegacyFeedDateSort({ q: "coffee" })).toBe(true);
    expect(shouldApplyLegacyFeedDateSort({ tags: ["music"] })).toBe(true);
  });
});
