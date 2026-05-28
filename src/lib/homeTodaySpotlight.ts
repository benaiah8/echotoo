/**
 * Home vertical Today spotlight (page-0 merge).
 * Rails are unaffected — only the vertical ProgressiveFeed loader uses this.
 */

import type { FeedItem, FeedOptions } from "../api/queries/getPublicFeed";

/** Max Today rows fetched for spotlight prefix (RPC source of truth). */
export const TODAY_SPOTLIGHT_FETCH_CAP = 30;

export type OccurrenceWindow = {
  occursOn: string;
  occursTz: string;
};

export type NormalVerticalLoadResult = {
  items: FeedItem[];
  consumedOffset: number;
  count?: number;
};

export type NormalVerticalLoader = (
  options: FeedOptions
) => Promise<NormalVerticalLoadResult>;

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

export type LoadHomeVerticalPageArgs = {
  offset: number;
  limit: number;
  todayActive: boolean;
  occurrence: OccurrenceWindow | null;
  /** Base feed opts without offset/limit/occurrence — segment type, q, tags, viewer. */
  baseFeedOptions: Omit<
    FeedOptions,
    "offset" | "limit" | "occursOn" | "occursTz"
  >;
  loadNormal: NormalVerticalLoader;
};

function dedupeNormalTail(
  todayItems: FeedItem[],
  normalItems: FeedItem[]
): FeedItem[] {
  const todayIds = new Set(todayItems.map((i) => i.id));
  return normalItems.filter((i) => !todayIds.has(i.id));
}

/**
 * Vertical feed loader with optional Today spotlight on offset 0.
 * - Today off or offset > 0: normal RPC only (no occurrence params on tail).
 * - Today on @ offset 0: parallel Today + normal RPC, merge, dedupe by id.
 * Pagination uses normal `consumedOffset` / `count` only.
 */
export async function loadHomeVerticalPage(
  args: LoadHomeVerticalPageArgs
): Promise<NormalVerticalLoadResult> {
  const {
    offset,
    limit,
    todayActive,
    occurrence,
    baseFeedOptions,
    loadNormal,
  } = args;

  const normalOpts: FeedOptions = {
    ...baseFeedOptions,
    offset,
    limit,
    occursOn: null,
    occursTz: null,
  };

  if (!todayActive) {
    const result = await loadNormal(normalOpts);
    logTodaySpotlight({
      todayActive: false,
      offset,
      limit,
      normalCount: result.items.length,
      mergedCount: result.items.length,
      consumedOffset: result.consumedOffset,
      count: result.count,
    });
    return result;
  }

  if (offset > 0) {
    const result = await loadNormal(normalOpts);
    logTodaySpotlight({
      todayActive: true,
      phase: "tail",
      offset,
      limit,
      normalCount: result.items.length,
      mergedCount: result.items.length,
      consumedOffset: result.consumedOffset,
      count: result.count,
    });
    return result;
  }

  if (!occurrence) {
    logTodaySpotlight({
      todayActive: true,
      phase: "no-occurrence-fallback",
      offset: 0,
      limit,
    });
    return loadNormal(normalOpts);
  }

  const todayOpts: FeedOptions = {
    ...baseFeedOptions,
    offset: 0,
    limit: TODAY_SPOTLIGHT_FETCH_CAP,
    occursOn: occurrence.occursOn,
    occursTz: occurrence.occursTz,
  };

  const [todayResult, normalResult] = await Promise.all([
    loadNormal(todayOpts),
    loadNormal(normalOpts),
  ]);

  const tail = dedupeNormalTail(todayResult.items, normalResult.items);
  const merged = [...todayResult.items, ...tail];

  logTodaySpotlight({
    todayActive: true,
    phase: "merge",
    occursOn: occurrence.occursOn,
    occursTz: occurrence.occursTz,
    todayCount: todayResult.items.length,
    normalCount: normalResult.items.length,
    tailAfterDedupe: tail.length,
    mergedCount: merged.length,
    consumedOffset: normalResult.consumedOffset,
    count: normalResult.count,
  });

  return {
    items: merged,
    consumedOffset: normalResult.consumedOffset,
    count: normalResult.count,
  };
}
