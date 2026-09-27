import { useCallback, useEffect, useRef, useState } from "react";
import { listMyOpenPlanRequests } from "../api/services/openPlans";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedOpenPlanIncoming,
  isOpenPlanIncomingSoftStale,
  removeFromCachedOpenPlanIncoming,
  subscribeOpenPlanCache,
} from "../lib/openPlanCache";
import type { OpenPlanIncomingRequest } from "../lib/people/types";

export type UseOpenPlanIncomingRequestsResult = {
  requests: OpenPlanIncomingRequest[];
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Authoritative local drop; also patches first-page cache silently. */
  removeRequest: (requestId: string) => void;
};

function uniqueByRequestId(
  rows: OpenPlanIncomingRequest[]
): OpenPlanIncomingRequest[] {
  const seen = new Set<string>();
  const out: OpenPlanIncomingRequest[] = [];
  for (const row of rows) {
    if (seen.has(row.request_id)) continue;
    seen.add(row.request_id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: OpenPlanIncomingRequest[],
  incoming: OpenPlanIncomingRequest[]
): OpenPlanIncomingRequest[] {
  const seen = new Set(prev.map((row) => row.request_id));
  const added = incoming.filter((row) => !seen.has(row.request_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Creator Open Plan pending-request inbox. Defaults to `enabled: false` so
 * Messages can lazy-mount on first Requests open without network traffic.
 */
export function useOpenPlanIncomingRequests(options?: {
  limit?: number;
  enabled?: boolean;
}): UseOpenPlanIncomingRequestsResult {
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled === true;
  const [requests, setRequests] = useState<OpenPlanIncomingRequest[]>([]);
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
    if (uid === undefined) return;
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
      const usable =
        requestsRef.current.length > 0 || hasLoadedRef.current;
      if (usable) {
        setIsValidating(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await listMyOpenPlanRequests({
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
    if (uid) removeFromCachedOpenPlanIncoming(uid, requestId);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (userId === undefined) return;
    if (!userId) {
      setRequests([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      hasLoadedRef.current = false;
      requestsRef.current = [];
      nextCursorRef.current = null;
      return;
    }

    const cached = getCachedOpenPlanIncoming(userId);
    if (cached && requestsRef.current.length === 0) {
      requestsRef.current = cached.requests;
      hasLoadedRef.current = true;
      nextCursorRef.current = cached.next_cursor ?? null;
      setRequests(cached.requests);
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor ?? null);
      setLoading(false);
      setHasLoaded(true);
    } else if (!cached && !hasLoadedRef.current) {
      setLoading(true);
    }

    if (!cached) {
      void revalidate(false);
      return;
    }
    if (isOpenPlanIncomingSoftStale(userId)) {
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
    try {
      const page = await listMyOpenPlanRequests({
        limit: limitRef.current,
        cursor: nextCursorRef.current,
      });
      setRequests((prev) => appendPage(prev, page.requests));
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor ?? null);
    } catch (err) {
      setError(toError(err));
      throw err;
    }
  }, [hasMore]);

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
