/**
 * Short-lived post patches for feeds that were unmounted when emitPostChanged fired
 * (e.g. admin edit on /create/finalize while Home tab unmounts).
 */

import { applyPostPatch } from "./applyPostPatch";
import type { PostPatch } from "./postEvents";

const STORAGE_KEY = "pending_post_patches_v1" as const;
const SCHEMA_VERSION = 1 as const;
const MAX_QUEUE_SIZE = 50;
const PATCH_TTL_MS = 10 * 60 * 1000;

type PendingEntry = {
  postId: string;
  patch: PostPatch;
  enqueuedAt: number;
};

type QueuePayload = {
  v: typeof SCHEMA_VERSION;
  entries: PendingEntry[];
};

function readQueue(): PendingEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuePayload;
    if (!parsed || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries.filter(
      (e) =>
        e &&
        typeof e.postId === "string" &&
        e.postId.length > 0 &&
        e.patch &&
        typeof e.patch === "object" &&
        typeof e.enqueuedAt === "number"
    );
  } catch {
    return [];
  }
}

function writeQueue(entries: PendingEntry[]): void {
  try {
    if (!entries.length) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: QueuePayload = { v: SCHEMA_VERSION, entries };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

function pruneExpired(entries: PendingEntry[], now = Date.now()): PendingEntry[] {
  return entries.filter((e) => now - e.enqueuedAt <= PATCH_TTL_MS);
}

function capQueue(entries: PendingEntry[]): PendingEntry[] {
  if (entries.length <= MAX_QUEUE_SIZE) return entries;
  return entries.slice(entries.length - MAX_QUEUE_SIZE);
}

/** Store a patch to apply when a feed remounts from cache. */
export function enqueuePendingPostPatch(postId: string, patch: PostPatch): void {
  if (!postId?.trim() || !patch || typeof patch !== "object") return;

  const now = Date.now();
  const withoutPost = pruneExpired(readQueue(), now).filter(
    (e) => e.postId !== postId
  );
  const next = capQueue([
    ...withoutPost,
    { postId, patch, enqueuedAt: now },
  ]);
  writeQueue(next);
}

/** Apply queued patches to feed rows; removes consumed entries from the queue. */
export function applyPendingPostPatchesToItems<
  T extends Record<string, unknown> & { id?: string }
>(items: T[]): T[] {
  if (!items.length) return items;

  const now = Date.now();
  const queue = pruneExpired(readQueue(), now);
  if (!queue.length) return items;

  const patchByPostId = new Map(queue.map((e) => [e.postId, e.patch]));
  let changed = false;
  const appliedPostIds = new Set<string>();

  const next = items.map((item) => {
    const postId = item.id;
    if (typeof postId !== "string" || !postId) return item;
    const patch = patchByPostId.get(postId);
    if (!patch) return item;
    appliedPostIds.add(postId);
    changed = true;
    return applyPostPatch(item, patch) as T;
  });

  if (!changed) return items;

  const remaining = queue.filter((e) => !appliedPostIds.has(e.postId));
  writeQueue(remaining);

  return next;
}

/** Apply a pending patch to a single post object (detail modal bootstrap). */
export function applyPendingPostPatchToItem<
  T extends Record<string, unknown> & { id?: string }
>(item: T): T {
  if (!item?.id) return item;
  return applyPendingPostPatchesToItems([item])[0] ?? item;
}
