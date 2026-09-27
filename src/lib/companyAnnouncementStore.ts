/**
 * App-level in-memory store for company announcements (not Invites / Activity).
 * One shared fetch; BottomTabPeekOwl and modal only subscribe.
 */

import { useSyncExternalStore } from "react";
import {
  fetchCompanyAnnouncementsRuntime,
  markCompanyAnnouncementsSeen,
} from "../api/services/companyAnnouncementsRuntime";
import {
  companyAnnouncementsHaveUnread,
  patchCompanyAnnouncementsSeen,
} from "./companyAnnouncementActive";
import type { CompanyAnnouncementRuntimeItem } from "../types/companyAnnouncement";

export type CompanyAnnouncementStoreState = {
  userId: string | null;
  items: CompanyAnnouncementRuntimeItem[];
  loading: boolean;
  error: string | null;
  modalOpen: boolean;
  fetchedAt: number | null;
};

const listeners = new Set<() => void>();

let state: CompanyAnnouncementStoreState = {
  userId: null,
  items: [],
  loading: false,
  error: null,
  modalOpen: false,
  fetchedAt: null,
};

/** Bumped on clear so in-flight fetches cannot repopulate a previous viewer. */
let storeEpoch = 0;
let inflight: Promise<void> | null = null;
let inflightUserId: string | null = null;

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setState(partial: Partial<CompanyAnnouncementStoreState>): void {
  state = { ...state, ...partial };
  emit();
}

export function getCompanyAnnouncementStoreState(): CompanyAnnouncementStoreState {
  return state;
}

export function getCompanyAnnouncementsHaveUnread(): boolean {
  return companyAnnouncementsHaveUnread(state.items);
}

export function clearCompanyAnnouncementStore(): void {
  storeEpoch += 1;
  inflight = null;
  inflightUserId = null;
  state = {
    userId: null,
    items: [],
    loading: false,
    error: null,
    modalOpen: false,
    fetchedAt: null,
  };
  emit();
}

/** Bind viewer; clears prior user's items when switching accounts. */
export function bindCompanyAnnouncementViewer(userId: string | null): void {
  const uid = (userId ?? "").trim() || null;
  if (state.userId === uid) return;
  storeEpoch += 1;
  inflight = null;
  inflightUserId = null;
  state = {
    userId: uid,
    items: [],
    loading: false,
    error: null,
    modalOpen: false,
    fetchedAt: null,
  };
  emit();
}

export async function hydrateCompanyAnnouncements(options?: {
  force?: boolean;
  minIntervalMs?: number;
}): Promise<void> {
  const uid = state.userId;
  if (!uid) return;

  const minInterval = options?.minIntervalMs ?? 120_000;
  const force = options?.force ?? false;
  if (
    !force &&
    state.fetchedAt != null &&
    Date.now() - state.fetchedAt < minInterval
  ) {
    return;
  }

  if (inflight && inflightUserId === uid) {
    return inflight;
  }

  const epoch = storeEpoch;
  setState({ loading: true, error: null });

  inflightUserId = uid;
  inflight = (async () => {
    try {
      // Full replace from RPC: inactive/expired rows drop out → unread pip clears.
      const items = await fetchCompanyAnnouncementsRuntime();
      if (epoch !== storeEpoch || state.userId !== uid) return;
      setState({
        items,
        loading: false,
        error: null,
        fetchedAt: Date.now(),
      });
    } catch (e) {
      if (epoch !== storeEpoch || state.userId !== uid) return;
      const msg =
        e instanceof Error ? e.message : "Could not load company announcements.";
      setState({ loading: false, error: msg });
    } finally {
      if (inflightUserId === uid) {
        inflight = null;
        inflightUserId = null;
      }
    }
  })();

  return inflight;
}

export function openCompanyAnnouncementModal(): void {
  if (!state.userId) return;
  if (state.modalOpen) return;
  setState({ modalOpen: true });
}

/**
 * Viewer-local dismiss only. Does not set is_active=false or call admin APIs.
 * Seen state is recorded separately via markLoadedCompanyAnnouncementsSeen.
 */
export function closeCompanyAnnouncementModal(): void {
  if (!state.modalOpen) return;
  setState({ modalOpen: false });
}

/**
 * Mark currently loaded unread items as seen (server), then patch local cache.
 * On failure: leave is_seen false so indicator stays / retry is safe.
 */
export async function markLoadedCompanyAnnouncementsSeen(): Promise<{
  ok: boolean;
  markedIds: string[];
}> {
  const unreadIds = state.items
    .filter((i) => !i.is_seen)
    .map((i) => i.id);
  if (!unreadIds.length) return { ok: true, markedIds: [] };

  const epoch = storeEpoch;
  const uid = state.userId;

  try {
    await markCompanyAnnouncementsSeen(unreadIds);
    if (epoch !== storeEpoch || state.userId !== uid) {
      return { ok: false, markedIds: [] };
    }
    setState({
      items: patchCompanyAnnouncementsSeen(state.items, unreadIds),
    });
    return { ok: true, markedIds: unreadIds };
  } catch {
    return { ok: false, markedIds: [] };
  }
}

function getSnapshot(): CompanyAnnouncementStoreState {
  return state;
}

function getServerSnapshot(): CompanyAnnouncementStoreState {
  return {
    userId: null,
    items: [],
    loading: false,
    error: null,
    modalOpen: false,
    fetchedAt: null,
  };
}

export function useCompanyAnnouncementStore(): CompanyAnnouncementStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCompanyAnnouncementsHaveUnread(): boolean {
  return useSyncExternalStore(
    subscribe,
    getCompanyAnnouncementsHaveUnread,
    () => false
  );
}

export function useCompanyAnnouncementModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.modalOpen,
    () => false
  );
}
