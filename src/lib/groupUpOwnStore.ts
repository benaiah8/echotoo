/**
 * Viewer own Group Up state across Hangout/Experience surfaces.
 * Persistent hydrate + soft revalidate (same pattern as pairUpJoinStore).
 * KNOWN STALE stays visible (never → UNKNOWN solely from soft TTL).
 */

import toast from "react-hot-toast";
import { supabase } from "./supabaseClient";
import { getMyGroupUpsForSources } from "../api/services/groupUp";
import {
  getCachedGroupUpOwn,
  isCachedGroupUpOwnSoftStale,
  setCachedGroupUpOwn,
  setCachedGroupUpOwnFromPersist,
  subscribeGroupUpCache,
} from "./groupUpCache";
import type { GroupUpOpportunity } from "./people/types";
import {
  readSocialActionLastUserId,
  readSocialActionPersistBag,
} from "./socialActionPersistCache";

export type GroupUpOwnStatus = "loading" | "active" | "idle";

const FLUSH_MS = 40;
const LOGOUT_CONFIRM_MS = 400;

let viewerId: string | null | undefined;
let lastConfirmedUserId: string | null = null;
let viewerPromise: Promise<string | null> | null = null;
let authSubscribed = false;
let logoutConfirmTimer: number | null = null;

const requested = new Set<string>();
const inflight = new Set<string>();
const loadFailed = new Set<string>();
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

function hydratedGroupStub(postId: string, userId: string): GroupUpOpportunity {
  return {
    id: `persist:${postId}`,
    source_post_id: postId,
    creator_id: userId,
    conversation_id: `persist-conv:${postId}`,
    status: "active",
    description: null,
    occurs_at: null,
    occurs_time_explicit: true,
    discoverable_until: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date(0).toISOString(),
    closed_at: null,
  };
}

function hydrateAllFromPersist(userId: string): void {
  const bag = readSocialActionPersistBag(userId);
  for (const [postId, e] of Object.entries(bag.groupOwn)) {
    if (getCachedGroupUpOwn(userId, postId) !== undefined) {
      softRevalidate.add(postId);
      continue;
    }
    setCachedGroupUpOwnFromPersist(
      userId,
      postId,
      e.active ? hydratedGroupStub(postId, userId) : null
    );
    softRevalidate.add(postId);
  }
}

function rehydratePostFromPersist(userId: string, postId: string): boolean {
  if (getCachedGroupUpOwn(userId, postId) !== undefined) return true;
  const e = readSocialActionPersistBag(userId).groupOwn[postId];
  if (!e) return false;
  setCachedGroupUpOwnFromPersist(
    userId,
    postId,
    e.active ? hydratedGroupStub(postId, userId) : null
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
  clearMemoryControlSets();
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
        /* keep lastConfirmed */
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
    if (isCachedGroupUpOwnSoftStale(viewer, id)) return true;
    return getCachedGroupUpOwn(viewer, id) === undefined;
  });
  if (missing.length === 0) return;

  for (const id of missing) {
    inflight.add(id);
    loadFailed.delete(id);
  }
  try {
    await getMyGroupUpsForSources(missing, { bypassCache: true });
    for (const id of missing) {
      loadFailed.delete(id);
      softRevalidate.delete(id);
    }
  } catch {
    for (const id of missing) {
      if (getCachedGroupUpOwn(viewer, id) === undefined) {
        loadFailed.add(id);
      }
    }
    toast.error("Couldn't load Group Up status.");
  } finally {
    for (const id of missing) inflight.delete(id);
    emit();
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = globalThis.setTimeout(() => void flush(), FLUSH_MS) as unknown as number;
}

export function isGroupUpOwnViewerSignedIn(): boolean {
  return typeof effectiveUserId() === "string";
}

export function isGroupUpOwnViewerSignedOut(): boolean {
  return viewerId === null && !lastConfirmedUserId;
}

export function requestGroupUpOwnState(postId: string): void {
  if (!postId) return;
  ensureViewerSubscription();
  if (viewerId === null && !lastConfirmedUserId) return;
  const uid = effectiveUserId();
  if (!uid) return;

  rehydratePostFromPersist(uid, postId);

  if (
    getCachedGroupUpOwn(uid, postId) !== undefined &&
    !softRevalidate.has(postId) &&
    !isCachedGroupUpOwnSoftStale(uid, postId)
  ) {
    loadFailed.delete(postId);
    return;
  }
  if (inflight.has(postId)) return;
  requested.add(postId);
  scheduleFlush();
}

export function isGroupUpOwnStateResolving(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) {
    if (viewerId === null) return false;
    return true;
  }
  rehydratePostFromPersist(uid, postId);
  if (getCachedGroupUpOwn(uid, postId) !== undefined) return false;
  if (loadFailed.has(postId)) return false;
  return true;
}

