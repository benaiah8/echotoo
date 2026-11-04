import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  expressPairUpInterest,
  isOwnP2pDiscoverDisabled,
  listPairUpCandidates,
  toPairUpRpcError,
} from "../api/services/pairUp";
import type {
  PairUpCandidate,
  PairUpExpressResult,
} from "../lib/people/types";
import {
  getCachedPairUpDeck,
  isPairUpDeckSoftStale,
  PAIR_UP_DECK_KIND_DISCOVER,
  PAIR_UP_DECK_KIND_MY_PLANS,
  subscribePairUpDeckCache,
  type PairUpDeckKind,
} from "../lib/pairUpCache";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import { useTabActive } from "../router/PersistentTabContainer.new";
import { peopleDebugRecord } from "../lib/people/peopleDeckDebug";
import { clearDiscoverSentComments } from "../lib/people/discoverSentComment";
import {
  markDuoInterestCleared,
  markDuoInterestExpressed,
} from "../lib/people/duoHeartVisibility";
import {
  confirmDiscoverHeart,
  discoverHeartShouldHold,
  reconcileDiscoverHeartCandidate,
  setDiscoverHeartViewer,
  startDiscoverHeartListFetch,
} from "../lib/people/discoverHeartState";
import { clearDiscoverRecentSeenHistory } from "../lib/people/discoverCandidateRotation";
import {
  appendDiscoverHardRefreshPage,
  shouldFetchDiscoverHardRefreshBoostPage,
} from "../lib/people/discoverHardRefreshPrefetch";
import {
  discoverDiagNotePage,
  discoverDiagResetSession,
} from "../lib/people/discoverCompletenessDiag";

export type UsePairUpCandidatesResult = {
  candidates: PairUpCandidate[];
  hasMore: boolean;
  /** No usable candidate data yet (initial load / signed-out). */
  loading: boolean;
  /** Background refresh while existing cards stay visible. */
  isValidating: boolean;
  error: Error | null;
  /** True after cache hydration or a successful candidate request. */
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  /**
   * Manual hard refresh: force page 0 and REPLACE (no Duo merge-tail / retention).
   * Discover may fetch one boost page only when page 0 is a single-creator monopoly.
   * Bumps list generation so stale loadMore/soft results cannot append afterward.
   */
  hardRefresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  express: (toOpportunityId: string) => Promise<PairUpExpressResult>;
  /** Discover Heart only. Does not change pool membership or comment fields. */
  noteDiscoverHeartExpressed: (opportunityId: string, expressed: boolean) => void;
  /** Duo Heart only. Clears one opportunity and leaves the candidate visible. */
  noteDuoHeartWithdrawn: (opportunityId: string, viewerId: string) => void;
};

function uniqueByOpportunityId(rows: PairUpCandidate[]): PairUpCandidate[] {
  const seen = new Set<string>();
  const out: PairUpCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.opportunity_id)) continue;
    seen.add(row.opportunity_id);
    out.push(row);
  }
  return out;
}

/**
 * Soft page-0 My Duo replace. Server page is authoritative: cards the RPC
 * omits (expired sources, closed windows) must drop — do not preserve a
 * merge-tail that can keep ineligible opportunities indefinitely.
 */
export function mergeMyPlansDeckPage(
  _prev: PairUpCandidate[],
  incoming: PairUpCandidate[]
): PairUpCandidate[] {
  return uniqueByOpportunityId(incoming);
}

