/**
 * Open-DM Realtime: INSERT on public.messages filtered to conversation_id.
 */

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  parseRealtimeMessageRow,
  type MessageRow,
} from "../api/services/messaging";
import { logDmRealtime } from "../lib/messagesRealtimeDebug";

type ThreadRealtimeStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED"
  | string;

type Options = {
  conversationId: string | null;
  enabled: boolean;
  onInsert: (message: MessageRow) => void;
  onStatus?: (status: ThreadRealtimeStatus) => void;
};

const lastThreadRealtimeUnsubscribedAt = new Map<string, number>();
const threadRealtimeHealthy = new Map<string, boolean>();
const STRICT_MODE_UNSUB_IGNORE_MS = 1000;

export function threadRealtimeHadCoverageGap(
  conversationId: string,
  cacheUpdatedAt: number
): boolean {
  const id = (conversationId ?? "").trim();
  if (!id) return false;
  const unsub = lastThreadRealtimeUnsubscribedAt.get(id);
  if (unsub == null) return false;
  if (Date.now() - unsub < STRICT_MODE_UNSUB_IGNORE_MS) return false;
  return unsub >= cacheUpdatedAt - 50;
}

export function isThreadRealtimeHealthy(conversationId: string): boolean {
  const id = (conversationId ?? "").trim();
  if (!id) return false;
  return threadRealtimeHealthy.get(id) === true;
}

export function useDirectConversationRealtime({
  conversationId,
  enabled,
  onInsert,
  onStatus,
}: Options) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    const id = (conversationId ?? "").trim();
    if (!enabled || !id) return;

    const channelName = `dm-messages:${id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = parseRealtimeMessageRow(payload.new);
          if (row) onInsertRef.current(row);
        }
      )
      .subscribe((status) => {
        logDmRealtime("dm-messages status", {
          channel: channelName,
          status,
        });
        if (status === "SUBSCRIBED") {
          threadRealtimeHealthy.set(id, true);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          threadRealtimeHealthy.set(id, false);
        }
        onStatusRef.current?.(status);
      });

    return () => {
      lastThreadRealtimeUnsubscribedAt.set(id, Date.now());
      threadRealtimeHealthy.set(id, false);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, enabled]);
}
