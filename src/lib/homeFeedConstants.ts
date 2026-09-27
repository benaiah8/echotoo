/**
 * Home vertical ProgressiveFeed initial page size — must match
 * HomePage dataCache.generateFeedKey limit for the RPC first-page cache key.
 * Display/hydration snapshots use a separate home_display_v1 key.
 */
export const HOME_FEED_FIRST_PAGE = 15;

/**
 * Phase 2B.2B — max mounted true-default-All cards before front prune.
 * Keeps memory bounded across continuous cycles without virtualization.
 */
export const HOME_FEED_MAX_MOUNTED_ITEMS = 90;
/** After exceeding max, prune the front down to this many retained cards. */
export const HOME_FEED_PRUNE_TO_ITEMS = 75;

/**
 * Canonical Home/Event calendar timezone. Client occurrence params and SQL
 * hangout calendar-day eligibility both use this zone.
 */
export const HOME_EVENT_TIMEZONE = "Africa/Addis_Ababa";
