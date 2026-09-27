/**
 * Share S2A — selection keys, person↔DM merge, canonicalize, concurrency, sticky client ids.
 * Pure orchestration helpers (no React).
 */

import {
  createClientMessageId,
  getOrCreateDirectConversation,
  isDmStrangerLimitError,
  sendSharedPostMessage,
  type InboxConversationRow,
} from "../api/services/messaging";

export const SHARE_DESTINATION_MAX = 15;
export const SHARE_NOTE_MAX = 200;
export const SHARE_SEND_CONCURRENCY = 3;
export const SHARE_GROUP_TITLE_MAX = 80;

/** Per Send click — sticky client ids + successes only within this attempt. */
export type ShareSendAttempt = {
  mode: "separate" | "new_group";
  clientIdsByConversation: Map<string, string>;
  succeededConversationIds: Set<string>;
  failedKeys: string[];
  createdGroupConversationId?: string;
};

export function createShareSendAttempt(
  mode: "separate" | "new_group"
): ShareSendAttempt {
  return {
    mode,
    clientIdsByConversation: new Map(),
    succeededConversationIds: new Set(),
    failedKeys: [],
  };
}

export const VISIBILITY_SHARE_ERROR_FRAGMENT =
  "can't be shared with everyone in this conversation";

/** Presentation-only preview for group tiles (from inbox member_preview). */
export type ShareMemberPreview = {
  userId: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
};

export type ShareDestination =
  | {
      key: `conversation:${string}`;
      kind: "conversation";
      conversationId: string;
      conversationKind: "direct" | "group";
      label: string;
      avatarUrl: string | null;
      otherUserId: string | null;
      /**
       * Group only: up to 3 members from inbox `member_preview`.
       * null = backend omitted / unknown (loading).
       * [] = confirmed empty. Undefined for direct.
       */
      memberPreview?: ShareMemberPreview[] | null;
    }
  | {
      key: `person:${string}`;
      kind: "person";
      userId: string;
      label: string;
      avatarUrl: string | null;
    };

/** Map inbox member_preview → ShareMemberPreview (max 3). null stays null. */
export function shareMemberPreviewFromInbox(
  preview: InboxConversationRow["member_preview"]
): ShareMemberPreview[] | null {
  if (preview == null) return null;
  if (!Array.isArray(preview)) return null;
  const out: ShareMemberPreview[] = [];
  for (const m of preview) {
    if (!m || typeof m !== "object") continue;
    const userId =
      typeof m.user_id === "string" ? m.user_id.trim() : "";
    if (!userId) continue;
    out.push({
      userId,
      avatarUrl: m.avatar_url ?? null,
      displayName: m.display_name ?? null,
      username: m.username ?? null,
    });
    if (out.length >= 3) break;
  }
  return out;
}

/** Person or direct-with-otherUserId (group tiles never qualify). */
export function isGroupComposableDestination(
  dest: ShareDestination
): boolean {
  if (dest.kind === "person") {
    return dest.userId.trim().length > 0;
  }
  return (
    dest.conversationKind === "direct" &&
    (dest.otherUserId?.trim().length ?? 0) > 0
  );
}

/**
 * ≥2 destinations, all person or direct-with-otherUserId, no existing groups.
 * Uses held destination fields only (no extra reads).
 */
export function isGroupComposableSelection(
  destinations: ShareDestination[]
): boolean {
  if (destinations.length < 2) return false;
  return destinations.every(isGroupComposableDestination);
}

/** @deprecated Prefer isGroupComposableSelection */
export function canSendToNewGroup(
  destinations: ShareDestination[]
): boolean {
  return isGroupComposableSelection(destinations);
}

/**
 * Auth user ids for createGroupConversation from person.userId + direct.otherUserId.
 * Skips groups; optionally excludes viewer.
 */
