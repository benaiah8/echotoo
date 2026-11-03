import { describe, expect, it } from "vitest";
import { dataCache } from "./dataCache";
import { HOME_EVENT_TIMEZONE } from "./homeFeedConstants";
import {
  applyHomeFilterTransition,
  buildHomeOccurrenceFields,
  buildVerticalFeedOptionsProp,
  buildVerticalLoadFeedOptions,
  getDateRangeForFilter,
  getDateSpotlightOccurrenceParams,
  getHomeFeedRpcType,
  hasExplicitHomeContentFilters,
  hasNonShortcutHomeFilters,
  buildHomeCompactFilterBarChips,
  buildHomeVerticalFirstPageFeedKeyOptions,
  formatHomeCustomDateChipLabel,
  homeCompactBarExtraDateFilter,
  homeDateFilterChipLabel,
  isTodayChipActive,
  isTrueDefaultAllVerticalFeed,
  shouldPersonalizeHomeVerticalFeed,
  shouldShowHomeDiscoveryRails,
  tomorrowSecondaryDateFilter,
  viewerLocalOccurrence,
  type HomeFilterState,
  type HomeVerticalFilterContext,
} from "./homeVerticalFilters";

const ADDIS_TUESDAY = new Date("2026-09-08T02:00:00.000Z"); // Addis 05:00 Tue Sep 8
const ADDIS_FRIDAY = new Date("2026-09-11T02:00:00.000Z"); // Addis Friday Sep 11
const ADDIS_SATURDAY = new Date("2026-09-12T02:00:00.000Z");

const baseCtx = (
  partial: Partial<HomeVerticalFilterContext>
): HomeVerticalFilterContext => ({
  viewMode: "all",
  dateFilter: "none",
  customOccursOn: null,
  selectedTags: [],
  viewerProfileId: "profile-1",
  friendsFilter: false,
  ...partial,
});

const baseState = (
  partial: Partial<HomeFilterState> = {}
): HomeFilterState => ({
  dateFilter: "none",
  customOccursOn: null,
  viewMode: "all",
  friendsFilter: false,
  ...partial,
});

describe("Addis calendar helpers", () => {
  it("uses HOME_EVENT_TIMEZONE for today/tomorrow occurrence", () => {
    const today = viewerLocalOccurrence(0, ADDIS_TUESDAY);
    const tomorrow = viewerLocalOccurrence(1, ADDIS_TUESDAY);
    expect(today).toEqual({
      occursOn: "2026-09-08",
      occursTz: HOME_EVENT_TIMEZONE,
    });
    expect(tomorrow).toEqual({
      occursOn: "2026-09-09",
      occursTz: HOME_EVENT_TIMEZONE,
    });
  });

  it("builds This Week as today through Sunday Addis", () => {
    const range = getDateRangeForFilter("this_week", ADDIS_TUESDAY);
    expect(range).toEqual({
      occursFrom: "2026-09-08",
      occursTo: "2026-09-13",
      occursTz: HOME_EVENT_TIMEZONE,
    });
  });

  it("builds This Weekend as Saturday-Sunday Addis", () => {
    const range = getDateRangeForFilter("this_weekend", ADDIS_TUESDAY);
    expect(range).toEqual({
      occursFrom: "2026-09-12",
      occursTo: "2026-09-13",
      occursTz: HOME_EVENT_TIMEZONE,
    });
  });

  it("builds Next Week as next Monday-Sunday Addis", () => {
    const range = getDateRangeForFilter("next_week", ADDIS_TUESDAY);
    expect(range).toEqual({
      occursFrom: "2026-09-14",
      occursTo: "2026-09-20",
      occursTz: HOME_EVENT_TIMEZONE,
    });
  });

  it("maps Today/Tomorrow spotlight params to Addis days", () => {
    expect(getDateSpotlightOccurrenceParams("today", ADDIS_TUESDAY)).toEqual({
      mode: "day",
      occursOn: "2026-09-08",
      occursTz: HOME_EVENT_TIMEZONE,
    });
    expect(getDateSpotlightOccurrenceParams("tomorrow", ADDIS_TUESDAY)).toEqual({
      mode: "day",
      occursOn: "2026-09-09",
      occursTz: HOME_EVENT_TIMEZONE,
    });
  });

  it("uses See this weekend from Tuesday tomorrow, See next week from Friday", () => {
    expect(tomorrowSecondaryDateFilter(ADDIS_TUESDAY)).toBe("this_weekend");
    expect(tomorrowSecondaryDateFilter(ADDIS_FRIDAY)).toBe("next_week");
    expect(tomorrowSecondaryDateFilter(ADDIS_SATURDAY)).toBe("next_week");
  });
});

