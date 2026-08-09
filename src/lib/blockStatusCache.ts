/**
 * Session in-memory cache of auth user ids the viewer has blocked.
 * Used for instant feed filtering and profile shell without per-item DB checks.
 */

import { supabase } from "./supabaseClient";

const BLOCKED_IDS_LOAD_LIMIT = 1000;

export const BLOCK_STATUS_CHANGED_EVENT = "user:blockStatusChanged" as const;

export type BlockStatusChangedDetail = {
  blockedUserId: string;
  blocked: boolean;
};

let blockedUserIds: Set<string> | null = null;
let loadPromise: Promise<Set<string>> | null = null;

export function clearBlockedUserCache(): void {
  blockedUserIds = null;
  loadPromise = null;
}

export function markUserBlocked(userId: string): void {
  if (!userId?.trim()) return;
  if (!blockedUserIds) blockedUserIds = new Set();
  blockedUserIds.add(userId);
}

export function markUserUnblocked(userId: string): void {
  if (!userId?.trim() || !blockedUserIds) return;
  blockedUserIds.delete(userId);
}

/** Merge ids from block list fetch without clearing existing entries. */
export function seedBlockedUserIds(ids: string[]): void {
  if (!ids.length) return;
  if (!blockedUserIds) blockedUserIds = new Set();
  for (const id of ids) {
    if (id?.trim()) blockedUserIds.add(id);
  }
}

export function isUserBlockedLocally(
  userId: string | null | undefined
): boolean {
  if (!userId?.trim() || !blockedUserIds) return false;
  return blockedUserIds.has(userId);
}

async function requireSessionUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

/** Lazy-load viewer's blocked auth user ids (at most once per session unless cleared). */
export async function loadMyBlockedUserIds(): Promise<Set<string>> {
  if (blockedUserIds) return blockedUserIds;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const uid = await requireSessionUserId();
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_user_id")
      .eq("blocker_user_id", uid)
      .limit(BLOCKED_IDS_LOAD_LIMIT);

    if (error) {
      console.error("[blockStatusCache] loadMyBlockedUserIds", error);
      throw error;
    }

    blockedUserIds = new Set(
      (data ?? [])
        .map((row) => row.blocked_user_id)
        .filter((id): id is string => typeof id === "string" && !!id.trim())
    );
    return blockedUserIds;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

export function emitBlockStatusChanged(detail: BlockStatusChangedDetail): void {
  window.dispatchEvent(
    new CustomEvent(BLOCK_STATUS_CHANGED_EVENT, { detail })
  );
}

export function onBlockStatusChanged(
  handler: (detail: BlockStatusChangedDetail) => void
): () => void {
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<BlockStatusChangedDetail>).detail;
    if (
      detail &&
      typeof detail.blockedUserId === "string" &&
      typeof detail.blocked === "boolean"
    ) {
      handler(detail);
    }
  };
  window.addEventListener(BLOCK_STATUS_CHANGED_EVENT, wrapped);
  return () => window.removeEventListener(BLOCK_STATUS_CHANGED_EVENT, wrapped);
}
