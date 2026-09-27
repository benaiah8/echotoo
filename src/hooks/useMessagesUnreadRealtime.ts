/**
 * Always-on lightweight unread Realtime: conversation_members for the viewer only.
 * Does not subscribe to conversations or messages (M1D inbox Realtime stays scoped).
 */

import { useEffect, useRef } from "react";
import { listMyConversations } from "../api/services/messaging";
import {
  getDmInboxCache,
  isDmInboxUsable,
  patchDmInboxUnread,
  setDmInboxCache,
} from "../lib/dmInboxCache";
import { logDmRealtime } from "../lib/messagesRealtimeDebug";
import {
  applyMemberUnread,
  clearMessagesUnreadStore,
  hydrateFromInboxRows,
} from "../lib/messagesUnreadStore";
import { supabase } from "../lib/supabaseClient";

type MemberPayload = {
  conversation_id?: string;
  user_id?: string;
  unread_count?: number;
  left_at?: string | null;
};

function applyMemberRow(viewerUserId: string, row: MemberPayload): void {
  const conversationId =
    typeof row.conversation_id === "string" ? row.conversation_id.trim() : "";
  if (!conversationId) return;

  const unread =
    row.left_at != null
      ? 0
      : typeof row.unread_count === "number"
        ? row.unread_count
        : 0;

  applyMemberUnread(conversationId, unread);
  patchDmInboxUnread(viewerUserId, conversationId, unread);
}

export function useMessagesUnreadRealtime(viewerUserId: string | null): void {
  const viewerRef = useRef(viewerUserId);
  viewerRef.current = viewerUserId;
  const prevViewerRef = useRef<string | null>(null);

  useEffect(() => {
    const me = (viewerUserId ?? "").trim();
    if (!me) {
      prevViewerRef.current = null;
      clearMessagesUnreadStore();
      return;
    }

    if (prevViewerRef.current && prevViewerRef.current !== me) {
      clearMessagesUnreadStore();
    }
    prevViewerRef.current = me;

    let cancelled = false;

    const cached = getDmInboxCache(me);
    if (cached && isDmInboxUsable(cached)) {
      hydrateFromInboxRows(me, cached.conversations);
    } else {
      void listMyConversations().then(({ data }) => {
        if (cancelled || !data) return;
        if ((viewerRef.current ?? "").trim() !== me) return;
        setDmInboxCache(me, data.conversations);
        hydrateFromInboxRows(me, data.conversations);
      });
    }

    const channelName = `dm-unread:${me}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${me}`,
        },
        (payload) => {
          applyMemberRow(me, payload.new as MemberPayload);
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
          applyMemberRow(me, payload.new as MemberPayload);
        }
      )
      .subscribe((status) => {
        logDmRealtime("dm-unread status", {
          channel: channelName,
          status,
        });
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [viewerUserId]);
}