describe("Home RPC option builders", () => {
  it("date mode requests hangout plus occurs so leftover Places cannot leak", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({ dateFilter: "today", viewMode: "hangouts" }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.type).toBe("hangout");
    expect(opts.occursOn).toBe("2026-09-08");
    expect(opts.occursTz).toBe(HOME_EVENT_TIMEZONE);
    expect(opts.occursFrom).toBeNull();
    expect(opts.occursTo).toBeNull();
    expect(getHomeFeedRpcType({ dateFilter: "today", viewMode: "all" })).toBe(
      "hangout"
    );
  });

  it("Places options are type experience with no occurs", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({ viewMode: "experiences" }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.type).toBe("experience");
    expect(opts.occursOn).toBeNull();
    expect(opts.occursTz).toBeNull();
    expect(opts.occursFrom).toBeNull();
    expect(opts.occursTo).toBeNull();
  });

  it("Events options are type hangout with no occurs", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({ viewMode: "hangouts" }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.type).toBe("hangout");
    expect(opts.occursOn).toBeNull();
    expect(opts.occursTz).toBeNull();
  });

  it("Friends + Today combines friendsOnly and occurs", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: true,
      }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.friendsOnly).toBe(true);
    expect(opts.type).toBe("hangout");
    expect(opts.occursOn).toBe("2026-09-08");
  });

  it("Friends + Places combines friendsOnly and type experience", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({ viewMode: "experiences", friendsFilter: true }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.friendsOnly).toBe(true);
    expect(opts.type).toBe("experience");
  });

  it("feed key options include occurs for Today", () => {
    const prop = buildVerticalFeedOptionsProp(
      baseCtx({ dateFilter: "today", viewMode: "hangouts" }),
      ADDIS_TUESDAY
    );
    expect(prop.occursOn).toBe("2026-09-08");
    expect(prop.occursTz).toBe(HOME_EVENT_TIMEZONE);
    expect(prop.type).toBe("hangout");
  });

  it("week range occurrence uses from/to", () => {
    const occurs = buildHomeOccurrenceFields("this_week", ADDIS_TUESDAY);
    expect(occurs.occursFrom).toBe("2026-09-08");
    expect(occurs.occursTo).toBe("2026-09-13");
    expect(occurs.occursOn).toBeNull();
  });
});

