import React, { useState, useEffect, useRef } from "react";
import { type NotificationWithActor } from "../../types/notification";
import {
  getNotifications,
  getNotificationBadgeData,
  markViewNotificationsAsRead,
  markNotificationIdsAsRead,
} from "../../api/services/notifications";
import NotificationItem from "./NotificationItem";
import NotificationPermissionBanner from "./NotificationPermissionBanner";
import { PiEnvelopeSimple, PiHeart } from "react-icons/pi";
import { toast } from "react-hot-toast";
import {
  getBatchFollowStatuses,
  getViewerId,
  getViewerAuthUserId,
} from "../../api/services/follows";
import { getBatchInvitesByIds } from "../../api/services/invites";
import { setCachedInviteData } from "../../lib/inviteDataCache";
import { setCachedInviteStatus } from "../../lib/inviteStatusCache";
import { logFetchStart } from "../../lib/tabVisibilityDebug";
import { NOTIFICATIONS_TAB_REFRESH_EVENT } from "../../lib/homeRefreshEvents";

/** First page & each "Load more" batch (server applies typeGroup as today). */
const NOTIFICATION_PAGE_SIZE = 10;

interface Props {
  className?: string;
  /** When false, skips initial fetch (e.g. tab hidden). When true, fetches immediately. */
  isVisible?: boolean;
}

/**
 * NotificationList Component
 *
 * [FIX: Phase 1 - Navigation Bug] Switched to LOCAL STATE for filter (like Profile page)
 * Previously used URL search params which caused race condition with navigate()
 * Now uses simple React state - no URL manipulation, no event listeners needed
 */
