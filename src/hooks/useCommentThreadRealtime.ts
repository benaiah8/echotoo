/**
 * Scoped Supabase Realtime for an open comment thread (CommentList mounted).
 * Subscribes to comments for one post_id and comment_likes for loaded comment IDs only.
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

const DEBOUNCE_MS = 400;

type Options = {
  postId: string;
  commentIds: string[];
  enabled?: boolean;
  onCommentsChanged: () => void;
  onLikesChanged: () => void;
};

export function useCommentThreadRealtime({
  postId,
  commentIds,
  enabled = true,
  onCommentsChanged,
  onLikesChanged,
}: Options): void {
  const onCommentsRef = useRef(onCommentsChanged);
  const onLikesRef = useRef(onLikesChanged);
  onCommentsRef.current = onCommentsChanged;
  onLikesRef.current = onLikesChanged;

  const commentsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commentIdsKey = commentIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || !postId) return;

    const scheduleComments = () => {
      if (commentsDebounceRef.current) clearTimeout(commentsDebounceRef.current);
      commentsDebounceRef.current = setTimeout(() => {
        commentsDebounceRef.current = null;
        onCommentsRef.current();
      }, DEBOUNCE_MS);
    };

    const scheduleLikes = () => {
      if (likesDebounceRef.current) clearTimeout(likesDebounceRef.current);
      likesDebounceRef.current = setTimeout(() => {
        likesDebounceRef.current = null;
        onLikesRef.current();
      }, DEBOUNCE_MS);
    };

    const onVisibilityOrFocus = () => {
      const docVisible =
        typeof document === "undefined" ||
        document.visibilityState === "visible";
      if (!docVisible) return;
      scheduleComments();
    };

    const channel: RealtimeChannel = supabase.channel(
      `comment-thread-${postId}`
    );

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        scheduleComments
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        scheduleComments
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        scheduleComments
      );

    if (commentIds.length > 0) {
      const likesFilter = `comment_id=in.(${commentIds.join(",")})`;

      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "comment_likes",
            filter: likesFilter,
          },
          scheduleLikes
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "comment_likes",
            filter: likesFilter,
          },
          scheduleLikes
        );
    }

    channel.subscribe();

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      if (commentsDebounceRef.current) clearTimeout(commentsDebounceRef.current);
      if (likesDebounceRef.current) clearTimeout(likesDebounceRef.current);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      void supabase.removeChannel(channel);
    };
  }, [postId, commentIdsKey, enabled, commentIds.length]);
}
