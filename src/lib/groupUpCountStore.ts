/**
 * Batched discoverable Group Up counts per source_post_id.
 * Persistent hydrate + SWR; mutations write memory + disk.
 *
 * Soft-stale counts remain KNOWN (visible) while background SWR runs.
 * Transient auth null does not wipe Account A's memory.
 */

import { supabase } from "./supabaseClient";
import {
  getGroupUpCountsForSources,
  GROUP_UP_COUNT_BATCH_MAX,
} from "../api/services/groupUpSourceBrowse";
import {
  isPersistedCountSoftStale,
  persistGroupCount,
  readSocialActionLastUserId,
  readSocialActionPersistBag,
  SOCIAL_COUNT_PERSIST_TTL_MS,
} from "./socialActionPersistCache";

const FLUSH_MS = 40;
const LOGOUT_CONFIRM_MS = 400;
/** Memory soft-stale window — matches persist soft window. */
export const GROUP_UP_COUNT_STALE_MS = SOCIAL_COUNT_PERSIST_TTL_MS;

type CountEntry = { count: number; ts: number };

const cache = new Map<string, CountEntry>();
const requested = new Set<string>();
const inflight = new Set<string>();
const loadFailed = new Set<string>();
const softRevalidate = new Set<string>();
const subscribers = new Set<() => void>();
let flushTimer: number | null = null;
let logoutConfirmTimer: number | null = null;

let viewerId: string | null | undefined;
let lastConfirmedUserId: string | null = null;
let viewerPromise: Promise<string | null> | null = null;
let authSubscribed = false;

function emit(): void {
  for (const listener of Array.from(subscribers)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

function effectiveUserId(): string | null {
  if (typeof viewerId === "string") return viewerId;
  if (viewerId === null) return null;
  return lastConfirmedUserId ?? readSocialActionLastUserId();
}

function hydrateAllFromPersist(userId: string): void {
  const bag = readSocialActionPersistBag(userId);
  for (const [postId, e] of Object.entries(bag.counts)) {
    const existing = cache.get(postId);
    if (existing === undefined) {
      cache.set(postId, { count: e.count, ts: e.ts });
    }
    if (isPersistedCountSoftStale(e) || isStale(cache.get(postId)!)) {
      softRevalidate.add(postId);
    }
  }
}

function rehydratePostFromPersist(userId: string, postId: string): boolean {
  if (cache.has(postId)) return true;
  const e = readSocialActionPersistBag(userId).counts[postId];
  if (!e) return false;
  cache.set(postId, { count: e.count, ts: e.ts });
  if (isPersistedCountSoftStale(e)) softRevalidate.add(postId);
  return true;
}

function clearMemoryForAccountSwitch(): void {
  requested.clear();
  inflight.clear();
  loadFailed.clear();
  softRevalidate.clear();
  cache.clear();
}

function applyConfirmedUser(next: string): void {
  const prev = viewerId;
  lastConfirmedUserId = next;
  if (logoutConfirmTimer != null) {
    globalThis.clearTimeout(logoutConfirmTimer);
    logoutConfirmTimer = null;
  }
  if (prev === next && typeof prev === "string") {
    viewerId = next;
    return;
  }
  if (typeof prev === "string" && prev !== next) {
    clearMemoryForAccountSwitch();
  }
  viewerId = next;
  hydrateAllFromPersist(next);
  emit();
}

function applyConfirmedSignedOut(): void {
  if (logoutConfirmTimer != null) {
    globalThis.clearTimeout(logoutConfirmTimer);
    logoutConfirmTimer = null;
  }
  clearMemoryForAccountSwitch();
  viewerId = null;
  lastConfirmedUserId = null;
  emit();
}

function noteTransientAuthNull(): void {
  if (logoutConfirmTimer != null) return;
  logoutConfirmTimer = globalThis.setTimeout(() => {
    logoutConfirmTimer = null;
    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        const id = session?.user?.id ?? null;
        if (id) applyConfirmedUser(id);
        else applyConfirmedSignedOut();
      })
      .catch(() => {
        /* keep lastConfirmed + cache */
      });
  }, LOGOUT_CONFIRM_MS) as unknown as number;
}

function resolveViewerId(): Promise<string | null> {
  if (viewerPromise) return viewerPromise;
  viewerPromise = supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      const next = session?.user?.id ?? null;
      if (next) {
        applyConfirmedUser(next);
        return next;
      }
      if (lastConfirmedUserId) {
        noteTransientAuthNull();
        return lastConfirmedUserId;
      }
      applyConfirmedSignedOut();
      return null;
    })
    .catch(() => {
      if (lastConfirmedUserId) {
        noteTransientAuthNull();
        return lastConfirmedUserId;
      }
      applyConfirmedSignedOut();
      return null;
    });
  return viewerPromise;
}

function ensureViewerSubscription(): void {
  if (authSubscribed) return;
  authSubscribed = true;

  const last = readSocialActionLastUserId();
  if (last && viewerId === undefined) {
    lastConfirmedUserId = last;
    viewerId = last;
    hydrateAllFromPersist(last);
    emit();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    const next = session?.user?.id ?? null;
    viewerPromise = Promise.resolve(next ?? lastConfirmedUserId);
    if (next) {
      applyConfirmedUser(next);
      return;
    }
    if (event === "SIGNED_OUT") {
      applyConfirmedSignedOut();
      return;
    }
    noteTransientAuthNull();
  });
  void resolveViewerId();
}

function isStale(entry: CountEntry): boolean {
  return Date.now() - entry.ts > GROUP_UP_COUNT_STALE_MS;
}

