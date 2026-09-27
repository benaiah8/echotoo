import type { PairUpCandidatesPage, PairUpOpportunity } from "./people/types";
import { persistDuoOwnState } from "./socialActionPersistCache";

/** Soft-stale for own Duo UI: still readable; SWR should refresh. */
export const PAIR_UP_OWN_SOFT_STALE_MS = 120_000;
/** Hard retention for own Duo memory (account-scoped; far past normal SWR). */
const OWN_HARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Hard cache lifetime for deck/preview maps (unchanged browse semantics). */
const TTL_MS = 120_000;
/** Soft-stale: background revalidation may run while this data is still shown. */
export const PAIR_UP_DECK_SOFT_STALE_MS = 30_000;

/**
 * Deck cache kind / filter. My Plans is the live kind.
 * Discover keys may be invalidated before any Discover entries exist.
 */
export const PAIR_UP_DECK_KIND_MY_PLANS = "my_plans";
export const PAIR_UP_DECK_KIND_DISCOVER = "discover";
export type PairUpDeckKind =
  | typeof PAIR_UP_DECK_KIND_MY_PLANS
  | typeof PAIR_UP_DECK_KIND_DISCOVER;

type CacheEntry = { ts: number; value: PairUpOpportunity | null };
type DeckCacheEntry = { ts: number; value: PairUpCandidatesPage };

const cache = new Map<string, CacheEntry>();
const deckCache = new Map<string, DeckCacheEntry>();
const previewCache = new Map<string, DeckCacheEntry>();

export function pairUpCacheKey(userId: string, postId: string): string {
  return `pair_up:${userId}:${postId}`;
}

type PairUpCacheListener = () => void;

const listeners = new Set<PairUpCacheListener>();

/**
 * Notified whenever a viewer's join state for any post is written or dropped.
 * Lets every surface (feed cards, post detail, People rows) read the same cache
 * without its own RPC.
 */
export function subscribePairUpCache(listener: PairUpCacheListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitPairUpCacheChanged(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* A broken subscriber must not block the others. */
    }
  }
}

