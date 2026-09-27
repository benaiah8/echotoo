import { useCallback, useEffect, useRef, useState } from "react";
import { listOpenPlanCandidates } from "../api/services/openPlans";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedOpenPlanDeck,
  isOpenPlanDeckSoftStale,
  subscribeOpenPlanCache,
} from "../lib/openPlanCache";
import type { OpenPlanCandidate } from "../lib/people/types";
import { peopleDebugRecord } from "../lib/people/peopleDeckDebug";

export type UseOpenPlanCandidatesResult = {
  candidates: OpenPlanCandidate[];
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Immediate local patch — does not invent Accepted card state. */
  patchRequestStatus: (
    opportunityId: string,
    status: "pending" | null
  ) => void;
  /** Authoritative local drop; pair with overlay removedIds via one shared callback. */
  removeCandidate: (opportunityId: string) => void;
};

function uniqueByOpportunityId(
  rows: OpenPlanCandidate[]
): OpenPlanCandidate[] {
  const seen = new Set<string>();
  const out: OpenPlanCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.opportunity_id)) continue;
    seen.add(row.opportunity_id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: OpenPlanCandidate[],
  incoming: OpenPlanCandidate[]
): OpenPlanCandidate[] {
  const seen = new Set(prev.map((row) => row.opportunity_id));
  const added = incoming.filter((row) => !seen.has(row.opportunity_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Open Plans browse deck. Defaults to `enabled: false` until People first
 * opens the Open Plans scope (8E.2 lazy mount).
 */
export function useOpenPlanCandidates(options?: {
  limit?: number;
  enabled?: boolean;
}): UseOpenPlanCandidatesResult {
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled === true;
  const [candidates, setCandidates] = useState<OpenPlanCandidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  /** `undefined` = session not resolved yet; `null` = signed out. */
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;
  const nextCursorRef = useRef(nextCursor);
  nextCursorRef.current = nextCursor;
  const inflightRef = useRef<Promise<void> | null>(null);

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
    if (inflightRef.current) return inflightRef.current;

    const run = (async () => {
      const usable =
        candidatesRef.current.length > 0 || hasLoadedRef.current;
      peopleDebugRecord("fetch:start", {
        hook: "openPlan",
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
        const page = await listOpenPlanCandidates({
          limit: limitRef.current,
          cursor: null,
          force,
        });
        setCandidates(uniqueByOpportunityId(page.candidates));
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
        peopleDebugRecord("fetch:complete", {
          hook: "openPlan",
          count: page.candidates.length,
          hasMore: page.has_more,
          hasCursor: Boolean(page.next_cursor),
        });
      } catch (err) {
        setError(toError(err));
        if (!hasLoadedRef.current) {
          setHasLoaded(true);
          hasLoadedRef.current = true;
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

  const patchRequestStatus = useCallback(
    (opportunityId: string, status: "pending" | null) => {
      if (!opportunityId) return;
      setCandidates((prev) => {
        let changed = false;
        const next = prev.map((row) => {
          if (row.opportunity_id !== opportunityId) return row;
          if (row.my_request_status === status) return row;
          changed = true;
          return { ...row, my_request_status: status };
        });
        if (!changed) return prev;
        candidatesRef.current = next;
        return next;
      });
    },
    []
  );

  const removeCandidate = useCallback((opportunityId: string) => {
    if (!opportunityId) return;
    setCandidates((prev) => {
      const next = prev.filter((row) => row.opportunity_id !== opportunityId);
      if (next.length === prev.length) return prev;
      candidatesRef.current = next;
      return next;
    });
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

    const cached = getCachedOpenPlanDeck(userId);
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
        hook: "openPlan",
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
    if (isOpenPlanDeckSoftStale(userId)) {
      void revalidate(true);
    }
  }, [enabled, userId, revalidate]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeOpenPlanCache(() => {
      if (!enabledRef.current) return;
      if (!userIdRef.current) return;
      void revalidate(true);
    });
  }, [enabled, revalidate]);

  const loadMore = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (!uid || !nextCursorRef.current) return;
    if (!hasMore) return;
    setError(null);
    peopleDebugRecord("loadMore:start", {
      hook: "openPlan",
      prevCount: candidatesRef.current.length,
      hasCursor: true,
    });
    try {
      const page = await listOpenPlanCandidates({
        limit: limitRef.current,
        cursor: nextCursorRef.current,
      });
      setCandidates((prev) => appendPage(prev, page.candidates));
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor ?? null);
      peopleDebugRecord("loadMore:complete", {
        hook: "openPlan",
        added: page.candidates.length,
        hasMore: page.has_more,
      });
    } catch (err) {
      setError(toError(err));
      throw err;
    }
  }, [hasMore]);

  return {
    candidates,
    hasMore,
    loading,
    isValidating,
    error,
    hasLoaded,
    refresh,
    loadMore,
    patchRequestStatus,
    removeCandidate,
  };
}
