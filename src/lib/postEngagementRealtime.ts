/**
 * Central Supabase Realtime listener for post engagement (cross-account sync).
 * Debounces per post, fetches authoritative snapshot, emits absolute patches via post:changed.
 */

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { emitPostChanged, type PostPatch } from "./postEvents";
import { fetchPostEngagementSnapshot } from "../api/queries/fetchPostEngagementSnapshot";
import { invalidatePostDetailCache } from "../api/queries/getPostById";
import { isDraftPostId } from "./drafts";

const CHANNEL_NAME = "post-engagement-sync";
const DEBOUNCE_MS = 350;

let channel: ReturnType<typeof supabase.channel> | null = null;
let activeViewerId: string | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resolvePostId(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): string | null {
  const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
  if (!row) return null;
  const postId = row.post_id ?? row.id;
  return typeof postId === "string" ? postId : null;
}

function shouldHandlePostsUpdate(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): boolean {
  const n = payload.new as Record<string, unknown> | null | undefined;
  const o = payload.old as Record<string, unknown> | null | undefined;
  if (!n) return false;
  if (!o) return true;
  const keys = [
    "rating_average",
    "rating_count",
    "rating_enabled",
  ] as const;
  return keys.some((k) => n[k] !== o[k]);
}

function scheduleEngagementRefresh(postId: string) {
  if (isDraftPostId(postId)) return;
  const existing = debounceTimers.get(postId);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    postId,
    setTimeout(() => {
      debounceTimers.delete(postId);
      void flushEngagementSnapshot(postId);
    }, DEBOUNCE_MS)
  );
}

async function flushEngagementSnapshot(postId: string) {
  const viewerId = activeViewerId;
  if (!viewerId) return;

  const snap = await fetchPostEngagementSnapshot(postId, viewerId);
  if (!snap) return;

  const patch: PostPatch = {
    likeCount: snap.likeCount,
    saveCount: snap.saveCount,
    effectiveLikeCount: snap.effectiveLikeCount,
    effectiveSaveCount: snap.effectiveSaveCount,
    commentCount: snap.commentCount,
    viewerLiked: snap.viewerLiked,
    viewerSaved: snap.viewerSaved,
    ratingAverage: snap.ratingAverage,
    ratingCount: snap.ratingCount,
    effectiveRatingAverage: snap.effectiveRatingAverage,
    effectiveRatingCount: snap.effectiveRatingCount,
    viewerRating: snap.viewerRating,
  };
  if (snap.ratingEnabled !== null) {
    patch.ratingEnabled = snap.ratingEnabled;
  }

  invalidatePostDetailCache(postId);
  emitPostChanged(postId, patch);
}

function attachListeners(ch: ReturnType<typeof supabase.channel>) {
  const onEngagementTable = (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => {
    const postId = resolvePostId(payload);
    if (postId) scheduleEngagementRefresh(postId);
  };

  ch.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "post_likes",
    },
    onEngagementTable
  )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "post_likes",
      },
      onEngagementTable
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "saved_posts",
      },
      onEngagementTable
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "saved_posts",
      },
      onEngagementTable
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "comments",
      },
      onEngagementTable
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "comments",
      },
      onEngagementTable
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "comments",
      },
      onEngagementTable
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "posts",
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (!shouldHandlePostsUpdate(payload)) return;
        const postId = resolvePostId(payload);
        if (postId) scheduleEngagementRefresh(postId);
      }
    );
}

/**
 * Start listening for engagement changes. Idempotent for the same viewer id.
 * Call after session is established.
 */
export function startPostEngagementRealtime(viewerUserId: string): void {
  if (!viewerUserId) return;
  if (channel && activeViewerId === viewerUserId) return;

  stopPostEngagementRealtime();
  activeViewerId = viewerUserId;

  const ch = supabase.channel(CHANNEL_NAME);
  attachListeners(ch);
  ch.subscribe((status) => {
    if (import.meta.env.DEV && status === "SUBSCRIBED") {
      console.debug("[postEngagementRealtime] subscribed");
    }
    if (status === "CHANNEL_ERROR") {
      console.warn("[postEngagementRealtime] channel error");
    }
  });

  channel = ch;
}

/**
 * Tear down channel and pending debouncers (logout / unmount).
 */
export function stopPostEngagementRealtime(): void {
  debounceTimers.forEach((t) => clearTimeout(t));
  debounceTimers.clear();
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  activeViewerId = null;
}
