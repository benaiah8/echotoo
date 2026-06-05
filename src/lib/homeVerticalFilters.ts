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

/** Inputs shared by vertical feed, cache keys, and Today spotlight. */
export type HomeVerticalFilterContext = {
  viewMode: HomeViewMode;
  feedSearchQ?: string;
  selectedTags: string[];
  viewerProfileId: string | null;
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

/** Drawer date chips — only Today is implemented in Phase 2. */
export const HOME_DATE_FILTER_DRAWER_OPTIONS: ReadonlyArray<{
  value: Exclude<HomeDateFilter, "none">;
  label: string;
  enabled: boolean;
}> = [
  { value: "today", label: "Today", enabled: true },
  { value: "tomorrow", label: "Tomorrow", enabled: false },
  { value: "this_week", label: "This Week", enabled: false },
  { value: "this_weekend", label: "This Weekend", enabled: false },
  { value: "next_week", label: "Next Week", enabled: false },
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

/** Personalization applies only on the default vertical segment with no search/tags. */
export function shouldPersonalizeHomeVerticalFeed(params: {
  feedSearchQ?: string;
  selectedTags: readonly string[];
  viewMode: HomeViewMode;
}): boolean {
  return (
    !params.feedSearchQ &&
    params.selectedTags.length === 0 &&
    params.viewMode === "all"
  );
}

/** First-page vertical cache key options (occurrence params always null for now). */
export function buildHomeVerticalFirstPageFeedKeyOptions(
  ctx: HomeVerticalFilterContext
): Parameters<typeof dataCache.generateFeedKey>[0] {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    limit: HOME_FEED_FIRST_PAGE,
    offset: 0,
    viewerProfileId: ctx.viewerProfileId,
    occursOn: null,
    occursTz: null,
  };
}

/** Base RPC options for Today spotlight (occurrence applied by fetchTodaySpotlightItems). */
export function buildTodaySpotlightBaseOptions(
  ctx: HomeVerticalFilterContext
): TodaySpotlightBaseOptions {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    viewerProfileId: ctx.viewerProfileId || undefined,
  };
}

/** ProgressiveFeed vertical loader RPC options. */
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
  };
}

/** `feedOptions` prop for HomePostsSection / ProgressiveFeed feedKey. */
export function buildVerticalFeedOptionsProp(ctx: HomeVerticalFilterContext): {
  type?: FeedOptions["type"];
  q?: string;
  tags?: string[];
  currentUserId: string | null;
  occursOn: null;
  occursTz: null;
} {
  return {
    type: getVerticalSegmentType(ctx.viewMode),
    q: ctx.feedSearchQ,
    tags: tagsForFeedOptions(ctx.selectedTags),
    currentUserId: ctx.viewerProfileId,
    occursOn: null,
    occursTz: null,
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
  feedSearchQ?: string;
  selectedTags: string[];
  viewerProfileId: string | null;
}): HomeVerticalFilterContext {
  return {
    viewMode: params.viewMode,
    feedSearchQ: params.feedSearchQ,
    selectedTags: params.selectedTags,
    viewerProfileId: params.viewerProfileId,
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
