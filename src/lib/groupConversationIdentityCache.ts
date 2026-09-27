/**
 * Shared group conversation identity cache (Phase 1).
 * Lightweight title/memberCount/preview/source + optional full members.
 * Persists a small bag (no message bodies) for instant hydrate after reload.
 * Server remains source of truth; callers SWR/revalidate.
 */

import type { ConversationMemberRow } from "../api/services/messaging";
import type { GroupUpSourceContext } from "./people/types";
import { setCachedAvatar } from "./avatarCache";

export const GROUP_IDENTITY_PERSIST_SCHEMA = 1 as const;
/** Soft window — still returned; background revalidate. */
export const GROUP_IDENTITY_SOFT_MS = 5 * 60_000;
/** Hard prune for persisted bag. */
export const GROUP_IDENTITY_HARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_MEMORY = 40;
const MAX_PERSIST = 40;
const MAX_PREVIEW = 3;
const LAST_USER_KEY = "echotoo_group_identity_last_user_v1";

export type GroupMemberPreview = {
  userId: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
  joinedAt?: string | null;
};

export type GroupConversationIdentityEntry = {
  conversationId: string;
  kind: "group";
  title: string | null;
  memberCount: number | null;
  memberPreview?: GroupMemberPreview[];
  members?: ConversationMemberRow[];
  sourceContext?: GroupUpSourceContext | null;
  updatedAt: number;
  membersUpdatedAt?: number;
  /** When memberPreview was last applied from inbox/RPC (not full members). */
  previewUpdatedAt?: number;
};

/** Disk shape — omits full `members` to stay small. */
type PersistedIdentitySlice = {
  conversationId: string;
  kind: "group";
  title: string | null;
  memberCount: number | null;
  memberPreview?: GroupMemberPreview[];
  sourceContext?: GroupUpSourceContext | null;
  updatedAt: number;
  membersUpdatedAt?: number;
  previewUpdatedAt?: number;
};

type PersistBag = {
  v: typeof GROUP_IDENTITY_PERSIST_SCHEMA;
  userId: string;
  byId: Record<string, PersistedIdentitySlice>;
};

export type GroupIdentityUpsertOptions = {
  /** Default true. Bulk inbox seed sets false then flushes once. */
  persist?: boolean;
};

export type GroupIdentityFreshness = "fresh" | "stale";

const memory = new Map<string, GroupConversationIdentityEntry>();

/** Test hook: count of bag writePersistBag calls. */
let __persistWriteCountForTests = 0;

function bagKey(userId: string): string {
  return `echotoo_group_identity_v${GROUP_IDENTITY_PERSIST_SCHEMA}:${userId}`;
}

function cacheKey(viewerUserId: string, conversationId: string): string | null {
  const viewer = (viewerUserId ?? "").trim();
  const id = (conversationId ?? "").trim();
  if (!viewer || !id) return null;
  return `${viewer}:${id}`;
}

function writeLastUserId(userId: string | null): void {
  try {
    if (!userId) localStorage.removeItem(LAST_USER_KEY);
    else localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* private / quota */
  }
}

function emptyBag(userId: string): PersistBag {
  return {
    v: GROUP_IDENTITY_PERSIST_SCHEMA,
    userId,
    byId: {},
  };
}

function isSourceContext(value: unknown): value is GroupUpSourceContext {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.source_post_id === "string" &&
    (o.post_type === "hangout" || o.post_type === "experience")
  );
}

function sanitizePreview(
  list: GroupMemberPreview[] | undefined
): GroupMemberPreview[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const out: GroupMemberPreview[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
    if (!userId) continue;
    out.push({
      userId,
      avatarUrl: raw.avatarUrl ?? null,
      displayName: raw.displayName ?? null,
      username: raw.username ?? null,
      joinedAt: raw.joinedAt ?? null,
    });
    if (out.length >= MAX_PREVIEW) break;
  }
  return out.length > 0 ? out : undefined;
}

