import type { GroupUpMembershipsPage } from "./people/types";

const TTL_MS = 120_000;
export const GROUP_UP_MEMBERSHIPS_SOFT_STALE_MS = 30_000;

type Entry = { ts: number; value: GroupUpMembershipsPage };

const cache = new Map<string, Entry>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeGroupUpMembershipsCache(
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

export function groupUpMembershipsCacheKey(userId: string): string {
  return `group_up_memberships:${userId}:0`;
}

function readEntry(userId: string): Entry | undefined {
  const key = groupUpMembershipsCacheKey(userId);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedGroupUpMemberships(
  userId: string
): GroupUpMembershipsPage | undefined {
  return readEntry(userId)?.value;
}

export function isGroupUpMembershipsSoftStale(userId: string): boolean {
  const entry = readEntry(userId);
  if (!entry) return true;
  return Date.now() - entry.ts >= GROUP_UP_MEMBERSHIPS_SOFT_STALE_MS;
}

export function setCachedGroupUpMemberships(
  userId: string,
  value: GroupUpMembershipsPage
): void {
  cache.set(groupUpMembershipsCacheKey(userId), {
    ts: Date.now(),
    value,
  });
  emit();
}

export function invalidateGroupUpMemberships(userId: string): void {
  cache.delete(groupUpMembershipsCacheKey(userId));
  emit();
}
