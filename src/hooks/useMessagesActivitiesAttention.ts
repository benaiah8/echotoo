/**
 * Always-on Activities attention: seed + notifications INSERT + notifications:updated.
 * Does not load the Activities list. Eligibility matches Activity surface
 * (exclude invite, saved, and obsolete Going RSVP).
 */

import { useEffect, useRef } from "react";
import {
  coerceNotificationAdditionalData,
  isActivitiesSurfaceNotification,
} from "../lib/activitiesNotificationEligibility";
import {
  applyLatestEligibleActivity,
  bindMessagesActivitiesAttentionViewer,
  clearMessagesActivitiesAttentionStore,
  getLatestEligibleActivityMs,
  refreshMessagesActivitiesAttention,
} from "../lib/messagesActivitiesAttentionStore";
import { supabase } from "../lib/supabaseClient";

type NotificationPayload = {
  type?: string;
  created_at?: string;
  additional_data?: Record<string, unknown> | null;
};

export function useMessagesActivitiesAttention(
  viewerUserId: string | null
): void {
  const viewerRef = useRef(viewerUserId);
  viewerRef.current = viewerUserId;
  const prevViewerRef = useRef<string | null>(null);

  useEffect(() => {
    const me = (viewerUserId ?? "").trim();
    if (!me) {
      prevViewerRef.current = null;
      clearMessagesActivitiesAttentionStore();
      return;
    }

    if (prevViewerRef.current && prevViewerRef.current !== me) {
      clearMessagesActivitiesAttentionStore();
    }
    prevViewerRef.current = me;
    bindMessagesActivitiesAttentionViewer(me);

    let cancelled = false;
    void refreshMessagesActivitiesAttention(me);

    const onNotificationsUpdated = () => {
      const uid = (viewerRef.current ?? "").trim();
      if (!uid) return;
      void refreshMessagesActivitiesAttention(uid);
    };
    window.addEventListener("notifications:updated", onNotificationsUpdated);

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const uid = (viewerRef.current ?? "").trim();
      if (!uid) return;
      void refreshMessagesActivitiesAttention(uid);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const channelName = `activities-attention:${me}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${me}`,
        },
        (payload) => {
          if (cancelled) return;
          if ((viewerRef.current ?? "").trim() !== me) return;
          const row = payload.new as NotificationPayload;
          const type = typeof row.type === "string" ? row.type : "";
          if (
            !type ||
            !isActivitiesSurfaceNotification({
              type,
              additional_data: coerceNotificationAdditionalData(
                row.additional_data,
              ),
            })
          ) {
            return;
          }
          const createdAt =
            typeof row.created_at === "string"
              ? Date.parse(row.created_at)
              : NaN;
          if (Number.isFinite(createdAt)) {
            const prev = getLatestEligibleActivityMs();
            const next =
              prev == null ? createdAt : Math.max(prev, createdAt);
            applyLatestEligibleActivity(me, next);
            return;
          }
          if (cancelled) return;
          void refreshMessagesActivitiesAttention(me);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener(
        "notifications:updated",
        onNotificationsUpdated
      );
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [viewerUserId]);
}
