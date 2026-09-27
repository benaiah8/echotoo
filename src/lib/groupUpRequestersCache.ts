/**
 * Lazy SWR cache for Group Up requesters keyed by conversation_id.
 */

import type { GroupUpRequestersPage } from "./people/types";

const TTL_MS = 120_000;
export const GROUP_UP_REQUESTERS_SOFT_STALE_MS = 30_000;

type RequestersCacheEntry = { ts: number; value: GroupUpRequestersPage };

const requestersCache = new Map<string, RequestersCacheEntry>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeGroupUpRequestersCache(
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

export function groupUpRequestersCacheKey(
  userId: string,
  conversationId: string
): string {
  return `group_up_requesters:${userId}:${conversationId}`;
}

function readEntry(
  userId: string,
  conversationId: string
): RequestersCacheEntry | undefined {
  const key = groupUpRequestersCacheKey(userId, conversationId);
  const entry = requestersCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    requestersCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedGroupUpRequesters(
  userId: string,
  conversationId: string
): GroupUpRequestersPage | undefined {
  return readEntry(userId, conversationId)?.value;
}

export function getGroupUpRequestersFetchedAt(
  userId: string,
  conversationId: string
): number | undefined {
  return readEntry(userId, conversationId)?.ts;
}

export function isGroupUpRequestersSoftStale(
  userId: string,
  conversationId: string
): boolean {
  const fetchedAt = getGroupUpRequestersFetchedAt(userId, conversationId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= GROUP_UP_REQUESTERS_SOFT_STALE_MS;
}

export function setCachedGroupUpRequesters(
  userId: string,
  conversationId: string,
  value: GroupUpRequestersPage
): void {
  requestersCache.set(groupUpRequestersCacheKey(userId, conversationId), {
    ts: Date.now(),
    value,
  });
  emit();
}

export function invalidateGroupUpRequesters(
  userId: string,
  conversationId: string
): void {
  requestersCache.delete(groupUpRequestersCacheKey(userId, conversationId));
  emit();
}

export function removeFromCachedGroupUpRequesters(
  userId: string,
  conversationId: string,
  requestId: string
): void {
  if (!userId || !conversationId || !requestId) return;
  const key = groupUpRequestersCacheKey(userId, conversationId);
  const entry = requestersCache.get(key);
  if (!entry) return;
  if (Date.now() - entry.ts >= TTL_MS) {
    requestersCache.delete(key);
    return;
  }
  const nextRequests = entry.value.requests.filter(
    (row) => row.request_id !== requestId
  );
  if (nextRequests.length === entry.value.requests.length) return;
  requestersCache.set(key, {
    ts: entry.ts,
    value: { ...entry.value, requests: nextRequests },
  });
  emit();
}

/** Test helper — clear in-memory cache. */
export function __resetGroupUpRequestersCacheForTests(): void {
  requestersCache.clear();
}
