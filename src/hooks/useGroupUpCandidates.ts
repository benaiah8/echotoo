import { useCallback, useEffect, useRef, useState } from "react";
import {
  listGroupUpCandidates,
  listMyGroupUpMemberships,
} from "../api/services/groupUp";
import { supabase } from "../lib/supabaseClient";
import {
  getCachedGroupUpDeck,
  isGroupUpDeckSoftStale,
  patchCachedGroupUpDeckViewerState,
  removeCachedGroupUpDeckCandidate,
  writeCachedGroupUpDeckSilent,
} from "../lib/groupUpCandidateCache";
import { mergeGroupUpBrowseAndMemberships } from "../lib/groupUpBrowse";
import { groupUpDeckRowId } from "../lib/groupUpDeckRowId";
import {
  collectGroupUpSourcePostIds,
  ensureGroupUpPublishedMediaMap,
  readFreshGroupUpPublishedMediaMap,
} from "../lib/groupUpPublishedMedia";
import type {
  GroupUpCandidate,
  GroupUpViewerState,
} from "../lib/people/types";
import type { PublishedMediaItem } from "../lib/publishedMedia";
import { peopleDebugRecord } from "../lib/people/peopleDeckDebug";

export type UseGroupUpCandidatesResult = {
  candidates: GroupUpCandidate[];
  /**
   * Viewer-scoped published media for candidate `source_post_id`s.
   * Sourced from the shared Feed/Profile/Detail publishedMediaCache
   * (cache-first + one batch miss fetch). Authoritative empty = [].
   */
  publishedMediaByPostId: Readonly<Record<string, PublishedMediaItem[]>>;
  hasMore: boolean;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  hasLoaded: boolean;
  refresh: () => Promise<void>;
  /** Manual hard refresh — replace browse page 0; invalidates in-flight loadMore. */
  hardRefresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  patchViewerState: (
    opportunityId: string,
    patch: { viewer_state: GroupUpViewerState; request_id: string | null }
  ) => void;
  removeCandidate: (opportunityId: string) => void;
};

type ViewerSnap = {
  viewer_state: GroupUpViewerState;
  request_id: string | null;
};