export function getCachedPairUp(
  userId: string,
  postId: string
): PairUpOpportunity | null | undefined {
  const key = pairUpCacheKey(userId, postId);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= OWN_HARD_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

/** True when own entry exists but past soft-stale window (UI still uses value). */
export function isCachedPairUpSoftStale(
  userId: string,
  postId: string
): boolean {
  const entry = cache.get(pairUpCacheKey(userId, postId));
  if (!entry) return true;
  if (Date.now() - entry.ts >= OWN_HARD_TTL_MS) return true;
  return Date.now() - entry.ts >= PAIR_UP_OWN_SOFT_STALE_MS;
}

export function setCachedPairUp(
  userId: string,
  postId: string,
  value: PairUpOpportunity | null
): void {
  cache.set(pairUpCacheKey(userId, postId), { ts: Date.now(), value });
  persistDuoOwnState(userId, postId, value != null);
  emitPairUpCacheChanged();
}

/** Hydrate without rewriting persist (already on disk). */
export function setCachedPairUpFromPersist(
  userId: string,
  postId: string,
  value: PairUpOpportunity | null
): void {
  cache.set(pairUpCacheKey(userId, postId), { ts: Date.now(), value });
  emitPairUpCacheChanged();
}

export function pairUpDeckCacheKey(
  userId: string,
  sourcePostId?: string | null,
  offset = 0,
  kind: PairUpDeckKind = PAIR_UP_DECK_KIND_MY_PLANS
): string {
  const filter = sourcePostId ? sourcePostId : "mixed";
  return `pair_up_deck:${userId}:${kind}:${filter}:${offset}`;
}

function readDeckCacheEntry(
  userId: string,
  sourcePostId?: string | null,
  offset = 0,
  kind: PairUpDeckKind = PAIR_UP_DECK_KIND_MY_PLANS
): DeckCacheEntry | undefined {
  const key = pairUpDeckCacheKey(userId, sourcePostId, offset, kind);
  const entry = deckCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    deckCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedPairUpDeck(
  userId: string,
  sourcePostId?: string | null,
  offset = 0,
  kind: PairUpDeckKind = PAIR_UP_DECK_KIND_MY_PLANS
): PairUpCandidatesPage | undefined {
  return readDeckCacheEntry(userId, sourcePostId, offset, kind)?.value;
}

/** `fetchedAt` for the last successful offset-0 write still inside the hard TTL. */
export function getPairUpDeckFetchedAt(
  userId: string,
  sourcePostId?: string | null,
  offset = 0,
  kind: PairUpDeckKind = PAIR_UP_DECK_KIND_MY_PLANS
): number | undefined {
  return readDeckCacheEntry(userId, sourcePostId, offset, kind)?.ts;
}

export function isPairUpDeckSoftStale(
  userId: string,
  sourcePostId?: string | null,
  offset = 0,
  kind: PairUpDeckKind = PAIR_UP_DECK_KIND_MY_PLANS
): boolean {
  const fetchedAt = getPairUpDeckFetchedAt(userId, sourcePostId, offset, kind);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= PAIR_UP_DECK_SOFT_STALE_MS;
}

export function setCachedPairUpDeck(
  userId: string,
  sourcePostId: string | null | undefined,
  offset: number,
  value: PairUpCandidatesPage,
  kind: PairUpDeckKind = PAIR_UP_DECK_KIND_MY_PLANS
): void {
  deckCache.set(pairUpDeckCacheKey(userId, sourcePostId, offset, kind), {
    ts: Date.now(),
    value,
  });
}

export function pairUpDeckPreviewCacheKey(userId: string): string {
  return `pair_up_deck_preview:${userId}`;
}

export function getCachedPairUpDeckPreview(
  userId: string
): PairUpCandidatesPage | undefined {
  const key = pairUpDeckPreviewCacheKey(userId);
  const entry = previewCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    previewCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCachedPairUpDeckPreview(
  userId: string,
  value: PairUpCandidatesPage
): void {
  previewCache.set(pairUpDeckPreviewCacheKey(userId), {
    ts: Date.now(),
    value,
  });
}

type PairUpDeckCacheListener = () => void;

const deckListeners = new Set<PairUpDeckCacheListener>();

function emitPairUpDeckCacheChanged(): void {
  for (const listener of Array.from(deckListeners)) {
    try {
      listener();
    } catch {
      /* A broken subscriber must not block the others. */
    }
  }
}

/** Notified when My Plans / deck cache entries are dropped (join, leave, express). */
export function subscribePairUpDeckCache(
  listener: PairUpDeckCacheListener
): () => void {
  deckListeners.add(listener);
  return () => {
    deckListeners.delete(listener);
  };
}

export function invalidatePairUpDeck(userId?: string): void {
  if (!userId) {
    deckCache.clear();
    previewCache.clear();
    emitPairUpDeckCacheChanged();
    return;
  }
  const prefix = `pair_up_deck:${userId}:`;
  for (const key of Array.from(deckCache.keys())) {
    if (key.startsWith(prefix)) deckCache.delete(key);
  }
  previewCache.delete(pairUpDeckPreviewCacheKey(userId));
  emitPairUpDeckCacheChanged();
}

/**
 * Drop one deck kind for a user. Does not emit My Plans listeners —
 * Discover preference changes must not refetch the My Plans deck.
 */
export function invalidatePairUpDeckKind(
  userId: string,
  kind: PairUpDeckKind
): void {
  const prefix = `pair_up_deck:${userId}:${kind}:`;
  for (const key of Array.from(deckCache.keys())) {
    if (key.startsWith(prefix)) deckCache.delete(key);
  }
}

export function invalidatePairUpForPost(postId: string): void {
  const needle = `:${postId}`;
  for (const key of Array.from(cache.keys())) {
    if (key.endsWith(needle)) cache.delete(key);
  }
  invalidatePairUpDeck();
  emitPairUpCacheChanged();
}

export function invalidatePairUpForUser(userId: string): void {
  const prefix = `pair_up:${userId}:`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  invalidatePairUpDeck(userId);
  emitPairUpCacheChanged();
}

export function invalidateAllPairUpCache(): void {
  cache.clear();
  deckCache.clear();
  previewCache.clear();
  emitPairUpCacheChanged();
  emitPairUpDeckCacheChanged();
}
