/**
 * SWR cache for host Open Plan request summaries (one row per opportunity_id).
 */

import type {
  OpenPlanAnonymousPreview,
  OpenPlanRequestGroup,
  OpenPlanRequestGroupsPage,
} from "./people/types";

const TTL_MS = 120_000;
export const OPEN_PLAN_REQUEST_GROUPS_SOFT_STALE_MS = 30_000;

type GroupsCacheEntry = {
  ts: number;
  value: OpenPlanRequestGroupsPage;
};

const groupsCache = new Map<string, GroupsCacheEntry>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOpenPlanRequestGroupsCache(
  listener: Listener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

export function openPlanRequestGroupsCacheKey(userId: string): string {
  return `open_plan_request_groups:${userId}`;
}

function readEntry(userId: string): GroupsCacheEntry | undefined {
  const key = openPlanRequestGroupsCacheKey(userId);
  const entry = groupsCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    groupsCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedOpenPlanRequestGroups(
  userId: string
): OpenPlanRequestGroupsPage | undefined {
  return readEntry(userId)?.value;
}

export function getOpenPlanRequestGroupsFetchedAt(
  userId: string
): number | undefined {
  return readEntry(userId)?.ts;
}

export function isOpenPlanRequestGroupsSoftStale(userId: string): boolean {
  const fetchedAt = getOpenPlanRequestGroupsFetchedAt(userId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= OPEN_PLAN_REQUEST_GROUPS_SOFT_STALE_MS;
}

export function setCachedOpenPlanRequestGroups(
  userId: string,
  value: OpenPlanRequestGroupsPage
): void {
  groupsCache.set(openPlanRequestGroupsCacheKey(userId), {
    ts: Date.now(),
    value,
  });
  emit();
}

export function invalidateOpenPlanRequestGroups(userId: string): void {
  groupsCache.delete(openPlanRequestGroupsCacheKey(userId));
  emit();
}

export function anonymousPreviewFromFields(row: {
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
}): OpenPlanAnonymousPreview {
  return {
    avatar_url: row.avatar_url,
    profile_photos: row.profile_photos,
    echo_preset: row.echo_preset,
  };
}

/**
 * After Accept: decrement that plan's pending_count.
 * Previews/latest are taken from remaining cached requesters when provided.
 * If those cannot guarantee ordering, invalidate so the hook refetches.
 */
export function patchOpenPlanRequestGroupsAfterAccept(
  userId: string,
  opportunityId: string,
  options: {
    remainingPreviews: OpenPlanAnonymousPreview[] | null;
    remainingLatest: { at: string; id: string } | null;
    acceptedWasLatest: boolean;
    removePlan?: boolean;
  }
): void {
  if (!userId || !opportunityId) return;
  const key = openPlanRequestGroupsCacheKey(userId);
  const entry = groupsCache.get(key);
  if (!entry) {
    emit();
    return;
  }
  if (Date.now() - entry.ts >= TTL_MS) {
    groupsCache.delete(key);
    emit();
    return;
  }

  if (options.removePlan) {
    const groups = entry.value.groups.filter(
      (g) => g.opportunity_id !== opportunityId
    );
    if (groups.length === entry.value.groups.length) {
      emit();
      return;
    }
    groupsCache.set(key, {
      ts: entry.ts,
      value: { ...entry.value, groups },
    });
    emit();
    return;
  }

  const idx = entry.value.groups.findIndex(
    (g) => g.opportunity_id === opportunityId
  );
  if (idx < 0) {
    emit();
    return;
  }

  const current = entry.value.groups[idx];
  const nextCount = Math.max(0, Math.floor(current.pending_count) - 1);
  if (nextCount <= 0) {
    const groups = entry.value.groups.filter(
      (g) => g.opportunity_id !== opportunityId
    );
    groupsCache.set(key, {
      ts: entry.ts,
      value: { ...entry.value, groups },
    });
    emit();
    return;
  }

  const neededPreviews = Math.min(2, nextCount);
  if (
    options.remainingPreviews == null ||
    options.remainingPreviews.length < neededPreviews ||
    (options.acceptedWasLatest && !options.remainingLatest)
  ) {
    groupsCache.delete(key);
    emit();
    return;
  }

  const groups = entry.value.groups.slice();
  groups[idx] = {
    ...current,
    pending_count: nextCount,
    preview_requesters: options.remainingPreviews.slice(0, 2),
    latest_request_at: options.acceptedWasLatest
      ? options.remainingLatest!.at
      : current.latest_request_at,
    latest_request_id: options.acceptedWasLatest
      ? options.remainingLatest!.id
      : current.latest_request_id,
  };
  groupsCache.set(key, {
    ts: entry.ts,
    value: { ...entry.value, groups },
  });
  emit();
}

/**
 * Remaining cached requesters → accept patch inputs.
 * Returns null previews when the remaining page cannot fill the two-slot
 * summary preview, so callers invalidate instead of inventing avatars.
 */
export function remainingOpenPlanAcceptPatchInputs(
  remaining: Array<{
    request_id: string;
    requested_at: string;
    avatar_url: string | null;
    profile_photos: string[];
    echo_preset: string | null;
  }>,
  nextCount: number
): {
  remainingPreviews: OpenPlanAnonymousPreview[] | null;
  remainingLatest: { at: string; id: string } | null;
} {
  const count = Math.max(0, Math.floor(nextCount));
  const remainingLatest = remaining[0]
    ? { at: remaining[0].requested_at, id: remaining[0].request_id }
    : null;
  const neededPreviews = Math.min(2, count);
  if (count > 0 && remaining.length < neededPreviews) {
    return { remainingPreviews: null, remainingLatest };
  }
  return {
    remainingPreviews: remaining
      .slice(0, 2)
      .map((row) => anonymousPreviewFromFields(row)),
    remainingLatest,
  };
}

/** Test helper — clear in-memory cache. */
export function __resetOpenPlanRequestGroupsCacheForTests(): void {
  groupsCache.clear();
}
