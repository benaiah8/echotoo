/**
 * Viewer own Open Plan state across Place surfaces.
 *
 * Cards ask with `requestOpenPlanOwnState`; asks coalesce into one batched
 * `getMyOpenPlansForSources` call. Values live in `openPlanCache` own map.
 *
 * Place Duo persists the same compact own-active bit as Event Duo.
 * KNOWN STALE stays visible (never → UNKNOWN solely from soft TTL).
 */

import { supabase } from "./supabaseClient";
import { getMyOpenPlansForSources } from "../api/services/openPlans";
import {
  getCachedOpenPlanOwn,
  isCachedOpenPlanOwnSoftStale,
  setCachedOpenPlanOwn,
  setCachedOpenPlanOwnFromPersist,
  subscribeOpenPlanCache,
} from "./openPlanCache";
import type { OpenPlanOpportunity } from "./people/types";
import {
  readSocialActionLastUserId,
  readSocialActionPersistBag,
} from "./socialActionPersistCache";

export type OpenPlanOwnStatus = "loading" | "active" | "idle";

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
/** Explicit create/cancel mutations — hydrates must not reverse these. */
const localOpenPlanMutation = new Map<string, { active: boolean; seq: number }>();
let localOpenPlanMutationSeq = 0;
let flushTimer: number | null = null;

function localOpenPlanMutationKey(userId: string, postId: string): string {
  return `${userId}:${postId}`;
}

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

function hydratedOpenPlanStub(
  postId: string,
  userId: string
): OpenPlanOpportunity {
  return {
    id: `persist:${postId}`,
    source_post_id: postId,
    creator_id: userId,
    status: "active",
    description: null,
    occurs_at: "",
    occurs_time_explicit: true,
    discoverable_until: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date(0).toISOString(),
    closed_at: null,
  };
}

function hydrateAllFromPersist(userId: string): void {
  const bag = readSocialActionPersistBag(userId);
  for (const [postId, e] of Object.entries(bag.openPlan ?? {})) {
    if (getCachedOpenPlanOwn(userId, postId) !== undefined) {
      softRevalidate.add(postId);
      continue;
    }
    setCachedOpenPlanOwnFromPersist(
      userId,
      postId,
      e.active ? hydratedOpenPlanStub(postId, userId) : null
    );
    softRevalidate.add(postId);
  }
}

function rehydratePostFromPersist(userId: string, postId: string): boolean {
  if (getCachedOpenPlanOwn(userId, postId) !== undefined) return true;
  const e = readSocialActionPersistBag(userId).openPlan?.[postId];
  if (!e) return false;
  setCachedOpenPlanOwnFromPersist(
    userId,
    postId,
    e.active ? hydratedOpenPlanStub(postId, userId) : null
  );
  softRevalidate.add(postId);
  return true;
}

function clearMemoryControlSets(): void {
  softRevalidate.clear();
  requested.clear();
  inflight.clear();
  loadFailed.clear();
  localOpenPlanMutation.clear();
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
    if (isCachedOpenPlanOwnSoftStale(viewer, id)) return true;
    return getCachedOpenPlanOwn(viewer, id) === undefined;
  });
  if (missing.length === 0) return;

  for (const id of missing) {
    inflight.add(id);
    loadFailed.delete(id);
  }
  try {
    await getMyOpenPlansForSources(missing, { bypassCache: true });
    for (const id of missing) {
      loadFailed.delete(id);
      softRevalidate.delete(id);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      const e = err as { message?: unknown; code?: unknown; name?: unknown };
      console.warn("[social-status] Open Plan batch failed", {
        rpc: "get_my_open_plans_for_sources",
        message: typeof e?.message === "string" ? e.message : String(err),
        code: typeof e?.code === "string" ? e.code : null,
        name: typeof e?.name === "string" ? e.name : null,
        postCount: missing.length,
        hadAnyCache: missing.some(
          (id) => getCachedOpenPlanOwn(viewer, id) !== undefined
        ),
      });
    }
    for (const id of missing) {
      if (getCachedOpenPlanOwn(viewer, id) === undefined) {
        loadFailed.add(id);
      }
    }
    // Background hydrate/revalidate: keep cache / loadFailed; no global toast.
  } finally {
    for (const id of missing) inflight.delete(id);
    emit();
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = globalThis.setTimeout(() => void flush(), FLUSH_MS) as unknown as number;
}

