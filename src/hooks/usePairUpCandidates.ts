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
   * Manual hard refresh: fetch page 0 and REPLACE the list (no Duo merge-tail).
   * Bumps list generation so stale loadMore/soft results cannot append afterward.
   */
  hardRefresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  express: (toOpportunityId: string) => Promise<PairUpExpressResult>;
};

function mergeMyPlansDeckPage(
  prev: PairUpCandidate[],
  incoming: PairUpCandidate[]
): PairUpCandidate[] {
  if (prev.length === 0) return incoming;
  const seen = new Set(incoming.map((row) => row.opportunity_id));
  const tail = prev.filter((row) => !seen.has(row.opportunity_id));
  return tail.length === 0 ? incoming : [...incoming, ...tail];
}

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

function appendDiscoverPage(
  prev: PairUpCandidate[],
  incoming: PairUpCandidate[]
): PairUpCandidate[] {
  const seen = new Set(prev.map((row) => row.opportunity_id));
  const added = incoming.filter((row) => !seen.has(row.opportunity_id));
  return added.length === 0 ? prev : [...prev, ...added];
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
  /** Bumped by hardRefresh; stale soft/loadMore applies are discarded. */
  const listGenerationRef = useRef(0);

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

  const revalidate = useCallback(async (force = false) => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (uid === undefined) return;
    if (!uid) {
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    if (isDiscoverRef.current && isOwnP2pDiscoverDisabled()) {
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setLoading(false);
      setIsValidating(false);
      setError(null);
      return;
    }
    if (inflightRef.current) return inflightRef.current;

    const genAtStart = listGenerationRef.current;
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
        if (kindRef.current === PAIR_UP_DECK_KIND_DISCOVER) {
          setCandidates(uniqueByOpportunityId(page.candidates));
          setNextCursor(page.next_cursor ?? null);
        } else {
          setCandidates((prev) => mergeMyPlansDeckPage(prev, page.candidates));
        }
        setHasMore(page.has_more);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
        peopleDebugRecord("fetch:complete", {
          hook: "pairUp",
          kind: kindRef.current,
          count: page.candidates.length,
          hasMore: page.has_more,
          hasCursor: Boolean(page.next_cursor),
        });
      } catch (err) {
        if (genAtStart !== listGenerationRef.current) return;
        const rpcErr = toPairUpRpcError(err);
        if (usable) {
          if (import.meta.env.DEV) {
            console.warn("[pair-up-deck] background revalidate failed", rpcErr);
          }
        } else {
          setError(rpcErr);
          setCandidates([]);
          setHasMore(false);
          setNextCursor(null);
          setHasLoaded(false);
          hasLoadedRef.current = false;
        }
      } finally {
        setLoading(false);
        setIsValidating(false);
      }
    })();

    inflightRef.current = run;
    try {
      await run;
    } finally {
      if (inflightRef.current === run) inflightRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await revalidate(true);
  }, [revalidate]);

  /**
   * Explicit manual hard refresh — always REPLACE page 0 (Duo included).
   * Soft `revalidate`/`refresh` keep merge-tail for my_plans.
   */
  const hardRefresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (uid === undefined) return;
    if (!uid) {
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    if (isDiscoverRef.current && isOwnP2pDiscoverDisabled()) {
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setLoading(false);
      setIsValidating(false);
      setError(null);
      return;
    }

    const gen = ++listGenerationRef.current;
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
      setCandidates(uniqueByOpportunityId(page.candidates));
      setNextCursor(page.next_cursor ?? null);
      setHasMore(page.has_more);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setError(null);
      peopleDebugRecord("fetch:complete", {
        hook: "pairUp",
        kind: kindRef.current,
        count: page.candidates.length,
        hasMore: page.has_more,
        hasCursor: Boolean(page.next_cursor),
        hard: true,
      });
    } catch (err) {
      if (gen !== listGenerationRef.current) return;
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
      setHasLoaded(false);
      hasLoadedRef.current = false;
      throw rpcErr;
    } finally {
      if (gen === listGenerationRef.current) {
        setLoading(false);
        setIsValidating(false);
      }
    }
  }, []);


  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (userId === undefined) return;
    if (!userId) {
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      hasLoadedRef.current = false;
      candidatesRef.current = [];
      nextCursorRef.current = null;
      return;
    }
    if (!peopleActive) return;

    if (isDiscover && isOwnP2pDiscoverDisabled()) {
      candidatesRef.current = [];
      hasLoadedRef.current = true;
      nextCursorRef.current = null;
      setCandidates([]);
      setHasMore(false);
      setNextCursor(null);
      setLoading(false);
      setHasLoaded(true);
      setError(null);
      return;
    }

    const cacheSourcePostId = isDiscover ? null : sourcePostId;
    const cached = getCachedPairUpDeck(userId, cacheSourcePostId, 0, kind);
    if (cached && candidatesRef.current.length === 0) {
      candidatesRef.current = cached.candidates;
      hasLoadedRef.current = true;
      nextCursorRef.current = cached.next_cursor ?? null;
      setCandidates(cached.candidates);
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor ?? null);
      setLoading(false);
      setHasLoaded(true);
      peopleDebugRecord("cache:applied", {
        hook: "pairUp",
        kind,
        count: cached.candidates.length,
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
  }, [enabled, userId, sourcePostId, peopleActive, kind, isDiscover, revalidate]);

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
      if (isOwnP2pDiscoverDisabled()) {
        candidatesRef.current = [];
        nextCursorRef.current = null;
        setCandidates([]);
        setHasMore(false);
        setNextCursor(null);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setLoading(false);
        setIsValidating(false);
        setError(null);
        return;
      }
      if (!peopleActiveRef.current) return;
      if (!userIdRef.current) return;
      void revalidate(true);
    };
    window.addEventListener("profile:updated", onProfileUpdated);
    return () => {
      window.removeEventListener("profile:updated", onProfileUpdated);
    };
  }, [isDiscover, revalidate]);

  const loadMore = useCallback(async () => {
    if (!enabledRef.current) return;
    if (!userId || !hasMore) return;
    const gen = listGenerationRef.current;
    setError(null);
    peopleDebugRecord("loadMore:start", {
      hook: "pairUp",
      kind,
      prevCount: candidates.length,
      hasCursor: Boolean(nextCursor),
    });
    try {
      if (kind === PAIR_UP_DECK_KIND_DISCOVER) {
        const cursor = nextCursor;
        if (!cursor) return;
        const page = await listPairUpCandidates({
          kind,
          limit,
          cursor,
        });
        if (gen !== listGenerationRef.current) return;
        setCandidates((prev) => appendDiscoverPage(prev, page.candidates));
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        peopleDebugRecord("loadMore:complete", {
          hook: "pairUp",
          kind,
          added: page.candidates.length,
          hasMore: page.has_more,
        });
        return;
      }
      const page = await listPairUpCandidates({
        sourcePostId,
        limit,
        offset: candidates.length,
        kind,
      });
      if (gen !== listGenerationRef.current) return;
      setCandidates((prev) => [...prev, ...page.candidates]);
      setHasMore(page.has_more);
      peopleDebugRecord("loadMore:complete", {
        hook: "pairUp",
        kind,
        added: page.candidates.length,
        hasMore: page.has_more,
      });
    } catch (err) {
      if (gen !== listGenerationRef.current) return;
      setError(toPairUpRpcError(err));
      throw err;
    }
  }, [userId, hasMore, sourcePostId, limit, candidates.length, kind, nextCursor]);

  const express = useCallback(
    async (toOpportunityId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const previous = candidates;
      setError(null);
      setCandidates((prev) =>
        prev.map((row) =>
          row.opportunity_id === toOpportunityId
            ? { ...row, expressed_by_me: true }
            : row
        )
      );
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
  };
}
