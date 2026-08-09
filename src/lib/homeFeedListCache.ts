/**
 * Persistent (localStorage) first-page snapshot of Home vertical feed for cold-start hydrate.
 * Keyed by dataCache feed key; no aggressive expiry — last-known-good rows when offline.
 */

import type { FeedItem } from "../api/queries/getPublicFeed";
import { HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";

export const HOME_FEED_LIST_CACHE_KEY_PREFIX = "home_feed_v1:";
export const HOME_FEED_LIST_CACHE_SCHEMA_VERSION = 1 as const;

export type HomeFeedPersistedPayload = {
  version: typeof HOME_FEED_LIST_CACHE_SCHEMA_VERSION;
  key: string;
  items: FeedItem[];
  ts: number;
};

function storageKey(feedCacheKey: string): string {
  return `${HOME_FEED_LIST_CACHE_KEY_PREFIX}${feedCacheKey}`;
}

function trimItemsForPersistence(items: FeedItem[]): FeedItem[] {
  if (items.length <= HOME_FEED_FIRST_PAGE) return items;
  return items.slice(0, HOME_FEED_FIRST_PAGE);
}

export function readPersistedHomeFeed(
  feedCacheKey: string
): HomeFeedPersistedPayload | null {
  if (!feedCacheKey) return null;
  try {
    const raw = localStorage.getItem(storageKey(feedCacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.version !== HOME_FEED_LIST_CACHE_SCHEMA_VERSION) return null;
    if (typeof o.key !== "string" || o.key !== feedCacheKey) return null;
    if (!Array.isArray(o.items) || o.items.length === 0) return null;
    if (typeof o.ts !== "number" || !Number.isFinite(o.ts)) return null;
    return {
      version: HOME_FEED_LIST_CACHE_SCHEMA_VERSION,
      key: o.key,
      items: o.items as FeedItem[],
      ts: o.ts,
    };
  } catch {
    return null;
  }
}

export function writePersistedHomeFeed(
  feedCacheKey: string,
  items: FeedItem[]
): void {
  if (!feedCacheKey || !Array.isArray(items) || items.length === 0) return;
  try {
    const toStore: HomeFeedPersistedPayload = {
      version: HOME_FEED_LIST_CACHE_SCHEMA_VERSION,
      key: feedCacheKey,
      items: trimItemsForPersistence(items),
      ts: Date.now(),
    };
    localStorage.setItem(storageKey(feedCacheKey), JSON.stringify(toStore));
  } catch (e) {
    console.warn("[homeFeedListCache] write failed:", e);
  }
}

/** Remove one persisted home feed snapshot. */
export function clearPersistedHomeFeed(feedCacheKey: string): void {
  if (!feedCacheKey) return;
  try {
    localStorage.removeItem(storageKey(feedCacheKey));
  } catch {
    /* ignore */
  }
}

/** Remove all persisted home feed snapshots (profile author display changed). */
export function clearAllPersistedHomeFeeds(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(HOME_FEED_LIST_CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
