/**
 * Viewer join state for Pair Up / Duo across any post surface.
 *
 * Cards ask with `requestPairUpJoinState`; asks coalesce into one batched
 * `getMyPairUpsForSources` call. Values live in `pairUpCache`.
 * Persistent hydrate avoids inactive flash on reload; soft-revalidate after hydrate.
 *
 * KNOWN STALE stays visible (never → UNKNOWN solely from soft TTL).
 */

import toast from "react-hot-toast";
import { supabase } from "./supabaseClient";
import { getMyPairUpsForSources } from "../api/services/pairUp";
import {
  getCachedPairUp,
  isCachedPairUpSoftStale,
  setCachedPairUp,
  setCachedPairUpFromPersist,
  subscribePairUpCache,
} from "./pairUpCache";
import type { PairUpOpportunity } from "./people/types";
import {
  clearSocialActionPersistForUser,
  readSocialActionLastUserId,
  readSocialActionPersistBag,
} from "./socialActionPersistCache";

export type PairUpJoinStatus = "pending" | "joined" | "idle";

const FLUSH_MS = 40;
const LOGOUT_CONFIRM_MS = 400;

/** `undefined` = viewer not resolved yet, `null` = signed out (confirmed). */
let viewerId: string | null | undefined;
/** Last confirmed signed-in user — retained across transient auth null. */
let lastConfirmedUserId: string | null = null;
let viewerPromise: Promise<string | null> | null = null;
let authSubscribed = false;
let logoutConfirmTimer: number | null = null;

const requested = new Set<string>();
const inflight = new Set<string>();
const loadFailed = new Set<string>();
/** Post ids with hydrated/persisted UI that still need a network refresh. */
const softRevalidate = new Set<string>();
const subscribers = new Set<() => void>();
let flushTimer: number | null = null;

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

function hydratedPairStub(postId: string): PairUpOpportunity {
  return {
    id: `persist:${postId}`,
    source_post_id: postId,
    status: "active",
    description: null,
    discoverable_until: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date(0).toISOString(),
  };
}

/** Bulk hydrate (boot / account switch). Cheap; overwrites only missing keys via setFromPersist. */
function hydrateAllFromPersist(userId: string): void {
  const bag = readSocialActionPersistBag(userId);
  for (const [postId, e] of Object.entries(bag.duo)) {
    if (getCachedPairUp(userId, postId) !== undefined) {
      softRevalidate.add(postId);
      continue;
    }
    setCachedPairUpFromPersist(
      userId,
      postId,
      e.active ? hydratedPairStub(postId) : null
    );
    softRevalidate.add(postId);
  }
}

/** Per-post rehydrate after memory miss — not gated by a one-shot flag. */
function rehydratePostFromPersist(userId: string, postId: string): boolean {
  if (getCachedPairUp(userId, postId) !== undefined) return true;
  const e = readSocialActionPersistBag(userId).duo[postId];
  if (!e) return false;
  setCachedPairUpFromPersist(
    userId,
    postId,
    e.active ? hydratedPairStub(postId) : null
  );
  softRevalidate.add(postId);
  return true;
}

function clearMemoryControlSets(): void {
  softRevalidate.clear();
  requested.clear();
  inflight.clear();
  loadFailed.clear();
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
    clearMemoryControlSets();
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
  const prev = viewerId;
  clearMemoryControlSets();
  viewerId = null;
  lastConfirmedUserId = null;
  if (typeof prev === "string") {
    clearSocialActionPersistForUser(null);
  }
  emit();
}

/**
 * Transient auth null: keep last-confirmed UI identity; do not clear caches.
 * Confirm logout shortly via getSession.
 */
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
        /* keep lastConfirmed until a later event */
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

