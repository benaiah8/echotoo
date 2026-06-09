/**
 * Home vertical date spotlight — separate from ProgressiveFeed.
 * Fetches occurrence-qualified rows via RPC single-day or range params.
 */

import {
  getPublicFeed,
  getPublicFeedOptimizedWithCount,
  type FeedItem,
  type FeedOptions,
} from "../api/queries/getPublicFeed";
import {
  getDateSpotlightFallbackChain,
  getDateSpotlightOccurrenceParams,
  type DateSpotlightOccurrenceParams,
  type HomeDateFilterChip,
} from "./homeVerticalFilters";

/** Max spotlight rows for the block above the normal feed. */
export const DATE_SPOTLIGHT_FETCH_CAP = 30;

export type DateSpotlightFallback = {
  filter: HomeDateFilterChip;
  items: FeedItem[];
};

export type DateSpotlightResolution = {
  primaryFilter: HomeDateFilterChip;
  primaryItems: FeedItem[];
  fallback: DateSpotlightFallback | null;
};

/** @deprecated Use DATE_SPOTLIGHT_FETCH_CAP */
export const TODAY_SPOTLIGHT_FETCH_CAP = DATE_SPOTLIGHT_FETCH_CAP;

/** @deprecated Use DateSpotlightOccurrenceParams from homeVerticalFilters */
export type OccurrenceWindow = {
  occursOn: string;
  occursTz: string;
};

export type DateSpotlightBaseOptions = Omit<
  FeedOptions,
  "offset" | "limit" | "occursOn" | "occursTz" | "occursFrom" | "occursTo"
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
  occurrence: DateSpotlightOccurrenceParams,
  useOptimizedFeed: boolean
): Promise<FeedItem[]> {
  const opts: FeedOptions = {
    ...baseFeedOptions,
    offset: 0,
    limit: DATE_SPOTLIGHT_FETCH_CAP,
    occursTz: occurrence.occursTz,
    ...(occurrence.mode === "day"
      ? {
          occursOn: occurrence.occursOn,
          occursFrom: null,
          occursTo: null,
        }
      : {
          occursOn: null,
          occursFrom: occurrence.occursFrom,
          occursTo: occurrence.occursTo,
        }),
  };

  const items = useOptimizedFeed
    ? (await getPublicFeedOptimizedWithCount(opts)).items
    : await getPublicFeed(opts);

  return dedupeFeedItemsById(items);
}

/**
 * Fetch primary spotlight bucket; if empty, walk the full fallback chain from
 * getDateSpotlightFallbackChain sequentially and stop at the first non-empty
 * bucket (at most one fallback section). RPC bound: 1 primary + chain.length
 * (short, controlled chain — no fixed cap that truncates before next_week).
 */
export async function resolveDateSpotlightWithFallback(
  primaryFilter: HomeDateFilterChip,
  baseFeedOptions: DateSpotlightBaseOptions,
  useOptimizedFeed: boolean
): Promise<DateSpotlightResolution> {
  const emptyResult = (): DateSpotlightResolution => ({
    primaryFilter,
    primaryItems: [],
    fallback: null,
  });

  const primaryOccurrence = getDateSpotlightOccurrenceParams(primaryFilter);
  if (!primaryOccurrence) return emptyResult();

  const primaryItems = await fetchDateSpotlightItems(
    baseFeedOptions,
    primaryOccurrence,
    useOptimizedFeed
  );

  if (primaryItems.length > 0) {
    return { primaryFilter, primaryItems, fallback: null };
  }

  const fallbackChain = getDateSpotlightFallbackChain(primaryFilter);

  for (const fallbackFilter of fallbackChain) {
    const occurrence = getDateSpotlightOccurrenceParams(fallbackFilter);
    if (!occurrence) continue;

    const items = await fetchDateSpotlightItems(
      baseFeedOptions,
      occurrence,
      useOptimizedFeed
    );

    if (items.length > 0) {
      return {
        primaryFilter,
        primaryItems: [],
        fallback: { filter: fallbackFilter, items },
      };
    }
  }

  return emptyResult();
}

/** @deprecated Use fetchDateSpotlightItems */
export const fetchTodaySpotlightItems = fetchDateSpotlightItems;