export function getGroupUpOwnStatus(postId: string): GroupUpOwnStatus {
  if (viewerId === null && !lastConfirmedUserId) return "idle";
  const uid = effectiveUserId();
  if (!uid) return "loading";
  rehydratePostFromPersist(uid, postId);
  const cached = getCachedGroupUpOwn(uid, postId);
  if (cached === undefined) {
    if (loadFailed.has(postId)) return "idle";
    return "loading";
  }
  return cached ? "active" : "idle";
}

export function isGroupUpOwnStateLoadFailed(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) return false;
  if (getCachedGroupUpOwn(uid, postId) !== undefined) return false;
  return loadFailed.has(postId);
}

export function getGroupUpOwnOpportunity(
  postId: string
): GroupUpOpportunity | null {
  const uid = effectiveUserId();
  if (!uid || !postId) return null;
  return getCachedGroupUpOwn(uid, postId) ?? null;
}

export function subscribeGroupUpOwnState(listener: () => void): () => void {
  ensureViewerSubscription();
  subscribers.add(listener);
  const unsubscribeCache = subscribeGroupUpCache(listener);
  return () => {
    subscribers.delete(listener);
    unsubscribeCache();
  };
}

/** Explicit create/cancel mutations — snapshots must not reverse these. */
const localGroupMutation = new Map<string, { active: boolean; seq: number }>();
let localGroupMutationSeq = 0;

function noteLocalGroupUpMutation(postId: string, active: boolean): void {
  if (!postId) return;
  localGroupMutation.set(postId, {
    active,
    seq: ++localGroupMutationSeq,
  });
}

function clearLocalGroupUpMutation(postId: string): void {
  localGroupMutation.delete(postId);
}

export function setOptimisticGroupUpOwnState(
  postId: string,
  opportunity: GroupUpOpportunity | null
): (() => void) | null {
  const viewer = effectiveUserId();
  if (!viewer || !postId) return null;
  const previous = getCachedGroupUpOwn(viewer, postId) ?? null;
  const previousMutation = localGroupMutation.get(postId) ?? null;
  noteLocalGroupUpMutation(postId, opportunity != null);
  setCachedGroupUpOwn(viewer, postId, opportunity);
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  return () => {
    setCachedGroupUpOwn(viewer, postId, previous);
    if (previousMutation) {
      localGroupMutation.set(postId, previousMutation);
    } else {
      clearLocalGroupUpMutation(postId);
    }
  };
}

const FEED_SNAPSHOT_GROUP: Omit<
  GroupUpOpportunity,
  "source_post_id" | "created_at"
> = {
  id: "feed_snapshot",
  creator_id: "",
  conversation_id: "",
  status: "active",
  description: null,
  occurs_at: null,
  occurs_time_explicit: true,
  discoverable_until: "",
  closed_at: null,
};

function isHydratedGroupOpportunity(value: GroupUpOpportunity | null): boolean {
  if (!value) return false;
  return value.id !== "feed_snapshot" && value.id !== "optimistic";
}

export function seedGroupUpOwnFromSnapshot(
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

  const mutation = localGroupMutation.get(postId);
  if (mutation && mutation.active !== active) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  if (mutation && mutation.active === active) {
    clearLocalGroupUpMutation(postId);
  }

  const existing = getCachedGroupUpOwn(userId, postId);
  if (existing !== undefined && isHydratedGroupOpportunity(existing)) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  if (existing != null && !active) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
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

  setCachedGroupUpOwn(
    userId,
    postId,
    active
      ? {
          ...FEED_SNAPSHOT_GROUP,
          creator_id: userId,
          source_post_id: postId,
          created_at: new Date().toISOString(),
        }
      : null
  );
  softRevalidate.add(postId);
  loadFailed.delete(postId);
}

/** Surface knows viewer hosts Group — seed before Post Detail nav. */
export function seedKnownActiveGroupUpBeforeDetail(
  userId: string,
  postId: string
): void {
  if (!userId || !postId) return;
  seedGroupUpOwnFromSnapshot(userId, postId, true);
}

(function bootstrapSocialGroupOwnPersist(): void {
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

export function __setGroupUpOwnViewerForTests(
  id: string | null | undefined
): void {
  viewerId = id;
  lastConfirmedUserId = typeof id === "string" ? id : null;
  viewerPromise = Promise.resolve(id ?? null);
  authSubscribed = true;
  if (typeof id === "string") hydrateAllFromPersist(id);
}

export function __resetGroupUpOwnStoreForTests(): void {
  softRevalidate.clear();
  requested.clear();
  inflight.clear();
  loadFailed.clear();
  localGroupMutation.clear();
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