describe("applyHomeFilterTransition", () => {
  it("date chip sets hangouts and clears Places", () => {
    const next = applyHomeFilterTransition(
      baseState({ viewMode: "experiences" }),
      { type: "toggleDate", target: "today" }
    );
    expect(next).toEqual({
      dateFilter: "today",
      customOccursOn: null,
      viewMode: "hangouts",
      friendsFilter: false,
    });
  });

  it("Events clears date", () => {
    const next = applyHomeFilterTransition(
      baseState({ dateFilter: "today", viewMode: "hangouts" }),
      { type: "toggleEvents" }
    );
    expect(next).toEqual({
      dateFilter: "none",
      customOccursOn: null,
      viewMode: "hangouts",
      friendsFilter: false,
    });
  });

  it("Places clears date", () => {
    const next = applyHomeFilterTransition(
      baseState({ dateFilter: "today", viewMode: "hangouts" }),
      { type: "togglePlaces" }
    );
    expect(next).toEqual({
      dateFilter: "none",
      customOccursOn: null,
      viewMode: "experiences",
      friendsFilter: false,
    });
  });

  it("Friends + Today See tomorrow preserves friendsFilter", () => {
    const next = applyHomeFilterTransition(
      baseState({ dateFilter: "today", viewMode: "hangouts", friendsFilter: true }),
      { type: "selectDate", target: "tomorrow" }
    );
    expect(next).toEqual({
      dateFilter: "tomorrow",
      customOccursOn: null,
      viewMode: "hangouts",
      friendsFilter: true,
    });
  });

  it("Back to Feed / clearAll clears date, viewMode, and Friends", () => {
    const next = applyHomeFilterTransition(
      baseState({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: true,
      }),
      { type: "clearAll" }
    );
    expect(next).toEqual({
      dateFilter: "none",
      customOccursOn: null,
      viewMode: "all",
      friendsFilter: false,
    });
  });

  it("Friends toggle does not require items and stays independent", () => {
    const on = applyHomeFilterTransition(baseState(), { type: "toggleFriends" });
    expect(on.friendsFilter).toBe(true);
    const off = applyHomeFilterTransition(on, { type: "toggleFriends" });
    expect(off.friendsFilter).toBe(false);
  });

  it("Explore events from Friends-only keeps Friends", () => {
    const next = applyHomeFilterTransition(
      baseState({ friendsFilter: true }),
      { type: "selectEvents" }
    );
    expect(next).toEqual({
      dateFilter: "none",
      customOccursOn: null,
      viewMode: "hangouts",
      friendsFilter: true,
    });
  });

  it("supports simultaneous Friends with date or type filters", () => {
    const nextWeekFriends = applyHomeFilterTransition(
      baseState({ friendsFilter: true }),
      { type: "toggleDate", target: "next_week" }
    );
    expect(nextWeekFriends).toEqual({
      dateFilter: "next_week",
      customOccursOn: null,
      viewMode: "hangouts",
      friendsFilter: true,
    });
    expect(homeCompactBarExtraDateFilter(nextWeekFriends.dateFilter)).toBe(
      "next_week"
    );
    expect(isTodayChipActive(nextWeekFriends.dateFilter)).toBe(false);

    const postsFriends = applyHomeFilterTransition(
      baseState({ friendsFilter: true }),
      { type: "togglePlaces" }
    );
    expect(postsFriends).toEqual({
      dateFilter: "none",
      customOccursOn: null,
      viewMode: "experiences",
      friendsFilter: true,
    });
  });

  it("selectCustomDate scopes hangouts and clears presets", () => {
    const next = applyHomeFilterTransition(
      baseState({ dateFilter: "tomorrow", viewMode: "all" }),
      { type: "selectCustomDate", occursOn: "2026-11-05" }
    );
    expect(next).toEqual({
      dateFilter: "none",
      customOccursOn: "2026-11-05",
      viewMode: "hangouts",
      friendsFilter: false,
    });
  });

  it("toggleCustomDate clears when the same day is toggled off", () => {
    const next = applyHomeFilterTransition(
      baseState({ customOccursOn: "2026-11-05", viewMode: "hangouts" }),
      { type: "toggleCustomDate", occursOn: "2026-11-05" }
    );
    expect(next.customOccursOn).toBeNull();
    expect(next.viewMode).toBe("all");
  });

  it("preset date clears customOccursOn", () => {
    const next = applyHomeFilterTransition(
      baseState({ customOccursOn: "2026-11-05", viewMode: "hangouts" }),
      { type: "selectDate", target: "today" }
    );
    expect(next.dateFilter).toBe("today");
    expect(next.customOccursOn).toBeNull();
  });

  it("Friends preserved with custom date", () => {
    const next = applyHomeFilterTransition(
      baseState({ friendsFilter: true }),
      { type: "selectCustomDate", occursOn: "2026-11-05" }
    );
    expect(next.friendsFilter).toBe(true);
    expect(next.customOccursOn).toBe("2026-11-05");
  });
});

