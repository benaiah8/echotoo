import { useCallback, useEffect, useRef, useState } from "react";
import { listOpenPlanRequesters } from "../api/services/openPlans";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedOpenPlanRequesters,
  isOpenPlanRequestersSoftStale,
  removeFromCachedOpenPlanRequesters,
  subscribeOpenPlanRequestersCache,
} from "../lib/openPlanRequestersCache";
import type { OpenPlanRequester } from "../lib/people/types";

export type UseOpenPlanRequestersResult = {
  requests: OpenPlanRequester[];
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  removeRequest: (requestId: string) => void;
};

function uniqueByRequestId(rows: OpenPlanRequester[]): OpenPlanRequester[] {
  const seen = new Set<string>();
  const out: OpenPlanRequester[] = [];
  for (const row of rows) {
    if (seen.has(row.request_id)) continue;
    seen.add(row.request_id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: OpenPlanRequester[],
  incoming: OpenPlanRequester[]
): OpenPlanRequester[] {
  const seen = new Set(prev.map((row) => row.request_id));
  const added = incoming.filter((row) => !seen.has(row.request_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Lazy pending requesters for one Open Plan opportunity.
 * Cursor is scoped to opportunityId and reset when it changes.
 */
export function useOpenPlanRequesters(options: {
  opportunityId: string | null;
  limit?: number;
  enabled?: boolean;
}): UseOpenPlanRequestersResult {
  const opportunityId = options.opportunityId?.trim() || null;
  const limit = options.limit ?? 20;
  const enabled = options.enabled === true && Boolean(opportunityId);
  const [requests, setRequests] = useState<OpenPlanRequester[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const opportunityIdRef = useRef(opportunityId);
  opportunityIdRef.current = opportunityId;
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const requestsRef = useRef(requests);
  requestsRef.current = requests;
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
    const oppId = opportunityIdRef.current;
    if (uid === undefined || !oppId) return;
    if (!uid) {
      setRequests([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    if (inflightRef.current) return inflightRef.current;

    const run = (async () => {
      const usable = requestsRef.current.length > 0 || hasLoadedRef.current;
      if (usable) {
        setIsValidating(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await listOpenPlanRequesters({
          opportunityId: oppId,
          limit: limitRef.current,
          cursor: null,
          force,
        });
        setRequests(uniqueByRequestId(page.requests));
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
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

  const removeRequest = useCallback((requestId: string) => {
    if (!requestId) return;
    setRequests((prev) => {
      const next = prev.filter((row) => row.request_id !== requestId);
      if (next.length === prev.length) return prev;
      requestsRef.current = next;
      return next;
    });
    const uid = userIdRef.current;
    const oppId = opportunityIdRef.current;
    if (uid && oppId) {
      removeFromCachedOpenPlanRequesters(uid, oppId, requestId);
    }
  }, []);

  useEffect(() => {
    setRequests([]);
    setHasMore(false);
    setNextCursor(null);
    setHasLoaded(false);
    hasLoadedRef.current = false;
    setError(null);
  }, [opportunityId]);

  useEffect(() => {
    if (!enabled || !opportunityId) {
      setLoading(false);
      return;
    }
    if (userId === undefined) return;
    if (!userId) {
      setRequests([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      return;
    }

    const cached = getCachedOpenPlanRequesters(userId, opportunityId);
    if (cached) {
      setRequests(uniqueByRequestId(cached.requests));
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      if (!isOpenPlanRequestersSoftStale(userId, opportunityId)) return;
    }
    void revalidate(true);
  }, [enabled, userId, opportunityId, revalidate]);

  useEffect(() => {
    if (!enabled || !opportunityId) return;
    return subscribeOpenPlanRequestersCache(() => {
      const uid = userIdRef.current;
      const oppId = opportunityIdRef.current;
      if (!uid || !oppId) return;
      const cached = getCachedOpenPlanRequesters(uid, oppId);
      if (cached) {
        setRequests(uniqueByRequestId(cached.requests));
        setHasMore(cached.has_more);
        setNextCursor(cached.next_cursor);
        setHasLoaded(true);
        hasLoadedRef.current = true;
      }
      if (isOpenPlanRequestersSoftStale(uid, oppId)) void revalidate(true);
    });
  }, [enabled, opportunityId, revalidate]);

  const loadMore = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    const oppId = opportunityIdRef.current;
    const cursor = nextCursorRef.current;
    if (!uid || !oppId || !cursor || inflightRef.current) return;

    const run = (async () => {
      setIsValidating(true);
      try {
        const page = await listOpenPlanRequesters({
          opportunityId: oppId,
          limit: limitRef.current,
          cursor,
          force: true,
        });
        setRequests((prev) => appendPage(prev, page.requests));
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        setError(null);
      } catch (err) {
        setError(toError(err));
      } finally {
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

  return {
    requests,
    hasMore,
    loading,
    isValidating,
    error,
    hasLoaded,
    refresh,
    loadMore,
    removeRequest,
  };
}
