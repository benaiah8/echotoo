import type { GroupUpIncomingRequestsPage } from "./people/types";

const TTL_MS = 120_000;
export const GROUP_UP_INCOMING_SOFT_STALE_MS = 30_000;

type IncomingCacheEntry = { ts: number; value: GroupUpIncomingRequestsPage };

const incomingCache = new Map<string, IncomingCacheEntry>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeGroupUpIncomingCache(listener: Listener): () => void {
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

export function groupUpIncomingCacheKey(userId: string): string {
  return `group_up_requests:${userId}:incoming:0`;
}

function readEntry(userId: string): IncomingCacheEntry | undefined {
  const key = groupUpIncomingCacheKey(userId);
  const entry = incomingCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    incomingCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedGroupUpIncoming(
  userId: string
): GroupUpIncomingRequestsPage | undefined {
  return readEntry(userId)?.value;
}

export function getGroupUpIncomingFetchedAt(
  userId: string
): number | undefined {
  return readEntry(userId)?.ts;
}

export function isGroupUpIncomingSoftStale(userId: string): boolean {
  const fetchedAt = getGroupUpIncomingFetchedAt(userId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= GROUP_UP_INCOMING_SOFT_STALE_MS;
}

export function setCachedGroupUpIncoming(
  userId: string,
  value: GroupUpIncomingRequestsPage
): void {
  incomingCache.set(groupUpIncomingCacheKey(userId), {
    ts: Date.now(),
    value,
  });
  emit();
}

export function invalidateGroupUpIncoming(userId: string): void {
  incomingCache.delete(groupUpIncomingCacheKey(userId));
  emit();
}

/** Silent first-page drop — avoids SWR race on Accept/Decline. */
export function removeFromCachedGroupUpIncoming(
  userId: string,
  requestId: string
): void {
  if (!userId || !requestId) return;
  const key = groupUpIncomingCacheKey(userId);
  const entry = incomingCache.get(key);
  if (!entry) return;
  if (Date.now() - entry.ts >= TTL_MS) {
    incomingCache.delete(key);
    return;
  }
  const nextRequests = entry.value.requests.filter(
    (row) => row.request_id !== requestId
  );
  if (nextRequests.length === entry.value.requests.length) return;
  incomingCache.set(key, {
    ts: entry.ts,
    value: { ...entry.value, requests: nextRequests },
  });
}