export default function NotificationList({
  className = "",
  isVisible = true,
}: Props) {
  const [notifications, setNotifications] = useState<NotificationWithActor[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  /** Invites (type invite) vs everything else */
  const [listView, setListView] = useState<"invites" | "activity">("invites");
  const listViewRef = useRef(listView);
  listViewRef.current = listView;

  /** For switch button dot: other view’s unread (from head counts) */
  const [tabBadgeBreakdown, setTabBadgeBreakdown] = useState({
    invite: 0,
    activity: 0,
  });

  // [OPTIMIZATION: Phase 1 - Batch] Store batched follow statuses for follow request notifications
  // Why: Batch load all follow statuses at once instead of individual queries per notification
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});

  // [OPTIMIZATION: StrictMode Guard] Prevent duplicate loadNotifications on React 18 StrictMode double-mount
  const initialLoadInFlightRef = useRef(false);

  const lastLoadedAtRef = useRef<number>(0);
  const prevListViewRef = useRef(listView);

  const loadNotifications = async (offset = 0, append = false) => {
    try {
      if (offset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      logFetchStart("NotificationList", "notifications", isVisible, undefined);
      const typeGroup =
        listViewRef.current === "invites" ? "invite" : "activity";
      const data = await getNotifications(
        NOTIFICATION_PAGE_SIZE,
        offset,
        { typeGroup }
      );

      // [OPTIMIZATION] Batch hydrate invite direction/status to eliminate N+1 getInviteById
      const inviteIdsToHydrate = data
        .filter(
          (n) =>
            n.type === "invite" &&
            n.additional_data?.invite_id &&
            !n.additional_data?.invite_direction
        )
        .map((n) => n.additional_data!.invite_id as string);
      if (inviteIdsToHydrate.length > 0) {
        try {
          const viewerUserId = await getViewerAuthUserId();
          const batchInvites = await getBatchInvitesByIds(inviteIdsToHydrate);
          const inviteMetaMap: Record<
            string,
            {
              direction: "sent" | "received";
              status: "pending" | "accepted" | "declined";
            }
          > = {};
          for (const inv of batchInvites) {
            const direction: "sent" | "received" =
              viewerUserId && inv.inviter_id === viewerUserId
                ? "sent"
                : "received";
            const status: "pending" | "accepted" | "declined" =
              inv.status === "accepted" || inv.status === "declined"
                ? inv.status
                : "pending";
            inviteMetaMap[inv.id] = { direction, status };
            setCachedInviteData(inv.id, inv);
            setCachedInviteStatus(inv.id, status);
          }
          // Enrich notifications with batch data
          for (let i = 0; i < data.length; i++) {
            const n = data[i];
            if (n.type !== "invite") continue;
            const inviteId = n.additional_data?.invite_id;
            if (!inviteId || !inviteMetaMap[inviteId]) continue;
            data[i] = {
              ...n,
              additional_data: {
                ...n.additional_data,
                invite_direction: inviteMetaMap[inviteId].direction,
                invite_status: inviteMetaMap[inviteId].status,
              },
            };
          }
        } catch (err) {
          console.warn(
            "[NotificationList] Batch invite hydration failed:",
            err
          );
        }
      }

      // [OPTIMIZATION] Batch load follow statuses BEFORE setting notifications
      // so rows get initialFollowStatus on first render, avoiding per-row getFollowStatus
      const followRequestNotifications = data.filter(
        (n) =>
          n.type === "follow" &&
          n.additional_data?.follow_request_status &&
          n.additional_data?.follower_profile_id &&
          n.additional_data?.following_profile_id
      );

      let statusMap: Record<
        string,
        "none" | "pending" | "following" | "friends"
      > = {};

      if (followRequestNotifications.length > 0) {
        try {
          const viewerProfileId = await getViewerId();
          if (viewerProfileId) {
            const profileIdsToCheck = new Set<string>();
            followRequestNotifications.forEach((notification) => {
              const followerProfileId =
                notification.additional_data?.follower_profile_id;
              const followingProfileId =
                notification.additional_data?.following_profile_id;

              if (followerProfileId && followingProfileId) {
                if (viewerProfileId === followingProfileId) {
                  profileIdsToCheck.add(followerProfileId);
                } else if (viewerProfileId === followerProfileId) {
                  profileIdsToCheck.add(followingProfileId);
                }
              }
            });

            if (profileIdsToCheck.size > 0) {
              const followStatuses = await getBatchFollowStatuses(
                viewerProfileId,
                Array.from(profileIdsToCheck)
              );

              followRequestNotifications.forEach((notification) => {
                const followerProfileId =
                  notification.additional_data?.follower_profile_id;
                const followingProfileId =
                  notification.additional_data?.following_profile_id;

                if (followerProfileId && followingProfileId) {
                  let status:
                    | "none"
                    | "pending"
                    | "following"
                    | "friends"
                    | undefined;

                  if (viewerProfileId === followingProfileId) {
                    status = followStatuses[followerProfileId];
                  } else if (viewerProfileId === followerProfileId) {
                    status = followStatuses[followingProfileId];
                  }

                  if (status) {
                    statusMap[notification.id] = status;
                  }
                }
              });
            }
          }
        } catch (error) {
          console.warn(
            "[NotificationList] Failed to batch load follow statuses:",
            error
          );
        }
      }

      if (append) {
        setNotifications((prev) => [...prev, ...data]);
        setBatchedFollowStatuses((prev) => ({ ...prev, ...statusMap }));
      } else {
        setNotifications(data);
        setBatchedFollowStatuses(statusMap);
        lastLoadedAtRef.current = Date.now();
      }

      setHasMore(data.length === NOTIFICATION_PAGE_SIZE);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      setError(err.message || "Failed to load notifications");
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      if (offset === 0) {
        initialLoadInFlightRef.current = false;
      }
    }
  };

  const loadNotificationsRef = useRef(loadNotifications);
  loadNotificationsRef.current = loadNotifications;

  useEffect(() => {
    const onTabRefresh = () => {
      if (!isVisible) return;
      lastLoadedAtRef.current = 0;
      initialLoadInFlightRef.current = false;
      setError(null);
      if (import.meta.env.DEV) {
        console.debug("[notifications-tab-refresh] refetch");
      }
      loadNotificationsRef.current(0, false);
    };
    window.addEventListener(NOTIFICATIONS_TAB_REFRESH_EVENT, onTabRefresh);
    return () =>
      window.removeEventListener(NOTIFICATIONS_TAB_REFRESH_EVENT, onTabRefresh);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) {
      initialLoadInFlightRef.current = false;
      setLoading(false);
      return;
    }
    const switched = prevListViewRef.current !== listView;
    prevListViewRef.current = listView;
    if (switched) {
      initialLoadInFlightRef.current = false;
    }
    if (initialLoadInFlightRef.current) return;
    initialLoadInFlightRef.current = true;
    loadNotifications(0, false);
  }, [isVisible, listView]);

  /** Refresh “other view” unread dots + align with bottom tab (same event/caches) */
  useEffect(() => {
    if (!isVisible) return;
    let alive = true;
    const run = () => {
      getNotificationBadgeData()
        .then((d) => {
          if (alive) {
            setTabBadgeBreakdown({
              invite: d.inviteUnread,
              activity: d.activityUnread,
            });
          }
        })
        .catch(() => {});
    };
    run();
    const onUpd = () => run();
    window.addEventListener("notifications:updated", onUpd);
    return () => {
      alive = false;
      window.removeEventListener("notifications:updated", onUpd);
    };
  }, [isVisible]);

  // Notify other components when notifications are loaded/updated
  useEffect(() => {
    // Dispatch custom event to update notification badge count
    const event = new CustomEvent("notifications:updated");
    window.dispatchEvent(event);
  }, [notifications]);

  const handleMarkAsRead = (notificationId: string) => {
    lastLoadedAtRef.current = 0;
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    );
  };

  const handleClearUnreadInView = async () => {
    if (notifications.some((n) => !n.is_read)) {
      try {
        await markViewNotificationsAsRead(
          listView === "invites" ? "invite" : "activity"
        );
        lastLoadedAtRef.current = 0;
        setNotifications((prev) =>
          prev.map((notification) => ({ ...notification, is_read: true }))
        );
        toast.success(
          listView === "invites"
            ? "Cleared invite unread"
            : "Cleared activity unread"
        );
      } catch (err: any) {
        console.error("Failed to clear unread in view:", err);
        toast.error("Couldn’t clear unread");
      }
    }
  };

  /**
   * When the current list is shown (not refetching), mark loaded rows as read.
   * Skips while `loading` so we never mark the wrong set during a list view switch.
   * Uses the same "countable unread" filter as the header (excludes declined follow noise).
   */
  useEffect(() => {
    if (!isVisible || loading) return;
    const markable = notifications
      .filter((n) => {
        if (n.is_read) return false;
        if (
          n.type === "follow" &&
          n.additional_data?.follow_request_status === "declined"
        ) {
          return false;
        }
        return true;
      })
      .map((n) => n.id);
    if (markable.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        await markNotificationIdsAsRead(markable);
        if (cancelled) return;
        const markSet = new Set(markable);
        setNotifications((prev) =>
          prev.map((n) => (markSet.has(n.id) ? { ...n, is_read: true } : n))
        );
      } catch (e) {
        console.warn("[NotificationList] auto mark visible as read:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisible, loading, listView, notifications]);

  const loadMore = () => {
    if (hasMore && !loadingMore) {
      loadNotifications(notifications.length, true);
    }
  };

  // Exclude declined follow requests from in-page unread row
  const unreadInView = notifications.filter((n) => {
    if (!n.is_read) {
      if (
        n.type === "follow" &&
        n.additional_data?.follow_request_status === "declined"
      ) {
        return false;
      }
      return true;
    }
    return false;
  }).length;

  const inviteUnreadBadge = tabBadgeBreakdown.invite;
  const activityUnreadBadge = tabBadgeBreakdown.activity;

  const topBarPill = (
    <div
      role="tablist"
      aria-label="Notification views"
      className="relative mx-auto flex w-[80%] max-w-[640px] items-stretch rounded-full border border-transparent bg-[var(--glass-bg)] p-1 text-[var(--text)] shadow-[0_0_0_2px_var(--bottom-tab-pill-ring),0_3px_16px_rgba(0,0,0,0.1)] backdrop-blur-[var(--glass-blur)] isolate app-dark:shadow-[0_0_0_2px_var(--bottom-tab-pill-ring),0_4px_22px_rgba(0,0,0,0.42)]"
    >
      <button
        type="button"
        role="tab"
        id="notifications-tab-invites"
        aria-selected={listView === "invites"}
        aria-controls="notifications-list-panel"
        onClick={() => setListView("invites")}
        className={[
          "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-[5px] text-center text-[12px] font-semibold leading-none tracking-tight transition-colors",
          "cursor-pointer outline-none select-none active:scale-[0.985]",
          "focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          listView === "invites"
            ? "border border-sky-500/35 bg-[var(--bottom-tab-feed-notif-active-bg)] text-[var(--bottom-tab-feed-notif-active-fg)] shadow-[0_1px_10px_rgba(0,0,0,0.12)] app-dark:border-sky-400/30 app-dark:shadow-[0_2px_12px_rgba(0,0,0,0.28)]"
            : "border border-transparent bg-transparent text-[var(--text)]/75 hover:bg-[var(--text)]/[0.05] hover:text-[var(--text)]/92",
        ].join(" ")}
      >
        <PiEnvelopeSimple
          size={18}
          className={
            listView === "invites"
              ? "shrink-0 text-sky-700 app-light:text-sky-300"
              : "shrink-0 text-sky-600/65 app-light:text-sky-500/65"
          }
          aria-hidden
        />
        <span className="truncate">Invites</span>
        {inviteUnreadBadge > 0 ? (
          <span
            className={[
              "min-w-[1rem] shrink-0 text-[11px] font-semibold tabular-nums tracking-tight",
              listView === "invites"
                ? "text-sky-800 app-light:text-sky-200"
                : "text-sky-600/90 app-light:text-sky-500/95",
            ].join(" ")}
            aria-label={`${inviteUnreadBadge} unread invite notifications`}
          >
            {inviteUnreadBadge > 99 ? "99+" : inviteUnreadBadge}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        id="notifications-tab-activity"
        aria-selected={listView === "activity"}
        aria-controls="notifications-list-panel"
        onClick={() => setListView("activity")}
        className={[
          "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-[5px] text-center text-[12px] font-semibold leading-none tracking-tight transition-colors",
          "cursor-pointer outline-none select-none active:scale-[0.985]",
          "focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          listView === "activity"
            ? "border border-rose-500/35 bg-[var(--bottom-tab-feed-notif-active-bg)] text-[var(--bottom-tab-feed-notif-active-fg)] shadow-[0_1px_10px_rgba(0,0,0,0.12)] app-dark:border-rose-400/30 app-dark:shadow-[0_2px_12px_rgba(0,0,0,0.28)]"
            : "border border-transparent bg-transparent text-[var(--text)]/75 hover:bg-[var(--text)]/[0.05] hover:text-[var(--text)]/92",
        ].join(" ")}
      >
        <PiHeart
          size={18}
          className={
            listView === "activity"
              ? "shrink-0 text-rose-600 app-light:text-rose-300"
              : "shrink-0 text-rose-600/60 app-light:text-rose-400/65"
          }
          aria-hidden
        />
        <span className="truncate">Activity</span>
        {activityUnreadBadge > 0 ? (
          <span
            className={[
              "min-w-[1rem] shrink-0 text-[11px] font-semibold tabular-nums tracking-tight",
              listView === "activity"
                ? "text-rose-800 app-light:text-rose-100"
                : "text-rose-700/95 app-light:text-rose-300/95",
            ].join(" ")}
            aria-label={`${activityUnreadBadge} unread activity notifications`}
          >
            {activityUnreadBadge > 99 ? "99+" : activityUnreadBadge}
          </span>
        ) : null}
      </button>
    </div>
  );

  const listScrollPadding: React.CSSProperties = {
    paddingTop: "calc(62px + env(safe-area-inset-top, 0px))",
  };

  /** Invites tab: slightly wider list; activity unchanged. */
  const listPanelHorizontalClass =
    listView === "invites" ? "px-1.5 sm:px-2" : "px-3";

  if (loading) {
    return (
      <div className={`w-full min-h-0 ${className}`}>
        <div
          className="fixed left-0 right-0 z-[30] flex flex-col items-center"
          style={{
            paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
          }}
        >
          {topBarPill}
        </div>
        <div
          id="notifications-list-panel"
          role="tabpanel"
          aria-labelledby={
            listView === "invites"
              ? "notifications-tab-invites"
              : "notifications-tab-activity"
          }
          className={listPanelHorizontalClass}
          style={listScrollPadding}
        >
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-full rounded-lg p-3 gap-3 flex bg-[var(--surface-2)]/80 animate-pulse"
              >
                <div className="w-14 h-14 rounded-lg bg-[var(--text)]/10 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[var(--text)]/10 rounded w-3/4" />
                  <div className="h-3 bg-[var(--text)]/10 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-full min-h-0 ${className}`}>
        <div
          className="fixed left-0 right-0 z-[30] flex flex-col items-center"
          style={{
            paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
          }}
        >
          {topBarPill}
        </div>
        <div
          id="notifications-list-panel"
          role="tabpanel"
          aria-labelledby={
            listView === "invites"
              ? "notifications-tab-invites"
              : "notifications-tab-activity"
          }
          className="text-center py-8 text-[var(--text)]/70"
          style={listScrollPadding}
        >
          <p className="text-sm mb-4">Failed to load notifications</p>
          <button
            type="button"
            onClick={() => loadNotifications(0, false)}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (notifications.length === 0 && !loading) {
    return (
      <div className={`w-full min-h-0 ${className}`}>
        <div
          className="fixed left-0 right-0 z-[30] flex flex-col items-center"
          style={{
            paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
          }}
        >
          {topBarPill}
        </div>
        <div
          id="notifications-list-panel"
          role="tabpanel"
          aria-labelledby={
            listView === "invites"
              ? "notifications-tab-invites"
              : "notifications-tab-activity"
          }
          className={listPanelHorizontalClass}
          style={listScrollPadding}
        >
          <div className="text-center py-10 text-[var(--text)]/60 text-sm">
            {listView === "invites"
              ? "No invite notifications yet"
              : "No activity yet"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full min-h-0 ${className}`}>
      <div
        className="fixed left-0 right-0 z-[30] flex flex-col items-center"
        style={{
          paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
        }}
      >
        {topBarPill}
      </div>

      <div
        id="notifications-list-panel"
        role="tabpanel"
        aria-labelledby={
          listView === "invites"
            ? "notifications-tab-invites"
            : "notifications-tab-activity"
        }
        className={listPanelHorizontalClass}
        style={listScrollPadding}
      >
        <div className="pt-1">
          <NotificationPermissionBanner />
        </div>

        {unreadInView > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-[var(--border)]/60 mb-1">
            <span className="text-xs text-[var(--text)]/65">
              {unreadInView} unread
            </span>
            <button
              type="button"
              onClick={handleClearUnreadInView}
              className="text-xs text-[var(--text)]/50 hover:text-[var(--text)]/75 underline-offset-2 hover:underline"
            >
              Clear unread
            </button>
          </div>
        )}

        <div
          className={
            listView === "invites" ? "flex flex-col gap-2 py-1" : "py-1"
          }
        >
          {notifications.map((notification) => {
            const isActivity = listView === "activity";
            if (isActivity) {
              return (
                <div
                  key={notification.id}
                  className="border-b border-[var(--border)]/50 last:border-b-0"
                >
                  <NotificationItem
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    showGoToPostButton
                    activityCalm
                    batchedFollowStatus={
                      notification.type === "follow" &&
                      notification.additional_data?.follow_request_status
                        ? batchedFollowStatuses[notification.id]
                        : undefined
                    }
                  />
                </div>
              );
            }
            return (
              <div
                key={notification.id}
                className="border-b border-[var(--border)]/45 last:border-b-0"
              >
                <NotificationItem
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  showGoToPostButton
                  batchedFollowStatus={
                    notification.type === "follow" &&
                    notification.additional_data?.follow_request_status
                      ? batchedFollowStatuses[notification.id]
                        : undefined
                  }
                />
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 text-sm text-[var(--text)]/70 hover:text-[var(--text)] transition-colors disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
