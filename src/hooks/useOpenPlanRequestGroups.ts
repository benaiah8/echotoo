import { useCallback, useEffect, useRef, useState } from "react";
import { listMyOpenPlanRequestGroups } from "../api/services/openPlans";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedOpenPlanRequestGroups,
  isOpenPlanRequestGroupsSoftStale,
  subscribeOpenPlanRequestGroupsCache,
} from "../lib/openPlanRequestGroupsCache";
import type { OpenPlanRequestGroup } from "../lib/people/types";

export type UseOpenPlanRequestGroupsResult = {
  groups: OpenPlanRequestGroup[];
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

function uniqueByOpportunityId(
  rows: OpenPlanRequestGroup[]
): OpenPlanRequestGroup[] {
  const seen = new Set<string>();
  const out: OpenPlanRequestGroup[] = [];
  for (const row of rows) {
    if (seen.has(row.opportunity_id)) continue;
    seen.add(row.opportunity_id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: OpenPlanRequestGroup[],
  incoming: OpenPlanRequestGroup[]
): OpenPlanRequestGroup[] {
  const seen = new Set(prev.map((row) => row.opportunity_id));
  const added = incoming.filter((row) => !seen.has(row.opportunity_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Host Open Plan request summaries — one row per opportunity_id.
 * Lazy via enabled flag. Dedupes by opportunity_id only.
 */
export function useOpenPlanRequestGroups(options?: {
  limit?: number;
  enabled?: boolean;
}): UseOpenPlanRequestGroupsResult {
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled === true;
  const [groups, setGroups] = useState<OpenPlanRequestGroup[]>([]);
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
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
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
      setGroups([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    if (inflightRef.current) return inflightRef.current;

    const run = (async () => {
      const usable = groupsRef.current.length > 0 || hasLoadedRef.current;
      if (usable) {
        setIsValidating(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await listMyOpenPlanRequestGroups({
          limit: limitRef.current,
          cursor: null,
          force,
        });
        setGroups(uniqueByOpportunityId(page.groups));
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

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (userId === undefined) return;
    if (!userId) {
      setGroups([]);
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      return;
    }

    const cached = getCachedOpenPlanRequestGroups(userId);
    if (cached) {
      setGroups(uniqueByOpportunityId(cached.groups));
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      if (!isOpenPlanRequestGroupsSoftStale(userId)) return;
    }
    // Soft-stale must force network; force:false returns TTL cache and never refreshes.
    void revalidate(true);
  }, [enabled, userId, revalidate]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeOpenPlanRequestGroupsCache(() => {
      const uid = userIdRef.current;
      if (!uid) return;
      const cached = getCachedOpenPlanRequestGroups(uid);
      if (cached) {
        setGroups(uniqueByOpportunityId(cached.groups));
        setHasMore(cached.has_more);
        setNextCursor(cached.next_cursor);
        setHasLoaded(true);
        hasLoadedRef.current = true;
      }
      if (isOpenPlanRequestGroupsSoftStale(uid)) void revalidate(true);
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
        const page = await listMyOpenPlanRequestGroups({
          limit: limitRef.current,
          cursor,
          force: true,
        });
        setGroups((prev) => appendPage(prev, page.groups));
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
    groups,
    hasMore,
    loading,
    isValidating,
    error,
    hasLoaded,
    refresh,
    loadMore,
  };
}
