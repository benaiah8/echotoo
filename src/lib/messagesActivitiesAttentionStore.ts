/**
 * M4.3 — in-memory viewer-scoped Activities attention for the Messages tab dot.
 * SoT: latest eligible activity created_at vs persisted lastActivitiesVisitedAt.
 * Does not persist the visit timestamp (see messagesActivitiesVisitPrefs).
 */

import { useSyncExternalStore } from "react";
import { getLatestEligibleActivityCreatedAt } from "../api/services/notifications";
import { getLastActivitiesVisitedAt } from "./messagesActivitiesVisitPrefs";

type AttentionState = {
  viewerUserId: string | null;
  hasNewActivities: boolean;
  overlayOpen: boolean;
  latestEligibleCreatedAtMs: number | null;
};

const listeners = new Set<() => void>();

let state: AttentionState = {
  viewerUserId: null,
  hasNewActivities: false,
  overlayOpen: false,
  latestEligibleCreatedAtMs: null,
};

/** Bumped on clear so in-flight hydrates cannot repopulate a previous viewer. */
let attentionEpoch = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function deriveHasNew(
  viewerUserId: string | null,
  latestMs: number | null,
  overlayOpen: boolean
): boolean {
  if (overlayOpen) return false;
  if (!viewerUserId) return false;
  if (latestMs == null) return false;
  const lastVisit = getLastActivitiesVisitedAt(viewerUserId);
  if (lastVisit == null) return true;
  return latestMs > lastVisit;
}

function setState(next: AttentionState): void {
  if (
    state.viewerUserId === next.viewerUserId &&
    state.hasNewActivities === next.hasNewActivities &&
    state.overlayOpen === next.overlayOpen &&
    state.latestEligibleCreatedAtMs === next.latestEligibleCreatedAtMs
  ) {
    return;
  }
  state = next;
  emit();
}

export function getHasNewActivities(): boolean {
  return state.hasNewActivities;
}

export function getLatestEligibleActivityMs(): number | null {
  return state.latestEligibleCreatedAtMs;
}

function getHasNewSnapshot(): boolean {
  return getHasNewActivities();
}

function getHasNewServerSnapshot(): boolean {
  return false;
}

export function useHasNewActivities(): boolean {
  return useSyncExternalStore(
    subscribe,
    getHasNewSnapshot,
    getHasNewServerSnapshot
  );
}

export function clearMessagesActivitiesAttentionStore(): void {
  attentionEpoch += 1;
  setState({
    viewerUserId: null,
    hasNewActivities: false,
    overlayOpen: false,
    latestEligibleCreatedAtMs: null,
  });
}

/** Bind the in-memory viewer immediately so INSERT cannot land on a null/stale store. */
export function bindMessagesActivitiesAttentionViewer(viewerUserId: string): void {
  const vid = (viewerUserId ?? "").trim();
  if (!vid) return;
  if (state.viewerUserId === vid) return;
  setState({
    viewerUserId: vid,
    hasNewActivities: false,
    overlayOpen: false,
    latestEligibleCreatedAtMs: null,
  });
}

/** Immediately hide Activities attention (open overlay / PTR). Visit prefs stay separate. */
export function acknowledgeActivitiesAttention(): void {
  if (!state.hasNewActivities) return;
  setState({
    ...state,
    hasNewActivities: false,
  });
}

export function setActivitiesOverlayOpen(open: boolean): void {
  const overlayOpen = open === true;
  setState({
    ...state,
    overlayOpen,
    hasNewActivities: overlayOpen ? false : state.hasNewActivities,
  });
}

export function applyLatestEligibleActivity(
  viewerUserId: string,
  latestMs: number | null
): void {
  const vid = (viewerUserId ?? "").trim();
  if (!vid) return;
  if (state.viewerUserId !== vid) return;
  setState({
    viewerUserId: vid,
    overlayOpen: state.overlayOpen,
    latestEligibleCreatedAtMs: latestMs,
    hasNewActivities: deriveHasNew(vid, latestMs, state.overlayOpen),
  });
}

/**
 * Limit-1 lookup vs persisted last visit. In-flight deduped by getLatestEligibleActivityCreatedAt.
 */
export async function refreshMessagesActivitiesAttention(
  viewerUserId: string
): Promise<void> {
  const vid = (viewerUserId ?? "").trim();
  if (!vid) return;
  const epoch = attentionEpoch;
  try {
    const latestMs = await getLatestEligibleActivityCreatedAt();
    if (epoch !== attentionEpoch) return;
    applyLatestEligibleActivity(vid, latestMs);
  } catch {
    /* keep prior attention — do not fall back to activityUnread */
  }
}
