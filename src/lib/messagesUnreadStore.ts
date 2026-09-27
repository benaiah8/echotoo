/**
 * M4.1 — in-memory viewer-scoped messaging unread map (bottom-tab dot).
 * Canonical source: conversation_members.unread_count (via inbox RPC + member Realtime).
 */

import { useSyncExternalStore } from "react";
import type { InboxConversationRow } from "../api/services/messaging";

type UnreadState = {
  viewerUserId: string | null;
  unreadByConversationId: Map<string, number>;
  activeConversationId: string | null;
};

const listeners = new Set<() => void>();

let state: UnreadState = {
  viewerUserId: null,
  unreadByConversationId: new Map(),
  activeConversationId: null,
};

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function normalizeUnread(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function mapHasUnread(map: Map<string, number>): boolean {
  for (const count of map.values()) {
    if (count > 0) return true;
  }
  return false;
}

function cloneUnreadMap(map: Map<string, number>): Map<string, number> {
  return new Map(map);
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, count] of a) {
    if (b.get(id) !== count) return false;
  }
  return true;
}

function setState(next: UnreadState): void {
  const viewerChanged = state.viewerUserId !== next.viewerUserId;
  const activeChanged = state.activeConversationId !== next.activeConversationId;
  const mapChanged = !mapsEqual(
    state.unreadByConversationId,
    next.unreadByConversationId
  );
  if (!viewerChanged && !activeChanged && !mapChanged) return;
  state = next;
  emit();
}

export function getHasUnreadMessages(): boolean {
  return mapHasUnread(state.unreadByConversationId);
}

function getHasUnreadSnapshot(): boolean {
  return getHasUnreadMessages();
}

function getHasUnreadServerSnapshot(): boolean {
  return false;
}

export function useHasUnreadMessages(): boolean {
  return useSyncExternalStore(
    subscribe,
    getHasUnreadSnapshot,
    getHasUnreadServerSnapshot
  );
}

export function clearMessagesUnreadStore(): void {
  setState({
    viewerUserId: null,
    unreadByConversationId: new Map(),
    activeConversationId: null,
  });
}

export function setActiveConversationId(id: string | null): void {
  const nextId = id && id.trim() ? id.trim() : null;
  if (state.activeConversationId === nextId) return;
  setState({
    ...state,
    activeConversationId: nextId,
  });
}

/**
 * Authoritative replace from inbox rows (includes Inbox + Requests).
 * Keeps unread ids not present in this page so member events outside the
 * list_my_conversations limit are not dropped.
 */
export function hydrateFromInboxRows(
  viewerId: string,
  rows: InboxConversationRow[]
): void {
  const vid = (viewerId ?? "").trim();
  if (!vid) return;

  const listed = new Set<string>();
  const next = new Map<string, number>();
  for (const row of rows) {
    const id = (row.conversation_id ?? "").trim();
    if (!id) continue;
    listed.add(id);
    const unread = normalizeUnread(row.unread_count);
    if (unread > 0 && id !== state.activeConversationId) {
      next.set(id, unread);
    }
  }

  if (state.viewerUserId === vid) {
    for (const [id, count] of state.unreadByConversationId) {
      if (listed.has(id) || count <= 0) continue;
      if (id === state.activeConversationId) continue;
      next.set(id, count);
    }
  }

  setState({
    viewerUserId: vid,
    unreadByConversationId: next,
    activeConversationId: state.activeConversationId,
  });
}

export function applyMemberUnread(
  conversationId: string,
  unreadCount: number
): void {
  const id = (conversationId ?? "").trim();
  if (!id) return;

  let nextCount = normalizeUnread(unreadCount);
  if (state.activeConversationId === id && nextCount > 0) {
    nextCount = 0;
  }

  const prev = state.unreadByConversationId.get(id) ?? 0;
  if (prev === nextCount) return;

  const next = cloneUnreadMap(state.unreadByConversationId);
  if (nextCount <= 0) next.delete(id);
  else next.set(id, nextCount);

  setState({
    ...state,
    unreadByConversationId: next,
  });
}

export function clearConversationUnread(conversationId: string): void {
  applyMemberUnread(conversationId, 0);
}
