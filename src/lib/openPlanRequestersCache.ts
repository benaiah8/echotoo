/**
 * Lazy SWR cache for Open Plan requesters keyed by opportunity_id.
 */

import type { OpenPlanRequestersPage } from "./people/types";

const TTL_MS = 120_000;
export const OPEN_PLAN_REQUESTERS_SOFT_STALE_MS = 30_000;

type RequestersCacheEntry = { ts: number; value: OpenPlanRequestersPage };

const requestersCache = new Map<string, RequestersCacheEntry>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOpenPlanRequestersCache(
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

export function openPlanRequestersCacheKey(
  userId: string,
  opportunityId: string
): string {
  return `open_plan_requesters:${userId}:${opportunityId}`;
}

function readEntry(
  userId: string,
  opportunityId: string
): RequestersCacheEntry | undefined {
  const key = openPlanRequestersCacheKey(userId, opportunityId);
  const entry = requestersCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= TTL_MS) {
    requestersCache.delete(key);
    return undefined;
  }
  return entry;
}

export function getCachedOpenPlanRequesters(
  userId: string,
  opportunityId: string
): OpenPlanRequestersPage | undefined {
  return readEntry(userId, opportunityId)?.value;
}

export function getOpenPlanRequestersFetchedAt(
  userId: string,
  opportunityId: string
): number | undefined {
  return readEntry(userId, opportunityId)?.ts;
}

export function isOpenPlanRequestersSoftStale(
  userId: string,
  opportunityId: string
): boolean {
  const fetchedAt = getOpenPlanRequestersFetchedAt(userId, opportunityId);
  if (fetchedAt == null) return true;
  return Date.now() - fetchedAt >= OPEN_PLAN_REQUESTERS_SOFT_STALE_MS;
}

export function setCachedOpenPlanRequesters(
  userId: string,
  opportunityId: string,
  value: OpenPlanRequestersPage
): void {
  requestersCache.set(openPlanRequestersCacheKey(userId, opportunityId), {
    ts: Date.now(),
    value,
  });
  emit();
}

export function invalidateOpenPlanRequesters(
  userId: string,
  opportunityId: string
): void {
  requestersCache.delete(openPlanRequestersCacheKey(userId, opportunityId));
  emit();
}

export function removeFromCachedOpenPlanRequesters(
  userId: string,
  opportunityId: string,
  requestId: string
): void {
  if (!userId || !opportunityId || !requestId) return;
  const key = openPlanRequestersCacheKey(userId, opportunityId);
  const entry = requestersCache.get(key);
  if (!entry) return;
  if (Date.now() - entry.ts >= TTL_MS) {
    requestersCache.delete(key);
    return;
  }
  const nextRequests = entry.value.requests.filter(
    (row) => row.request_id !== requestId
  );
  if (nextRequests.length === entry.value.requests.length) return;
  requestersCache.set(key, {
    ts: entry.ts,
    value: { ...entry.value, requests: nextRequests },
  });
  emit();
}

/** Test helper — clear in-memory cache. */
export function __resetOpenPlanRequestersCacheForTests(): void {
  requestersCache.clear();
}
