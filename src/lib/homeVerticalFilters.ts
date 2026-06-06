/**
 * Home vertical filter kernel — shared builders and derived state for HomePage.
 * Phase 1: extraction only; no new date chips or RPC changes.
 */

import type { FeedOptions } from "../api/queries/getPublicFeed";
import { dataCache } from "./dataCache";
import type { FilterType } from "./horizontalRailFilters";
import { HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";
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

export const INITIAL_HOME_DATE_FILTER: HomeDateFilter = "none";
export const INITIAL_HOME_TYPE_FILTER: HomeTypeFilter = "all";

export type ViewerLocalOccurrence = {
  occursOn: string;
  occursTz: string;
};

export type ViewerLocalDateRange = {
  occursFrom: string;
  occursTo: string;
  occursTz: string;
};

/** Drawer / toggle target — all mutually exclusive date chips except none. */
export type HomeDateFilterChip = Exclude<HomeDateFilter, "none">;

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

/** Spotlight RPC occurrence params for any active date filter. */
export function getDateSpotlightOccurrenceParams(
  dateFilter: HomeDateFilter
): DateSpotlightOccurrenceParams | null {
  if (!isDateSpotlightFilter(dateFilter)) return null;

  const dayOffset = getDateSpotlightDayOffset(dateFilter);
  if (dayOffset !== null) {
    const occurrence = viewerLocalOccurrence(dayOffset);
    if (!occurrence) return null;
    return {
      mode: "day",
      occursOn: occurrence.occursOn,
      occursTz: occurrence.occursTz,
    };
  }

  const range = getDateRangeForFilter(dateFilter);
  if (!range) return null;
  return {
    mode: "range",
    occursFrom: range.occursFrom,
    occursTo: range.occursTo,
    occursTz: range.occursTz,
  };
}

function viewerLocalTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function viewerLocalDateString(dayOffsetFromToday = 0): string | null {
  return viewerLocalOccurrence(dayOffsetFromToday)?.occursOn ?? null;
}

/** Postgres ISODOW in viewer TZ: Mon=1 … Sun=7. */
function viewerLocalIsodow(dayOffsetFromToday = 0): number | null {
  try {
    const timeZone = viewerLocalTimeZone();
    if (!timeZone) return null;
    const anchor = new Date();
    if (dayOffsetFromToday !== 0) {
      anchor.setDate(anchor.getDate() + dayOffsetFromToday);
    }
    const dayName = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(anchor);
    const isodowByName: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    return isodowByName[dayName] ?? null;
  } catch {
    return null;
  }
}

/**
 * Viewer-local inclusive date range for week spotlight filters.
 * Returns null for single-day/none filters or when TZ/date parts are unavailable.
 */
export function getDateRangeForFilter(
  dateFilter: HomeDateFilter
): ViewerLocalDateRange | null {
  if (
    dateFilter !== "this_week" &&
    dateFilter !== "this_weekend" &&
    dateFilter !== "next_week"
  ) {
    return null;
  }

  const occursTz = viewerLocalTimeZone();
  if (!occursTz) return null;

  const isodow = viewerLocalIsodow(0);
  if (isodow === null) return null;

  if (dateFilter === "this_week") {
    const occursFrom = viewerLocalDateString(0);
    const occursTo = viewerLocalDateString(7 - isodow);
    if (!occursFrom || !occursTo) return null;
    return { occursFrom, occursTo, occursTz };
  }

  if (dateFilter === "this_weekend") {
    if (isodow <= 5) {
      const occursFrom = viewerLocalDateString(6 - isodow);
      const occursTo = viewerLocalDateString(7 - isodow);
      if (!occursFrom || !occursTo) return null;
      return { occursFrom, occursTo, occursTz };
    }
    if (isodow === 6) {
      const occursFrom = viewerLocalDateString(0);
      const occursTo = viewerLocalDateString(1);
      if (!occursFrom || !occursTo) return null;
      return { occursFrom, occursTo, occursTz };
    }
    const occursFrom = viewerLocalDateString(0);
    if (!occursFrom) return null;
    return { occursFrom, occursTo: occursFrom, occursTz };
  }

  const nextMondayOffset = 7 - isodow + 1;
  const nextSundayOffset = nextMondayOffset + 6;
  const occursFrom = viewerLocalDateString(nextMondayOffset);
  const occursTo = viewerLocalDateString(nextSundayOffset);
  if (!occursFrom || !occursTo) return null;
  return { occursFrom, occursTo, occursTz };
}

/**
 * Viewer-local occurrence for a calendar day offset from today (0 = today).
 */
export function viewerLocalOccurrence(
  dayOffsetFromToday = 0
): ViewerLocalOccurrence | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return null;
    const anchor = new Date();
    if (dayOffsetFromToday !== 0) {
      anchor.setDate(anchor.getDate() + dayOffsetFromToday);
    }
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(anchor);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!year || !month || !day) return null;
    return {
      occursOn: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      occursTz: timeZone,
    };
  } catch {
    return null;
  }
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

