import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  listProfileSocialOpportunities,
  mergeProfileSocialOpportunitiesBySourcePostId,
  PROFILE_SOCIAL_OPPORTUNITY_PAGE_SIZE,
} from "../api/services/profileSocialOpportunities";
import type { ProfileSocialOpportunitiesPage } from "../lib/people/types";
import {
  getCachedProfileSocialOpportunities,
  isCachedProfileSocialOpportunitiesSoftStale,
  setCachedProfileSocialOpportunities,
  subscribeProfileSocialOpportunityCache,
} from "../lib/profileSocialOpportunityCache";
import { getViewerAuthUserId } from "../api/services/follows";

const EMPTY_PAGE: ProfileSocialOpportunitiesPage = {
  opportunities: [],
  has_more: false,
  next_cursor: null,
};

/**
 * Profile social-opportunity list with keyset pagination.
 * Refreshes from: initial/cache load, hard TTL revisit, local mutation patches,
 * and narrow per-owner invalidation — not generic profile:updated events.
 */
export function useProfileSocialOpportunities(input: {
  profileUserId: string | null | undefined;
  enabled: boolean;
}) {
  const profileUserId = input.profileUserId?.trim() || null;
  const enabled = input.enabled && !!profileUserId;

  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<ProfileSocialOpportunitiesPage>(EMPTY_PAGE);

  const loadMoreInFlightRef = useRef(false);
  const requestGenRef = useRef(0);
  const profileUserIdRef = useRef(profileUserId);
  profileUserIdRef.current = profileUserId;
  const viewerUserIdRef = useRef(viewerUserId);
  viewerUserIdRef.current = viewerUserId;
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    let cancelled = false;
    void getViewerAuthUserId().then((uid) => {
      if (!cancelled) setViewerUserId(uid);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cached = useSyncExternalStore(
    subscribeProfileSocialOpportunityCache,
    () => {
      if (!viewerUserId || !profileUserId) return null;
      return getCachedProfileSocialOpportunities(viewerUserId, profileUserId);
    }
  );

  useEffect(() => {
    if (cached) setPage(cached);
  }, [cached]);

  // Reset accumulation when the profile subject changes.
  useEffect(() => {
    requestGenRef.current += 1;
    loadMoreInFlightRef.current = false;
    setLoadingMore(false);
    setError(null);
    setPage(EMPTY_PAGE);
  }, [profileUserId]);

  const load = useCallback(
    async (force = false) => {
      if (!enabled || !profileUserId) {
        setPage(EMPTY_PAGE);
        setLoading(false);
        return;
      }

      // Wait for viewer auth id — do not treat as a resolved empty rail.
      if (!viewerUserId) {
        setLoading(true);
        return;
      }

      if (
        !force &&
        cached &&
        !isCachedProfileSocialOpportunitiesSoftStale(viewerUserId, profileUserId)
      ) {
        setPage(cached);
        setLoading(false);
        return;
      }

      const gen = ++requestGenRef.current;
      setLoading(!cached);
      setError(null);
      try {
        const next = await listProfileSocialOpportunities({
          profileUserId,
          force,
          cursor: null,
          limit: PROFILE_SOCIAL_OPPORTUNITY_PAGE_SIZE,
          bypassCache: force,
        });
        if (gen !== requestGenRef.current) return;
        if (profileUserIdRef.current !== profileUserId) return;
        if (viewerUserIdRef.current !== viewerUserId) return;
        setPage(next);
        setCachedProfileSocialOpportunities(viewerUserId, profileUserId, next);
      } catch (err) {
        if (gen !== requestGenRef.current) return;
        setError(err instanceof Error ? err.message : "Couldn't load");
        if (!cached) setPage(EMPTY_PAGE);
      } finally {
        if (gen === requestGenRef.current) setLoading(false);
      }
    },
    [enabled, profileUserId, viewerUserId, cached]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!enabled || !profileUserId || !viewerUserId) return;
    const snap = pageRef.current;
    if (snap.has_more !== true || !snap.next_cursor) return;
    if (loadMoreInFlightRef.current) return;

    loadMoreInFlightRef.current = true;
    const gen = requestGenRef.current;
    const cursor = snap.next_cursor;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await listProfileSocialOpportunities({
        profileUserId,
        cursor,
        limit: PROFILE_SOCIAL_OPPORTUNITY_PAGE_SIZE,
        bypassCache: true,
      });
      if (gen !== requestGenRef.current) return;
      if (profileUserIdRef.current !== profileUserId) return;
      if (viewerUserIdRef.current !== viewerUserId) return;

      const merged = mergeProfileSocialOpportunitiesBySourcePostId(
        pageRef.current.opportunities,
        next.opportunities
      );
      const accumulated: ProfileSocialOpportunitiesPage = {
        opportunities: merged,
        has_more: next.has_more,
        next_cursor: next.next_cursor,
      };
      setPage(accumulated);
      setCachedProfileSocialOpportunities(
        viewerUserId,
        profileUserId,
        accumulated
      );
    } catch (err) {
      if (gen !== requestGenRef.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load");
    } finally {
      loadMoreInFlightRef.current = false;
      if (gen === requestGenRef.current) setLoadingMore(false);
    }
  }, [enabled, profileUserId, viewerUserId]);

  return {
    opportunities: page.opportunities,
    hasMore: page.has_more === true,
    nextCursor: page.next_cursor ?? null,
    loading,
    loadingMore,
    error,
    reload: () => load(true),
    loadMore,
    viewerUserId,
  };
}
