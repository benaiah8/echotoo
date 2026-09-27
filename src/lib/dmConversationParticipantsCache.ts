/**
 * M3B — viewer-scoped conversation participant ID/metadata cache for group headers.
 * No message bodies. Seeded when People/Settings/mutations load members — not on every open.
 * Preserves real per-member joined_at for latest-joined ordering.
 */

import type { ConversationMemberRow } from "../api/services/messaging";
import { setCachedAvatar } from "./avatarCache";
import {
  clearGroupConversationIdentityCache,
  removeGroupConversationIdentity,
  setGroupConversationIdentityMembers,
} from "./groupConversationIdentityCache";

export type ParticipantMemberMeta = {
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type DmConversationParticipantsEntry = {
  conversationId: string;
  members: ParticipantMemberMeta[];
  memberCount: number;
  updatedAt: number;
};

const MAX_CONVERSATIONS = 8;

const store = new Map<string, DmConversationParticipantsEntry>();

function cacheKey(
  viewerUserId: string,
  conversationId: string
): string | null {
  const viewer = (viewerUserId ?? "").trim();
  const id = (conversationId ?? "").trim();
  if (!viewer || !id) return null;
  return `${viewer}:${id}`;
}

function touchOrder(key: string, entry: DmConversationParticipantsEntry) {
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_CONVERSATIONS) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

function toMeta(m: ConversationMemberRow): ParticipantMemberMeta {
  const joined =
    typeof m.joined_at === "string" && m.joined_at.trim()
      ? m.joined_at.trim()
      : "";
  return {
    user_id: m.user_id,
    role: typeof m.role === "string" ? m.role : String(m.role ?? "member"),
    joined_at: joined,
    display_name: m.display_name ?? null,
    username: m.username ?? null,
    avatar_url: m.avatar_url ?? null,
  };
}

function primeAvatarFromMeta(m: ParticipantMemberMeta) {
  const url = (m.avatar_url ?? "").trim();
  if (url && m.user_id) {
    setCachedAvatar(m.user_id, url);
  }
}

export function getDmConversationParticipantsCache(
  viewerUserId: string,
  conversationId: string
): DmConversationParticipantsEntry | null {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return null;
  return store.get(key) ?? null;
}

/** Convert cache entry to ConversationMemberRow[] for header / People UI. */
export function participantsEntryToMemberRows(
  entry: DmConversationParticipantsEntry
): ConversationMemberRow[] {
  return entry.members.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    display_name: m.display_name,
    username: m.username,
    avatar_url: m.avatar_url,
  }));
}

export function setDmConversationParticipantsCache(
  viewerUserId: string,
  conversationId: string,
  members: ConversationMemberRow[]
): void {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return;
  const metas = members.map(toMeta);
  for (const m of metas) primeAvatarFromMeta(m);
  const entry: DmConversationParticipantsEntry = {
    conversationId: conversationId.trim(),
    members: metas,
    memberCount: metas.length,
    updatedAt: Date.now(),
  };
  touchOrder(key, entry);
  setGroupConversationIdentityMembers(
    viewerUserId,
    conversationId,
    members
  );
}

export function removeDmConversationParticipantsCache(
  viewerUserId: string,
  conversationId: string
): void {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return;
  store.delete(key);
  removeGroupConversationIdentity(viewerUserId, conversationId);
}

export function clearDmConversationParticipantsCache(): void {
  store.clear();
  clearGroupConversationIdentityCache();
}

/** Test-only. */
export function __resetDmConversationParticipantsCacheForTests(): void {
  store.clear();
}