export function isOpenPlanOwnViewerSignedIn(): boolean {
  return typeof effectiveUserId() === "string";
}

export function isOpenPlanOwnViewerSignedOut(): boolean {
  return viewerId === null && !lastConfirmedUserId;
}

export function requestOpenPlanOwnState(postId: string): void {
  if (!postId) return;
  ensureViewerSubscription();
  if (viewerId === null && !lastConfirmedUserId) return;
  const uid = effectiveUserId();
  if (!uid) return;

  rehydratePostFromPersist(uid, postId);

  if (
    getCachedOpenPlanOwn(uid, postId) !== undefined &&
    !softRevalidate.has(postId) &&
    !isCachedOpenPlanOwnSoftStale(uid, postId)
  ) {
    loadFailed.delete(postId);
    return;
  }
  if (inflight.has(postId)) return;
  requested.add(postId);
  scheduleFlush();
}

export function getOpenPlanOwnStatus(postId: string): OpenPlanOwnStatus {
  if (viewerId === null && !lastConfirmedUserId) return "idle";
  const uid = effectiveUserId();
  if (!uid) return "idle";
  rehydratePostFromPersist(uid, postId);
  const cached = getCachedOpenPlanOwn(uid, postId);
  if (cached === undefined) {
    if (loadFailed.has(postId)) return "idle";
    return "loading";
  }
  return cached ? "active" : "idle";
}

export function isOpenPlanOwnStateResolving(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) return false;
  rehydratePostFromPersist(uid, postId);
  if (getCachedOpenPlanOwn(uid, postId) !== undefined) return false;
  if (loadFailed.has(postId)) return false;
  return true;
}

export function isOpenPlanOwnStateLoadFailed(postId: string): boolean {
  if (!postId) return false;
  const uid = effectiveUserId();
  if (!uid) return false;
  if (getCachedOpenPlanOwn(uid, postId) !== undefined) return false;
  return loadFailed.has(postId);
}

export function getOpenPlanOwnOpportunity(
  postId: string
): OpenPlanOpportunity | null {
  const uid = effectiveUserId();
  if (!uid || !postId) return null;
  return getCachedOpenPlanOwn(uid, postId) ?? null;
}

export function subscribeOpenPlanOwnState(listener: () => void): () => void {
  ensureViewerSubscription();
  subscribers.add(listener);
  const unsubscribeCache = subscribeOpenPlanCache(listener);
  return () => {
    subscribers.delete(listener);
    unsubscribeCache();
  };
}

export function setOptimisticOpenPlanOwnState(
  postId: string,
  opportunity: OpenPlanOpportunity | null
): (() => void) | null {
  const viewer = effectiveUserId();
  if (!viewer || !postId) return null;
  const mutKey = localOpenPlanMutationKey(viewer, postId);
  const previous = getCachedOpenPlanOwn(viewer, postId) ?? null;
  const previousMutation = localOpenPlanMutation.get(mutKey) ?? null;
  noteLocalOpenPlanMutation(postId, opportunity != null);
  setCachedOpenPlanOwn(viewer, postId, opportunity);
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  return () => {
    setCachedOpenPlanOwn(viewer, postId, previous);
    if (previousMutation) {
      localOpenPlanMutation.set(mutKey, previousMutation);
    } else {
      localOpenPlanMutation.delete(mutKey);
    }
  };
}

/**
 * True when id is a real server opportunity UUID — not feed_snapshot / persist / optimistic.
 */
export function isRealOpenPlanOpportunityId(
  id: string | null | undefined
): boolean {
  if (!id || typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed) return false;
  if (trimmed === "feed_snapshot" || trimmed === "optimistic") return false;
  if (trimmed.startsWith("persist:")) return false;
  return true;
}