function uniqueByDeckRowId(rows: GroupUpCandidate[]): GroupUpCandidate[] {
  const seen = new Set<string>();
  const out: GroupUpCandidate[] = [];
  for (const row of rows) {
    const id = groupUpDeckRowId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function appendPage(
  prev: GroupUpCandidate[],
  incoming: GroupUpCandidate[]
): GroupUpCandidate[] {
  const seen = new Set(prev.map((row) => groupUpDeckRowId(row)));
  const added = incoming.filter((row) => {
    const id = groupUpDeckRowId(row);
    return Boolean(id) && !seen.has(id);
  });
  return added.length === 0 ? prev : [...prev, ...added];
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function viewerSnapMap(rows: GroupUpCandidate[]): Map<string, ViewerSnap> {
  return new Map(
    rows
      .map((row) => {
        const id = groupUpDeckRowId(row);
        if (!id) return null;
        return [
          id,
          { viewer_state: row.viewer_state, request_id: row.request_id },
        ] as const;
      })
      .filter((entry): entry is readonly [string, ViewerSnap] => entry != null)
  );
}

/** Keep in-flight local viewer_state patches when a stale list response arrives. */
function mergeDeckViewerState(
  serverRows: GroupUpCandidate[],
  beforeSnap: Map<string, ViewerSnap>,
  afterSnap: Map<string, ViewerSnap>
): GroupUpCandidate[] {
  return serverRows.map((row) => {
    const id = groupUpDeckRowId(row);
    const before = beforeSnap.get(id);
    const after = afterSnap.get(id);
    if (
      before &&
      after &&
      (after.viewer_state !== before.viewer_state ||
        after.request_id !== before.request_id)
    ) {
      return {
        ...row,
        viewer_state: after.viewer_state,
        request_id: after.request_id,
      };
    }
    return row;
  });
}

/**
 * Group Up browse deck. Defaults to `enabled: false` until People first
 * opens mode=groups (lazy mount).
 */
export function useGroupUpCandidates(options?: {
  limit?: number;
  enabled?: boolean;
}): UseGroupUpCandidatesResult {
  const limit = options?.limit ?? 20;
  const enabled = options?.enabled === true;
  const [candidates, setCandidates] = useState<GroupUpCandidate[]>([]);
  const [publishedMediaByPostId, setPublishedMediaByPostId] = useState<
    Record<string, PublishedMediaItem[]>
  >({});
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
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;
  const nextCursorRef = useRef(nextCursor);
  nextCursorRef.current = nextCursor;
  const inflightRef = useRef<Promise<void> | null>(null);
  const listGenerationRef = useRef(0);
  const mediaEnrichGenRef = useRef(0);

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
      setPublishedMediaByPostId({});
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    if (inflightRef.current) return inflightRef.current;

    const genAtStart = listGenerationRef.current;
    const run = (async () => {
      const beforeSnap = viewerSnapMap(candidatesRef.current);
      const usable =
        candidatesRef.current.length > 0 || hasLoadedRef.current;
      peopleDebugRecord("fetch:start", {
        hook: "groupUp",
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
        const [page, membershipsPage] = await Promise.all([
          listGroupUpCandidates({
            limit: limitRef.current,
            cursor: null,
            force,
            writeCache: false,
          }),
          listMyGroupUpMemberships({
            limit: 50,
            cursor: null,
            force,
          }),
        ]);
        const afterSnap = viewerSnapMap(candidatesRef.current);
        if (genAtStart !== listGenerationRef.current) return;
        const browseMerged = uniqueByDeckRowId(
          mergeDeckViewerState(page.candidates, beforeSnap, afterSnap)
        );
        const mergedCandidates = mergeGroupUpBrowseAndMemberships(
          browseMerged,
          membershipsPage.memberships
        );
        const mergedPage = {
          ...page,
          candidates: mergedCandidates,
        };
        writeCachedGroupUpDeckSilent(uid, mergedPage);
        setCandidates(mergedCandidates);
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor ?? null);
        setHasLoaded(true);
        hasLoadedRef.current = true;
        setError(null);
        peopleDebugRecord("fetch:complete", {
          hook: "groupUp",
          count: mergedCandidates.length,
          hasMore: page.has_more,
          hasCursor: Boolean(page.next_cursor),
          memberships: membershipsPage.memberships.length,
        });
      } catch (err) {
        if (genAtStart !== listGenerationRef.current) return;
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

  const hardRefresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (uid === undefined) return;
    if (!uid) {
      setCandidates([]);
      setPublishedMediaByPostId({});
      setHasMore(false);
      setNextCursor(null);
      setHasLoaded(false);
      setLoading(false);
      setIsValidating(false);
      return;
    }
    const gen = ++listGenerationRef.current;
    const beforeSnap = viewerSnapMap(candidatesRef.current);
    const usable =
      candidatesRef.current.length > 0 || hasLoadedRef.current;
    if (usable) setIsValidating(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const [page, membershipsPage] = await Promise.all([
        listGroupUpCandidates({
          limit: limitRef.current,
          cursor: null,
          force: true,
          writeCache: false,
        }),
        listMyGroupUpMemberships({
          limit: 50,
          cursor: null,
          force: true,
        }),
      ]);
      if (gen !== listGenerationRef.current) return;
      const afterSnap = viewerSnapMap(candidatesRef.current);
      const browseMerged = uniqueByDeckRowId(
        mergeDeckViewerState(page.candidates, beforeSnap, afterSnap)
      );
      const mergedCandidates = mergeGroupUpBrowseAndMemberships(
        browseMerged,
        membershipsPage.memberships
      );
      writeCachedGroupUpDeckSilent(uid, {
        ...page,
        candidates: mergedCandidates,
      });
      setCandidates(mergedCandidates);
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor ?? null);
      setHasLoaded(true);
      hasLoadedRef.current = true;
      setError(null);
    } catch (err) {
      if (gen !== listGenerationRef.current) return;
      setError(toError(err));
      throw err;
    } finally {
      if (gen === listGenerationRef.current) {
        setLoading(false);
        setIsValidating(false);
      }
    }
  }, []);

  const patchViewerState = useCallback(
    (
      opportunityId: string,
      patch: { viewer_state: GroupUpViewerState; request_id: string | null }
    ) => {
      if (!opportunityId) return;
      const uid = userIdRef.current;
      if (uid) {
        patchCachedGroupUpDeckViewerState(uid, opportunityId, patch);
      }
      setCandidates((prev) => {
        let changed = false;
        const next = prev.map((row) => {
          if (row.opportunity_id !== opportunityId) return row;
          if (
            row.viewer_state === patch.viewer_state &&
            row.request_id === patch.request_id
          ) {
            return row;
          }
          changed = true;
          return {
            ...row,
            viewer_state: patch.viewer_state,
            request_id: patch.request_id,
          };
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
    const uid = userIdRef.current;
    if (uid) removeCachedGroupUpDeckCandidate(uid, opportunityId);
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
      setPublishedMediaByPostId({});
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

    const cached = getCachedGroupUpDeck(userId);
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
        hook: "groupUp",
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
    if (isGroupUpDeckSoftStale(userId)) {
      void revalidate(true);
    }
  }, [enabled, userId, revalidate]);

  const loadMore = useCallback(async () => {
    if (!enabledRef.current) return;
    const uid = userIdRef.current;
    if (!uid || !nextCursorRef.current) return;
    if (!hasMore) return;
    const gen = listGenerationRef.current;
    setError(null);
    peopleDebugRecord("loadMore:start", {
      hook: "groupUp",
      prevCount: candidatesRef.current.length,
      hasCursor: true,
    });
    try {
      const page = await listGroupUpCandidates({
        limit: limitRef.current,
        cursor: nextCursorRef.current,
        writeCache: false,
      });
      const membershipsPage = await listMyGroupUpMemberships({
        limit: 50,
        cursor: null,
        force: false,
      });
      if (gen !== listGenerationRef.current) return;
      setCandidates((prev) =>
        mergeGroupUpBrowseAndMemberships(
          appendPage(prev, page.candidates),
          membershipsPage.memberships
        )
      );
      setHasMore(page.has_more);
      setNextCursor(page.next_cursor ?? null);
      peopleDebugRecord("loadMore:complete", {
        hook: "groupUp",
        added: page.candidates.length,
        hasMore: page.has_more,
      });
    } catch (err) {
      if (gen !== listGenerationRef.current) return;
      setError(toError(err));
      throw err;
    }
  }, [hasMore]);

  // Cache-first source-post media for the current candidate page (no per-card fetch).
  useEffect(() => {
    if (!enabled) return;
    if (userId === undefined) return;
    if (!userId) {
      setPublishedMediaByPostId({});
      return;
    }

    const postIds = collectGroupUpSourcePostIds(candidates);
    if (postIds.length === 0) {
      setPublishedMediaByPostId({});
      return;
    }

    const fresh = readFreshGroupUpPublishedMediaMap({
      postIds,
      viewerUserId: userId,
    });
    if (Object.keys(fresh).length > 0) {
      setPublishedMediaByPostId((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of postIds) {
          if (Object.prototype.hasOwnProperty.call(fresh, id)) {
            if (next[id] !== fresh[id]) {
              next[id] = fresh[id]!;
              changed = true;
            }
          }
        }
        // Drop ids no longer in the page.
        for (const key of Object.keys(next)) {
          if (!postIds.includes(key)) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    const allFresh = postIds.every((id) =>
      Object.prototype.hasOwnProperty.call(fresh, id),
    );
    if (allFresh) return;

    const gen = ++mediaEnrichGenRef.current;
    const uid = userId;
    void ensureGroupUpPublishedMediaMap({
      postIds,
      viewerUserId: uid,
    })
      .then(({ byPostId }) => {
        if (mediaEnrichGenRef.current !== gen) return;
        if (userIdRef.current !== uid) return;
        setPublishedMediaByPostId(byPostId);
      })
      .catch(() => {
        if (mediaEnrichGenRef.current !== gen) return;
        // Keep sync fresh hits; do not clear on soft failure.
      });
  }, [enabled, userId, candidates]);

  return {
    candidates,
    publishedMediaByPostId,
    hasMore,
    loading,
    isValidating,
    error,
    hasLoaded,
    refresh,
    hardRefresh,
    loadMore,
    patchViewerState,
    removeCandidate,
  };
}
