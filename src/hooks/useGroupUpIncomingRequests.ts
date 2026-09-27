import { useCallback, useEffect, useRef, useState } from "react";
import { listMyGroupUpRequests } from "../api/services/groupUp";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedGroupUpIncoming,
  isGroupUpIncomingSoftStale,
  removeFromCachedGroupUpIncoming,
  subscribeGroupUpIncomingCache,
} from "../lib/groupUpIncomingCache";
import type { GroupUpIncomingRequest } from "../lib/people/types";

export type UseGroupUpIncomingRequestsResult = {
  requests: GroupUpIncomingRequest[];
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  removeRequest: (requestId: string) => void;
};

function uniqueByRequestId(
  rows: GroupUpIncomingRequest[]
): GroupUpIncomingRequest[] {
  const seen = new Set<string>();
  const out: GroupUpIncomingRequest[] = [];
  for (const row of rows) {
    if (seen.has(row.request_id)) continue;
    seen.add(row.request_id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: GroupUpIncomingRequest[],
  incoming: GroupUpIncomingRequest[]
): GroupUpIncomingRequest[] {
  const seen = new Set(prev.map((row) => row.request_id));
  const added = incoming.filter((row) => !seen.has(row.request_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Host Group Up pending-request inbox. Lazy-mount via enabled flag.
 */
export function useGroupUpIncomingRequests(options?: {
  limit?: number;
  enabled?: boolean;
}): UseGroupUpIncomingRequestsResult {
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled === true;
  const [requests, setRequests] = useState<GroupUpIncomingRequest[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
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
      const usable = requestsRef.current.length > 0 || hasLoadedRef.current;
      if (usable) {
        setIsValidating(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await listMyGroupUpRequests({
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
    if (uid) removeFromCachedGroupUpIncoming(uid, requestId);
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
      return;
    }

    const cached = getCachedGroupUpIncoming(userId);
    if (cached) {
      setRequests(uniqueByRequestId(cached.requests));
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      if (!isGroupUpIncomingSoftStale(userId)) return;
    }
    void revalidate(false);
  }, [enabled, userId, revalidate]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeGroupUpIncomingCache(() => {
      const uid = userIdRef.current;
      if (!uid) return;
      if (isGroupUpIncomingSoftStale(uid)) void revalidate(false);
    });
  }, [enabled, revalidate]);

  const loadMore = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    const cursor = nextCursorRef.current;
    if (!uid || !cursor || inflightRef.current) return;

    const run = (async () => {
      setIsValidating(true);
      try {
        const page = await listMyGroupUpRequests({
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
