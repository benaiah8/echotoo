/**
 * Inbox Realtime: conversation_members INSERT+UPDATE (viewer) + conversations UPDATE.
 */

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { logDmRealtime } from "../lib/messagesRealtimeDebug";

type MemberPayload = {
  conversation_id?: string;
  user_id?: string;
  unread_count?: number;
  left_at?: string | null;
};

type ConversationPayload = {
  id?: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_sender_id?: string | null;
};

type InboxRealtimeStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED"
  | string;

type Options = {
  viewerUserId: string | null;
  enabled: boolean;
  knownConversationIds: ReadonlySet<string>;
  onMemberUnread: (conversationId: string, unreadCount: number) => void;
  onMemberInsertUnknown: (conversationId: string) => void;
  /** Viewer left or was removed from a known conversation. */
  onMemberLeft: (conversationId: string) => void;
  onConversationSummary: (patch: {
    conversationId: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_message_sender_id: string | null;
  }) => void;
  onStatus?: (status: InboxRealtimeStatus) => void;
};

export function useMessagesInboxRealtime({
  viewerUserId,
  enabled,
  knownConversationIds,
  onMemberUnread,
  onMemberInsertUnknown,
  onMemberLeft,
  onConversationSummary,
  onStatus,
}: Options) {
  const knownRef = useRef(knownConversationIds);
  knownRef.current = knownConversationIds;

  const onMemberUnreadRef = useRef(onMemberUnread);
  onMemberUnreadRef.current = onMemberUnread;
  const onMemberInsertUnknownRef = useRef(onMemberInsertUnknown);
  onMemberInsertUnknownRef.current = onMemberInsertUnknown;
  const onMemberLeftRef = useRef(onMemberLeft);
  onMemberLeftRef.current = onMemberLeft;
  const onConversationSummaryRef = useRef(onConversationSummary);
  onConversationSummaryRef.current = onConversationSummary;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    const me = (viewerUserId ?? "").trim();
    if (!enabled || !me) return;

    let cancelled = false;

    const channel = supabase
      .channel(`dm-inbox:${me}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${me}`,
        },
        (payload) => {
          const row = payload.new as MemberPayload;
          const conversationId =
            typeof row.conversation_id === "string"
              ? row.conversation_id
              : null;
          if (!conversationId) return;

          // Leave/remove: drop known inbox rows immediately.
          if (row.left_at != null) {
            if (knownRef.current.has(conversationId)) {
              onMemberLeftRef.current(conversationId);
            }
            return;
          }

          const unread =
            typeof row.unread_count === "number" ? row.unread_count : 0;
          if (knownRef.current.has(conversationId)) {
            onMemberUnreadRef.current(conversationId, unread);
          } else {
            // Unknown active UPDATE (incl. reactivation) → authoritative refresh.
            onMemberInsertUnknownRef.current(conversationId);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${me}`,
        },
        (payload) => {
          const row = payload.new as MemberPayload;
          const conversationId =
            typeof row.conversation_id === "string"
              ? row.conversation_id
              : null;
          if (!conversationId) return;
          if (row.left_at != null) return;
          if (knownRef.current.has(conversationId)) {
            const unread =
              typeof row.unread_count === "number" ? row.unread_count : 0;
            onMemberUnreadRef.current(conversationId, unread);
            return;
          }
          onMemberInsertUnknownRef.current(conversationId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          const row = payload.new as ConversationPayload;
          const conversationId = typeof row.id === "string" ? row.id : null;
          if (!conversationId) return;
          if (!knownRef.current.has(conversationId)) return;
          onConversationSummaryRef.current({
            conversationId,
            last_message_at:
              row.last_message_at === undefined
                ? null
                : (row.last_message_at ?? null),
            last_message_preview:
              row.last_message_preview === undefined
                ? null
                : (row.last_message_preview ?? null),
            last_message_sender_id:
              row.last_message_sender_id === undefined
                ? null
                : (row.last_message_sender_id ?? null),
          });
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        logDmRealtime("dm-inbox status", {
          channel: `dm-inbox:${me}`,
          status,
        });
        onStatusRef.current?.(status);
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [viewerUserId, enabled]);
}
