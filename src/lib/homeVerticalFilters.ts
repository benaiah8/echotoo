/**
 * Home vertical filter kernel — shared builders, Addis calendar helpers,
 * RPC option construction, and explicit-filter state transitions.
 */

import type { FeedOptions } from "../api/queries/getPublicFeed";
import { dataCache } from "./dataCache";
import type { FilterType } from "./horizontalRailFilters";
import { HOME_EVENT_TIMEZONE, HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";
import { isTrueDefaultAllFeed } from "./homeMatchedOccurrence";
import type { TodaySpotlightBaseOptions } from "./homeTodaySpotlight";

export type HomeDateFilter =
  | "none"
  | "today"
  | "tomorrow"
  | "this_week"
  | "this_weekend"
  | "next_week";

export type HomeTypeFilter = "all" | "hangouts" | "experiences";

/** Alias for vertical segment / viewMode. */
export type HomeViewMode = HomeTypeFilter;

/** Drawer / toggle target — all mutually exclusive date chips except none. */
export type HomeDateFilterChip = Exclude<HomeDateFilter, "none">;

export const INITIAL_HOME_DATE_FILTER: HomeDateFilter = "none";
export const INITIAL_HOME_TYPE_FILTER: HomeTypeFilter = "all";

export type HomeFilterState = {
  dateFilter: HomeDateFilter;
  viewMode: HomeViewMode;
  friendsFilter: boolean;
};

export type HomeFilterAction =
  | { type: "toggleDate"; target: HomeDateFilterChip }
  | { type: "selectDate"; target: HomeDateFilterChip }
  | { type: "toggleEvents" }
  | { type: "togglePlaces" }
  | { type: "selectEvents" }
  | { type: "selectPlaces" }
  | { type: "toggleFriends" }
  | { type: "clearAll" };

export type ViewerLocalOccurrence = {
  occursOn: string;
  occursTz: string;
};

export type ViewerLocalDateRange = {
  occursFrom: string;
  occursTo: string;
  occursTz: string;
};

/** Inputs shared by vertical feed, cache keys, and Today spotlight. */
export type HomeVerticalFilterContext = {
  viewMode: HomeViewMode;
  dateFilter: HomeDateFilter;
  feedSearchQ?: string;
  selectedTags: string[];
  viewerProfileId: string | null;
  friendsFilter: boolean;
};

export type HomeRailFilterContext = {
  feedSearchQ?: string;
  selectedTags: string[];
  railAppliedFilters: FilterType[];
  viewerProfileId: string | null;
};

/**
 * Viewer-local calendar date YYYY-MM-DD + IANA zone for Today RPC (`p_occurs_on` / `p_occurs_tz`).
 * Matches backend `AT TIME ZONE` interpretation of scheduled instants.
 */
export function viewerLocalOccurrenceForTodayChip(): ViewerLocalOccurrence | null {
  return viewerLocalOccurrence(0);
}

/** Date filters that use the occurrence spotlight block above the normal feed. */
export const HOME_DATE_SPOTLIGHT_FILTERS = [
  "today",
  "tomorrow",
  "this_week",
  "this_weekend",
  "next_week",
] as const;

export type HomeDateSpotlightFilter = (typeof HOME_DATE_SPOTLIGHT_FILTERS)[number];

export function isDateSpotlightFilter(
  dateFilter: HomeDateFilter
): dateFilter is HomeDateFilterChip {
  return dateFilter !== "none";
}

export type DateSpotlightDayParams = {
  mode: "day";
  occursOn: string;
  occursTz: string;
};

export type DateSpotlightRangeParams = {
  mode: "range";
  occursFrom: string;
  occursTo: string;
  occursTz: string;
};

export type DateSpotlightOccurrenceParams =
  | DateSpotlightDayParams
  | DateSpotlightRangeParams;

/** Calendar day offset for spotlight RPC (`0` = today, `1` = tomorrow). */
export function getDateSpotlightDayOffset(
  dateFilter: HomeDateFilter
): number | null {
  if (dateFilter === "today") return 0;
  if (dateFilter === "tomorrow") return 1;
  return null;
}

export function viewerLocalOccurrenceForDateFilter(
  dateFilter: HomeDateFilter
): ViewerLocalOccurrence | null {
  const offset = getDateSpotlightDayOffset(dateFilter);
  if (offset === null) return null;
  return viewerLocalOccurrence(offset);
}

export function getDateSpotlightEmptyNotice(dateFilter: HomeDateFilter): string {
  switch (dateFilter) {
    case "tomorrow":
      return "Nothing scheduled for tomorrow.";
    case "this_week":
      return "No posts scheduled for this week.";
    case "this_weekend":
      return "No posts scheduled for this weekend.";
    case "next_week":
      return "No posts scheduled for next week.";
    case "today":
    default:
      return "Nothing scheduled for today.";
  }
}

/**
 * Ordered fallback date buckets when the selected spotlight filter returns no posts.
 * Fetch orchestration (later): walk this chain sequentially and stop at the first
 * non-empty bucket; show at most one fallback section above the normal vertical feed.
 * Max RPC count and caching will be handled in a follow-up step — no UI/fetch changes here.
 *
 * @param dateFilter - Active Home date chip (primary bucket is not included in the result).
 * @param options.isodow - Viewer-local Postgres ISODOW (Mon=1 … Sun=7); defaults to
 *   `viewerLocalIsodow(0)` when omitted. When unavailable, uses the weekday chain (isodow < 6).
 */
export function getDateSpotlightFallbackChain(
  dateFilter: HomeDateFilter,
  options?: { isodow?: number }
): HomeDateFilterChip[] {
  if (!isDateSpotlightFilter(dateFilter)) return [];

  const isodow =
    options?.isodow ?? viewerLocalIsodow(0) ?? 3;
  const weekendPassedOrCurrent = isodow >= 6;

  switch (dateFilter) {
    case "today":
      return weekendPassedOrCurrent
        ? ["tomorrow", "next_week"]
        : ["tomorrow", "this_weekend", "next_week"];
    case "tomorrow":
      return weekendPassedOrCurrent
        ? ["next_week"]
        : ["this_weekend", "next_week"];
    case "this_week":
      return ["next_week"];
    case "this_weekend":
      return ["next_week"];
    case "next_week":
      return [];
    default:
      return [];
  }
}

/** Section heading for a fallback spotlight bucket (first non-empty chain step). */
export function getDateSpotlightFallbackSectionTitle(
  filter: HomeDateFilterChip
): string {
  switch (filter) {
    case "tomorrow":
      return "Coming up tomorrow";
    case "this_week":
      return "Coming up this week";
    case "this_weekend":
      return "Coming up this weekend";
    case "next_week":
      return "Coming up next week";
    case "today":
      return "Happening today";
    default:
      return "";
  }
}

/** Spotlight RPC occurrence params for any active date filter. */
export function getDateSpotlightOccurrenceParams(
  dateFilter: HomeDateFilter,
  now: Date = new Date()
): DateSpotlightOccurrenceParams | null {
  if (!isDateSpotlightFilter(dateFilter)) return null;

  const dayOffset = getDateSpotlightDayOffset(dateFilter);
  if (dayOffset !== null) {
    const occurrence = viewerLocalOccurrence(dayOffset, now);
    if (!occurrence) return null;
    return {
      mode: "day",
      occursOn: occurrence.occursOn,
      occursTz: occurrence.occursTz,
    };
  }

  const range = getDateRangeForFilter(dateFilter, now);
  if (!range) return null;
  return {
    mode: "range",
    occursFrom: range.occursFrom,
    occursTo: range.occursTo,
    occursTz: range.occursTz,
  };
}

type AddisYmd = { year: number; month: number; day: number };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdToString(ymd: AddisYmd): string {
  return `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day)}`;
}

function ymdCompare(a: AddisYmd, b: AddisYmd): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function addisCalendarParts(now: Date = new Date()): AddisYmd | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_EVENT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    if (!year || !month || !day) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

function addCalendarDays(ymd: AddisYmd, dayOffset: number): AddisYmd {
  const utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + dayOffset));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** Postgres ISODOW for an Addis calendar date: Mon=1 … Sun=7. */
