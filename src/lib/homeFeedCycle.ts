/**
 * Home Feed Phase 2B.2A/2B.2B — true default-All cycle cursor, unseen-first
 * refresh, continuous wrap, and presentation identity.
 *
 * Module-level store so Home-tab remounts cannot wipe seen IDs.
 * Business identity remains real post.id; presentation keys are UI-only.
 */

import {
  HOME_EVENT_TIMEZONE,
  HOME_FEED_FIRST_PAGE,
  HOME_FEED_MAX_MOUNTED_ITEMS,
  HOME_FEED_PRUNE_TO_ITEMS,
} from "./homeFeedConstants";
import {
  inferHasMoreAfterPage,
  nextFeedOffset,
  rpcConsumedOffset,
} from "./homeFeedPagination";
import { isUpcomingEligibleHangout } from "./feedExpiryFilters";
import type { FeedItemWithDates } from "./feedSorting";

export const HOME_FEED_CYCLE_MAX_SCAN_PAGES = 24;
/** Cap wraps attempted inside one loadMore so a zero-display pool cannot loop. */
export const HOME_FEED_CYCLE_MAX_WRAPS_PER_LOAD = 2;

/** UI-only field; never rewrite post.id. */
export const HOME_FEED_PRESENTATION_KEY_FIELD =
  "__homePresentationKey" as const;

export type HomeFeedCyclePage<T extends { id: string }> = {
  items: T[];
  consumedOffset: number;
  count?: number;
  countIsAuthoritative?: boolean;
};

export type HomeFeedCycleState = {
  cycleId: number;
  cursorOffset: number;
  cycleSeenIds: Set<string>;
  authoritativeCount: number | null;
  replacedThisCycle: boolean;
};

export type HomeFeedCycleSnapshot = {
  cycleId: number;
  cursorOffset: number;
  cycleSeenIds: string[];
  authoritativeCount: number | null;
  replacedThisCycle: boolean;
};

export type WithHomeFeedPresentationKey<T extends { id: string }> = T & {
  [HOME_FEED_PRESENTATION_KEY_FIELD]?: string;
};

const cycles = new Map<string, HomeFeedCycleState>();

export function homeFeedCycleViewerKey(
  viewerProfileId: string | null | undefined
): string {
  return viewerProfileId?.trim() ? viewerProfileId : "guest";
}

function emptyCycle(): HomeFeedCycleState {
  return {
    cycleId: 1,
    cursorOffset: 0,
    cycleSeenIds: new Set(),
    authoritativeCount: null,
    replacedThisCycle: false,
  };
}

export function getHomeFeedCycle(viewerKey: string): HomeFeedCycleState {
  let state = cycles.get(viewerKey);
  if (!state) {
    state = emptyCycle();
    cycles.set(viewerKey, state);
  }
  return state;
}

export function snapshotHomeFeedCycle(
  viewerKey: string
): HomeFeedCycleSnapshot {
  const state = getHomeFeedCycle(viewerKey);
  return {
    cycleId: state.cycleId,
    cursorOffset: state.cursorOffset,
    cycleSeenIds: [...state.cycleSeenIds],
    authoritativeCount: state.authoritativeCount,
    replacedThisCycle: state.replacedThisCycle,
  };
}

export function resetHomeFeedCycle(viewerKey: string): void {
  cycles.set(viewerKey, emptyCycle());
}

export function cloneHomeFeedCycleState(
  state: HomeFeedCycleState
): HomeFeedCycleState {
  return {
    cycleId: state.cycleId,
    cursorOffset: state.cursorOffset,
    cycleSeenIds: new Set(state.cycleSeenIds),
    authoritativeCount: state.authoritativeCount,
    replacedThisCycle: state.replacedThisCycle,
  };
}