describe("custom calendar date helpers", () => {
  it("buildHomeOccurrenceFields uses custom day with Addis tz", () => {
    const occurs = buildHomeOccurrenceFields("none", ADDIS_TUESDAY, "2026-11-05");
    expect(occurs).toEqual({
      occursOn: "2026-11-05",
      occursTz: HOME_EVENT_TIMEZONE,
      occursFrom: null,
      occursTo: null,
    });
  });

  it("custom date overrides preset dateFilter for RPC occurrence", () => {
    const occurs = buildHomeOccurrenceFields(
      "today",
      ADDIS_TUESDAY,
      "2026-11-05"
    );
    expect(occurs.occursOn).toBe("2026-11-05");
  });

  it("formats compact chip label with short weekday and Addis calendar day", () => {
    expect(formatHomeCustomDateChipLabel("2026-10-26")).toBe("Mon, Oct 26");
    expect(formatHomeCustomDateChipLabel("2026-10-28")).toBe("Wed, Oct 28");
    expect(formatHomeCustomDateChipLabel("2026-10-29")).toBe("Thu, Oct 29");
    expect(formatHomeCustomDateChipLabel("2026-11-05")).toBe("Thu, Nov 5");
    expect(formatHomeCustomDateChipLabel("2026-12-01")).toBe("Tue, Dec 1");
    expect(formatHomeCustomDateChipLabel("2027-01-01")).toBe("Fri, Jan 1");
    expect(formatHomeCustomDateChipLabel("2024-02-29")).toBe("Thu, Feb 29");
  });

  it("buildVerticalLoadFeedOptions sends hangout + occurs for custom date", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({ customOccursOn: "2026-11-05", viewMode: "hangouts" }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.type).toBe("hangout");
    expect(opts.occursOn).toBe("2026-11-05");
    expect(opts.occursTz).toBe(HOME_EVENT_TIMEZONE);
    expect(opts.friendsOnly).toBeUndefined();
  });

  it("Friends + custom date includes friendsOnly on RPC options", () => {
    const opts = buildVerticalLoadFeedOptions(
      baseCtx({
        customOccursOn: "2026-11-05",
        viewMode: "hangouts",
        friendsFilter: true,
      }),
      { offset: 0, limit: 15 },
      ADDIS_TUESDAY
    );
    expect(opts.friendsOnly).toBe(true);
  });

  it("feed cache keys differ for different custom dates", () => {
    const a = dataCache.generateFeedKey(
      buildHomeVerticalFirstPageFeedKeyOptions(
        baseCtx({ customOccursOn: "2026-11-05", viewMode: "hangouts" }),
        ADDIS_TUESDAY
      )
    );
    const b = dataCache.generateFeedKey(
      buildHomeVerticalFirstPageFeedKeyOptions(
        baseCtx({ customOccursOn: "2026-11-06", viewMode: "hangouts" }),
        ADDIS_TUESDAY
      )
    );
    expect(a).not.toBe(b);
    expect(a).toContain("2026-11-05");
    expect(b).toContain("2026-11-06");
  });

  it("custom date chip is active-first with short label", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "none",
      customOccursOn: "2026-11-05",
      viewMode: "hangouts",
      friendsFilter: false,
    });
    expect(chips[0]).toMatchObject({
      id: "custom-date",
      active: true,
      label: "Thu, Nov 5",
      customOccursOn: "2026-11-05",
    });
  });
});

describe("discovery rails helper", () => {
  it("hides rails when any explicit filter is active", () => {
    expect(
      shouldShowHomeDiscoveryRails({
        dateFilter: "none",
        viewMode: "all",
        friendsFilter: false,
      })
    ).toBe(true);
    expect(
      shouldShowHomeDiscoveryRails({
        dateFilter: "today",
        viewMode: "hangouts",
        friendsFilter: false,
      })
    ).toBe(false);
    expect(
      shouldShowHomeDiscoveryRails({
        dateFilter: "none",
        customOccursOn: "2026-11-05",
        viewMode: "all",
        friendsFilter: false,
      })
    ).toBe(false);
    expect(
      hasExplicitHomeContentFilters({
        dateFilter: "none",
        viewMode: "all",
        friendsFilter: true,
      })
    ).toBe(true);
  });
});