export function appendDiscoverPage(
  prev: PairUpCandidate[],
  incoming: PairUpCandidate[]
): PairUpCandidate[] {
  const seen = new Set(prev.map((row) => row.opportunity_id));
  const added = incoming.filter((row) => !seen.has(row.opportunity_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

/**
 * Discover comment retention. Memory only: a reload or Discover-hook
 * unmount drops it. A comment does not set expressed_by_me.
 */
const discoverCommentRetainedRows = new Map<string, PairUpCandidate>();

export function retainDiscoverCommentCandidate(row: PairUpCandidate): void {
  const id = row.opportunity_id.trim();
  if (!id) return;
  discoverCommentRetainedRows.set(id, { ...row, opportunity_id: id });
}

export function releaseDiscoverCommentRetention(opportunityId: string): void {
  const id = opportunityId.trim();
  if (!id) return;
  discoverCommentRetainedRows.delete(id);
}

export function clearDiscoverCommentRetention(): void {
  discoverCommentRetainedRows.clear();
  clearDiscoverSentComments();
}

/**
 * Page-0 Discover replace. Server rows win. A retained comment row stays
 * once, in its previous position, when this page omits it.
 */
export function applyDiscoverPageReplacement(
  prev: PairUpCandidate[],
  incoming: PairUpCandidate[],
  retained: ReadonlyMap<string, PairUpCandidate>
): PairUpCandidate[] {
  const incomingUnique = uniqueByOpportunityId(incoming);
  const incomingById = new Map(
    incomingUnique.map((row) => [row.opportunity_id, row])
  );
  const used = new Set<string>();
  const out: PairUpCandidate[] = [];

  for (const row of prev) {
    const fresh = incomingById.get(row.opportunity_id);
    if (fresh) {
      out.push(fresh);
      used.add(row.opportunity_id);
      continue;
    }
    if (retained.has(row.opportunity_id)) {
      out.push(row);
      used.add(row.opportunity_id);
    }
  }

  for (const row of incomingUnique) {
    if (!used.has(row.opportunity_id)) out.push(row);
  }

  for (const [id, row] of retained) {
    if (!used.has(id)) out.push(row);
  }

  return out;
}

export function applyDiscoverServerPage(
  prev: PairUpCandidate[],
  incoming: PairUpCandidate[],
  fetchSeq: number
): PairUpCandidate[] {
  const reconciled = incoming.map((row) =>
    reconcileDiscoverHeartCandidate(row, fetchSeq)
  );
  const retained = new Map(discoverCommentRetainedRows);
  const incomingIds = new Set(reconciled.map((row) => row.opportunity_id));
  for (const row of prev) {
    if (incomingIds.has(row.opportunity_id)) continue;
    if (!discoverHeartShouldHold(row.opportunity_id, fetchSeq)) continue;
    if (!retained.has(row.opportunity_id)) retained.set(row.opportunity_id, row);
  }
  return applyDiscoverPageReplacement(prev, reconciled, retained);
}

/**
 * Soft page-0 revalidate after loadMore: refresh first-page rows without
 * dropping already-fetched later pages. Hard refresh still pure-replaces.
 */
export function mergeDiscoverSoftRevalidate(
  prev: PairUpCandidate[],
  incoming: PairUpCandidate[],
  firstPageIds: ReadonlySet<string>,
  fetchSeq: number
): PairUpCandidate[] {
  const reconciled = incoming.map((row) =>
    reconcileDiscoverHeartCandidate(row, fetchSeq)
  );
  const incomingIds = new Set(reconciled.map((row) => row.opportunity_id));
  const out: PairUpCandidate[] = [];
  const used = new Set<string>();

  for (const row of reconciled) {
    out.push(row);
    used.add(row.opportunity_id);
  }

  for (const row of prev) {
    if (used.has(row.opportunity_id)) continue;
    if (firstPageIds.has(row.opportunity_id)) {
      if (
        discoverCommentRetainedRows.has(row.opportunity_id) ||
        discoverHeartShouldHold(row.opportunity_id, fetchSeq)
      ) {
        out.push(row);
        used.add(row.opportunity_id);
      }
      continue;
    }
    // Later-page row — keep through soft revalidate.
    out.push(
      incomingIds.has(row.opportunity_id)
        ? reconcileDiscoverHeartCandidate(row, fetchSeq)
        : row
    );
    used.add(row.opportunity_id);
  }

  for (const [id, row] of discoverCommentRetainedRows) {
    if (used.has(id)) continue;
    out.push(row);
    used.add(id);
  }

  return out;
}

export function usePairUpCandidates(options?: {
  sourcePostId?: string | null;
  limit?: number;
  kind?: PairUpDeckKind;
  /**
   * When false, skip network/cache hydration (used to lazy-start Discover).
   * Defaults true.
   */
  enabled?: boolean;
}): UsePairUpCandidatesResult {
  const sourcePostId = options?.sourcePostId ?? null;
  const limit = options?.limit ?? 20;
  const kind = options?.kind ?? PAIR_UP_DECK_KIND_MY_PLANS;
  const enabled = options?.enabled !== false;
  const isDiscover = kind === PAIR_UP_DECK_KIND_DISCOVER;
  const peopleActive = useTabActive("people");
  const [candidates, setCandidates] = useState<PairUpCandidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  /** `undefined` = session not resolved yet; `null` = signed out. */
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const peopleActiveRef = useRef(peopleActive);
  peopleActiveRef.current = peopleActive;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const sourcePostIdRef = useRef(sourcePostId);
  sourcePostIdRef.current = sourcePostId;
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const isDiscoverRef = useRef(isDiscover);
  isDiscoverRef.current = isDiscover;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;
  const nextCursorRef = useRef(nextCursor);
  nextCursorRef.current = nextCursor;
  const inflightRef = useRef<Promise<void> | null>(null);
  /** Bumped by hardRefresh and account changes; stale applies are discarded. */
  const listGenerationRef = useRef(0);
  /** Last auth user applied to local deck state (detect A→B without relying on null). */
  const scopedUserIdRef = useRef<string | null | undefined>(undefined);
  /** Opportunity ids received across the current Discover pagination cycle. */
  const discoverCycleReceivedIdsRef = useRef<Set<string>>(new Set());
  /** Ids from the latest authoritative page-0 response (soft revalidate boundary). */
  const discoverFirstPageIdsRef = useRef<Set<string>>(new Set());
  /** 0-based Discover page index for DEV completeness diagnostics. */
  const discoverPageIndexRef = useRef(0);

  const resetDeckLocalState = useCallback(
    (opts?: { hasLoaded?: boolean; clearRetention?: boolean }) => {
      candidatesRef.current = [];
      hasLoadedRef.current = opts?.hasLoaded === true;
      nextCursorRef.current = null;
      discoverCycleReceivedIdsRef.current = new Set();
      discoverFirstPageIdsRef.current = new Set();
      discoverPageIndexRef.current = 0;
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(opts?.hasLoaded === true);
      setLoading(false);
      setIsValidating(false);
      setError(null);
      if (opts?.clearRetention !== false && isDiscoverRef.current) {
        clearDiscoverCommentRetention();
      }
    },
    []
  );

  const noteDiscoverCycleReceived = useCallback((rows: PairUpCandidate[]) => {
    if (!isDiscoverRef.current) return;
    for (const row of rows) {
      const id = row.opportunity_id?.trim();
      if (id) discoverCycleReceivedIdsRef.current.add(id);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Account change: invalidate generations and drop previous user's deck state. */
  useEffect(() => {
    if (userId === undefined) return;
    const prev = scopedUserIdRef.current;
    if (prev === userId) return;
    scopedUserIdRef.current = userId;
    listGenerationRef.current += 1;
    inflightRef.current = null;
    if (prev != null && prev !== userId) {
      clearDiscoverRecentSeenHistory(prev);
    }
    if (!userId) {
      if (isDiscover) {
        clearDiscoverCommentRetention();
        setDiscoverHeartViewer(null);
        clearDiscoverRecentSeenHistory();
      }
      resetDeckLocalState({ hasLoaded: false });
      return;
    }
    if (isDiscover) {
      discoverDiagResetSession(userId);
    }
    resetDeckLocalState({ hasLoaded: false });
  }, [userId, isDiscover, resetDeckLocalState]);

  const revalidate = useCallback(async (force = false) => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (uid === undefined) return;
    if (!uid) {
      resetDeckLocalState({ hasLoaded: false });
      return;
    }
    if (isDiscoverRef.current && isOwnP2pDiscoverDisabled(uid)) {
      resetDeckLocalState({ hasLoaded: true });
      return;
    }
    if (inflightRef.current) return inflightRef.current;

    const genAtStart = listGenerationRef.current;
    const fetchSeq = isDiscoverRef.current ? startDiscoverHeartListFetch() : 0;
    const run = (async () => {
      const usable =
        candidatesRef.current.length > 0 || hasLoadedRef.current;
      peopleDebugRecord("fetch:start", {
        hook: "pairUp",
        kind: kindRef.current,
        force,
        background: usable,
      });
      if (usable) {
        setIsValidating(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await listPairUpCandidates({
          sourcePostId: sourcePostIdRef.current,
          limit: limitRef.current,
          offset: 0,
          force,
          kind: kindRef.current,
        });
        if (genAtStart !== listGenerationRef.current) return;
        if (userIdRef.current !== uid) return;
        if (kindRef.current === PAIR_UP_DECK_KIND_DISCOVER) {
          const incomingIds = new Set(
            page.candidates.map((row) => row.opportunity_id)
          );
          const hasAppendedTail = candidatesRef.current.some(
            (row) => !incomingIds.has(row.opportunity_id)
          );
          const previousFirstPageIds = discoverFirstPageIdsRef.current;
          const preserveTail = force && hasAppendedTail;
          discoverFirstPageIdsRef.current = incomingIds;
          discoverPageIndexRef.current = 0;

          if (preserveTail) {
            // Soft force after loadMore: keep later pages + cursor/hasMore.
            noteDiscoverCycleReceived(page.candidates);
            setCandidates((prev) =>
              mergeDiscoverSoftRevalidate(
                prev,
                page.candidates,
                previousFirstPageIds.size > 0
                  ? previousFirstPageIds
                  : incomingIds,
                fetchSeq
              )
            );
          } else {
            if (force) {
              discoverCycleReceivedIdsRef.current = new Set();
            }
            noteDiscoverCycleReceived(page.candidates);
            setCandidates((prev) =>
              applyDiscoverServerPage(prev, page.candidates, fetchSeq)
            );
            nextCursorRef.current = page.next_cursor ?? null;
            setNextCursor(page.next_cursor ?? null);
            setHasMore(page.has_more);
          }

          discoverDiagNotePage({
            accountKey: uid,
            pageIndex: 0,
            fromCache: false,
            opportunityIds: page.candidates.map((r) => r.opportunity_id),
            creatorIds: page.candidates.map((r) => r.creator_id),
            hasMore: preserveTail
              ? Boolean(nextCursorRef.current) || page.has_more
              : page.has_more,
            hasCursor: Boolean(
              preserveTail ? nextCursorRef.current : page.next_cursor
            ),
            loadMoreTriggered: false,
            loadMoreSkipReason: preserveTail
              ? "softRevalidatePreservedTail"
              : null,
          });
          peopleDebugRecord("fetch:complete", {
            hook: "pairUp",
            kind: kindRef.current,
            count: page.candidates.length,
            hasMore: page.has_more,
            hasCursor: Boolean(page.next_cursor),
            cycleReceived: discoverCycleReceivedIdsRef.current.size,
            softTailPreserved: preserveTail,
          });
        } else {
          setCandidates((prev) => mergeMyPlansDeckPage(prev, page.candidates));
          setHasMore(page.has_more);
          peopleDebugRecord("fetch:complete", {
            hook: "pairUp",
            kind: kindRef.current,
            count: page.candidates.length,
            hasMore: page.has_more,
            hasCursor: Boolean(page.next_cursor),
          });
        }
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
      } catch (err) {
        if (genAtStart !== listGenerationRef.current) return;
        if (userIdRef.current !== uid) return;
        const rpcErr = toPairUpRpcError(err);
        if (isDiscoverRef.current) {
          discoverDiagNotePage({
            accountKey: uid,
            pageIndex: discoverPageIndexRef.current,
            fromCache: false,
            rpcFailed: true,
            opportunityIds: [],
            creatorIds: [],
            hasMore: true,
            hasCursor: Boolean(nextCursorRef.current),
          });
        }
        if (usable) {
          if (import.meta.env.DEV) {
            console.warn("[pair-up-deck] background revalidate failed", rpcErr);
          }
        } else {
          setError(rpcErr);
          setCandidates([]);
          setHasMore(false);
          setNextCursor(null);
          nextCursorRef.current = null;
          setHasLoaded(false);
          hasLoadedRef.current = false;
        }
      } finally {
        if (genAtStart === listGenerationRef.current) {
          setLoading(false);
          setIsValidating(false);
        }
      }
    })();

    inflightRef.current = run;
    try {
      await run;
    } finally {
      if (inflightRef.current === run) inflightRef.current = null;
    }
  }, [resetDeckLocalState, noteDiscoverCycleReceived]);

  const refresh = useCallback(async () => {
    await revalidate(true);
  }, [revalidate]);

  /**
   * Explicit manual hard refresh — REPLACE from a forced page 0.
   * Discover stays incremental (scroll loadMore); optional one boost page only
   * when page 0 is a single-creator monopoly. Soft revalidate never boosts.
   */
  const hardRefresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (uid === undefined) return;
    if (!uid) {
      resetDeckLocalState({ hasLoaded: false });
      return;
    }
    if (isDiscoverRef.current && isOwnP2pDiscoverDisabled(uid)) {
      resetDeckLocalState({ hasLoaded: true });
      return;
    }

    const gen = ++listGenerationRef.current;
    inflightRef.current = null;
    const fetchSeq = isDiscoverRef.current ? startDiscoverHeartListFetch() : 0;
    // Hard refresh always starts a new paging cycle from a forced page-0.
    nextCursorRef.current = null;
    setNextCursor(null);
    // Discover hard refresh must not resurrect Heart/comment-retained rows the
    // server omitted (left Duo, expired source, etc.).
    if (isDiscoverRef.current) {
      clearDiscoverCommentRetention();
      discoverCycleReceivedIdsRef.current = new Set();
      discoverFirstPageIdsRef.current = new Set();
      discoverPageIndexRef.current = 0;
    }
    const usable =
      candidatesRef.current.length > 0 || hasLoadedRef.current;
    peopleDebugRecord("fetch:start", {
      hook: "pairUp",
      kind: kindRef.current,
      force: true,
      hard: true,
      background: usable,
    });
    if (usable) {
      setIsValidating(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const page = await listPairUpCandidates({
        sourcePostId: sourcePostIdRef.current,
        limit: limitRef.current,
        offset: 0,
        force: true,
        kind: kindRef.current,
      });
      if (gen !== listGenerationRef.current) return;
      if (userIdRef.current !== uid) return;

      let accumulated = page.candidates;
      let pageHasMore = page.has_more;
      let pageCursor = page.next_cursor ?? null;
      let pagesFetched = 1;

      if (kindRef.current === PAIR_UP_DECK_KIND_DISCOVER) {
        discoverFirstPageIdsRef.current = new Set(
          page.candidates.map((row) => row.opportunity_id)
        );
        noteDiscoverCycleReceived(page.candidates);
        discoverDiagNotePage({
          accountKey: uid,
          pageIndex: 0,
          fromCache: false,
          opportunityIds: page.candidates.map((r) => r.opportunity_id),
          creatorIds: page.candidates.map((r) => r.creator_id),
          hasMore: page.has_more,
          hasCursor: Boolean(page.next_cursor),
        });

        // Narrow boost: only when page 0 is one creator and more pages exist.
        if (
          shouldFetchDiscoverHardRefreshBoostPage({
            pagesFetched,
            candidates: accumulated,
            hasMore: pageHasMore,
            nextCursor: pageCursor,
            allowSingleCreatorBoost: true,
          }) &&
          pageCursor
        ) {
          const nextPage = await listPairUpCandidates({
            kind: PAIR_UP_DECK_KIND_DISCOVER,
            limit: limitRef.current,
            cursor: pageCursor,
          });
          if (gen !== listGenerationRef.current) return;
          if (userIdRef.current !== uid) return;
          pagesFetched = 2;
          discoverPageIndexRef.current = 1;
          accumulated = appendDiscoverHardRefreshPage(
            accumulated,
            nextPage.candidates
          );
          pageHasMore = nextPage.has_more;
          pageCursor = nextPage.next_cursor ?? null;
          noteDiscoverCycleReceived(nextPage.candidates);
          discoverDiagNotePage({
            accountKey: uid,
            pageIndex: 1,
            fromCache: false,
            opportunityIds: nextPage.candidates.map((r) => r.opportunity_id),
            creatorIds: nextPage.candidates.map((r) => r.creator_id),
            hasMore: nextPage.has_more,
            hasCursor: Boolean(nextPage.next_cursor),
            loadMoreTriggered: true,
          });
        }
      }

      setCandidates(() =>
        kindRef.current === PAIR_UP_DECK_KIND_DISCOVER
          ? uniqueByOpportunityId(
              accumulated.map((row) =>
                reconcileDiscoverHeartCandidate(row, fetchSeq)
              )
            )
          : uniqueByOpportunityId(accumulated)
      );
      nextCursorRef.current = pageCursor;
      setNextCursor(pageCursor);
      setHasMore(pageHasMore);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setError(null);
      peopleDebugRecord("fetch:complete", {
        hook: "pairUp",
        kind: kindRef.current,
        count: accumulated.length,
        hasMore: pageHasMore,
        hasCursor: Boolean(pageCursor),
        hard: true,
        pagesFetched,
        cycleReceived: discoverCycleReceivedIdsRef.current.size,
      });
    } catch (err) {
      if (gen !== listGenerationRef.current) return;
      if (userIdRef.current !== uid) return;
      const rpcErr = toPairUpRpcError(err);
      if (usable) {
        if (import.meta.env.DEV) {
          console.warn("[pair-up-deck] hard refresh failed", rpcErr);
        }
        throw rpcErr;
      }
      setError(rpcErr);
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      nextCursorRef.current = null;
      setHasLoaded(false);
      hasLoadedRef.current = false;
      throw rpcErr;
    } finally {
      if (gen === listGenerationRef.current) {
        setLoading(false);
        setIsValidating(false);
      }
    }
  }, [resetDeckLocalState, noteDiscoverCycleReceived]);

  useEffect(() => {
    if (!isDiscover) return;
    return () => {
      clearDiscoverCommentRetention();
    };
  }, [isDiscover]);

  useEffect(() => {
    if (!isDiscover) return;
    setDiscoverHeartViewer(typeof userId === "string" ? userId : null);
  }, [isDiscover, userId]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (userId === undefined) return;
    if (!userId) return;
    if (!peopleActive) return;

    if (isDiscover && isOwnP2pDiscoverDisabled(userId)) {
      resetDeckLocalState({ hasLoaded: true });
      return;
    }

    const cacheSourcePostId = isDiscover ? null : sourcePostId;
    const cached = getCachedPairUpDeck(userId, cacheSourcePostId, 0, kind);
    if (cached && candidatesRef.current.length === 0) {
      const cachedRows = isDiscover
        ? cached.candidates.map((row) => reconcileDiscoverHeartCandidate(row, 0))
        : cached.candidates;
      candidatesRef.current = cachedRows;
      hasLoadedRef.current = true;
      nextCursorRef.current = cached.next_cursor ?? null;
      if (isDiscover) {
        discoverFirstPageIdsRef.current = new Set(
          cachedRows.map((row) => row.opportunity_id)
        );
        discoverPageIndexRef.current = 0;
        noteDiscoverCycleReceived(cachedRows);
        discoverDiagNotePage({
          accountKey: userId,
          pageIndex: 0,
          fromCache: true,
          opportunityIds: cachedRows.map((r) => r.opportunity_id),
          creatorIds: cachedRows.map((r) => r.creator_id),
          hasMore: cached.has_more,
          hasCursor: Boolean(cached.next_cursor),
        });
      }
      setCandidates(cachedRows);
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor ?? null);
      setLoading(false);
      setHasLoaded(true);
      peopleDebugRecord("cache:applied", {
        hook: "pairUp",
        kind,
        count: cachedRows.length,
        hasMore: cached.has_more,
      });
    } else if (!cached && !hasLoadedRef.current) {
      setLoading(true);
    }

    if (!cached) {
      void revalidate(false);
      return;
    }
    if (isPairUpDeckSoftStale(userId, cacheSourcePostId, 0, kind)) {
      void revalidate(true);
    }
  }, [
    enabled,
    userId,
    sourcePostId,
    peopleActive,
    kind,
    isDiscover,
    revalidate,
    resetDeckLocalState,
    noteDiscoverCycleReceived,
  ]);

  useEffect(() => {
    const maybeRevalidateIfStale = () => {
      if (!enabledRef.current) return;
      if (!peopleActiveRef.current) return;
      const uid = userIdRef.current;
      if (!uid) return;
      const cacheSourcePostId = isDiscoverRef.current
        ? null
        : sourcePostIdRef.current;
      if (
        !isPairUpDeckSoftStale(
          uid,
          cacheSourcePostId,
          0,
          kindRef.current
        )
      ) {
        return;
      }
      void revalidate(true);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") maybeRevalidateIfStale();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let cancelled = false;
    let removeResume: (() => void) | undefined;
    if (isNativeApp()) {
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          const handle = await App.addListener("resume", () => {
            maybeRevalidateIfStale();
          });
          if (cancelled) {
            void handle.remove();
          } else {
            removeResume = () => {
              void handle.remove();
            };
          }
        } catch {
          /* Web / missing plugin. */
        }
      })();
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      removeResume?.();
    };
  }, [revalidate]);

  useEffect(() => {
    return subscribePairUpDeckCache(() => {
      if (!enabledRef.current) return;
      if (!peopleActiveRef.current) return;
      if (!userIdRef.current) return;
      void revalidate(true);
    });
  }, [revalidate]);

  useEffect(() => {
    if (!isDiscover) return;
    const onProfileUpdated = () => {
      const uid = userIdRef.current;
      if (isOwnP2pDiscoverDisabled(uid)) {
        resetDeckLocalState({ hasLoaded: true });
        return;
      }
      if (!peopleActiveRef.current) return;
      if (!uid) return;
      void revalidate(true);
    };
    window.addEventListener("profile:updated", onProfileUpdated);
    return () => {
      window.removeEventListener("profile:updated", onProfileUpdated);
    };
  }, [isDiscover, revalidate, resetDeckLocalState]);

  const loadMore = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (!uid || !hasMore) {
      if (isDiscoverRef.current) {
        discoverDiagNotePage({
          accountKey: uid ?? "anon",
          pageIndex: discoverPageIndexRef.current,
          fromCache: false,
          opportunityIds: [],
          creatorIds: [],
          hasMore: Boolean(hasMore),
          hasCursor: Boolean(nextCursorRef.current),
          loadMoreTriggered: false,
          loadMoreSkipReason: !uid
            ? "noUser"
            : !hasMore
              ? "hasMoreFalse"
              : "skipped",
        });
      }
      return;
    }
    const gen = listGenerationRef.current;
    const fetchSeq = isDiscoverRef.current ? startDiscoverHeartListFetch() : 0;
    setError(null);
    peopleDebugRecord("loadMore:start", {
      hook: "pairUp",
      kind,
      prevCount: candidatesRef.current.length,
      hasCursor: Boolean(nextCursorRef.current),
    });
    try {
      if (kind === PAIR_UP_DECK_KIND_DISCOVER) {
        const cursor = nextCursorRef.current;
        if (!cursor) {
          // Desynced paging state: recover with a forced first page instead of latching.
          peopleDebugRecord("loadMore:missingCursor", {
            hook: "pairUp",
            kind,
            hasMore: true,
          });
          discoverDiagNotePage({
            accountKey: uid,
            pageIndex: discoverPageIndexRef.current,
            fromCache: false,
            opportunityIds: [],
            creatorIds: [],
            hasMore: true,
            hasCursor: false,
            loadMoreTriggered: true,
            loadMoreSkipReason: "missingCursorRecover",
          });
          await revalidate(true);
          return;
        }
        const page = await listPairUpCandidates({
          kind,
          limit,
          cursor,
        });
        if (gen !== listGenerationRef.current) return;
        if (userIdRef.current !== uid) return;
        discoverPageIndexRef.current += 1;
        noteDiscoverCycleReceived(page.candidates);
        setCandidates((prev) =>
          appendDiscoverPage(
            prev,
            page.candidates.map((row) =>
              reconcileDiscoverHeartCandidate(row, fetchSeq)
            )
          )
        );
        setHasMore(page.has_more);
        nextCursorRef.current = page.next_cursor ?? null;
        setNextCursor(page.next_cursor ?? null);
        discoverDiagNotePage({
          accountKey: uid,
          pageIndex: discoverPageIndexRef.current,
          fromCache: false,
          opportunityIds: page.candidates.map((r) => r.opportunity_id),
          creatorIds: page.candidates.map((r) => r.creator_id),
          hasMore: page.has_more,
          hasCursor: Boolean(page.next_cursor),
          loadMoreTriggered: true,
        });
        peopleDebugRecord("loadMore:complete", {
          hook: "pairUp",
          kind,
          added: page.candidates.length,
          hasMore: page.has_more,
          cycleReceived: discoverCycleReceivedIdsRef.current.size,
        });
        return;
      }
      const page = await listPairUpCandidates({
        sourcePostId,
        limit,
        offset: candidatesRef.current.length,
        kind,
      });
      if (gen !== listGenerationRef.current) return;
      if (userIdRef.current !== uid) return;
      setCandidates((prev) => {
        const seen = new Set(prev.map((row) => row.opportunity_id));
        const added = page.candidates.filter(
          (row) => !seen.has(row.opportunity_id)
        );
        return added.length === 0 ? prev : [...prev, ...added];
      });
      setHasMore(page.has_more);
      peopleDebugRecord("loadMore:complete", {
        hook: "pairUp",
        kind,
        added: page.candidates.length,
        hasMore: page.has_more,
      });
    } catch (err) {
      if (gen !== listGenerationRef.current) return;
      if (userIdRef.current !== uid) return;
      // Keep hasMore true so near-end / prefetch can retry — no permanent latch.
      setError(toPairUpRpcError(err));
      throw err;
    }
  }, [userId, hasMore, sourcePostId, limit, kind, revalidate, noteDiscoverCycleReceived]);

  const express = useCallback(
    async (toOpportunityId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const previous = candidates;
      setError(null);
      setCandidates((prev) => markDuoInterestExpressed(prev, toOpportunityId));
      try {
        const result = await expressPairUpInterest(toOpportunityId);
        return result;
      } catch (err) {
        setCandidates(previous);
        setError(toPairUpRpcError(err));
        throw err;
      }
    },
    [userId, candidates]
  );

  const noteDiscoverHeartExpressed = useCallback(
    (opportunityId: string, expressed: boolean) => {
      const uid = userIdRef.current;
      if (!isDiscoverRef.current || !uid || !opportunityId) return;
      confirmDiscoverHeart(uid, opportunityId, expressed);
      setCandidates((prev) =>
        prev.map((row) =>
          row.opportunity_id === opportunityId
            ? { ...row, expressed_by_me: expressed }
            : row
        )
      );
    },
    []
  );

  const noteDuoHeartWithdrawn = useCallback(
    (opportunityId: string, viewerId: string) => {
      if (isDiscoverRef.current) return;
      if (!viewerId || userIdRef.current !== viewerId || !opportunityId) return;
      setCandidates((prev) => markDuoInterestCleared(prev, opportunityId));
    },
    []
  );

  return {
    candidates,
    hasMore,
    loading,
    isValidating,
    error,
    hasLoaded,
    refresh,
    hardRefresh,
    loadMore,
    express,
    noteDiscoverHeartExpressed,
    noteDuoHeartWithdrawn,
  };
}
