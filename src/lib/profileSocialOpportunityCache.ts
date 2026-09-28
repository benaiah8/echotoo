/**
 * In-memory cache for list_profile_social_opportunities.
 * Narrow invalidation only — no feed refetch.
 * Patches target Duo or Group sub-payload by opportunity_id.
 */

import type { ProfileSocialOpportunitiesPage } from "./people/types";

const TTL_MS = 60_000;
const SOFT_STALE_MS = 20_000;

type Entry = { ts: number; value: ProfileSocialOpportunitiesPage };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

export function profileSocialOpportunityCacheKey(
  viewerUserId: string,
  profileUserId: string
): string {
  return `profile_social_opps:${viewerUserId}:${profileUserId}`;
}

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeProfileSocialOpportunityCache(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedProfileSocialOpportunities(
  viewerUserId: string,
  profileUserId: string
): ProfileSocialOpportunitiesPage | null {
  const entry = cache.get(
    profileSocialOpportunityCacheKey(viewerUserId, profileUserId)
  );
  if (!entry) return null;
  if (Date.now() - entry.ts >= TTL_MS) {
    cache.delete(profileSocialOpportunityCacheKey(viewerUserId, profileUserId));
    return null;
  }
  return entry.value;
}

export function isCachedProfileSocialOpportunitiesSoftStale(
  viewerUserId: string,
  profileUserId: string
): boolean {
  const entry = cache.get(
    profileSocialOpportunityCacheKey(viewerUserId, profileUserId)
  );
  if (!entry) return true;
  return Date.now() - entry.ts >= SOFT_STALE_MS;
}

export function setCachedProfileSocialOpportunities(
  viewerUserId: string,
  profileUserId: string,
  value: ProfileSocialOpportunitiesPage
): void {
  cache.set(profileSocialOpportunityCacheKey(viewerUserId, profileUserId), {
    ts: Date.now(),
    value,
  });
  emit();
}

export function patchCachedProfileSocialOpportunity(
  viewerUserId: string,
  profileUserId: string,
  opportunityId: string,
  patch: Partial<{
    viewer_duo_joined: boolean;
    viewer_profile_connected: boolean;
    viewer_group_state: "none" | "pending" | "member" | null;
    request_id: string | null;
  }>
): void {
  const key = profileSocialOpportunityCacheKey(viewerUserId, profileUserId);
  const entry = cache.get(key);
  if (!entry) return;
  const next = {
    ...entry.value,
    opportunities: entry.value.opportunities.map((row) => {
      if (row.duo?.opportunity_id === opportunityId) {
        return {
          ...row,
          duo: {
            ...row.duo,
            ...(patch.viewer_duo_joined !== undefined
              ? { viewer_duo_joined: patch.viewer_duo_joined }
              : {}),
            ...(patch.viewer_profile_connected !== undefined
              ? { viewer_profile_connected: patch.viewer_profile_connected }
              : {}),
          },
        };
      }
      if (row.group?.opportunity_id === opportunityId) {
        return {
          ...row,
          group: {
            ...row.group,
            ...(patch.viewer_group_state !== undefined
              ? { viewer_group_state: patch.viewer_group_state }
              : {}),
            ...(patch.request_id !== undefined
              ? { request_id: patch.request_id }
              : {}),
          },
        };
      }
      return row;
    }),
  };
  cache.set(key, { ts: entry.ts, value: next });
  emit();
}

export type ProfileSocialOpportunitySide = "duo" | "group";

/**
 * Clear one side of a post-centric Profile rail row. Drops the row only when
 * both Duo and Group payloads are gone. Prefer opportunity_id when known;
 * source_post_id is the post-centric fallback for own leave/cancel.
 */
export function removeCachedProfileSocialOpportunitySide(
  viewerUserId: string,
  profileUserId: string,
  input: {
    side: ProfileSocialOpportunitySide;
    sourcePostId?: string | null;
    opportunityId?: string | null;
  }
): boolean {
  const sourcePostId = input.sourcePostId?.trim() || null;
  const opportunityId = input.opportunityId?.trim() || null;
  if (!sourcePostId && !opportunityId) return false;

  const key = profileSocialOpportunityCacheKey(viewerUserId, profileUserId);
  const entry = cache.get(key);
  if (!entry) return false;

  let changed = false;
  const opportunities = entry.value.opportunities.flatMap((row) => {
    const sideMatch =
      input.side === "duo"
        ? (opportunityId != null && row.duo?.opportunity_id === opportunityId) ||
          (sourcePostId != null &&
            row.source_post_id === sourcePostId &&
            row.duo != null)
        : (opportunityId != null &&
            row.group?.opportunity_id === opportunityId) ||
          (sourcePostId != null &&
            row.source_post_id === sourcePostId &&
            row.group != null);

    if (!sideMatch) return [row];

    changed = true;
    const nextRow = {
      ...row,
      duo: input.side === "duo" ? null : row.duo,
      group: input.side === "group" ? null : row.group,
    };
    if (nextRow.duo == null && nextRow.group == null) return [];
    return [nextRow];
  });

  if (!changed) return false;

  cache.set(key, {
    // Keep immediate UI; mark soft-stale so hook revalidates against backend.
    ts: Date.now() - SOFT_STALE_MS - 1,
    value: { ...entry.value, opportunities },
  });
  emit();
  return true;
}

/** Force soft-stale so the next load revalidates without wiping local rows. */
export function markProfileSocialOpportunitiesSoftStale(
  viewerUserId: string,
  profileUserId: string
): void {
  const key = profileSocialOpportunityCacheKey(viewerUserId, profileUserId);
  const entry = cache.get(key);
  if (!entry) return;
  cache.set(key, {
    ts: Date.now() - SOFT_STALE_MS - 1,
    value: entry.value,
  });
  emit();
}

/** Drop all Profile opportunity caches for a viewer (rare; prefer per-owner invalidate). */
export function invalidateProfileSocialOpportunitiesForViewer(
  viewerUserId: string
): void {
  const prefix = `profile_social_opps:${viewerUserId}:`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  emit();
}

export function invalidateProfileSocialOpportunities(
  viewerUserId: string,
  profileUserId: string
): void {
  cache.delete(profileSocialOpportunityCacheKey(viewerUserId, profileUserId));
  emit();
}

/** Test helper. */
export function __resetProfileSocialOpportunityCacheForTests(): void {
  cache.clear();
  emit();
}