export function applyHomeFeedCycleState(
  viewerKey: string,
  next: HomeFeedCycleState
): void {
  cycles.set(viewerKey, {
    cycleId: next.cycleId,
    cursorOffset: next.cursorOffset,
    cycleSeenIds: new Set(next.cycleSeenIds),
    authoritativeCount: next.authoritativeCount,
    replacedThisCycle: next.replacedThisCycle,
  });
}

function rememberCount(
  state: HomeFeedCycleState,
  count: number | undefined,
  countIsAuthoritative: boolean | undefined
): void {
  if (countIsAuthoritative === true && typeof count === "number") {
    state.authoritativeCount = count;
  }
}

/** Record IDs actually selected for the vertical list; advance cursor by RAW rows. */
export function recordHomeFeedCycleDelivery<T extends { id: string }>(
  state: HomeFeedCycleState,
  args: {
    deliveredItems: T[];
    requestOffset: number;
    consumedOffset: number;
    count?: number;
    countIsAuthoritative?: boolean;
  }
): HomeFeedCycleState {
  const next = cloneHomeFeedCycleState(state);
  rememberCount(next, args.count, args.countIsAuthoritative);
  for (const item of args.deliveredItems) {
    if (item?.id) next.cycleSeenIds.add(item.id);
  }
  next.cursorOffset = Math.max(
    next.cursorOffset,
    nextFeedOffset(args.requestOffset, args.consumedOffset)
  );
  return next;
}

export function filterUnseenCycleItems<T extends { id: string }>(
  items: T[],
  seenIds: ReadonlySet<string>,
  alreadySelected?: ReadonlySet<string>
): T[] {
  const out: T[] = [];
  const used = new Set(alreadySelected);
  for (const item of items) {
    if (!item?.id) continue;
    if (seenIds.has(item.id) || used.has(item.id)) continue;
    used.add(item.id);
    out.push(item);
  }
  return out;
}

/** Presentation key: cycleId:realPostId — UI/list only. */
export function homeFeedPresentationKey(
  cycleId: number,
  postId: string
): string {
  return `${cycleId}:${postId}`;
}

export function getHomeFeedItemPresentationKey<T extends { id: string }>(
  item: WithHomeFeedPresentationKey<T>
): string {
  const stamped = item[HOME_FEED_PRESENTATION_KEY_FIELD];
  return stamped && stamped.length > 0 ? stamped : item.id;
}

export function getHomeFeedItemRealId<T extends { id: string }>(
  item: WithHomeFeedPresentationKey<T>
): string {
  return item.id;
}

export function stampHomeFeedPresentationKeys<T extends { id: string }>(
  items: T[],
  cycleId: number
): WithHomeFeedPresentationKey<T>[] {
  return items.map((item) => ({
    ...item,
    [HOME_FEED_PRESENTATION_KEY_FIELD]: homeFeedPresentationKey(
      cycleId,
      item.id
    ),
  }));
}

export function stripHomeFeedPresentationKey<T extends { id: string }>(
  item: WithHomeFeedPresentationKey<T>
): T {
  const {
    [HOME_FEED_PRESENTATION_KEY_FIELD]: _drop,
    ...rest
  } = item as WithHomeFeedPresentationKey<T> & Record<string, unknown>;
  return rest as T;
}

export function stripHomeFeedPresentationKeys<T extends { id: string }>(
  items: WithHomeFeedPresentationKey<T>[]
): T[] {
  return items.map((item) => stripHomeFeedPresentationKey(item));
}

/**
 * Genuine backend exhaustion for the current cycle.
 * Prefer authoritative true_total; also accept a consumed empty page signal
 * when the caller passes exhaustedByPage=true.
 */
export function isHomeFeedCycleExhausted(
  state: HomeFeedCycleState,
  opts?: { exhaustedByPage?: boolean }
): boolean {
  if (opts?.exhaustedByPage) return true;
  if (
    state.authoritativeCount != null &&
    state.cursorOffset >= state.authoritativeCount
  ) {
    return true;
  }
  return false;
}

