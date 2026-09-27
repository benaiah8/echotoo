import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { listProfileSocialOpportunities } from "../api/services/profileSocialOpportunities";
import type { ProfileSocialOpportunitiesPage } from "../lib/people/types";
import {
  getCachedProfileSocialOpportunities,
  isCachedProfileSocialOpportunitiesSoftStale,
  subscribeProfileSocialOpportunityCache,
} from "../lib/profileSocialOpportunityCache";
import { getViewerAuthUserId } from "../api/services/follows";

/**
 * Profile social-opportunity list.
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
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<ProfileSocialOpportunitiesPage>({
    opportunities: [],
  });

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

  const load = useCallback(
    async (force = false) => {
      if (!enabled || !profileUserId) {
        setPage({ opportunities: [] });
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

      setLoading(!cached);
      setError(null);
      try {
        const next = await listProfileSocialOpportunities({
          profileUserId,
          force,
        });
        setPage(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load");
        if (!cached) setPage({ opportunities: [] });
      } finally {
        setLoading(false);
      }
    },
    [enabled, profileUserId, viewerUserId, cached]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return {
    opportunities: page.opportunities,
    loading,
    error,
    reload: () => load(true),
    viewerUserId,
  };
}
