/**
 * Persistent (localStorage) first-page snapshot of profile post tabs for cold-start hydrate.
 * Keyed by tab + userId; no aggressive expiry — last-known-good rows when offline.
 */

import type { FeedItem } from "../api/queries/getPublicFeed";

export const PROFILE_POST_LIST_CACHE_KEY_PREFIX = "profile_posts_v1:";
export const PROFILE_POST_LIST_CACHE_MAX_ROWS = 20;
export const PROFILE_POST_LIST_CACHE_SCHEMA_VERSION = 1 as const;

export type ProfilePostListTab = "created" | "interacted" | "saved";

export type ProfilePostListPersistedPayload = {
  version: typeof PROFILE_POST_LIST_CACHE_SCHEMA_VERSION;
  tab: ProfilePostListTab;
  userId: string;
  items: FeedItem[];
  ts: number;
};

function storageKey(tab: ProfilePostListTab, userId: string): string {
  return `${PROFILE_POST_LIST_CACHE_KEY_PREFIX}${tab}:${userId}`;
}

function trimItemsForPersistence(items: FeedItem[]): FeedItem[] {
  if (items.length <= PROFILE_POST_LIST_CACHE_MAX_ROWS) return items;
  return items.slice(0, PROFILE_POST_LIST_CACHE_MAX_ROWS);
}

export function readPersistedProfilePosts(
  tab: ProfilePostListTab,
  userId: string
): ProfilePostListPersistedPayload | null {
  if (!userId || !tab) return null;
  try {
    const raw = localStorage.getItem(storageKey(tab, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.version !== PROFILE_POST_LIST_CACHE_SCHEMA_VERSION) return null;
    if (o.tab !== tab) return null;
    if (typeof o.userId !== "string" || o.userId !== userId) return null;
    if (!Array.isArray(o.items) || o.items.length === 0) return null;
    if (typeof o.ts !== "number" || !Number.isFinite(o.ts)) return null;
    return {
      version: PROFILE_POST_LIST_CACHE_SCHEMA_VERSION,
      tab,
      userId: o.userId,
      items: o.items as FeedItem[],
      ts: o.ts,
    };
  } catch {
    return null;
  }
}

/** Remove persisted first-page snapshot for one tab (targeted invalidation). */
export function clearPersistedProfilePosts(
  tab: ProfilePostListTab,
  userId: string
): void {
  if (!userId || !tab) return;
  try {
    localStorage.removeItem(storageKey(tab, userId));
  } catch {
    /* ignore */
  }
}

export function writePersistedProfilePosts(
  tab: ProfilePostListTab,
  userId: string,
  items: FeedItem[]
): void {
  if (!userId || !tab || !Array.isArray(items) || items.length === 0) return;
  try {
    const toStore: ProfilePostListPersistedPayload = {
      version: PROFILE_POST_LIST_CACHE_SCHEMA_VERSION,
      tab,
      userId,
      items: trimItemsForPersistence(items),
      ts: Date.now(),
    };
    localStorage.setItem(storageKey(tab, userId), JSON.stringify(toStore));
  } catch (e) {
    console.warn("[profilePostListCache] write failed:", e);
  }
}
