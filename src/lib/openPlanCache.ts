import type {
  OpenPlanCandidatesPage,
  OpenPlanIncomingRequestsPage,
  OpenPlanOpportunity,
} from "./people/types";
import { persistOpenPlanOwnState } from "./socialActionPersistCache";

/** Soft-stale for own Open Plan UI: still readable; SWR should refresh. */
export const OPEN_PLAN_OWN_SOFT_STALE_MS = 120_000;
/** Hard retention for own Open Plan memory (account-scoped). */
const OWN_HARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Hard cache lifetime for deck/incoming maps (unchanged browse semantics). */
const TTL_MS = 120_000;
/** Soft-stale: background revalidation may run while this data is still shown. */
export const OPEN_PLAN_DECK_SOFT_STALE_MS = 30_000;
export const OPEN_PLAN_INCOMING_SOFT_STALE_MS = 30_000;

type OwnCacheEntry = { ts: number; value: OpenPlanOpportunity | null };
type DeckCacheEntry = { ts: number; value: OpenPlanCandidatesPage };
type IncomingCacheEntry = { ts: number; value: OpenPlanIncomingRequestsPage };

const ownCache = new Map<string, OwnCacheEntry>();
const deckCache = new Map<string, DeckCacheEntry>();
const incomingCache = new Map<string, IncomingCacheEntry>();

type OpenPlanCacheListener = () => void;
const listeners = new Set<OpenPlanCacheListener>();

export function subscribeOpenPlanCache(
  listener: OpenPlanCacheListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitOpenPlanCacheChanged(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* A broken subscriber must not block the others. */
    }
  }
}

/** Per-viewer own Open Plan for one source post. */
export function openPlanOwnCacheKey(userId: string, postId: string): string {
  return `open_plan_own:${userId}:${postId}`;
}

/** First-page Open Plans browse cache for one viewer. */
export function openPlanDeckCacheKey(userId: string): string {
  return `open_plan_deck:${userId}:mixed:0`;
}

/** First-page creator incoming Open Plan requests cache. */
export function openPlanIncomingCacheKey(userId: string): string {
  return `open_plan_requests:${userId}:incoming:0`;
}

export function getCachedOpenPlanOwn(
  userId: string,
  postId: string
): OpenPlanOpportunity | null | undefined {
  const key = openPlanOwnCacheKey(userId, postId);
  const entry = ownCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= OWN_HARD_TTL_MS) {
    ownCache.delete(key);
    return undefined;
  }
  return entry.value;
}

/** True when own entry exists but past soft-stale window (UI still uses value). */
export function isCachedOpenPlanOwnSoftStale(
  userId: string,
  postId: string
): boolean {
  const entry = ownCache.get(openPlanOwnCacheKey(userId, postId));
  if (!entry) return true;
  if (Date.now() - entry.ts >= OWN_HARD_TTL_MS) return true;
  return Date.now() - entry.ts >= OPEN_PLAN_OWN_SOFT_STALE_MS;
}

export function setCachedOpenPlanOwn(
  userId: string,
  postId: string,
  value: OpenPlanOpportunity | null
): void {
  ownCache.set(openPlanOwnCacheKey(userId, postId), {
    ts: Date.now(),
    value,
  });
  persistOpenPlanOwnState(userId, postId, value != null);
  emitOpenPlanCacheChanged();
}

/** Hydrate without rewriting persist (already on disk). */
export function setCachedOpenPlanOwnFromPersist(
  userId: string,
  postId: string,
  value: OpenPlanOpportunity | null
): void {
  ownCache.set(openPlanOwnCacheKey(userId, postId), {
    ts: Date.now(),
    value,
  });
  emitOpenPlanCacheChanged();
}

export function invalidateOpenPlanOwnForPost(postId: string): void {
  const suffix = `:${postId}`;
  for (const key of Array.from(ownCache.keys())) {
    if (key.endsWith(suffix)) ownCache.delete(key);
  }
  emitOpenPlanCacheChanged();
}

function readDeckCacheEntry(userId: string): DeckCacheEntry | undefined {
  const key = openPlanDeckCacheKey(userId);
  const entry = deckCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    deckCache.delete(key);
    return undefined;
  }
  return entry;
}

function readIncomingCacheEntry(
  userId: string
): IncomingCacheEntry | undefined {
  const key = openPlanIncomingCacheKey(userId);
  const entry = incomingCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    incomingCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedOpenPlanDeck(
  userId: string
): OpenPlanCandidatesPage | undefined {
  return readDeckCacheEntry(userId)?.value;
}

export function getOpenPlanDeckFetchedAt(userId: string): number | undefined {
  return readDeckCacheEntry(userId)?.ts;
}

export function isOpenPlanDeckSoftStale(userId: string): boolean {
  const fetchedAt = getOpenPlanDeckFetchedAt(userId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= OPEN_PLAN_DECK_SOFT_STALE_MS;
}

export function setCachedOpenPlanDeck(
  userId: string,
  value: OpenPlanCandidatesPage
): void {
  deckCache.set(openPlanDeckCacheKey(userId), {
    ts: Date.now(),
    value,
  });
  emitOpenPlanCacheChanged();
}

export function invalidateOpenPlanDeck(userId: string): void {
  deckCache.delete(openPlanDeckCacheKey(userId));
  emitOpenPlanCacheChanged();
}

export function getCachedOpenPlanIncoming(
  userId: string
): OpenPlanIncomingRequestsPage | undefined {
  return readIncomingCacheEntry(userId)?.value;
}

export function getOpenPlanIncomingFetchedAt(
  userId: string
): number | undefined {
  return readIncomingCacheEntry(userId)?.ts;
}

export function isOpenPlanIncomingSoftStale(userId: string): boolean {
  const fetchedAt = getOpenPlanIncomingFetchedAt(userId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= OPEN_PLAN_INCOMING_SOFT_STALE_MS;
}

export function setCachedOpenPlanIncoming(
  userId: string,
  value: OpenPlanIncomingRequestsPage
): void {
  incomingCache.set(openPlanIncomingCacheKey(userId), {
    ts: Date.now(),
    value,
  });
  emitOpenPlanCacheChanged();
}

export function invalidateOpenPlanIncoming(userId: string): void {
  incomingCache.delete(openPlanIncomingCacheKey(userId));
  emitOpenPlanCacheChanged();
}

/**
 * Drop one request from the first-page incoming cache without emitting.
 * Keeps local Accept/remove in sync without triggering an immediate SWR race.
 */
export function removeFromCachedOpenPlanIncoming(
  userId: string,
  requestId: string
): void {
  if (!userId || !requestId) return;
  const key = openPlanIncomingCacheKey(userId);
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
    value: {
      ...entry.value,
      requests: nextRequests,
    },
  });
}