/**
 * Begin the next logical pass: bump cycleId, clear seen, reset cursor.
 * Keep authoritativeCount as a non-authoritative hint until the next RPC.
 */
export function startNextHomeFeedCycle(
  state: HomeFeedCycleState
): HomeFeedCycleState {
  return {
    cycleId: state.cycleId + 1,
    cursorOffset: 0,
    cycleSeenIds: new Set(),
    authoritativeCount: state.authoritativeCount,
    replacedThisCycle: false,
  };
}

export function pruneMountedHomeFeedItems<T>(
  items: T[],
  opts?: { maxMounted?: number; pruneTo?: number }
): { items: T[]; prunedCount: number } {
  const maxMounted = opts?.maxMounted ?? HOME_FEED_MAX_MOUNTED_ITEMS;
  const pruneTo = opts?.pruneTo ?? HOME_FEED_PRUNE_TO_ITEMS;
  if (items.length <= maxMounted) {
    return { items, prunedCount: 0 };
  }
  const keep = Math.min(pruneTo, maxMounted);
  const prunedCount = Math.max(0, items.length - keep);
  return {
    items: items.slice(prunedCount),
    prunedCount,
  };
}

/**
 * Compact snapshot for display/persist: newest first-page slice, strip
 * presentation keys so restart hydrate does not treat keys as business IDs.
 */
export function compactHomeFeedDisplaySnapshot<T extends { id: string }>(
  items: WithHomeFeedPresentationKey<T>[],
  pageSize: number = HOME_FEED_FIRST_PAGE
): T[] {
  if (!items.length) return [];
  const slice =
    items.length <= pageSize ? items : items.slice(-pageSize);
  return stripHomeFeedPresentationKeys(slice);
}

export type ApplyRefreshEventNudgeOptions = {
  frontWindow?: number;
  desiredUpcomingEvents?: number;
  maxPromotions?: number;
  now?: Date;
  timeZone?: string;
};

/**
 * Phase 2B.2C — soft Event front-nudge for explicit default-All refresh only.
 * Presentation ordering on an already-selected candidate page. Deterministic.
 * Does not touch cycle seen/cursor state.
 */
export function applyRefreshEventNudge<T extends { id: string; type?: string }>(
  items: T[],
  opts: ApplyRefreshEventNudgeOptions = {}
): T[] {
  const frontWindow = opts.frontWindow ?? 6;
  const desired = opts.desiredUpcomingEvents ?? 2;
  const maxPromotions = opts.maxPromotions ?? 2;
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? HOME_EVENT_TIMEZONE;

  if (!items.length || frontWindow <= 0 || desired <= 0 || maxPromotions <= 0) {
    return items;
  }

  const isEvent = (item: T) =>
    isUpcomingEligibleHangout(
      item as unknown as FeedItemWithDates,
      now,
      timeZone
    );

  const frontEventCount = items
    .slice(0, frontWindow)
    .filter((item) => isEvent(item)).length;
  if (frontEventCount >= desired) return items;

  const needed = Math.min(desired - frontEventCount, maxPromotions);
  const promoteIndexes: number[] = [];
  for (
    let i = frontWindow;
    i < items.length && promoteIndexes.length < needed;
    i++
  ) {
    if (isEvent(items[i]!)) promoteIndexes.push(i);
  }
  if (promoteIndexes.length === 0) return items;

  const promoteSet = new Set(promoteIndexes);
  const promoted = promoteIndexes.map((i) => items[i]!);
  const without = items.filter((_, i) => !promoteSet.has(i));

  // Preserve genuinely high-ranked non-Event at position 0 (e.g. new Place).
  let insertAt = 0;
  if (without.length > 0 && !isEvent(without[0]!)) {
    insertAt = 1;
  }

  return [
    ...without.slice(0, insertAt),
    ...promoted,
    ...without.slice(insertAt),
  ];
}