async function flush(): Promise<void> {
  flushTimer = null;
  const viewer = await resolveViewerId();
  const asked = Array.from(requested);
  requested.clear();

  if (!viewer || asked.length === 0) return;

  const missing = asked.filter((id) => {
    if (inflight.has(id)) return false;
    if (softRevalidate.has(id)) return true;
    if (isCachedPairUpSoftStale(viewer, id)) return true;
    return getCachedPairUp(viewer, id) === undefined;
  });
  if (missing.length === 0) return;

  for (const id of missing) {
    inflight.add(id);
    loadFailed.delete(id);
  }
  try {
    await getMyPairUpsForSources(missing, { bypassCache: true });
    for (const id of missing) {
      loadFailed.delete(id);
      softRevalidate.delete(id);
      const cached = getCachedPairUp(viewer, id);
      const mut = localPairMutation.get(id);
      if (mut) {
        const joined = cached != null;
        if (mut.joined === joined) clearLocalPairUpMutation(id);
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      const e = err as { message?: unknown; code?: unknown; name?: unknown };
      console.warn("[social-status] P2P batch failed", {
        rpc: "get_my_pair_ups_for_sources",
        message: typeof e?.message === "string" ? e.message : String(err),
        code: typeof e?.code === "string" ? e.code : null,
        name: typeof e?.name === "string" ? e.name : null,
        postCount: missing.length,
        hadAnyCache: missing.some(
          (id) => getCachedPairUp(viewer, id) !== undefined
        ),
      });
    }
    for (const id of missing) {
      if (getCachedPairUp(viewer, id) === undefined) {
        loadFailed.add(id);
      }
    }
    toast.error("Couldn't load P2P status.");
  } finally {
    for (const id of missing) inflight.delete(id);
    emit();
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = globalThis.setTimeout(() => void flush(), FLUSH_MS) as unknown as number;
}

export function requestPairUpJoinState(postId: string): void {
  if (!postId) return;
  ensureViewerSubscription();
  if (viewerId === null && !lastConfirmedUserId) return;
  const uid = effectiveUserId();
  if (!uid) return;

  rehydratePostFromPersist(uid, postId);

  if (
    getCachedPairUp(uid, postId) !== undefined &&
    !softRevalidate.has(postId) &&
    !isCachedPairUpSoftStale(uid, postId)
  ) {
    loadFailed.delete(postId);
    return;
  }
  if (inflight.has(postId)) return;
  requested.add(postId);
  scheduleFlush();
}

export function getPairUpJoinStatus(postId: string): PairUpJoinStatus {
  if (viewerId === null && !lastConfirmedUserId) return "idle";
  const uid = effectiveUserId();
  if (!uid) return "pending";
  rehydratePostFromPersist(uid, postId);
  const cached = getCachedPairUp(uid, postId);
  if (cached === undefined) return "pending";
  return cached ? "joined" : "idle";
}

export function isPairUpJoinStateResolving(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) {
    if (viewerId === null) return false;
    return true;
  }
  rehydratePostFromPersist(uid, postId);
  if (getCachedPairUp(uid, postId) !== undefined) return false;
  if (loadFailed.has(postId)) return false;
  return true;
}

export function isPairUpJoinStateLoadFailed(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) return false;
  if (getCachedPairUp(uid, postId) !== undefined) return false;
  return loadFailed.has(postId);
}

export function subscribePairUpJoinState(listener: () => void): () => void {
  ensureViewerSubscription();
  subscribers.add(listener);
  const unsubscribeCache = subscribePairUpCache(listener);
  return () => {
    subscribers.delete(listener);
    unsubscribeCache();
  };
}

const OPTIMISTIC_JOIN: Omit<PairUpOpportunity, "source_post_id" | "created_at"> =
  {
    id: "optimistic",
    status: "active",
    description: null,
    discoverable_until: "",
  };

const FEED_SNAPSHOT_JOIN: Omit<PairUpOpportunity, "source_post_id" | "created_at"> =
  {
    id: "feed_snapshot",
    status: "active",
    description: null,
    discoverable_until: "",
  };

/** Explicit join/leave mutations — snapshots must not reverse these. */
const localPairMutation = new Map<string, { joined: boolean; seq: number }>();
let localPairMutationSeq = 0;

function noteLocalPairUpMutation(postId: string, joined: boolean): void {
  if (!postId) return;
  localPairMutation.set(postId, {
    joined,
    seq: ++localPairMutationSeq,
  });
}

/** Successful join/leave — stamps local mutation so in-flight fetches cannot reverse it. */
export function markLocalPairUpMutation(postId: string, joined: boolean): void {
  noteLocalPairUpMutation(postId, joined);
}

function clearLocalPairUpMutation(postId: string): void {
  localPairMutation.delete(postId);
}

function isHydratedPairOpportunity(value: PairUpOpportunity | null): boolean {
  if (!value) return false;
  return value.id !== "optimistic" && value.id !== "feed_snapshot";
}

function isKnownActivePairOpportunity(
  value: PairUpOpportunity | null | undefined
): boolean {
  return value != null && value !== undefined;
}

/**
 * First-paint seed from Feed/Detail snapshot. Keeps known face; marks SWR.
 * Does not clear on subsequent request*.
 * Never demotes known-active / optimistic / hydrated by stale false.
 * Never revives an explicit local leave with stale true.
 */