function toPersistSlice(
  entry: GroupConversationIdentityEntry
): PersistedIdentitySlice {
  return {
    conversationId: entry.conversationId,
    kind: "group",
    title: entry.title,
    memberCount: entry.memberCount,
    memberPreview: sanitizePreview(entry.memberPreview),
    sourceContext: entry.sourceContext ?? undefined,
    updatedAt: entry.updatedAt,
    membersUpdatedAt: entry.membersUpdatedAt,
    previewUpdatedAt: entry.previewUpdatedAt,
  };
}

function fromPersistSlice(
  slice: PersistedIdentitySlice
): GroupConversationIdentityEntry {
  return {
    conversationId: slice.conversationId,
    kind: "group",
    title: slice.title ?? null,
    memberCount:
      typeof slice.memberCount === "number" ? slice.memberCount : null,
    memberPreview: sanitizePreview(slice.memberPreview),
    sourceContext: isSourceContext(slice.sourceContext)
      ? slice.sourceContext
      : slice.sourceContext === null
        ? null
        : undefined,
    updatedAt: slice.updatedAt,
    membersUpdatedAt: slice.membersUpdatedAt,
    previewUpdatedAt: slice.previewUpdatedAt,
  };
}

function readPersistBag(userId: string): PersistBag {
  try {
    const raw = localStorage.getItem(bagKey(userId));
    if (!raw) return emptyBag(userId);
    const parsed = JSON.parse(raw) as Partial<PersistBag>;
    if (
      !parsed ||
      parsed.v !== GROUP_IDENTITY_PERSIST_SCHEMA ||
      parsed.userId !== userId ||
      typeof parsed.byId !== "object" ||
      !parsed.byId
    ) {
      return emptyBag(userId);
    }
    const now = Date.now();
    const byId: Record<string, PersistedIdentitySlice> = {};
    for (const [id, slice] of Object.entries(parsed.byId)) {
      if (!slice || typeof slice !== "object") continue;
      if (slice.kind !== "group") continue;
      if (now - (slice.updatedAt ?? 0) > GROUP_IDENTITY_HARD_TTL_MS) continue;
      byId[id] = {
        conversationId: id,
        kind: "group",
        title: typeof slice.title === "string" ? slice.title : null,
        memberCount:
          typeof slice.memberCount === "number" ? slice.memberCount : null,
        memberPreview: sanitizePreview(slice.memberPreview),
        sourceContext: isSourceContext(slice.sourceContext)
          ? slice.sourceContext
          : undefined,
        updatedAt: slice.updatedAt,
        membersUpdatedAt: slice.membersUpdatedAt,
        previewUpdatedAt:
          typeof slice.previewUpdatedAt === "number"
            ? slice.previewUpdatedAt
            : undefined,
      };
    }
    return { v: GROUP_IDENTITY_PERSIST_SCHEMA, userId, byId };
  } catch {
    return emptyBag(userId);
  }
}

function writePersistBag(bag: PersistBag): void {
  try {
    const entries = Object.values(bag.byId).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
    const trimmed: Record<string, PersistedIdentitySlice> = {};
    for (const slice of entries.slice(0, MAX_PERSIST)) {
      trimmed[slice.conversationId] = slice;
    }
    localStorage.setItem(
      bagKey(bag.userId),
      JSON.stringify({
        v: GROUP_IDENTITY_PERSIST_SCHEMA,
        userId: bag.userId,
        byId: trimmed,
      } satisfies PersistBag)
    );
    writeLastUserId(bag.userId);
    __persistWriteCountForTests += 1;
  } catch {
    /* private / quota */
  }
}

function persistEntry(
  viewerUserId: string,
  entry: GroupConversationIdentityEntry
): void {
  const viewer = viewerUserId.trim();
  if (!viewer) return;
  const bag = readPersistBag(viewer);
  bag.byId[entry.conversationId] = toPersistSlice(entry);
  writePersistBag(bag);
}