export type BuildUnseenHomeReplacementArgs<T extends { id: string }> = {
  pageSize?: number;
  /** RPC scan page size; defaults to `pageSize`. Cursor advances by this request's raw rows. */
  scanLimit?: number;
  state: HomeFeedCycleState;
  peekOffset0: () => Promise<HomeFeedCyclePage<T>>;
  fetchAtOffset: (
    offset: number,
    limit: number
  ) => Promise<HomeFeedCyclePage<T>>;
  maxScanPages?: number;
};

export type BuildUnseenHomeReplacementResult<T extends { id: string }> =
  | {
      ok: true;
      items: WithHomeFeedPresentationKey<T>[];
      nextState: HomeFeedCycleState;
      peekInjectedIds: string[];
      pagesScanned: number;
    }
  | {
      ok: false;
      reason: "empty" | "error";
      error?: unknown;
    };

/**
 * Build a replacement first page: inject unseen offset-0 rows (server order),
 * then fill from cursor by scanning forward. Does not mutate `state`.
 */
export async function buildUnseenHomeReplacementPage<T extends { id: string }>(
  args: BuildUnseenHomeReplacementArgs<T>
): Promise<BuildUnseenHomeReplacementResult<T>> {
  const pageSize = args.pageSize ?? HOME_FEED_FIRST_PAGE;
  const scanLimit = args.scanLimit ?? pageSize;
  const maxScanPages = args.maxScanPages ?? HOME_FEED_CYCLE_MAX_SCAN_PAGES;
  const next = cloneHomeFeedCycleState(args.state);
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const peekInjectedIds: string[] = [];

  try {
    const peek = await args.peekOffset0();
    rememberCount(next, peek.count, peek.countIsAuthoritative);
    const injected = filterUnseenCycleItems(
      peek.items,
      next.cycleSeenIds,
      selectedIds
    );
    for (const item of injected) {
      if (selected.length >= pageSize) break;
      selected.push(item);
      selectedIds.add(item.id);
      peekInjectedIds.push(item.id);
    }

    let pagesScanned = 0;
    let cursor = next.cursorOffset;

    while (selected.length < pageSize && pagesScanned < maxScanPages) {
      if (
        next.authoritativeCount != null &&
        cursor >= next.authoritativeCount
      ) {
        break;
      }

      const page = await args.fetchAtOffset(cursor, scanLimit);
      pagesScanned += 1;
      rememberCount(next, page.count, page.countIsAuthoritative);
      const rawConsumed = rpcConsumedOffset(page.consumedOffset, scanLimit);
      const unseen = filterUnseenCycleItems(
        page.items,
        next.cycleSeenIds,
        selectedIds
      );
      for (const item of unseen) {
        if (selected.length >= pageSize) break;
        selected.push(item);
        selectedIds.add(item.id);
      }
      const prevCursor = cursor;
      cursor = nextFeedOffset(cursor, rawConsumed);
      if (rawConsumed === 0 || cursor === prevCursor) break;

      const hasMore = inferHasMoreAfterPage({
        consumedOffsetThisPage: rawConsumed,
        requestedLimit: scanLimit,
        nextOffset: cursor,
        count: next.authoritativeCount,
        countIsAuthoritative: next.authoritativeCount != null,
      });
      if (!hasMore && selected.length < pageSize) break;
    }

    next.cursorOffset = cursor;
    if (selected.length === 0) {
      return { ok: false, reason: "empty" };
    }

    for (const item of selected) {
      next.cycleSeenIds.add(item.id);
    }
    next.replacedThisCycle = true;

    return {
      ok: true,
      items: stampHomeFeedPresentationKeys(selected, next.cycleId),
      nextState: next,
      peekInjectedIds,
      pagesScanned,
    };
  } catch (error) {
    return { ok: false, reason: "error", error };
  }
}

export function __resetHomeFeedCyclesForTests(): void {
  cycles.clear();
}