describe("homeDateFilterChipLabel", () => {
  it("maps none and each date filter to drawer labels", () => {
    expect(homeDateFilterChipLabel("none")).toBe("Today");
    expect(homeDateFilterChipLabel("today")).toBe("Today");
    expect(homeDateFilterChipLabel("tomorrow")).toBe("Tomorrow");
    expect(homeDateFilterChipLabel("this_week")).toBe("This Week");
    expect(homeDateFilterChipLabel("this_weekend")).toBe("This Weekend");
    expect(homeDateFilterChipLabel("next_week")).toBe("Next Week");
  });
});

describe("homeCompactBarExtraDateFilter", () => {
  it("omits extra chip for none and today", () => {
    expect(homeCompactBarExtraDateFilter("none")).toBeNull();
    expect(homeCompactBarExtraDateFilter("today")).toBeNull();
  });

  it("returns the selected non-Today date for a separate active chip", () => {
    expect(homeCompactBarExtraDateFilter("tomorrow")).toBe("tomorrow");
    expect(homeCompactBarExtraDateFilter("this_week")).toBe("this_week");
    expect(homeCompactBarExtraDateFilter("this_weekend")).toBe("this_weekend");
    expect(homeCompactBarExtraDateFilter("next_week")).toBe("next_week");
  });
});

describe("isTodayChipActive", () => {
  it("is true only when dateFilter is today", () => {
    expect(isTodayChipActive("today")).toBe(true);
    expect(isTodayChipActive("none")).toBe(false);
    expect(isTodayChipActive("next_week")).toBe(false);
    expect(isTodayChipActive("tomorrow")).toBe(false);
  });
});

describe("buildHomeCompactFilterBarChips", () => {
  const ids = (
    chips: ReturnType<typeof buildHomeCompactFilterBarChips>
  ) => chips.map((c) => c.id);
  const labels = (
    chips: ReturnType<typeof buildHomeCompactFilterBarChips>
  ) => chips.map((c) => c.label);

  it("defaults to Today | Events | Posts with no duplicates", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "none",
      viewMode: "all",
      friendsFilter: false,
    });
    expect(labels(chips)).toEqual(["Today", "Events", "Posts"]);
    expect(chips.every((c) => !c.active)).toBe(true);
    expect(new Set(ids(chips)).size).toBe(chips.length);
  });

  it("groups Next Week before inactive Today / Events / Posts", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "next_week",
      viewMode: "hangouts",
      friendsFilter: false,
    });
    expect(labels(chips)).toEqual([
      "Next Week",
      "Today",
      "Events",
      "Posts",
    ]);
    expect(chips[0]?.active).toBe(true);
    expect(chips.slice(1).every((c) => !c.active)).toBe(true);
    expect(isTodayChipActive("next_week")).toBe(false);
  });

  it("groups Next Week + Friends, then inactive shortcuts", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "next_week",
      viewMode: "hangouts",
      friendsFilter: true,
    });
    expect(labels(chips)).toEqual([
      "Next Week",
      "Friends",
      "Today",
      "Events",
      "Posts",
    ]);
    expect(chips.filter((c) => c.active).map((c) => c.label)).toEqual([
      "Next Week",
      "Friends",
    ]);
  });

  it("groups Events + Friends without falsely activating Today", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "none",
      viewMode: "hangouts",
      friendsFilter: true,
    });
    expect(labels(chips)).toEqual(["Events", "Friends", "Today", "Posts"]);
  });

  it("groups Today + Friends then Events | Posts", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "today",
      viewMode: "hangouts",
      friendsFilter: true,
    });
    expect(labels(chips)).toEqual(["Today", "Friends", "Events", "Posts"]);
    expect(chips.find((c) => c.id === "events")?.active).toBe(false);
  });

  it("does not highlight Events when a date filter is selected", () => {
    const chips = buildHomeCompactFilterBarChips({
      dateFilter: "tomorrow",
      viewMode: "hangouts",
      friendsFilter: false,
    });
    expect(chips.find((c) => c.id === "events")?.active).toBe(false);
    expect(chips.find((c) => c.id === "date:tomorrow")?.active).toBe(true);
  });

  it("clear-all shape restores default order", () => {
    const cleared = applyHomeFilterTransition(
      baseState({
        dateFilter: "next_week",
        viewMode: "hangouts",
        friendsFilter: true,
      }),
      { type: "clearAll" }
    );
    expect(labels(buildHomeCompactFilterBarChips(cleared))).toEqual([
      "Today",
      "Events",
      "Posts",
    ]);
  });
});