export function seedPairUpJoinFromSnapshot(
  userId: string,
  postId: string,
  active: boolean
): void {
  if (!userId || !postId) return;
  ensureViewerSubscription();
  if (viewerId === undefined) {
    viewerId = userId;
    lastConfirmedUserId = userId;
  }
  if (typeof viewerId === "string" && viewerId !== userId) return;
  if (lastConfirmedUserId && lastConfirmedUserId !== userId) return;

  const mutation = localPairMutation.get(postId);
  if (mutation && mutation.joined !== active) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  if (mutation && mutation.joined === active) {
    clearLocalPairUpMutation(postId);
  }

  const existing = getCachedPairUp(userId, postId);
  if (existing !== undefined && isHydratedPairOpportunity(existing)) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  // Stale false must not demote optimistic / feed_snapshot / known active.
  if (isKnownActivePairOpportunity(existing) && !active) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  // Stale true must not revive explicit null after leave (mutation covers this;
  // also protect bare null when mutation still present — handled above).
  const snapshotMatches =
    existing === null
      ? !active
      : existing?.id === "feed_snapshot"
        ? active
        : false;
  if (snapshotMatches) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }

  setCachedPairUp(
    userId,
    postId,
    active
      ? {
          ...FEED_SNAPSHOT_JOIN,
          source_post_id: postId,
          created_at: new Date().toISOString(),
        }
      : null
  );
  softRevalidate.add(postId);
  loadFailed.delete(postId);
}

/**
 * Surface already knows viewer Duo is active — seed before Post Detail nav.
 * Does not invent state when store already has an authoritative hydrate.
 */
export function seedKnownActivePairUpBeforeDetail(
  userId: string,
  postId: string
): void {
  if (!userId || !postId) return;
  seedPairUpJoinFromSnapshot(userId, postId, true);
}

/**
 * Apply a Pair Up batch/hydrate result. Explicit local join/leave mutations win
 * over older in-flight fetches that disagree.
 */
export function applyFetchedPairUpJoinState(
  userId: string,
  postId: string,
  opportunity: PairUpOpportunity | null
): boolean {
  if (!userId || !postId) return false;
  const joined = opportunity != null;
  const mut = localPairMutation.get(postId);
  if (mut && mut.joined !== joined) {
    // Newer explicit local mutation — ignore conflicting server write.
    return false;
  }
  if (mut && mut.joined === joined) {
    clearLocalPairUpMutation(postId);
  }
  setCachedPairUp(userId, postId, opportunity);
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  return true;
}

export function setOptimisticPairUpJoinState(
  postId: string,
  joined: boolean
): (() => void) | null {
  const viewer = effectiveUserId();
  if (!viewer || !postId) return null;
  const previous = getCachedPairUp(viewer, postId) ?? null;
  const previousMutation = localPairMutation.get(postId) ?? null;
  noteLocalPairUpMutation(postId, joined);
  setCachedPairUp(
    viewer,
    postId,
    joined
      ? {
          ...OPTIMISTIC_JOIN,
          source_post_id: postId,
          created_at: new Date().toISOString(),
        }
      : null
  );
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  return () => {
    setCachedPairUp(viewer, postId, previous);
    if (previousMutation) {
      localPairMutation.set(postId, previousMutation);
    } else {
      clearLocalPairUpMutation(postId);
    }
  };
}

export function patchCachedPairUpDescription(
  postId: string,
  description: string | null
): void {
  const viewer = effectiveUserId();
  if (!viewer || !postId) return;
  const current = getCachedPairUp(viewer, postId);
  if (!current) return;
  setCachedPairUp(viewer, postId, { ...current, description });
  loadFailed.delete(postId);
}

export function getCachedPairUpDescription(postId: string): string | null {
  const viewer = effectiveUserId();
  if (!viewer || !postId) return null;
  const cached = getCachedPairUp(viewer, postId);
  if (!cached) return null;
  return typeof cached.description === "string" ? cached.description : null;
}

/** Eager hydrate so first useSyncExternalStore snapshot sees known Feed state. */
(function bootstrapSocialPairPersist(): void {
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

export function __setPairUpJoinViewerForTests(
  id: string | null | undefined
): void {
  viewerId = id;
  lastConfirmedUserId = typeof id === "string" ? id : null;
  viewerPromise = Promise.resolve(id ?? null);
  authSubscribed = true;
  if (typeof id === "string") hydrateAllFromPersist(id);
}

export function __resetPairUpJoinStoreForTests(): void {
  softRevalidate.clear();
  requested.clear();
  inflight.clear();
  loadFailed.clear();
  localPairMutation.clear();
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