function isodowForYmd(ymd: AddisYmd): number {
  const utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  const jsDay = utc.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function viewerLocalDateString(
  dayOffsetFromToday = 0,
  now: Date = new Date()
): string | null {
  return viewerLocalOccurrence(dayOffsetFromToday, now)?.occursOn ?? null;
}

/** Postgres ISODOW in Addis: Mon=1 … Sun=7. */
function viewerLocalIsodow(
  dayOffsetFromToday = 0,
  now: Date = new Date()
): number | null {
  const today = addisCalendarParts(now);
  if (!today) return null;
  return isodowForYmd(addCalendarDays(today, dayOffsetFromToday));
}

/**
 * Tomorrow's next-window CTA: This Weekend when that Saturday is still after
 * tomorrow (Addis); otherwise Next Week.
 */
export function tomorrowSecondaryDateFilter(
  now: Date = new Date()
): "this_weekend" | "next_week" {
  const today = addisCalendarParts(now);
  if (!today) return "next_week";
  const tomorrow = addCalendarDays(today, 1);
  const weekendSaturday = addCalendarDays(today, 6 - isodowForYmd(today));
  return ymdCompare(weekendSaturday, tomorrow) > 0
    ? "this_weekend"
    : "next_week";
}

/**
 * Addis-local inclusive date range for week filters.
 * Returns null for single-day/none filters or when date parts are unavailable.
 */
export function getDateRangeForFilter(
  dateFilter: HomeDateFilter,
  now: Date = new Date()
): ViewerLocalDateRange | null {
  if (
    dateFilter !== "this_week" &&
    dateFilter !== "this_weekend" &&
    dateFilter !== "next_week"
  ) {
    return null;
  }

  const occursTz = HOME_EVENT_TIMEZONE;
  const isodow = viewerLocalIsodow(0, now);
  if (isodow === null) return null;

  if (dateFilter === "this_week") {
    const occursFrom = viewerLocalDateString(0, now);
    const occursTo = viewerLocalDateString(7 - isodow, now);
    if (!occursFrom || !occursTo) return null;
    return { occursFrom, occursTo, occursTz };
  }

  if (dateFilter === "this_weekend") {
    if (isodow <= 5) {
      const occursFrom = viewerLocalDateString(6 - isodow, now);
      const occursTo = viewerLocalDateString(7 - isodow, now);
      if (!occursFrom || !occursTo) return null;
      return { occursFrom, occursTo, occursTz };
    }
    if (isodow === 6) {
      const occursFrom = viewerLocalDateString(0, now);
      const occursTo = viewerLocalDateString(1, now);
      if (!occursFrom || !occursTo) return null;
      return { occursFrom, occursTo, occursTz };
    }
    const occursFrom = viewerLocalDateString(0, now);
    if (!occursFrom) return null;
    return { occursFrom, occursTo: occursFrom, occursTz };
  }

  const nextMondayOffset = 7 - isodow + 1;
  const nextSundayOffset = nextMondayOffset + 6;
  const occursFrom = viewerLocalDateString(nextMondayOffset, now);
  const occursTo = viewerLocalDateString(nextSundayOffset, now);
  if (!occursFrom || !occursTo) return null;
  return { occursFrom, occursTo, occursTz };
}

/**
 * Addis calendar occurrence for a day offset from today (0 = today).
 */
export function viewerLocalOccurrence(
  dayOffsetFromToday = 0,
  now: Date = new Date()
): ViewerLocalOccurrence | null {
  const today = addisCalendarParts(now);
  if (!today) return null;
  return {
    occursOn: ymdToString(addCalendarDays(today, dayOffsetFromToday)),
    occursTz: HOME_EVENT_TIMEZONE,
  };
}

export function isTodayChipActive(dateFilter: HomeDateFilter): boolean {
  return dateFilter === "today";
}

export function isHomeDateFilterActive(
  dateFilter: HomeDateFilter,
  target: Exclude<HomeDateFilter, "none">
): boolean {
  return dateFilter === target;
}

/** Drawer date chips — Today/Tomorrow spotlight; week filters hard-filter vertical feed. */
export const HOME_DATE_FILTER_DRAWER_OPTIONS: ReadonlyArray<{
  value: HomeDateFilterChip;
  label: string;
  enabled: boolean;
}> = [
  { value: "today", label: "Today", enabled: true },
  { value: "tomorrow", label: "Tomorrow", enabled: true },
  { value: "this_week", label: "This Week", enabled: true },
  { value: "this_weekend", label: "This Weekend", enabled: true },
  { value: "next_week", label: "Next Week", enabled: true },
];

export function isHomeTypeFilterActive(
  viewMode: HomeViewMode,
  target: "hangouts" | "experiences"
): boolean {
  return viewMode === target;
}

/** Mutually exclusive date chips: active chip toggles off; otherwise selects `next`. */
export function toggleHomeDateFilter(
  current: HomeDateFilter,
  next: Exclude<HomeDateFilter, "none">
): HomeDateFilter {
  return current === next ? "none" : next;
}

/** Mutually exclusive type chips: active segment toggles to all; otherwise selects `next`. */
export function toggleHomeTypeFilter(
  current: HomeTypeFilter,
  next: "hangouts" | "experiences"
): HomeTypeFilter {
  return current === next ? "all" : next;
}

export function getVerticalSegmentType(
  viewMode: HomeViewMode
): FeedOptions["type"] {
  if (viewMode === "hangouts") return "hangout";
  if (viewMode === "experiences") return "experience";
  return undefined;
}

/**
 * RPC `p_type` for Home vertical feed. Date and Events modes always request hangout
 * so leftover experience dates cannot leak into those filters.
 */
export function getHomeFeedRpcType(
  ctx: Pick<HomeVerticalFilterContext, "viewMode" | "dateFilter">
): FeedOptions["type"] {
  if (ctx.dateFilter !== "none") return "hangout";
  return getVerticalSegmentType(ctx.viewMode);
}

export type HomeOccurrenceFields = {
  occursOn: string | null;
  occursTz: string | null;
  occursFrom: string | null;
  occursTo: string | null;
};

export function buildHomeOccurrenceFields(
  dateFilter: HomeDateFilter,
  now: Date = new Date()
): HomeOccurrenceFields {
  const empty: HomeOccurrenceFields = {
    occursOn: null,
    occursTz: null,
    occursFrom: null,
    occursTo: null,
  };
  if (dateFilter === "none") return empty;
  const params = getDateSpotlightOccurrenceParams(dateFilter, now);
  if (!params) return { ...empty, occursTz: HOME_EVENT_TIMEZONE };
  if (params.mode === "day") {
    return {
      occursOn: params.occursOn,
      occursTz: params.occursTz,
      occursFrom: null,
      occursTo: null,
    };
  }
  return {
    occursOn: null,
    occursTz: params.occursTz,
    occursFrom: params.occursFrom,
    occursTo: params.occursTo,
  };
}

/** Discovery rails/spotlight only on unfiltered All Home. */
export function shouldShowHomeDiscoveryRails(params: {
  dateFilter: HomeDateFilter;
  viewMode: HomeViewMode;
  friendsFilter: boolean;
}): boolean {
  return (
    params.dateFilter === "none" &&
    params.viewMode === "all" &&
    !params.friendsFilter
  );
}

export function hasExplicitHomeContentFilters(params: {
  dateFilter: HomeDateFilter;
  viewMode: HomeViewMode;
  friendsFilter: boolean;
}): boolean {
  return !shouldShowHomeDiscoveryRails(params);
}

export function applyHomeFilterTransition(
  current: HomeFilterState,
  action: HomeFilterAction
): HomeFilterState {
  switch (action.type) {
    case "toggleDate": {
      if (current.dateFilter === action.target) {
        return { ...current, dateFilter: "none", viewMode: "all" };
      }
      return { ...current, dateFilter: action.target, viewMode: "hangouts" };
    }
    case "selectDate":
      return { ...current, dateFilter: action.target, viewMode: "hangouts" };
    case "toggleEvents": {
      if (current.viewMode === "hangouts" && current.dateFilter === "none") {
        return { ...current, viewMode: "all" };
      }
      return { ...current, viewMode: "hangouts", dateFilter: "none" };
    }
    case "selectEvents":
      return { ...current, viewMode: "hangouts", dateFilter: "none" };
    case "togglePlaces": {
      if (current.viewMode === "experiences") {
        return { ...current, viewMode: "all", dateFilter: "none" };
      }
      return { ...current, viewMode: "experiences", dateFilter: "none" };
    }
    case "selectPlaces":
      return { ...current, viewMode: "experiences", dateFilter: "none" };
    case "toggleFriends":
      return { ...current, friendsFilter: !current.friendsFilter };
    case "clearAll":
      return {
        dateFilter: INITIAL_HOME_DATE_FILTER,
        viewMode: INITIAL_HOME_TYPE_FILTER,
        friendsFilter: false,
      };
    default:
      return current;
  }
}

/** Social filters for rails (Friends only today; date filters are vertical-only). */
export function getRailAppliedFilters(friendsFilter: boolean): FilterType[] {
  return friendsFilter ? ["friends"] : [];
}

export function getRailAppliedFiltersSortedKey(
  railAppliedFilters: readonly FilterType[]
): string {
  return [...railAppliedFilters].sort().join(",");
}

export function railHasActiveDiscoveryFilters(
  railAppliedFilters: readonly FilterType[]
): boolean {
  return railAppliedFilters.length > 0;
}

/** Post/hangout/experience feed `q` only in posts mode. */
export function getFeedSearchQ(
  searchMode: "posts" | "users",
  search: string
): string | undefined {
  return searchMode === "posts" ? search || undefined : undefined;
}

export function tagsForFeedOptions(
  selectedTags: readonly string[]
): string[] | undefined {
  return selectedTags.length > 0 ? [...selectedTags] : undefined;
}

export type HasActiveHomeFiltersInput = {
  dateFilter: HomeDateFilter;
  typeFilter: HomeTypeFilter;
  friendsFilter: boolean;
  search: string;
  selectedTags: readonly string[];
};

/** True when any home filter dimension is active (canonical). */
export function hasActiveHomeFilters(params: HasActiveHomeFiltersInput): boolean {
  return (
    params.dateFilter !== "none" ||
    params.typeFilter !== "all" ||
    params.friendsFilter ||
    params.search.trim() !== "" ||
    params.selectedTags.length > 0
  );
}

/**
 * True when an active filter is not fully communicated by the visible
 * Today / Events / Places shortcut chips (drawer dates, Friends, search, tags).
 * Shortcut-only Today / Events / Places do not light this indicator.
 */
export function hasNonShortcutHomeFilters(
  params: HasActiveHomeFiltersInput
): boolean {
  if (params.friendsFilter) return true;
  if (params.search.trim() !== "") return true;
  if (params.selectedTags.length > 0) return true;
  if (params.dateFilter !== "none" && params.dateFilter !== "today") {
    return true;
  }
  return false;
}

/**
 * Legacy funnel-dot indicator: type, search, and tags only (excludes date/friends).
 * Preserves pre-drawer-upgrade visible behavior until drawer UI adopts full clear-all.
 */
export function hasActiveHomeFiltersFunnelDot(params: {
  typeFilter: HomeTypeFilter;
  search: string;
  selectedTags: readonly string[];
}): boolean {
  return (
    params.typeFilter !== "all" ||
    params.search.trim() !== "" ||
    params.selectedTags.length > 0
  );
}

/**
 * Personalization is off for Phase 2B.1: true default All uses server all_score.
 * Search/tags never used this path. Keep the helper and call sites for future For You.
 */
export function shouldPersonalizeHomeVerticalFeed(_params: {
  feedSearchQ?: string;
  selectedTags: readonly string[];
  viewMode: HomeViewMode;
  friendsFilter?: boolean;
  dateFilter?: HomeDateFilter;
}): boolean {
  return false;
}

/** True default All vertical Home: no type, friends, occurrence, search, or tags. */
export function isTrueDefaultAllVerticalFeed(
  ctx: HomeVerticalFilterContext,
  now: Date = new Date()
): boolean {
  const occurs = buildHomeOccurrenceFields(ctx.dateFilter, now);
  return isTrueDefaultAllFeed({
    type: getHomeFeedRpcType(ctx),
    friendsOnly: ctx.friendsFilter,
    q: ctx.feedSearchQ,
    tags: ctx.selectedTags,
    occursOn: occurs.occursOn,
    occursFrom: occurs.occursFrom,
    occursTo: occurs.occursTo,
  });
}

/** Cache key `filters` segment when Friends is active on vertical feed. */
export function verticalFriendsCacheFilters(
  friendsFilter: boolean
): FilterType[] | undefined {
  return friendsFilter ? ["friends"] : undefined;
}

/** First-page vertical cache key options (includes type, occurs, friends). */
export function buildHomeVerticalFirstPageFeedKeyOptions(
  ctx: HomeVerticalFilterContext,
  now: Date = new Date()
): Parameters<typeof dataCache.generateFeedKey>[0] {
  const occurs = buildHomeOccurrenceFields(ctx.dateFilter, now);
  return {
    type: getHomeFeedRpcType(ctx),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    filters: verticalFriendsCacheFilters(ctx.friendsFilter),
    limit: HOME_FEED_FIRST_PAGE,
    offset: 0,
    viewerProfileId: ctx.viewerProfileId,
    occursOn: occurs.occursOn,
    occursTz: occurs.occursTz,
    occursFrom: occurs.occursFrom,
    occursTo: occurs.occursTo,
  };
}

/** Base RPC options for date spotlight (occurrence applied by fetchDateSpotlightItems). */
export function buildDateSpotlightBaseOptions(
  ctx: HomeVerticalFilterContext
): TodaySpotlightBaseOptions {
  return {
    type: getHomeFeedRpcType(ctx),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    viewerProfileId: ctx.viewerProfileId || undefined,
    friendsOnly: ctx.friendsFilter || undefined,
  };
}

/** @deprecated Use buildDateSpotlightBaseOptions */
export const buildTodaySpotlightBaseOptions = buildDateSpotlightBaseOptions;

/** ProgressiveFeed vertical loader RPC options (type + occurs + friends). */
export function buildVerticalLoadFeedOptions(
  ctx: HomeVerticalFilterContext,
  page: { offset: number; limit: number },
  now: Date = new Date()
): FeedOptions {
  const occurs = buildHomeOccurrenceFields(ctx.dateFilter, now);
  return {
    type: getHomeFeedRpcType(ctx),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    limit: page.limit,
    offset: page.offset,
    viewerProfileId: ctx.viewerProfileId || undefined,
    friendsOnly: ctx.friendsFilter || undefined,
    occursOn: occurs.occursOn,
    occursTz: occurs.occursTz,
    occursFrom: occurs.occursFrom,
    occursTo: occurs.occursTo,
  };
}

/** `feedOptions` prop for HomePostsSection / ProgressiveFeed feedKey. */
export function buildVerticalFeedOptionsProp(
  ctx: HomeVerticalFilterContext,
  now: Date = new Date()
): {
  type?: FeedOptions["type"];
  q?: string;
  tags?: string[];
  currentUserId: string | null;
  occursOn: string | null;
  occursTz: string | null;
  occursFrom: string | null;
  occursTo: string | null;
  friendsFilter: boolean;
} {
  const occurs = buildHomeOccurrenceFields(ctx.dateFilter, now);
  return {
    type: getHomeFeedRpcType(ctx),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    currentUserId: ctx.viewerProfileId,
    occursOn: occurs.occursOn,
    occursTz: occurs.occursTz,
    occursFrom: occurs.occursFrom,
    occursTo: occurs.occursTo,
    friendsFilter: ctx.friendsFilter,
  };
}

/** Fixed discovery rail fetch — no Home filters (search, tags, friends, date, type). */
export function buildRailDiscoveryFeedOptions(params: {
  viewerProfileId: string | null;
  offset: number;
  limit: number;
}): FeedOptions {
  return {
    type: undefined,
    limit: params.limit,
    offset: params.offset,
    viewerProfileId: params.viewerProfileId || undefined,
  };
}

/** Stable rail cache key — discovery only; no q/tags/filters. */
export function buildRailDiscoveryCacheKeyOptions(params: {
  viewerProfileId: string | null;
  offset: number;
  limit: number;
}): Parameters<typeof dataCache.generateFeedKey>[0] {
  return {
    type: undefined,
    limit: params.limit,
    offset: params.offset,
    viewerProfileId: params.viewerProfileId,
  };
}

/** Mixed-type rail fetch (no occurrence params). */
export function buildRailFetchFeedOptions(params: {
  feedSearchQ?: string;
  selectedTags: string[];
  viewerProfileId: string | null;
  offset: number;
  limit: number;
}): FeedOptions {
  return {
    type: undefined,
    q: params.feedSearchQ,
    tags: tagsForFeedOptions(params.selectedTags),
    limit: params.limit,
    offset: params.offset,
    viewerProfileId: params.viewerProfileId || undefined,
  };
}

/** Rail cache key options (includes client-side filter list when active). */
export function buildRailCacheFeedKeyOptions(
  ctx: HomeRailFilterContext,
  page: { offset: number; limit: number }
): Parameters<typeof dataCache.generateFeedKey>[0] {
  return {
    type: undefined,
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    filters:
      ctx.railAppliedFilters.length > 0 ? [...ctx.railAppliedFilters] : undefined,
    limit: page.limit,
    offset: page.offset,
    viewerProfileId: ctx.viewerProfileId,
  };
}

export function buildHomeVerticalFilterContext(params: {
  viewMode: HomeViewMode;
  dateFilter?: HomeDateFilter;
  feedSearchQ?: string;
  selectedTags: string[];
  viewerProfileId: string | null;
  friendsFilter: boolean;
}): HomeVerticalFilterContext {
  return {
    viewMode: params.viewMode,
    dateFilter: params.dateFilter ?? "none",
    feedSearchQ: params.feedSearchQ,
    selectedTags: params.selectedTags,
    viewerProfileId: params.viewerProfileId,
    friendsFilter: params.friendsFilter,
  };
}

export function buildHomeRailFilterContext(params: {
  feedSearchQ?: string;
  selectedTags: string[];
  railAppliedFilters: FilterType[];
  viewerProfileId: string | null;
}): HomeRailFilterContext {
  return {
    feedSearchQ: params.feedSearchQ,
    selectedTags: params.selectedTags,
    railAppliedFilters: params.railAppliedFilters,
    viewerProfileId: params.viewerProfileId,
  };
}
