/**
 * Home vertical Today spotlight — separate from ProgressiveFeed normal loader.
 * Fetches Today-qualified rows only (RPC `p_occurs_on` / `p_occurs_tz`).
 */

import {
  getPublicFeed,
  getPublicFeedOptimizedWithCount,
  type FeedItem,
  type FeedOptions,
} from "../api/queries/getPublicFeed";

/** Max Today rows for the spotlight block above the normal feed. */
export const TODAY_SPOTLIGHT_FETCH_CAP = 30;

export type OccurrenceWindow = {
  occursOn: string;
  occursTz: string;
};

export type TodaySpotlightBaseOptions = Omit<
  FeedOptions,
  "offset" | "limit" | "occursOn" | "occursTz"
>;

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
 * Fetch Today spotlight items only. Does not touch normal feed offset/cache.
 */
export async function fetchTodaySpotlightItems(
  baseFeedOptions: TodaySpotlightBaseOptions,
  occurrence: OccurrenceWindow,
  useOptimizedFeed: boolean
): Promise<FeedItem[]> {
  const opts: FeedOptions = {
    ...baseFeedOptions,
    offset: 0,
    limit: TODAY_SPOTLIGHT_FETCH_CAP,
    occursOn: occurrence.occursOn,
    occursTz: occurrence.occursTz,
  };

  const items = useOptimizedFeed
    ? (await getPublicFeedOptimizedWithCount(opts)).items
    : await getPublicFeed(opts);

  return dedupeFeedItemsById(items);
}