/** Write all in-memory identity entries for a viewer to disk in one bag write. */
function persistViewerBagFromMemory(viewerUserId: string): void {
  const viewer = viewerUserId.trim();
  if (!viewer) return;
  const prefix = `${viewer}:`;
  const bag = readPersistBag(viewer);
  for (const [key, entry] of memory) {
    if (!key.startsWith(prefix)) continue;
    bag.byId[entry.conversationId] = toPersistSlice(entry);
  }
  writePersistBag(bag);
}

function touchMemory(
  key: string,
  entry: GroupConversationIdentityEntry
): void {
  memory.delete(key);
  memory.set(key, entry);
  while (memory.size > MAX_MEMORY) {
    const oldest = memory.keys().next().value as string | undefined;
    if (!oldest) break;
    memory.delete(oldest);
  }
}

function hydrateFromDiskIfNeeded(
  viewerUserId: string,
  conversationId: string,
  key: string
): GroupConversationIdentityEntry | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  const bag = readPersistBag(viewerUserId.trim());
  const slice = bag.byId[conversationId];
  if (!slice) return null;
  const entry = fromPersistSlice(slice);
  touchMemory(key, entry);
  return entry;
}

/**
 * Inbox/RPC preview must not replace a preview derived from newer full members.
 * Allow when no full members, or preview stamp is strictly newer than membersUpdatedAt.
 */
function shouldApplyInboxMemberPreview(
  prev: GroupConversationIdentityEntry | null,
  previewUpdatedAt: number | undefined
): boolean {
  if (!prev?.members?.length || typeof prev.membersUpdatedAt !== "number") {
    return true;
  }
  const stamp =
    typeof previewUpdatedAt === "number" && Number.isFinite(previewUpdatedAt)
      ? previewUpdatedAt
      : 0;
  return stamp > prev.membersUpdatedAt;
}

export function deriveMemberPreviewFromMembers(
  members: ConversationMemberRow[]
): GroupMemberPreview[] {
  return [...members]
    .filter((m) => typeof m.user_id === "string" && m.user_id.trim())
    .sort((a, b) => {
      const at = Date.parse(a.joined_at);
      const bt = Date.parse(b.joined_at);
      const aOk = Number.isFinite(at);
      const bOk = Number.isFinite(bt);
      if (aOk && bOk && bt !== at) return bt - at;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return a.user_id.localeCompare(b.user_id);
    })
    .slice(0, MAX_PREVIEW)
    .map((m) => ({
      userId: m.user_id.trim(),
      avatarUrl: m.avatar_url ?? null,
      displayName: m.display_name ?? null,
      username: m.username ?? null,
      joinedAt: m.joined_at ?? null,
    }));
}

function primeAvatarsFromPreview(preview: GroupMemberPreview[] | undefined) {
  if (!preview) return;
  for (const m of preview) {
    const url = (m.avatarUrl ?? "").trim();
    if (url && m.userId) setCachedAvatar(m.userId, url);
  }
}

function primeAvatarsFromMembers(members: ConversationMemberRow[] | undefined) {
  if (!members) return;
  for (const m of members) {
    const url = (m.avatar_url ?? "").trim();
    if (url && m.user_id) setCachedAvatar(m.user_id, url);
  }
}

export function getGroupConversationIdentity(
  viewerUserId: string,
  conversationId: string
): GroupConversationIdentityEntry | null {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return null;
  return (
    memory.get(key) ??
    hydrateFromDiskIfNeeded(viewerUserId, conversationId.trim(), key)
  );
}

export type GroupIdentityPatch = {
  title?: string | null;
  memberCount?: number | null;
  memberPreview?: GroupMemberPreview[] | null;
  /** Stamp for inbox/RPC preview; required to beat newer full members. */
  previewUpdatedAt?: number;
  members?: ConversationMemberRow[] | null;
  sourceContext?: GroupUpSourceContext | null;
  /** When true, bump membersUpdatedAt (full members write). */
  touchMembers?: boolean;
};

/**
 * Merge patch into existing entry (or create). Always kind=group.
 * Omitting a field leaves the previous value.
 */
