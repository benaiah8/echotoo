/**
 * Persistent (localStorage) first-page snapshot of Home vertical feed for cold-start hydrate.
 * Keyed by dataCache feed key; no aggressive expiry — last-known-good rows when offline.
 */

import type { FeedItem } from "../api/queries/getPublicFeed";
import { HOME_FEED_FIRST_PAGE } from "./homeFeedConstants";
import {
  compactHomeFeedDisplaySnapshot,
  type WithHomeFeedPresentationKey,
} from "./homeFeedCycle";

export const HOME_FEED_LIST_CACHE_KEY_PREFIX = "home_feed_v1:";
/** In-memory display/hydration snapshot — must not share the RPC first-page `feed:` key. */
export const HOME_FEED_DISPLAY_CACHE_KEY_PREFIX = "home_display_v1:";
export const HOME_FEED_LIST_CACHE_SCHEMA_VERSION = 1 as const;
export const HOME_FEED_DISPLAY_TTL_MS = 10 * 60 * 1000;

export type HomeFeedPersistedPayload = {
  version: typeof HOME_FEED_LIST_CACHE_SCHEMA_VERSION;
  key: string;
  items: FeedItem[];
  ts: number;
};

function storageKey(feedCacheKey: string): string {
  return `${HOME_FEED_LIST_CACHE_KEY_PREFIX}${feedCacheKey}`;
}

export function homeFeedDisplayCacheKey(rpcFeedKey: string): string {
  return `${HOME_FEED_DISPLAY_CACHE_KEY_PREFIX}${rpcFeedKey}`;
}

export function isHomeFeedRpcCacheKey(key: string): boolean {
  return key.startsWith("feed:");
}

/**
 * Warm display snapshot for ProgressiveFeed hydrate. Writes persist (first page)
 * and a separate in-memory key — never the RPC `feed:` first-page entry.
 */
export function writeHomeFeedDisplaySnapshot(
  rpcFeedKey: string,
  items: FeedItem[],
  setCache: (key: string, value: FeedItem[], ttlMs: number) => void
): void {
  if (!rpcFeedKey || !Array.isArray(items) || items.length === 0) return;
  const compact = compactHomeFeedDisplaySnapshot(
    items as WithHomeFeedPresentationKey<FeedItem>[]
  );
  if (compact.length === 0) return;
  setCache(
    homeFeedDisplayCacheKey(rpcFeedKey),
    compact,
    HOME_FEED_DISPLAY_TTL_MS
  );
  writePersistedHomeFeed(rpcFeedKey, compact);
}

export type HomeFeedHydrationSnapshot = {
  items: FeedItem[];
  source: "display" | "persist" | "rpc-first-page";
  snapshotTs?: number;
};

/**
 * Read hydrate rows without using a bloated RPC first-page list as the page.
 * RPC `feed:` fallback is capped to HOME_FEED_FIRST_PAGE.
 */
export function readHomeFeedHydrationSnapshot(
  rpcFeedKey: string,
  getCache: (key: string) => FeedItem[] | null | undefined
): HomeFeedHydrationSnapshot | null {
  if (!rpcFeedKey) return null;
  const display = getCache(homeFeedDisplayCacheKey(rpcFeedKey));
  if (Array.isArray(display) && display.length > 0) {
    return { items: display, source: "display" };
  }
  const persisted = readPersistedHomeFeed(rpcFeedKey);
  if (persisted?.items?.length) {
    return {
      items: persisted.items,
      source: "persist",
      snapshotTs: persisted.ts,
    };
  }
  const rpcPage = getCache(rpcFeedKey);
  if (Array.isArray(rpcPage) && rpcPage.length > 0) {
    return {
      items: rpcPage.slice(0, HOME_FEED_FIRST_PAGE),
      source: "rpc-first-page",
    };
  }
  return null;
}

function trimItemsForPersistence(items: FeedItem[]): FeedItem[] {
  return compactHomeFeedDisplaySnapshot(
    items as WithHomeFeedPresentationKey<FeedItem>[]
  );
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
