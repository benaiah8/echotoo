import { useCallback, useEffect, useRef, useState } from "react";
import { listMyGroupUpRequestGroups } from "../api/services/groupUp";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedGroupUpRequestGroups,
  isGroupUpRequestGroupsSoftStale,
  subscribeGroupUpRequestGroupsCache,
} from "../lib/groupUpRequestGroupsCache";
import type { GroupUpRequestGroup } from "../lib/people/types";

export type UseGroupUpRequestGroupsResult = {
  groups: GroupUpRequestGroup[];
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

function uniqueByConversationId(
  rows: GroupUpRequestGroup[]
): GroupUpRequestGroup[] {
  const seen = new Set<string>();
  const out: GroupUpRequestGroup[] = [];
  for (const row of rows) {
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: GroupUpRequestGroup[],
  incoming: GroupUpRequestGroup[]
): GroupUpRequestGroup[] {
  const seen = new Set(prev.map((row) => row.conversation_id));
  const added = incoming.filter((row) => !seen.has(row.conversation_id));
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/**
 * Host Group Up request group summaries. Lazy via enabled flag.
 */
export function useGroupUpRequestGroups(options?: {
  limit?: number;
  enabled?: boolean;
}): UseGroupUpRequestGroupsResult {
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled === true;
  const [groups, setGroups] = useState<GroupUpRequestGroup[]>([]);
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
        const page = await listMyGroupUpRequestGroups({
          limit: limitRef.current,
          cursor: null,
          force,
        });
        setGroups(uniqueByConversationId(page.groups));
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

    const cached = getCachedGroupUpRequestGroups(userId);
    if (cached) {
      setGroups(uniqueByConversationId(cached.groups));
      setHasMore(cached.has_more);
      setNextCursor(cached.next_cursor);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      if (!isGroupUpRequestGroupsSoftStale(userId)) return;
    }
    // Soft-stale must force network; force:false returns TTL cache and never refreshes.
    void revalidate(true);
  }, [enabled, userId, revalidate]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeGroupUpRequestGroupsCache(() => {
      const uid = userIdRef.current;
      if (!uid) return;
      const cached = getCachedGroupUpRequestGroups(uid);
      if (cached) {
        setGroups(uniqueByConversationId(cached.groups));
        setHasMore(cached.has_more);
        setNextCursor(cached.next_cursor);
        setHasLoaded(true);
        hasLoadedRef.current = true;
      }
      // Soft-stale refresh only when warranted; mark-seen patches bump ts so they
      // do not immediately race a stale in-flight overwrite.
      if (isGroupUpRequestGroupsSoftStale(uid)) void revalidate(true);
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
        const page = await listMyGroupUpRequestGroups({
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
