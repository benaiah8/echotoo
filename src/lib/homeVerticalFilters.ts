/**
 * Home vertical filter kernel — shared builders and derived state for HomePage.
 * Phase 1: extraction only; no new date chips or RPC changes.
 */

import type { FeedOptions } from "../api/queries/getPublicFeed";
import { dataCache } from "./dataCache";
import type { FilterType } from "./horizontalRailFilters";
import { HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";
import type { TodaySpotlightBaseOptions } from "./homeTodaySpotlight";

export type HomeViewMode = "all" | "hangouts" | "experiences";

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

export function isTodayChipActive(selectedFilters: readonly string[]): boolean {
  return selectedFilters.includes("today");
}

export function getVerticalSegmentType(
  viewMode: HomeViewMode
): FeedOptions["type"] {
  if (viewMode === "hangouts") return "hangout";
  if (viewMode === "experiences") return "experience";
  return undefined;
}

/** Social filters for rails; Today is vertical spotlight only. */
export function getRailAppliedFilters(
  selectedFilters: readonly string[]
): FilterType[] {
  return selectedFilters.filter((f) => f !== "today") as FilterType[];
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

export function hasActiveHomeFilters(params: {
  viewMode: HomeViewMode;
  search: string;
  selectedTags: readonly string[];
}): boolean {
  return (
    params.viewMode !== "all" ||
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