export function upsertGroupConversationIdentity(
  viewerUserId: string,
  conversationId: string,
  patch: GroupIdentityPatch,
  options?: GroupIdentityUpsertOptions
): GroupConversationIdentityEntry | null {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return null;
  const id = conversationId.trim();
  const prev =
    memory.get(key) ??
    hydrateFromDiskIfNeeded(viewerUserId, id, key) ??
    null;
  const now = Date.now();
  const shouldPersist = options?.persist !== false;

  let members = prev?.members;
  let memberPreview = prev?.memberPreview;
  let membersUpdatedAt = prev?.membersUpdatedAt;
  let previewUpdatedAt = prev?.previewUpdatedAt;
  let memberCount =
    typeof patch.memberCount === "number"
      ? patch.memberCount
      : (prev?.memberCount ?? null);

  if (patch.members !== undefined) {
    if (patch.members === null) {
      members = undefined;
      membersUpdatedAt = undefined;
    } else {
      members = patch.members;
      membersUpdatedAt = now;
      memberPreview = deriveMemberPreviewFromMembers(patch.members);
      previewUpdatedAt = now;
      memberCount = patch.members.length;
      primeAvatarsFromMembers(patch.members);
    }
  } else if (patch.memberPreview !== undefined) {
    if (shouldApplyInboxMemberPreview(prev, patch.previewUpdatedAt)) {
      memberPreview =
        patch.memberPreview === null
          ? undefined
          : sanitizePreview(patch.memberPreview);
      previewUpdatedAt =
        typeof patch.previewUpdatedAt === "number"
          ? patch.previewUpdatedAt
          : now;
      primeAvatarsFromPreview(memberPreview);
    }
    // else: keep members-derived preview; title/count still apply below
  }

  if (patch.touchMembers && members) {
    membersUpdatedAt = now;
  }

  const entry: GroupConversationIdentityEntry = {
    conversationId: id,
    kind: "group",
    title:
      patch.title !== undefined
        ? patch.title?.trim()
          ? patch.title.trim()
          : null
        : (prev?.title ?? null),
    memberCount,
    memberPreview,
    members,
    sourceContext:
      patch.sourceContext !== undefined
        ? patch.sourceContext
        : prev?.sourceContext,
    updatedAt: now,
    membersUpdatedAt,
    previewUpdatedAt,
  };

  touchMemory(key, entry);
  if (shouldPersist) {
    persistEntry(viewerUserId, entry);
  }
  return entry;
}

/** Seed identity rows from inbox list (title + member_count + optional preview). */
export function seedGroupIdentitiesFromInbox(
  viewerUserId: string,
  conversations: Array<{
    conversation_id: string;
    kind: string;
    title?: string | null;
    member_count?: number | null;
    /** Snake_case inbox RPC shape or already-normalized GroupMemberPreview. */
    member_preview?:
      | GroupMemberPreview[]
      | Array<{
          user_id?: string;
          userId?: string;
          avatar_url?: string | null;
          avatarUrl?: string | null;
          display_name?: string | null;
          displayName?: string | null;
          username?: string | null;
          joined_at?: string | null;
          joinedAt?: string | null;
        }>
      | null;
    /** Optional stamp; defaults to seed time when preview is present. */
    preview_updated_at?: number;
  }>
): void {
  const viewer = viewerUserId.trim();
  if (!viewer) return;
  const seedAt = Date.now();
  let touched = false;
  for (const row of conversations) {
    if (row.kind !== "group") continue;
    const id = (row.conversation_id ?? "").trim();
    if (!id) continue;
    const patch: GroupIdentityPatch = {
      title: row.title?.trim() ? row.title.trim() : null,
      memberCount:
        typeof row.member_count === "number" ? row.member_count : null,
    };
    if (Array.isArray(row.member_preview)) {
      const normalized: GroupMemberPreview[] = [];
      for (const raw of row.member_preview) {
        if (!raw || typeof raw !== "object") continue;
        const userId = (
          ("userId" in raw && typeof raw.userId === "string"
            ? raw.userId
            : null) ??
          ("user_id" in raw && typeof raw.user_id === "string"
            ? raw.user_id
            : null) ??
          ""
        ).trim();
        if (!userId) continue;
        normalized.push({
          userId,
          avatarUrl:
            ("avatarUrl" in raw ? raw.avatarUrl : undefined) ??
            ("avatar_url" in raw ? raw.avatar_url : undefined) ??
            null,
          displayName:
            ("displayName" in raw ? raw.displayName : undefined) ??
            ("display_name" in raw ? raw.display_name : undefined) ??
            null,
          username: ("username" in raw ? raw.username : undefined) ?? null,
          joinedAt:
            ("joinedAt" in raw ? raw.joinedAt : undefined) ??
            ("joined_at" in raw ? raw.joined_at : undefined) ??
            null,
        });
        if (normalized.length >= 3) break;
      }
      patch.memberPreview = normalized;
      patch.previewUpdatedAt =
        typeof row.preview_updated_at === "number"
          ? row.preview_updated_at
          : seedAt;
    }
    upsertGroupConversationIdentity(viewer, id, patch, { persist: false });
    touched = true;
  }
  if (touched) {
    persistViewerBagFromMemory(viewer);
  }
}

