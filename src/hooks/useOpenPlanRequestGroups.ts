import { useCallback, useEffect, useRef, useState } from "react";
import { listMyOpenPlanRequestGroups } from "../api/services/openPlans";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedOpenPlanRequestGroups,
  isOpenPlanRequestGroupsSoftStale,
  subscribeOpenPlanRequestGroupsCache,
} from "../lib/openPlanRequestGroupsCache";
import { acceptOpenPlanSnapshot } from "../lib/openPlanRequestSeen";
import type { OpenPlanFetchStatus } from "../lib/openPlanRequestSeen";
import type { OpenPlanRequestGroup } from "../lib/people/types";

export type UseOpenPlanRequestGroupsResult = {
  groups: OpenPlanRequestGroup[];
  /** User id that owns the current successful snapshot. Null until then. */
  ownerUserId: string | null;
  fetchStatus: OpenPlanFetchStatus;
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
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<OpenPlanFetchStatus>("idle");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const ownerUserIdRef = useRef(ownerUserId);
  ownerUserIdRef.current = ownerUserId;
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
      setOwnerUserId(null);
      setFetchStatus("idle");
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    if (inflightRef.current) return inflightRef.current;

    const requestUserId = uid;
    const run = (async () => {
      const usable =
        ownerUserIdRef.current === requestUserId &&
        (groupsRef.current.length > 0 || hasLoadedRef.current);
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
        const accepted = acceptOpenPlanSnapshot({
          requestUserId,
          currentUserId: userIdRef.current ?? null,
          status: "success",
          groups: uniqueByOpportunityId(page.groups),
        });
        if (!accepted) return;
        setGroups(accepted.groups);
        setOwnerUserId(accepted.userId);
        setFetchStatus("success");
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
      } catch (err) {
        if ((userIdRef.current ?? null) !== requestUserId) return;
        setError(toError(err));
        if (ownerUserIdRef.current !== requestUserId) {
          setFetchStatus("error");
          setOwnerUserId(null);
        }
        if (!hasLoadedRef.current) {
          setHasLoaded(true);
          hasLoadedRef.current = true;
        }
      } finally {
        if ((userIdRef.current ?? null) === requestUserId) {
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
      setOwnerUserId(null);
      setFetchStatus("idle");
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      hasLoadedRef.current = false;
      return;
    }

    inflightRef.current = null;
    const cached = getCachedOpenPlanRequestGroups(userId);
    if (cached) {
      const accepted = acceptOpenPlanSnapshot({
        requestUserId: userId,
        currentUserId: userId,
        status: "success",
        groups: uniqueByOpportunityId(cached.groups),
      });
      if (accepted) {
        setGroups(accepted.groups);
        setOwnerUserId(accepted.userId);
        setFetchStatus("success");
        setHasMore(cached.has_more);
        setNextCursor(cached.next_cursor);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
        if (!isOpenPlanRequestGroupsSoftStale(userId)) return;
      }
    } else {
      setGroups([]);
      setOwnerUserId(null);
      setFetchStatus("idle");
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      hasLoadedRef.current = false;
      setError(null);
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
        const accepted = acceptOpenPlanSnapshot({
          requestUserId: uid,
          currentUserId: uid,
          status: "success",
          groups: uniqueByOpportunityId(cached.groups),
        });
        if (!accepted) return;
        setGroups(accepted.groups);
        setOwnerUserId(accepted.userId);
        setFetchStatus("success");
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
        const accepted = acceptOpenPlanSnapshot({
          requestUserId: uid,
          currentUserId: userIdRef.current ?? null,
          status: "success",
          groups: page.groups,
        });
        if (!accepted) return;
        setGroups((prev) => appendPage(prev, accepted.groups));
        setOwnerUserId(accepted.userId);
        setFetchStatus("success");
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        setError(null);
      } catch (err) {
        if ((userIdRef.current ?? null) !== uid) return;
        setError(toError(err));
      } finally {
        if ((userIdRef.current ?? null) === uid) setIsValidating(false);
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
    ownerUserId,
    fetchStatus,
    hasMore,
    loading,
    isValidating,
    error,
    hasLoaded,
    refresh,
    loadMore,
  };
}