describe("hasNonShortcutHomeFilters", () => {
  const idle = {
    dateFilter: "none" as const,
    typeFilter: "all" as const,
    friendsFilter: false,
    search: "",
    selectedTags: [] as string[],
  };

  it("is false for idle, dates, Friends, and type chips (now visible in the bar)", () => {
    expect(hasNonShortcutHomeFilters(idle)).toBe(false);
    expect(
      hasNonShortcutHomeFilters({
        ...idle,
        dateFilter: "today",
        typeFilter: "hangouts",
      })
    ).toBe(false);
    expect(
      hasNonShortcutHomeFilters({
        ...idle,
        typeFilter: "hangouts",
      })
    ).toBe(false);
    expect(
      hasNonShortcutHomeFilters({
        ...idle,
        typeFilter: "experiences",
      })
    ).toBe(false);
    expect(
      hasNonShortcutHomeFilters({ ...idle, dateFilter: "tomorrow" })
    ).toBe(false);
    expect(
      hasNonShortcutHomeFilters({ ...idle, dateFilter: "this_weekend" })
    ).toBe(false);
    expect(
      hasNonShortcutHomeFilters({ ...idle, friendsFilter: true })
    ).toBe(false);
  });

  it("is true for search and tags (not shown as compact chips)", () => {
    expect(
      hasNonShortcutHomeFilters({ ...idle, search: "coffee" })
    ).toBe(true);
    expect(
      hasNonShortcutHomeFilters({ ...idle, selectedTags: ["music"] })
    ).toBe(true);
  });

  it("Friends + shortcuts stay false for the in-pill indicator", () => {
    expect(
      hasNonShortcutHomeFilters({
        ...idle,
        dateFilter: "today",
        typeFilter: "hangouts",
        friendsFilter: true,
      })
    ).toBe(false);
  });
});

describe("isTrueDefaultAllVerticalFeed", () => {
  it("is true only for unfiltered All Home", () => {
    expect(isTrueDefaultAllVerticalFeed(baseCtx({}))).toBe(true);
  });

  it("is false for Events, Places, Friends, date filters, search, and tags", () => {
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ viewMode: "hangouts" }))
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ viewMode: "experiences" }))
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ friendsFilter: true }))
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ dateFilter: "today" }))
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ dateFilter: "tomorrow" }))
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(
        baseCtx({ dateFilter: "this_week" }),
        ADDIS_TUESDAY
      )
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(
        baseCtx({ dateFilter: "this_weekend" }),
        ADDIS_TUESDAY
      )
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(
        baseCtx({ dateFilter: "next_week" }),
        ADDIS_TUESDAY
      )
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ feedSearchQ: "coffee" }))
    ).toBe(false);
    expect(
      isTrueDefaultAllVerticalFeed(baseCtx({ selectedTags: ["music"] }))
    ).toBe(false);
  });
});

describe("shouldPersonalizeHomeVerticalFeed", () => {
  it("is off for Phase 2B.1 including true default All and search/tags", () => {
    expect(
      shouldPersonalizeHomeVerticalFeed({
        selectedTags: [],
        viewMode: "all",
      })
    ).toBe(false);
    expect(
      shouldPersonalizeHomeVerticalFeed({
        feedSearchQ: "coffee",
        selectedTags: [],
        viewMode: "all",
      })
    ).toBe(false);
    expect(
      shouldPersonalizeHomeVerticalFeed({
        selectedTags: ["music"],
        viewMode: "all",
      })
    ).toBe(false);
    expect(
      shouldPersonalizeHomeVerticalFeed({
        selectedTags: [],
        viewMode: "hangouts",
      })
    ).toBe(false);
  });
});