export function setGroupConversationIdentityMembers(
  viewerUserId: string,
  conversationId: string,
  members: ConversationMemberRow[]
): GroupConversationIdentityEntry | null {
  return upsertGroupConversationIdentity(viewerUserId, conversationId, {
    members,
  });
}

export function setGroupConversationIdentitySourceContext(
  viewerUserId: string,
  conversationId: string,
  sourceContext: GroupUpSourceContext | null
): GroupConversationIdentityEntry | null {
  return upsertGroupConversationIdentity(viewerUserId, conversationId, {
    sourceContext,
  });
}

export function removeGroupConversationIdentity(
  viewerUserId: string,
  conversationId: string
): void {
  const key = cacheKey(viewerUserId, conversationId);
  if (!key) return;
  memory.delete(key);
  const viewer = viewerUserId.trim();
  const id = conversationId.trim();
  if (!viewer || !id) return;
  const bag = readPersistBag(viewer);
  if (bag.byId[id]) {
    delete bag.byId[id];
    writePersistBag(bag);
  }
}

export function clearGroupConversationIdentityCache(
  viewerUserId?: string | null
): void {
  if (viewerUserId?.trim()) {
    const prefix = `${viewerUserId.trim()}:`;
    for (const key of [...memory.keys()]) {
      if (key.startsWith(prefix)) memory.delete(key);
    }
    try {
      localStorage.removeItem(bagKey(viewerUserId.trim()));
    } catch {
      /* ignore */
    }
  } else {
    memory.clear();
    try {
      const last = localStorage.getItem(LAST_USER_KEY)?.trim();
      if (last) localStorage.removeItem(bagKey(last));
      localStorage.removeItem(LAST_USER_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** True when entry is within the soft freshness window (still paint either way). */
export function isGroupIdentityFresh(
  entry: GroupConversationIdentityEntry
): boolean {
  return Date.now() - entry.updatedAt < GROUP_IDENTITY_SOFT_MS;
}

/** Soft-stale: safe to paint; callers may background-revalidate. */
export function isGroupIdentityStale(
  entry: GroupConversationIdentityEntry
): boolean {
  return !isGroupIdentityFresh(entry);
}

export function getGroupIdentityFreshness(
  entry: GroupConversationIdentityEntry
): GroupIdentityFreshness {
  return isGroupIdentityFresh(entry) ? "fresh" : "stale";
}

/** Test-only. */
export function __resetGroupConversationIdentityCacheForTests(): void {
  memory.clear();
  __persistWriteCountForTests = 0;
}

/** Test-only. */
export function __getGroupIdentityPersistWriteCountForTests(): number {
  return __persistWriteCountForTests;
}