export function groupMemberUserIdsFromDestinations(
  destinations: ShareDestination[],
  excludeViewerUserId?: string | null
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const exclude = (excludeViewerUserId ?? "").trim();

  for (const d of destinations) {
    let id = "";
    if (d.kind === "person") {
      id = d.userId.trim();
    } else if (d.conversationKind === "direct" && d.otherUserId) {
      id = d.otherUserId.trim();
    }
    if (!id || seen.has(id)) continue;
    if (exclude && id === exclude) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** @deprecated Prefer groupMemberUserIdsFromDestinations */
export function personUserIdsFromDestinations(
  destinations: ShareDestination[]
): string[] {
  return groupMemberUserIdsFromDestinations(destinations);
}

export type ShareActionLayout = "send" | "dual" | "send_separately";

/** Locked S2C action matrix for selection count > 0. */
export function deriveShareActionLayout(
  destinations: ShareDestination[]
): ShareActionLayout {
  if (destinations.length <= 1) return "send";
  if (isGroupComposableSelection(destinations)) return "dual";
  return "send_separately";
}

export function conversationDestinationKey(
  conversationId: string
): `conversation:${string}` {
  return `conversation:${conversationId}`;
}

export function personDestinationKey(userId: string): `person:${string}` {
  return `person:${userId}`;
}

export function inboxRowTitle(row: InboxConversationRow): string {
  if (row.kind === "group") {
    return row.title?.trim() || "Group";
  }
  return (
    row.display_name?.trim() ||
    row.username?.trim() ||
    row.title?.trim() ||
    "Chat"
  );
}

export function destinationFromInboxRow(
  row: InboxConversationRow
): Extract<ShareDestination, { kind: "conversation" }> {
  const conversationKind =
    row.kind === "group" ? "group" : ("direct" as const);
  const conversationId = row.conversation_id;
  const dest: Extract<ShareDestination, { kind: "conversation" }> = {
    key: conversationDestinationKey(conversationId),
    kind: "conversation",
    conversationId,
    conversationKind,
    label: inboxRowTitle(row),
    avatarUrl: row.avatar_url ?? null,
    otherUserId:
      conversationKind === "direct" ? row.other_user_id?.trim() || null : null,
  };
  if (conversationKind === "group") {
    dest.memberPreview = shareMemberPreviewFromInbox(row.member_preview);
  }
  return dest;
}

export function personDestination(input: {
  userId: string;
  label: string;
  avatarUrl?: string | null;
}): Extract<ShareDestination, { kind: "person" }> {
  const userId = input.userId.trim();
  return {
    key: personDestinationKey(userId),
    kind: "person",
    userId,
    label: input.label.trim() || "Member",
    avatarUrl: input.avatarUrl ?? null,
  };
}

/** Selection-time merge: adding a conversation removes matching person. */
export function selectConversationDestination(
  selected: Map<string, ShareDestination>,
  dest: Extract<ShareDestination, { kind: "conversation" }>,
  max: number = SHARE_DESTINATION_MAX
): { next: Map<string, ShareDestination>; blockedReason?: string } {
  const next = new Map(selected);
  if (next.has(dest.key)) {
    return { next };
  }
  if (dest.otherUserId) {
    next.delete(personDestinationKey(dest.otherUserId));
  }
  if (next.size >= max && !next.has(dest.key)) {
    return {
      next: selected,
      blockedReason: "You can share to up to 15 chats",
    };
  }
  next.set(dest.key, dest);
  return { next };
}

/**
 * Selection-time merge: adding a person no-ops if their DM is already selected.
 */
export function selectPersonDestination(
  selected: Map<string, ShareDestination>,
  dest: Extract<ShareDestination, { kind: "person" }>,
  max: number = SHARE_DESTINATION_MAX
): {
  next: Map<string, ShareDestination>;
  blockedReason?: string;
  alreadyCovered?: boolean;
} {
  for (const d of selected.values()) {
    if (
      d.kind === "conversation" &&
      d.conversationKind === "direct" &&
      d.otherUserId === dest.userId
    ) {
      return { next: selected, alreadyCovered: true };
    }
  }
  if (selected.has(dest.key)) {
    return { next: selected };
  }
  if (selected.size >= max) {
    return {
      next: selected,
      blockedReason: "You can share to up to 15 chats",
    };
  }
  const next = new Map(selected);
  next.set(dest.key, dest);
  return { next };
}

export function rpcLikeMessage(error: unknown, fallback: string): string {
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function shareWaitingForReplyCopy(label: string): string {
  const name = label.trim();
  if (!name) return "Waiting for them to reply.";
  return `Waiting for ${name} to reply.`;
}

export function shareFailureCopy(
  label: string,
  error: unknown
): string {
  if (isDmStrangerLimitError(error)) {
    return shareWaitingForReplyCopy(label);
  }
  const raw = rpcLikeMessage(error, "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("dm_direct_access_denied") ||
    lower.includes("cannot message")
  ) {
    return "Messaging is unavailable.";
  }
  if (
    raw.toLowerCase().includes(VISIBILITY_SHARE_ERROR_FRAGMENT.toLowerCase())
  ) {
    return `Couldn't share to ${label}`;
  }
  if (raw.trim()) {
    // Prefer short destination-scoped copy for privacy; keep generic business messages short.
    if (
      lower.includes("not a member") ||
      lower.includes("not authenticated") ||
      lower.includes("note is too long")
    ) {
      return `Couldn't share to ${label}`;
    }
  }
  return `Couldn't share to ${label}`;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, concurrency);

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await worker(items[i]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    runOne()
  );
  await Promise.all(runners);
  return results;
}

export type CanonicalizeResult = {
  /** Unique conversation ids ready to send */
  conversationIds: string[];
  /** Labels keyed by conversation id (for errors/toasts) */
  labelsByConversationId: Map<string, string>;
  /** Person key → resolved conversation id when getOrCreate succeeded */
  personKeyToConversationId: Map<string, string>;
  /** Person keys that failed getOrCreate */
  personResolveFailures: Array<{ key: string; label: string; error: unknown }>;
};

/**
 * Resolve people → DMs, then unique conversation ids.
 * Sticky client ids are managed by the caller via ensureClientMessageId.
 */
export async function canonicalizeShareDestinations(
  destinations: ShareDestination[],
  concurrency: number = SHARE_SEND_CONCURRENCY
): Promise<CanonicalizeResult> {
  const labelsByConversationId = new Map<string, string>();
  const conversationIds: string[] = [];
  const personKeyToConversationId = new Map<string, string>();
  const personResolveFailures: CanonicalizeResult["personResolveFailures"] =
    [];

  for (const d of destinations) {
    if (d.kind === "conversation") {
      conversationIds.push(d.conversationId);
      labelsByConversationId.set(d.conversationId, d.label);
    }
  }

  const people = destinations.filter(
    (d): d is Extract<ShareDestination, { kind: "person" }> =>
      d.kind === "person"
  );

  await runWithConcurrency(people, concurrency, async (person) => {
    const { data, error } = await getOrCreateDirectConversation(person.userId);
    if (error || !data?.conversation_id) {
      personResolveFailures.push({
        key: person.key,
        label: person.label,
        error: error ?? new Error("Could not open conversation"),
      });
      return;
    }
    personKeyToConversationId.set(person.key, data.conversation_id);
    conversationIds.push(data.conversation_id);
    if (!labelsByConversationId.has(data.conversation_id)) {
      labelsByConversationId.set(data.conversation_id, person.label);
    }
  });

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of conversationIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  return {
    conversationIds: unique,
    labelsByConversationId,
    personKeyToConversationId,
    personResolveFailures,
  };
}

export function ensureClientMessageId(
  attemptClientIds: Map<string, string>,
  conversationId: string
): string {
  const existing = attemptClientIds.get(conversationId);
  if (existing) return existing;
  const id = createClientMessageId();
  attemptClientIds.set(conversationId, id);
  return id;
}

export type ShareSendItemResult = {
  conversationId: string;
  label: string;
  ok: boolean;
  error?: unknown;
};

export async function sendSharedPostToConversations(input: {
  conversationIds: string[];
  labelsByConversationId: Map<string, string>;
  postId: string;
  note: string | null;
  attemptClientIds: Map<string, string>;
  concurrency?: number;
}): Promise<ShareSendItemResult[]> {
  const {
    conversationIds,
    labelsByConversationId,
    postId,
    note,
    attemptClientIds,
    concurrency = SHARE_SEND_CONCURRENCY,
  } = input;

  return runWithConcurrency(conversationIds, concurrency, async (conversationId) => {
    const label =
      labelsByConversationId.get(conversationId)?.trim() || "chat";
    const clientMessageId = ensureClientMessageId(
      attemptClientIds,
      conversationId
    );
    const { data, error } = await sendSharedPostMessage(
      conversationId,
      postId,
      note,
      clientMessageId
    );
    if (error || !data) {
      return { conversationId, label, ok: false, error: error ?? new Error("Send failed") };
    }
    return { conversationId, label, ok: true };
  });
}

export function filterInboxRowsByQuery(
  rows: InboxConversationRow[],
  query: string
): InboxConversationRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const title = inboxRowTitle(row).toLowerCase();
    const username = (row.username ?? "").toLowerCase();
    const display = (row.display_name ?? "").toLowerCase();
    const groupTitle = (row.title ?? "").toLowerCase();
    return (
      title.includes(q) ||
      username.includes(q) ||
      display.includes(q) ||
      groupTitle.includes(q)
    );
  });
}

/**
 * Unified grid order: recent (filtered when searching) first, then people
 * whose user id is not already covered by a recent DM other_user_id.
 */
export function mergeShareGridDestinations(input: {
  recentRows: InboxConversationRow[];
  searchQuery: string;
  people: Array<{
    userId: string;
    label: string;
    avatarUrl?: string | null;
  }>;
}): ShareDestination[] {
  const q = input.searchQuery.trim();
  const recentSource = q
    ? filterInboxRowsByQuery(input.recentRows, q)
    : input.recentRows;

  const out: ShareDestination[] = [];
  const coveredUserIds = new Set<string>();

  for (const row of recentSource) {
    const dest = destinationFromInboxRow(row);
    out.push(dest);
    if (dest.conversationKind === "direct" && dest.otherUserId) {
      coveredUserIds.add(dest.otherUserId);
    }
  }

  if (!q) return out;

  for (const p of input.people) {
    const userId = p.userId.trim();
    if (!userId || coveredUserIds.has(userId)) continue;
    out.push(
      personDestination({
        userId,
        label: p.label,
        avatarUrl: p.avatarUrl,
      })
    );
  }

  return out;
}