/** Personalization applies only on the default vertical segment with no search/tags/friends. */
export function shouldPersonalizeHomeVerticalFeed(params: {
  feedSearchQ?: string;
  selectedTags: readonly string[];
  viewMode: HomeViewMode;
  friendsFilter?: boolean;
}): boolean {
  return (
    !params.feedSearchQ &&
    params.selectedTags.length === 0 &&
    params.viewMode === "all" &&
    !params.friendsFilter
  );
}

/** Cache key `filters` segment when Friends is active on vertical feed. */
export function verticalFriendsCacheFilters(
  friendsFilter: boolean
): FilterType[] | undefined {
  return friendsFilter ? ["friends"] : undefined;
}

/** First-page vertical cache key options (date filters use spotlight only — no occurrence params). */
export function buildHomeVerticalFirstPageFeedKeyOptions(
  ctx: HomeVerticalFilterContext
): Parameters<typeof dataCache.generateFeedKey>[0] {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    filters: verticalFriendsCacheFilters(ctx.friendsFilter),
    limit: HOME_FEED_FIRST_PAGE,
    offset: 0,
    viewerProfileId: ctx.viewerProfileId,
    occursOn: null,
    occursTz: null,
    occursFrom: null,
    occursTo: null,
  };
}

/** Base RPC options for date spotlight (occurrence applied by fetchDateSpotlightItems). */
export function buildDateSpotlightBaseOptions(
  ctx: HomeVerticalFilterContext
): TodaySpotlightBaseOptions {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    viewerProfileId: ctx.viewerProfileId || undefined,
    friendsOnly: ctx.friendsFilter || undefined,
  };
}

/** @deprecated Use buildDateSpotlightBaseOptions */
export const buildTodaySpotlightBaseOptions = buildDateSpotlightBaseOptions;

/** ProgressiveFeed vertical loader RPC options (no date occurrence params). */
export function buildVerticalLoadFeedOptions(
  ctx: HomeVerticalFilterContext,
  page: { offset: number; limit: number }
): FeedOptions {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    limit: page.limit,
    offset: page.offset,
    viewerProfileId: ctx.viewerProfileId || undefined,
    friendsOnly: ctx.friendsFilter || undefined,
  };
}

/** `feedOptions` prop for HomePostsSection / ProgressiveFeed feedKey (no date occurrence params). */
export function buildVerticalFeedOptionsProp(ctx: HomeVerticalFilterContext): {
  type?: FeedOptions["type"];
  q?: string;
  tags?: string[];
  currentUserId: string | null;
  occursOn: null;
  occursTz: null;
  occursFrom: null;
  occursTo: null;
  friendsFilter: boolean;
} {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    currentUserId: ctx.viewerProfileId,
    occursOn: null,
    occursTz: null,
    occursFrom: null,
    occursTo: null,
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