async function flush(): Promise<void> {
  flushTimer = null;
  const viewer = await resolveViewerId();
  const asked = Array.from(requested);
  requested.clear();
  if (!viewer || asked.length === 0) return;

  const missing = asked.filter((id) => {
    if (inflight.has(id)) return false;
    const entry = cache.get(id);
    if (entry === undefined) return true;
    if (softRevalidate.has(id) || isStale(entry)) return true;
    return false;
  });
  if (missing.length === 0) return;

  for (const id of missing) {
    inflight.add(id);
    loadFailed.delete(id);
  }

  try {
    for (let i = 0; i < missing.length; i += GROUP_UP_COUNT_BATCH_MAX) {
      const chunk = missing.slice(i, i + GROUP_UP_COUNT_BATCH_MAX);
      const map = await getGroupUpCountsForSources(chunk);
      const now = Date.now();
      for (const id of chunk) {
        const count = map.get(id) ?? 0;
        cache.set(id, { count, ts: now });
        persistGroupCount(viewer, id, count);
        softRevalidate.delete(id);
      }
    }
  } catch {
    for (const id of missing) {
      if (!cache.has(id)) loadFailed.add(id);
    }
  } finally {
    for (const id of missing) inflight.delete(id);
    emit();
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = globalThis.setTimeout(
    () => void flush(),
    FLUSH_MS
  ) as unknown as number;
}

export function requestGroupUpCount(postId: string): void {
  if (!postId) return;
  ensureViewerSubscription();
  const uid = effectiveUserId();
  if (!uid) return;

  rehydratePostFromPersist(uid, postId);

  const entry = cache.get(postId);
  if (entry !== undefined && !isStale(entry) && !softRevalidate.has(postId)) {
    loadFailed.delete(postId);
    return;
  }
  if (inflight.has(postId)) return;
  requested.add(postId);
  scheduleFlush();
}

export function markGroupUpCountStale(postId: string): void {
  if (!postId) return;
  softRevalidate.add(postId);
  emit();
}

export function getGroupUpDiscoverableCount(postId: string): number | null {
  const uid = effectiveUserId();
  if (uid) rehydratePostFromPersist(uid, postId);
  const entry = cache.get(postId);
  if (entry !== undefined) return entry.count;
  if (viewerId === null && !lastConfirmedUserId) return 0;
  return null;
}

/** Cached count stays visible during soft-revalidate — not "resolving" for UI. */
export function isGroupUpCountResolving(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (uid) rehydratePostFromPersist(uid, postId);
  if (cache.has(postId)) return false;
  if (!uid) return false;
  if (loadFailed.has(postId)) return false;
  return true;
}

export function isGroupUpCountLoadFailed(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) return false;
  if (cache.has(postId)) return false;
  return loadFailed.has(postId);
}

export function isGroupUpCountViewerSignedIn(): boolean {
  return typeof effectiveUserId() === "string";
}

export function subscribeGroupUpCount(listener: () => void): () => void {
  ensureViewerSubscription();
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function patchGroupUpCount(postId: string, delta: number): void {
  if (!postId || !Number.isFinite(delta)) return;
  const entry = cache.get(postId);
  const prev = entry?.count ?? 0;
  const next = Math.max(0, prev + delta);
  cache.set(postId, { count: next, ts: Date.now() });
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  const uid = effectiveUserId();
  if (uid) persistGroupCount(uid, postId, next);
  emit();
}

export function setGroupUpCount(postId: string, count: number): void {
  if (!postId || !Number.isFinite(count)) return;
  const next = Math.max(0, Math.floor(count));
  cache.set(postId, { count: next, ts: Date.now() });
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  const uid = effectiveUserId();
  if (uid) persistGroupCount(uid, postId, next);
  emit();
}

/** First-paint seed from Feed/Detail; keeps face during soft-revalidate. */
export function seedGroupUpCountFromSnapshot(
  userId: string,
  postId: string,
  count: number
): void {
  if (!userId || !postId || !Number.isFinite(count)) return;
  ensureViewerSubscription();
  if (viewerId === undefined) {
    viewerId = userId;
    lastConfirmedUserId = userId;
  }
  if (typeof viewerId === "string" && viewerId !== userId) return;
  if (lastConfirmedUserId && lastConfirmedUserId !== userId) return;

  const next = Math.max(0, Math.floor(count));
  const existing = cache.get(postId);
  if (existing?.count === next) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  cache.set(postId, { count: next, ts: Date.now() });
  softRevalidate.add(postId);
  loadFailed.delete(postId);
  persistGroupCount(userId, postId, next);
  emit();
}

export function __resetGroupUpCountStoreForTests(): void {
  cache.clear();
  requested.clear();
  inflight.clear();
  loadFailed.clear();
  softRevalidate.clear();
  subscribers.clear();
  if (flushTimer != null) {
    globalThis.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (logoutConfirmTimer != null) {
    globalThis.clearTimeout(logoutConfirmTimer);
    logoutConfirmTimer = null;
  }
  viewerId = undefined;
  lastConfirmedUserId = null;
  viewerPromise = null;
  authSubscribed = false;
}

export function __setGroupUpCountViewerForTests(
  id: string | null | undefined
): void {
  viewerId = id;
  lastConfirmedUserId = typeof id === "string" ? id : null;
  viewerPromise = Promise.resolve(id ?? null);
  authSubscribed = true;
  if (typeof id === "string") hydrateAllFromPersist(id);
}

(function bootstrapSocialGroupCountPersist(): void {
  try {
    const last = readSocialActionLastUserId();
    if (!last || viewerId !== undefined) return;
    lastConfirmedUserId = last;
    viewerId = last;
    hydrateAllFromPersist(last);
  } catch {
    /* noop */
  }
})();
