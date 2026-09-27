import { describe, expect, it } from "vitest";
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
  selectedTags: [],
  viewerProfileId: "profile-1",
  friendsFilter: false,
  ...partial,
});

const baseState = (
  partial: Partial<HomeFilterState> = {}
): HomeFilterState => ({
  dateFilter: "none",
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
      viewMode: "hangouts",
      friendsFilter: true,
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
      hasExplicitHomeContentFilters({
        dateFilter: "none",
        viewMode: "all",
        friendsFilter: true,
      })
    ).toBe(true);
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

  it("is false for idle and shortcut-only Today / Events / Places", () => {
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
  });

  it("is true for drawer dates, Friends, search, and tags", () => {
    expect(
      hasNonShortcutHomeFilters({ ...idle, dateFilter: "tomorrow" })
    ).toBe(true);
    expect(
      hasNonShortcutHomeFilters({ ...idle, dateFilter: "this_weekend" })
    ).toBe(true);
    expect(
      hasNonShortcutHomeFilters({ ...idle, friendsFilter: true })
    ).toBe(true);
    expect(
      hasNonShortcutHomeFilters({ ...idle, search: "coffee" })
    ).toBe(true);
    expect(
      hasNonShortcutHomeFilters({ ...idle, selectedTags: ["music"] })
    ).toBe(true);
  });

  it("is true when Friends combines with a visible shortcut", () => {
    expect(
      hasNonShortcutHomeFilters({
        ...idle,
        dateFilter: "today",
        typeFilter: "hangouts",
        friendsFilter: true,
      })
    ).toBe(true);
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
