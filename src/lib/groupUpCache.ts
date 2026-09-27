import type { GroupUpOpportunity } from "./people/types";
import { persistGroupOwnState } from "./socialActionPersistCache";

/** Soft-stale for own Group UI: still readable; SWR should refresh. */
export const GROUP_UP_OWN_SOFT_STALE_MS = 120_000;
/** Hard retention for own Group memory (account-scoped). */
const OWN_HARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type OwnCacheEntry = { ts: number; value: GroupUpOpportunity | null };

const ownCache = new Map<string, OwnCacheEntry>();

type GroupUpCacheListener = () => void;
const listeners = new Set<GroupUpCacheListener>();

export function subscribeGroupUpCache(listener: GroupUpCacheListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitGroupUpCacheChanged(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* A broken subscriber must not block the others. */
    }
  }
}

/** Per-viewer own Group Up for one source post. */
export function groupUpOwnCacheKey(userId: string, postId: string): string {
  return `group_up_own:${userId}:${postId}`;
}

export function getCachedGroupUpOwn(
  userId: string,
  postId: string
): GroupUpOpportunity | null | undefined {
  const key = groupUpOwnCacheKey(userId, postId);
  const entry = ownCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= OWN_HARD_TTL_MS) {
    ownCache.delete(key);
    return undefined;
  }
  return entry.value;
}

/** True when own entry exists but past soft-stale window (UI still uses value). */
export function isCachedGroupUpOwnSoftStale(
  userId: string,
  postId: string
): boolean {
  const entry = ownCache.get(groupUpOwnCacheKey(userId, postId));
  if (!entry) return true;
  if (Date.now() - entry.ts >= OWN_HARD_TTL_MS) return true;
  return Date.now() - entry.ts >= GROUP_UP_OWN_SOFT_STALE_MS;
}

export function setCachedGroupUpOwn(
  userId: string,
  postId: string,
  value: GroupUpOpportunity | null
): void {
  ownCache.set(groupUpOwnCacheKey(userId, postId), {
    ts: Date.now(),
    value,
  });
  persistGroupOwnState(userId, postId, value != null);
  emitGroupUpCacheChanged();
}

/** Hydrate without rewriting persist (already on disk). */
export function setCachedGroupUpOwnFromPersist(
  userId: string,
  postId: string,
  value: GroupUpOpportunity | null
): void {
  ownCache.set(groupUpOwnCacheKey(userId, postId), {
    ts: Date.now(),
    value,
  });
  emitGroupUpCacheChanged();
}

export function invalidateGroupUpOwnForPost(postId: string): void {
  const suffix = `:${postId}`;
  for (const key of Array.from(ownCache.keys())) {
    if (key.endsWith(suffix)) ownCache.delete(key);
  }
  emitGroupUpCacheChanged();
}