function noteLocalOpenPlanMutation(postId: string, active: boolean): void {
  if (!postId) return;
  const viewer = effectiveUserId();
  if (!viewer) return;
  localOpenPlanMutation.set(localOpenPlanMutationKey(viewer, postId), {
    active,
    seq: ++localOpenPlanMutationSeq,
  });
}

/** Successful create/cancel — stamps local mutation so in-flight hydrates cannot reverse it. */
export function markLocalOpenPlanMutation(
  postId: string,
  active: boolean
): void {
  noteLocalOpenPlanMutation(postId, active);
}

/**
 * Apply a get-mine / batch hydrate result. Explicit local create/cancel mutations
 * win over older in-flight fetches that disagree.
 */
export function applyFetchedOpenPlanOwnState(
  userId: string,
  postId: string,
  opportunity: OpenPlanOpportunity | null
): boolean {
  if (!userId || !postId) return false;
  const active = opportunity != null;
  const mutKey = localOpenPlanMutationKey(userId, postId);
  const mut = localOpenPlanMutation.get(mutKey);
  if (mut && mut.active !== active) {
    // Newer explicit local mutation — ignore conflicting server write.
    return false;
  }
  if (mut && mut.active && opportunity) {
    // Create/recreate stamp: ignore a different active opportunity id
    // (stale pre-recreate or older plan for the same source).
    const existing = getCachedOpenPlanOwn(userId, postId);
    if (
      existing &&
      isRealOpenPlanOpportunityId(existing.id) &&
      isRealOpenPlanOpportunityId(opportunity.id) &&
      existing.id !== opportunity.id
    ) {
      return false;
    }
  }
  if (mut && mut.active === active) {
    localOpenPlanMutation.delete(mutKey);
  }
  setCachedOpenPlanOwn(userId, postId, opportunity);
  softRevalidate.delete(postId);
  loadFailed.delete(postId);
  return true;
}

const FEED_SNAPSHOT_OPEN_PLAN: Omit<
  OpenPlanOpportunity,
  "source_post_id" | "created_at" | "creator_id"
> = {
  id: "feed_snapshot",
  status: "active",
  description: null,
  occurs_at: "",
  occurs_time_explicit: true,
  discoverable_until: "",
  closed_at: null,
};

function isHydratedOpenPlan(value: OpenPlanOpportunity | null): boolean {
  if (!value) return false;
  return isRealOpenPlanOpportunityId(value.id);
}

export function seedOpenPlanOwnFromSnapshot(
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

  const mutation = localOpenPlanMutation.get(
    localOpenPlanMutationKey(userId, postId)
  );
  if (mutation && mutation.active !== active) {
    softRevalidate.add(postId);
    loadFailed.delete(postId);
    return;
  }
  if (mutation && mutation.active === active) {
    localOpenPlanMutation.delete(localOpenPlanMutationKey(userId, postId));
  }

  const existing = getCachedOpenPlanOwn(userId, postId);
  if (existing !== undefined && isHydratedOpenPlan(existing)) {
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

  setCachedOpenPlanOwn(
    userId,
    postId,
    active
      ? {
          ...FEED_SNAPSHOT_OPEN_PLAN,
          creator_id: userId,
          source_post_id: postId,
          created_at: new Date().toISOString(),
        }
      : null
  );
  softRevalidate.add(postId);
  loadFailed.delete(postId);
}

(function bootstrapSocialOpenPlanPersist(): void {
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

export function __setOpenPlanOwnViewerForTests(
  id: string | null | undefined
): void {
  viewerId = id;
  lastConfirmedUserId = typeof id === "string" ? id : null;
  viewerPromise = Promise.resolve(id ?? null);
  authSubscribed = true;
  if (typeof id === "string") hydrateAllFromPersist(id);
}

export function __resetOpenPlanOwnStoreForTests(): void {
  softRevalidate.clear();
  requested.clear();
  inflight.clear();
  loadFailed.clear();
  localOpenPlanMutation.clear();
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
