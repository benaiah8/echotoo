/**
 * Discover hard-refresh policy helpers.
 *
 * Multi-page prefetch on hard refresh was removed: it pulled most of the
 * eligible pool up front and made the feed feel fully loaded before scroll.
 * Hard refresh is page-0 only; scroll uses next_cursor via loadMore.
 *
 * Optional single boost page: only when page 0 has a single creator and the
 * backend still has more — enough to change the leading creator without
 * eagerly fetching the full pool.
 */

export const DISCOVER_HARD_REFRESH_MAX_PAGES = 1;
/** @deprecated Kept for tests; hard refresh no longer targets multi-creator prefetch. */
export const DISCOVER_HARD_REFRESH_TARGET_CREATORS = 5;

export type DiscoverPrefetchCandidate = {
  opportunity_id: string;
  creator_id: string;
};

export function countUniqueDiscoverCreators(
  rows: readonly DiscoverPrefetchCandidate[]
): number {
  const creators = new Set<string>();
  for (const row of rows) {
    const id = row.creator_id?.trim();
    if (id) creators.add(id);
  }
  return creators.size;
}

export function countUnseenDiscoverOpportunities(
  rows: readonly DiscoverPrefetchCandidate[],
  recentSeenIds: readonly string[]
): number {
  if (rows.length === 0) return 0;
  const recent = new Set(
    recentSeenIds.filter((id) => typeof id === "string" && id.trim())
  );
  let unseen = 0;
  for (const row of rows) {
    const id = row.opportunity_id?.trim();
    if (!id) continue;
    if (!recent.has(id)) unseen += 1;
  }
  return unseen;
}

/**
 * Whether hard refresh may fetch exactly one extra cursor page.
 * Default policy: never (incremental scroll owns further pages).
 * Boost: page 0 is a single-creator monopoly and more pages exist.
 */
export function shouldFetchDiscoverHardRefreshBoostPage(options: {
  pagesFetched: number;
  candidates: readonly DiscoverPrefetchCandidate[];
  hasMore: boolean;
  nextCursor: string | null | undefined;
  /** When true, allow one boost page if page 0 has only one creator. */
  allowSingleCreatorBoost?: boolean;
}): boolean {
  if (options.allowSingleCreatorBoost !== true) return false;
  if (options.pagesFetched !== 1) return false;
  if (!options.hasMore) return false;
  if (
    typeof options.nextCursor !== "string" ||
    options.nextCursor.trim() === ""
  ) {
    return false;
  }
  return countUniqueDiscoverCreators(options.candidates) < 2;
}

/**
 * @deprecated Multi-page hard-refresh prefetch is disabled. Always false unless
 * an explicit single-creator boost is requested via shouldFetchDiscoverHardRefreshBoostPage.
 */
export function shouldContinueDiscoverHardRefreshPrefetch(options: {
  pagesFetched: number;
  candidates: readonly DiscoverPrefetchCandidate[];
  recentSeenIds: readonly string[];
  hasMore: boolean;
  nextCursor: string | null | undefined;
  maxPages?: number;
  targetCreators?: number;
}): boolean {
  void options.recentSeenIds;
  void options.maxPages;
  void options.targetCreators;
  return shouldFetchDiscoverHardRefreshBoostPage({
    pagesFetched: options.pagesFetched,
    candidates: options.candidates,
    hasMore: options.hasMore,
    nextCursor: options.nextCursor,
    allowSingleCreatorBoost: false,
  });
}

/** Append next page without duplicating opportunity ids (order preserved). */
export function appendDiscoverHardRefreshPage<T extends DiscoverPrefetchCandidate>(
  prev: readonly T[],
  incoming: readonly T[]
): T[] {
  const seen = new Set(prev.map((row) => row.opportunity_id));
  const out = [...prev];
  for (const row of incoming) {
    const id = row.opportunity_id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
