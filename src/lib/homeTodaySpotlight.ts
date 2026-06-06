/**
 * Home vertical date spotlight (Today / Tomorrow) — separate from ProgressiveFeed.
 * Fetches occurrence-qualified rows only (RPC `p_occurs_on` / `p_occurs_tz`).
 */

import {
  getPublicFeed,
  getPublicFeedOptimizedWithCount,
  type FeedItem,
  type FeedOptions,
} from "../api/queries/getPublicFeed";

/** Max spotlight rows for the block above the normal feed. */
export const DATE_SPOTLIGHT_FETCH_CAP = 30;

/** @deprecated Use DATE_SPOTLIGHT_FETCH_CAP */
export const TODAY_SPOTLIGHT_FETCH_CAP = DATE_SPOTLIGHT_FETCH_CAP;

export type OccurrenceWindow = {
  occursOn: string;
  occursTz: string;
};

export type DateSpotlightBaseOptions = Omit<
  FeedOptions,
  "offset" | "limit" | "occursOn" | "occursTz"
>;

/** @deprecated Use DateSpotlightBaseOptions */
export type TodaySpotlightBaseOptions = DateSpotlightBaseOptions;

/** Opt-in dev logs: `localStorage.setItem("DEBUG_TODAY_SPOTLIGHT", "1")` */
export function isTodaySpotlightDebugEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("DEBUG_TODAY_SPOTLIGHT") === "1"
  );
}

export function logTodaySpotlight(payload: Record<string, unknown>): void {
  if (!isTodaySpotlightDebugEnabled()) return;
  console.log("[FeedPipeline:TodaySpotlight]", payload);
}

export function dedupeFeedItemsById(items: FeedItem[]): FeedItem[] {
  return Array.from(new Map(items.map((i) => [i.id, i])).values());
}

/**
 * Fetch date spotlight items only. Does not touch normal feed offset/cache.
 */
export async function fetchDateSpotlightItems(
  baseFeedOptions: DateSpotlightBaseOptions,
  occurrence: OccurrenceWindow,
  useOptimizedFeed: boolean
): Promise<FeedItem[]> {
  const opts: FeedOptions = {
    ...baseFeedOptions,
    offset: 0,
    limit: DATE_SPOTLIGHT_FETCH_CAP,
    occursOn: occurrence.occursOn,
    occursTz: occurrence.occursTz,
  };

  const items = useOptimizedFeed
    ? (await getPublicFeedOptimizedWithCount(opts)).items
    : await getPublicFeed(opts);

  return dedupeFeedItemsById(items);
}

/** @deprecated Use fetchDateSpotlightItems */
export const fetchTodaySpotlightItems = fetchDateSpotlightItems;
