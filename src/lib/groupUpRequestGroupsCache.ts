/**
 * SWR cache for host Group Up request group summaries (one row per conversation).
 */

import type { GroupUpRequestGroup, GroupUpRequestGroupsPage } from "./people/types";
import {
  advanceRequestCursorMonotonic,
  isRequestCursorAfter,
  type GroupUpRequestCursor,
} from "./groupUpRequestCursor";

const TTL_MS = 120_000;
export const GROUP_UP_REQUEST_GROUPS_SOFT_STALE_MS = 30_000;

type GroupsCacheEntry = {
  ts: number;
  value: GroupUpRequestGroupsPage;
  /** Client-side watermarks for cursor-aware Accept/Decline patches. */
  watermarks: Record<string, GroupUpRequestCursor>;
};

const groupsCache = new Map<string, GroupsCacheEntry>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeGroupUpRequestGroupsCache(
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

export function groupUpRequestGroupsCacheKey(userId: string): string {
  return `group_up_request_groups:${userId}`;
}

/**
 * Local watermark wins over stale server new_count when latest request
 * is already covered by the client-seen cursor.
 */
export function reconcileGroupsWithLocalWatermarks(
  groups: GroupUpRequestGroup[],
  watermarks: Record<string, GroupUpRequestCursor>
): GroupUpRequestGroup[] {
  if (!groups.length) return groups;
  let changed = false;
  const next = groups.map((g) => {
    const wm = watermarks[g.conversation_id];
    if (!wm) return g;
    const latest = {
      at: g.latest_request_at,
      id: g.latest_request_id,
    };
    if (!isRequestCursorAfter(latest, wm)) {
      if (g.new_count === 0) return g;
      changed = true;
      return { ...g, new_count: 0 };
    }
    return g;
  });
  return changed ? next : groups;
}

function readEntry(userId: string): GroupsCacheEntry | undefined {
  const key = groupUpRequestGroupsCacheKey(userId);
  const entry = groupsCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    groupsCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedGroupUpRequestGroups(
  userId: string
): GroupUpRequestGroupsPage | undefined {
  return readEntry(userId)?.value;
}

export function getGroupUpRequestGroupsFetchedAt(
  userId: string
): number | undefined {
  return readEntry(userId)?.ts;
}

export function isGroupUpRequestGroupsSoftStale(userId: string): boolean {
  const fetchedAt = getGroupUpRequestGroupsFetchedAt(userId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= GROUP_UP_REQUEST_GROUPS_SOFT_STALE_MS;
}

export function getGroupUpRequestGroupWatermark(
  userId: string,
  conversationId: string
): GroupUpRequestCursor | null {
  const entry = readEntry(userId);
  if (!entry) return null;
  return entry.watermarks[conversationId] ?? null;
}

export function setCachedGroupUpRequestGroups(
  userId: string,
  value: GroupUpRequestGroupsPage
): void {
  const key = groupUpRequestGroupsCacheKey(userId);
  const prev = groupsCache.get(key);
  const watermarks = prev?.watermarks ?? {};
  const groups = reconcileGroupsWithLocalWatermarks(value.groups, watermarks);
  groupsCache.set(key, {
    ts: Date.now(),
    value: { ...value, groups },
    watermarks,
  });
  emit();
}

export function invalidateGroupUpRequestGroups(userId: string): void {
  groupsCache.delete(groupUpRequestGroupsCacheKey(userId));
  emit();
}

/**
 * Mark seen through a captured opening cursor.
 * Sets local watermark; new_count becomes 0 when latest is covered.
 * Preserves new_count when summary latest is still after the captured cursor.
 */
export function patchGroupUpRequestGroupsMarkSeen(
  userId: string,
  conversationId: string,
  through: GroupUpRequestCursor
): void {
  if (!userId || !conversationId || !through.at || !through.id) return;
  const key = groupUpRequestGroupsCacheKey(userId);
  const entry = groupsCache.get(key);
  if (!entry) return;
  if (Date.now() - entry.ts >= TTL_MS) {
    groupsCache.delete(key);
    return;
  }

  const nextWm = advanceRequestCursorMonotonic(
    entry.watermarks[conversationId] ?? null,
    through
  );
  const watermarks = { ...entry.watermarks, [conversationId]: nextWm };
  const groups = reconcileGroupsWithLocalWatermarks(
    entry.value.groups,
    watermarks
  );

  groupsCache.set(key, {
    // Bump ts so soft-stale does not immediately treat the entry as stale.
    ts: Date.now(),
    value: { ...entry.value, groups },
    watermarks,
  });
  emit();
}

/**
 * After Accept/Decline: always decrement pending; decrement new_count only when
 * the resolved request cursor is strictly after the local watermark.
 */
export function patchGroupUpRequestGroupsAfterResolve(
  userId: string,
  conversationId: string,
  resolved: GroupUpRequestCursor
): GroupUpRequestGroup | null {
  if (!userId || !conversationId || !resolved.at || !resolved.id) return null;
  const key = groupUpRequestGroupsCacheKey(userId);
  const entry = groupsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts >= TTL_MS) {
    groupsCache.delete(key);
    return null;
  }

  const wm = entry.watermarks[conversationId] ?? null;
  const wasNew = wm == null || isRequestCursorAfter(resolved, wm);

  let removed: GroupUpRequestGroup | null = null;
  const groups: GroupUpRequestGroup[] = [];
  for (const g of entry.value.groups) {
    if (g.conversation_id !== conversationId) {
      groups.push(g);
      continue;
    }
    const pending_count = Math.max(0, g.pending_count - 1);
    const new_count = wasNew
      ? Math.max(0, g.new_count - 1)
      : g.new_count;
    if (pending_count <= 0) {
      removed = g;
      continue;
    }
    groups.push({ ...g, pending_count, new_count });
  }

  groupsCache.set(key, {
    ts: Date.now(),
    value: { ...entry.value, groups },
    watermarks: entry.watermarks,
  });
  emit();
  return removed;
}

/** Sum of new_count across groups — Requests attention badge contribution. */
export function sumGroupUpRequestNewCount(
  groups: GroupUpRequestGroup[]
): number {
  let sum = 0;
  for (const g of groups) {
    sum += Math.max(0, g.new_count);
  }
  return sum;
}

/** Test helper — clear in-memory cache. */
export function __resetGroupUpRequestGroupsCacheForTests(): void {
  groupsCache.clear();
}
