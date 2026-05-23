import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Notification, NotificationWithActor } from "../../types/notification";
import {
  getNotifications,
  getNotificationBadgeData,
  markViewNotificationsAsRead,
  markNotificationIdsAsRead,
  hydrateNotificationWithActor,
  clearNotificationsResponseCache,
} from "../../api/services/notifications";
import { supabase } from "../../lib/supabaseClient";
import { clearCachedNotificationCount } from "../../lib/notificationCountCache";
import NotificationItem from "./NotificationItem";
import NotificationPermissionBanner from "./NotificationPermissionBanner";
import {
  NotificationListActivitySkeletonRows,
  NotificationListInviteSkeletonRows,
} from "./NotificationListSkeletons";
import {
  PiEnvelopeSimple,
  PiHeart,
  PiMegaphone,
  PiUser,
  PiUsers,
} from "react-icons/pi";
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
import { Paths } from "../../router/Paths";

/** Max extra invite pages to auto-fetch while resolving a push deep link (avoids infinite loops). */
const MAX_PUSH_INVITE_AUTO_LOADS = 30;

/** First page & each "Load more" batch (server applies typeGroup as today). */
const NOTIFICATION_PAGE_SIZE = 10;

/** In-memory list SWR cache (survives NotificationList unmount when leaving the tab). */
type NotificationDisplayListView = "invites" | "activity";

type NotificationDisplayCacheEntry = {
  notifications: NotificationWithActor[];
  hasMore: boolean;
  batchedFollowStatuses: Record<
    string,
    "none" | "pending" | "following" | "friends"
  >;
  ts: number;
};

const notificationDisplayCache = new Map<string, NotificationDisplayCacheEntry>();

/** Invites: ~2 min — activity: ~60s */
const DISPLAY_CACHE_TTL_MS_INVITES = 2 * 60 * 1000;
const DISPLAY_CACHE_TTL_MS_ACTIVITY = 60 * 1000;

/** Min cache age before a background quiet list sync — avoids egress on rapid tab switch / revisit while very fresh */
const MIN_INVITES_QUIET_REFRESH_AGE_MS = 20 * 1000;
const MIN_ACTIVITY_QUIET_REFRESH_AGE_MS = 10 * 1000;

function notificationDisplayCacheKey(
  userId: string,
  listView: NotificationDisplayListView
) {
  return `${userId}:${listView}`;
}

function notificationDisplayCacheTtlMs(listView: NotificationDisplayListView) {
  return listView === "invites"
    ? DISPLAY_CACHE_TTL_MS_INVITES
    : DISPLAY_CACHE_TTL_MS_ACTIVITY;
}

function readValidNotificationDisplayCache(
  userId: string,
  listView: NotificationDisplayListView
): NotificationDisplayCacheEntry | null {
  const key = notificationDisplayCacheKey(userId, listView);
  const e = notificationDisplayCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > notificationDisplayCacheTtlMs(listView)) {
    notificationDisplayCache.delete(key);
    return null;
  }
  return e;
}

function writeNotificationDisplayCache(
  userId: string,
  listView: NotificationDisplayListView,
  notifications: NotificationWithActor[],
  hasMore: boolean,
  batchedFollowStatuses: Record<
    string,
    "none" | "pending" | "following" | "friends"
  >
) {
  notificationDisplayCache.set(notificationDisplayCacheKey(userId, listView), {
    notifications,
    hasMore,
    batchedFollowStatuses,
    ts: Date.now(),
  });
}

function clearNotificationDisplayCacheForUser(userId: string) {
  notificationDisplayCache.delete(
    notificationDisplayCacheKey(userId, "invites")
  );
  notificationDisplayCache.delete(
    notificationDisplayCacheKey(userId, "activity")
  );
}

function persistNotificationDisplayCache(
  listViewKey: NotificationDisplayListView,
  nextNotifications: NotificationWithActor[],
  nextHasMore: boolean,
  nextFollow: Record<
    string,
    "none" | "pending" | "following" | "friends"
  >
) {
  void getViewerAuthUserId().then((uid) => {
    if (!uid) return;
    writeNotificationDisplayCache(
      uid,
      listViewKey,
      nextNotifications,
      nextHasMore,
      nextFollow
    );
  });
}

/** Invites tab only: sort by additional_data.latest_activity_at desc, else created_at desc. */
function inviteSortTimeMs(n: NotificationWithActor): number {
  const raw = n.additional_data?.latest_activity_at;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return Date.parse(n.created_at) || 0;
}

function sortInviteNotificationsByLatestActivity(
  list: NotificationWithActor[]
): NotificationWithActor[] {
  return [...list].sort((a, b) => {
    const d = inviteSortTimeMs(b) - inviteSortTimeMs(a);
    if (d !== 0) return d;
    return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
  });
}

/** Replace server page 0 and keep older pages by id de-dupe (invites resort). */
function mergeFirstPageIntoExisting(
  prev: NotificationWithActor[],
  page0: NotificationWithActor[],
  typeGroup: "invite" | "activity"
): NotificationWithActor[] {
  const freshIds = new Set(page0.map((n) => n.id));
  const tail = prev.filter((n) => !freshIds.has(n.id));
  if (typeGroup === "invite") {
    return sortInviteNotificationsByLatestActivity([...page0, ...tail]);
  }
  return [...page0, ...tail];
}

/** Invites tab quick filter: matches additional_data.thread_kind only. */
type InviteSubFilterKind = "personal" | "group" | "announcement";

function inviteRowMatchesSubFilter(
  n: NotificationWithActor,
  filter: InviteSubFilterKind
): boolean {
  if (n.type !== "invite") return false;
  const k = n.additional_data?.thread_kind;
  return k === filter;
}

function notificationFromRealtimeRow(
  row: Record<string, unknown>
): Notification | null {
  if (
    typeof row.id !== "string" ||
    typeof row.user_id !== "string" ||
    row.type !== "invite"
  ) {
    return null;
  }
  const et = row.entity_type;
  const entityType =
    et === "post" ||
    et === "comment" ||
    et === "hangout" ||
    et === "experience"
      ? et
      : "hangout";
  const ad = row.additional_data;
  return {
    id: row.id,
    user_id: row.user_id,
    actor_id: typeof row.actor_id === "string" ? row.actor_id : null,
    type: "invite",
    entity_type: entityType,
    entity_id: typeof row.entity_id === "string" ? row.entity_id : "",
    additional_data:
      ad && typeof ad === "object" && !Array.isArray(ad)
        ? (ad as Record<string, unknown>)
        : {},
    is_read: Boolean(row.is_read),
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
  };
}

async function enrichInviteDirectionIfNeeded(
  n: NotificationWithActor,
  viewerUserId: string | null
): Promise<NotificationWithActor> {
  if (n.type !== "invite") return n;
  const inviteId = n.additional_data?.invite_id as string | undefined;
  if (!inviteId || n.additional_data?.invite_direction) return n;
  try {
    const batchInvites = await getBatchInvitesByIds([inviteId]);
    const inv = batchInvites.find((x) => x.id === inviteId);
    if (!inv) return n;
    const direction: "sent" | "received" =
      viewerUserId && inv.inviter_id === viewerUserId ? "sent" : "received";
    const status: "pending" | "accepted" | "declined" =
      inv.status === "accepted" || inv.status === "declined"
        ? inv.status
        : "pending";
    return {
      ...n,
      additional_data: {
        ...n.additional_data,
        invite_direction: direction,
        invite_status: status,
      },
    };
  } catch {
    return n;
  }
}

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

  /** Invites tab: client-side row filter only (null = all loaded rows). */
  const [inviteSubFilter, setInviteSubFilter] = useState<
    InviteSubFilterKind | null
  >(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pushHighlightNotificationId, setPushHighlightNotificationId] =
    useState<string | null>(null);
  const inviteRowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const invitesRealtimeBadgeTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  /** Push invite deep-link: reset when `source=push` query changes or leaves. */
  const pushInviteIntentKeyRef = useRef<string | null>(null);
  const pushInviteAutoLoadsRef = useRef(0);
  const pushInviteLastTriggeredLoadAtLenRef = useRef<number | null>(null);
  const invitePushSubFilterClearedForIntentRef = useRef<string | null>(null);
  const pushHighlightAppliedForIntentRef = useRef<string | null>(null);

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
  const notificationsRef = useRef<NotificationWithActor[]>([]);
  const hasMoreRef = useRef(true);
  const batchedFollowStatusesRef = useRef<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});
  const listViewEffectGenRef = useRef(0);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    batchedFollowStatusesRef.current = batchedFollowStatuses;
  }, [batchedFollowStatuses]);

  type LoadNotificationsOptions = {
    quiet?: boolean;
    forceRefresh?: boolean;
    listViewForRequest?: NotificationDisplayListView;
  };

  const loadNotifications = async (
    offset = 0,
    append = false,
    opts?: LoadNotificationsOptions
  ) => {
    const quiet = opts?.quiet ?? false;
    const forceRefresh = opts?.forceRefresh ?? false;
    const listViewForRequest = opts?.listViewForRequest;
    const effectiveListView = listViewForRequest ?? listViewRef.current;
    const typeGroup =
      effectiveListView === "invites" ? "invite" : "activity";

    try {
      if (offset === 0 && !quiet) {
        setLoading(true);
        setError(null);
      } else if (offset > 0) {
        setLoadingMore(true);
      }

      if (forceRefresh && offset === 0) {
        clearNotificationsResponseCache();
      }

      const bypassResponseCache =
        offset === 0 && (forceRefresh || quiet);

      logFetchStart("NotificationList", "notifications", isVisible, undefined);
      let data = await getNotifications(
        NOTIFICATION_PAGE_SIZE,
        offset,
        { typeGroup, bypassResponseCache }
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

      if (typeGroup === "invite") {
        data = sortInviteNotificationsByLatestActivity(data);
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

      const pageHasMore = data.length === NOTIFICATION_PAGE_SIZE;

      if (append) {
        setNotifications((prev) => {
          const merged =
            typeGroup === "invite"
              ? sortInviteNotificationsByLatestActivity([...prev, ...data])
              : [...prev, ...data];
          const mergedFollow = {
            ...batchedFollowStatusesRef.current,
            ...statusMap,
          };
          persistNotificationDisplayCache(
            effectiveListView,
            merged,
            pageHasMore,
            mergedFollow
          );
          return merged;
        });
        setBatchedFollowStatuses((prev) => ({ ...prev, ...statusMap }));
        setHasMore(pageHasMore);
      } else if (quiet) {
        const prev = notificationsRef.current;
        const merged = mergeFirstPageIntoExisting(prev, data, typeGroup);
        const mergedFollow = {
          ...batchedFollowStatusesRef.current,
          ...statusMap,
        };
        let nextHasMore = pageHasMore;
        if (prev.length > NOTIFICATION_PAGE_SIZE) {
          nextHasMore = nextHasMore || hasMoreRef.current;
        }
        setNotifications(merged);
        setBatchedFollowStatuses(mergedFollow);
        setHasMore(nextHasMore);
        lastLoadedAtRef.current = Date.now();
        persistNotificationDisplayCache(
          effectiveListView,
          merged,
          nextHasMore,
          mergedFollow
        );
      } else {
        setNotifications(data);
        setBatchedFollowStatuses(statusMap);
        setHasMore(pageHasMore);
        lastLoadedAtRef.current = Date.now();
        persistNotificationDisplayCache(
          effectiveListView,
          data,
          pageHasMore,
          statusMap
        );
      }
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      if (!quiet) {
        setError(err.message || "Failed to load notifications");
        toast.error("Failed to load notifications");
      }
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
      void (async () => {
        const uid = await getViewerAuthUserId();
        if (uid) {
          clearNotificationDisplayCacheForUser(uid);
        }
        clearNotificationsResponseCache();
        lastLoadedAtRef.current = 0;
        initialLoadInFlightRef.current = false;
        listViewEffectGenRef.current += 1;
        setError(null);
        if (import.meta.env.DEV) {
          console.debug("[notifications-tab-refresh] refetch");
        }
        await loadNotificationsRef.current(0, false, { forceRefresh: true });
      })();
    };
    window.addEventListener(NOTIFICATIONS_TAB_REFRESH_EVENT, onTabRefresh);
    return () =>
      window.removeEventListener(NOTIFICATIONS_TAB_REFRESH_EVENT, onTabRefresh);
  }, [isVisible]);

  /** Supabase Realtime: invite rows only when Invites tab is visible — merges without loading skeleton or scroll reset */
  useEffect(() => {
    if (!isVisible || listView !== "invites") return;

    let cancelled = false;
    const channelRef: {
      current: ReturnType<typeof supabase.channel> | null;
    } = { current: null };

    void (async () => {
      const userId = await getViewerAuthUserId();
      if (!userId || cancelled) return;

      const scheduleInviteBadgeRefresh = () => {
        if (invitesRealtimeBadgeTimerRef.current) {
          clearTimeout(invitesRealtimeBadgeTimerRef.current);
        }
        invitesRealtimeBadgeTimerRef.current = setTimeout(() => {
          invitesRealtimeBadgeTimerRef.current = null;
          clearCachedNotificationCount(userId);
          clearNotificationsResponseCache();
          window.dispatchEvent(new CustomEvent("notifications:updated"));
        }, 120);
      };

      const handleInvitePayload = async (
        payload: RealtimePostgresChangesPayload<Record<string, unknown>>
      ) => {
        const raw =
          (payload.new as Record<string, unknown> | undefined) ??
          (payload.old as Record<string, unknown> | undefined);
        if (!raw) return;
        const parsed = notificationFromRealtimeRow(raw);
        if (!parsed) return;
        if (cancelled || listViewRef.current !== "invites") return;

        try {
          let withActor = await hydrateNotificationWithActor(parsed);
          withActor = await enrichInviteDirectionIfNeeded(withActor, userId);
          if (cancelled || listViewRef.current !== "invites") return;

          scheduleInviteBadgeRefresh();

          setNotifications((prev) => {
            if (listViewRef.current !== "invites") return prev;
            const id = withActor.id;
            const idx = prev.findIndex((n) => n.id === id);
            let next: NotificationWithActor[];
            if (idx >= 0) {
              const prevRow = prev[idx];
              const merged: NotificationWithActor = {
                ...prevRow,
                ...withActor,
                additional_data: {
                  ...prevRow.additional_data,
                  ...withActor.additional_data,
                },
                actor: withActor.actor ?? prevRow.actor,
              };
              const arr = [...prev];
              arr[idx] = merged;
              next = sortInviteNotificationsByLatestActivity(arr);
            } else {
              next = sortInviteNotificationsByLatestActivity([
                withActor,
                ...prev,
              ]);
            }
            persistNotificationDisplayCache(
              "invites",
              next,
              hasMoreRef.current,
              batchedFollowStatusesRef.current
            );
            return next;
          });
        } catch (e) {
          console.warn("[NotificationList] invite realtime merge failed:", e);
        }
      };

      const filter = `user_id=eq.${userId}`;
      const channel = supabase
        .channel(`notifications-invites-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter,
          },
          (p) => void handleInvitePayload(p)
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter,
          },
          (p) => void handleInvitePayload(p)
        )
        .subscribe();

      if (cancelled) {
        void supabase.removeChannel(channel);
        return;
      }
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (invitesRealtimeBadgeTimerRef.current) {
        clearTimeout(invitesRealtimeBadgeTimerRef.current);
        invitesRealtimeBadgeTimerRef.current = null;
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isVisible, listView]);

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

    const capturedListView = listView;
    const gen = ++listViewEffectGenRef.current;

    void (async () => {
      const userId = await getViewerAuthUserId();
      if (gen !== listViewEffectGenRef.current) {
        initialLoadInFlightRef.current = false;
        return;
      }
      if (!userId) {
        await loadNotifications(0, false, {
          listViewForRequest: capturedListView,
        });
        return;
      }
      const cached = readValidNotificationDisplayCache(userId, capturedListView);
      if (cached) {
        if (gen !== listViewEffectGenRef.current) {
          initialLoadInFlightRef.current = false;
          return;
        }
        setNotifications(cached.notifications);
        setHasMore(cached.hasMore);
        setBatchedFollowStatuses(cached.batchedFollowStatuses);
        notificationsRef.current = cached.notifications;
        hasMoreRef.current = cached.hasMore;
        batchedFollowStatusesRef.current = cached.batchedFollowStatuses;
        setLoading(false);
        setError(null);
        const cacheAgeMs = Date.now() - cached.ts;
        const minQuietRefreshAgeMs =
          capturedListView === "invites"
            ? MIN_INVITES_QUIET_REFRESH_AGE_MS
            : MIN_ACTIVITY_QUIET_REFRESH_AGE_MS;
        if (cacheAgeMs >= minQuietRefreshAgeMs) {
          await loadNotifications(0, false, {
            quiet: true,
            forceRefresh: true,
            listViewForRequest: capturedListView,
          });
        } else {
          initialLoadInFlightRef.current = false;
        }
        return;
      }
      if (gen !== listViewEffectGenRef.current) {
        initialLoadInFlightRef.current = false;
        return;
      }
      await loadNotifications(0, false, {
        listViewForRequest: capturedListView,
      });
    })();
  }, [isVisible, listView]);

  useEffect(() => {
    if (searchParams.get("source") !== "push") {
      pushInviteIntentKeyRef.current = null;
      pushInviteAutoLoadsRef.current = 0;
      pushInviteLastTriggeredLoadAtLenRef.current = null;
      invitePushSubFilterClearedForIntentRef.current = null;
      pushHighlightAppliedForIntentRef.current = null;
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (highlightClearTimerRef.current != null) {
        clearTimeout(highlightClearTimerRef.current);
        highlightClearTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (searchParams.get("source") !== "push") return;

    if (listView !== "invites") {
      setListView("invites");
      return;
    }

    if (loading) return;
    if (loadingMore) return;

    const pushIntentKey = searchParams.toString();
    if (pushInviteIntentKeyRef.current !== pushIntentKey) {
      pushInviteIntentKeyRef.current = pushIntentKey;
      pushInviteAutoLoadsRef.current = 0;
      pushInviteLastTriggeredLoadAtLenRef.current = null;
      invitePushSubFilterClearedForIntentRef.current = null;
      pushHighlightAppliedForIntentRef.current = null;
    }

    const inviteIdQ = searchParams.get("inviteId")?.trim() ?? "";
    const threadIdQ = searchParams.get("threadId")?.trim() ?? "";

    if (!inviteIdQ && !threadIdQ) {
      navigate(Paths.notification, { replace: true });
      return;
    }

    if (invitePushSubFilterClearedForIntentRef.current !== pushIntentKey) {
      invitePushSubFilterClearedForIntentRef.current = pushIntentKey;
      setInviteSubFilter(null);
    }

    const match = notifications.find((n) => {
      if (n.type !== "invite") return false;
      const ad = n.additional_data;
      if (!ad || typeof ad !== "object") return false;
      const rec = ad as Record<string, unknown>;
      if (threadIdQ && String(rec.thread_id ?? "") === threadIdQ) {
        return true;
      }
      if (inviteIdQ && String(rec.invite_id ?? "") === inviteIdQ) {
        return true;
      }
      return false;
    });

    if (match) {
      if (pushHighlightAppliedForIntentRef.current !== pushIntentKey) {
        pushHighlightAppliedForIntentRef.current = pushIntentKey;
        setPushHighlightNotificationId(match.id);
        if (highlightClearTimerRef.current != null) {
          clearTimeout(highlightClearTimerRef.current);
        }
        highlightClearTimerRef.current = setTimeout(() => {
          setPushHighlightNotificationId(null);
          highlightClearTimerRef.current = null;
        }, 4500);
        const id = match.id;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = inviteRowRefs.current.get(id);
            el?.scrollIntoView({ block: "center", behavior: "smooth" });
          });
        });
      }
      navigate(Paths.notification, { replace: true });
      return;
    }

    if (
      hasMore &&
      pushInviteAutoLoadsRef.current < MAX_PUSH_INVITE_AUTO_LOADS &&
      pushInviteLastTriggeredLoadAtLenRef.current !== notifications.length
    ) {
      pushInviteLastTriggeredLoadAtLenRef.current = notifications.length;
      pushInviteAutoLoadsRef.current += 1;
      void loadNotificationsRef.current(notifications.length, true);
      return;
    }

    navigate(Paths.notification, { replace: true });
  }, [
    isVisible,
    searchParams,
    listView,
    loading,
    loadingMore,
    hasMore,
    notifications,
    navigate,
  ]);

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
    setNotifications((prev) => {
      const next = prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      );
      persistNotificationDisplayCache(
        listViewRef.current,
        next,
        hasMoreRef.current,
        batchedFollowStatusesRef.current
      );
      return next;
    });
  };

  const handleClearUnreadInView = async () => {
    if (notifications.some((n) => !n.is_read)) {
      try {
        await markViewNotificationsAsRead(
          listView === "invites" ? "invite" : "activity"
        );
        lastLoadedAtRef.current = 0;
        setNotifications((prev) => {
          const next = prev.map((notification) => ({
            ...notification,
            is_read: true,
          }));
          persistNotificationDisplayCache(
            listViewRef.current,
            next,
            hasMoreRef.current,
            batchedFollowStatusesRef.current
          );
          return next;
        });
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
   * Auto-mark visible notifications read when the list is shown (activity tab only for invite rows).
   * Invite notifications on the Invites tab stay unread until the user opens the thread from the row.
   */
  useEffect(() => {
    if (!isVisible || loading) return;
    const markable = notifications
      .filter((n) => {
        if (n.is_read) return false;
        /** Invites stay unread until the user opens the thread from the row (InviteNotificationItem). */
        if (listView === "invites" && n.type === "invite") return false;
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
        setNotifications((prev) => {
          const next = prev.map((n) =>
            markSet.has(n.id) ? { ...n, is_read: true } : n
          );
          persistNotificationDisplayCache(
            listViewRef.current,
            next,
            hasMoreRef.current,
            batchedFollowStatusesRef.current
          );
          return next;
        });
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

  const visibleNotifications =
    listView === "invites" && inviteSubFilter != null
      ? notifications.filter((n) =>
          inviteRowMatchesSubFilter(n, inviteSubFilter)
        )
      : notifications;

  const showInviteFilteredEmpty =
    listView === "invites" &&
    inviteSubFilter != null &&
    notifications.length > 0 &&
    visibleNotifications.length === 0;

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
            onClick={() => loadNotifications(0, false, { forceRefresh: true })}
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

        {listView === "activity" && unreadInView > 0 && (
          <div className="mb-1 flex items-center justify-between gap-2 border-b border-[var(--border)]/60 py-2">
            <span className="min-w-0 shrink text-xs text-[var(--text)]/65">
              {unreadInView} unread
            </span>
            <button
              type="button"
              onClick={handleClearUnreadInView}
              className="shrink-0 text-xs text-[var(--text)]/50 underline-offset-2 hover:text-[var(--text)]/75 hover:underline"
            >
              Clear unread
            </button>
          </div>
        )}

        {listView === "invites" && (
          <div
            className={[
              "mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[var(--border)]/60 py-2 sm:flex-nowrap sm:gap-x-3",
              unreadInView > 0 ? "justify-between" : "justify-end",
            ].join(" ")}
          >
            {unreadInView > 0 ? (
              <span className="min-w-0 shrink-0 text-[11px] leading-tight text-[var(--text)]/65 sm:text-xs">
                {unreadInView} unread
              </span>
            ) : null}
            <div
              className={[
                "flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2",
                unreadInView > 0 ? "ml-auto sm:ml-0" : "",
              ].join(" ")}
            >
              {unreadInView > 0 ? (
                <button
                  type="button"
                  onClick={handleClearUnreadInView}
                  className="shrink-0 whitespace-nowrap pr-0.5 text-[11px] leading-tight text-[var(--text)]/50 underline-offset-2 hover:text-[var(--text)]/75 hover:underline sm:text-xs"
                >
                  Clear unread
                </button>
              ) : null}
              <div
                className="flex items-center gap-1 sm:gap-1.5"
                role="toolbar"
                aria-label="Filter invites by type"
              >
                <button
                  type="button"
                  onClick={() =>
                    setInviteSubFilter((prev) =>
                      prev === "personal" ? null : "personal"
                    )
                  }
                  aria-pressed={inviteSubFilter === "personal"}
                  aria-label="Show personal invites only"
                  className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-[color,background-color,border-color,box-shadow] outline-none",
                    "focus-visible:ring-2 focus-visible:ring-amber-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    inviteSubFilter === "personal"
                      ? "border-2 border-white/95 bg-white text-zinc-950 shadow-[0_1px_6px_rgba(0,0,0,0.35)] ring-2 ring-amber-400/55 app-light:border-neutral-950 app-light:bg-neutral-950 app-light:text-white app-light:shadow-[0_1px_6px_rgba(0,0,0,0.2)] app-light:ring-amber-500/45"
                      : "border-amber-500/45 bg-amber-500/[0.12] text-amber-200/85 hover:border-amber-400/60 hover:bg-amber-500/[0.18] hover:text-amber-50 app-light:border-amber-600/40 app-light:bg-amber-400/14 app-light:text-amber-900/80 app-light:hover:border-amber-600/55 app-light:hover:bg-amber-400/22 app-light:hover:text-amber-950",
                  ].join(" ")}
                >
                  <PiUser size={11} aria-hidden className="opacity-95" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setInviteSubFilter((prev) =>
                      prev === "group" ? null : "group"
                    )
                  }
                  aria-pressed={inviteSubFilter === "group"}
                  aria-label="Show group invites only"
                  className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-[color,background-color,border-color,box-shadow] outline-none",
                    "focus-visible:ring-2 focus-visible:ring-amber-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    inviteSubFilter === "group"
                      ? "border-2 border-white/95 bg-white text-zinc-950 shadow-[0_1px_6px_rgba(0,0,0,0.35)] ring-2 ring-amber-400/55 app-light:border-neutral-950 app-light:bg-neutral-950 app-light:text-white app-light:shadow-[0_1px_6px_rgba(0,0,0,0.2)] app-light:ring-amber-500/45"
                      : "border-amber-500/45 bg-amber-500/[0.12] text-amber-200/85 hover:border-amber-400/60 hover:bg-amber-500/[0.18] hover:text-amber-50 app-light:border-amber-600/40 app-light:bg-amber-400/14 app-light:text-amber-900/80 app-light:hover:border-amber-600/55 app-light:hover:bg-amber-400/22 app-light:hover:text-amber-950",
                  ].join(" ")}
                >
                  <PiUsers size={11} aria-hidden className="opacity-95" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setInviteSubFilter((prev) =>
                      prev === "announcement" ? null : "announcement"
                    )
                  }
                  aria-pressed={inviteSubFilter === "announcement"}
                  aria-label="Show Echo invites only"
                  className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-[color,background-color,border-color,box-shadow] outline-none",
                    "focus-visible:ring-2 focus-visible:ring-amber-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    inviteSubFilter === "announcement"
                      ? "border-2 border-white/95 bg-white text-zinc-950 shadow-[0_1px_6px_rgba(0,0,0,0.35)] ring-2 ring-amber-400/55 app-light:border-neutral-950 app-light:bg-neutral-950 app-light:text-white app-light:shadow-[0_1px_6px_rgba(0,0,0,0.2)] app-light:ring-amber-500/45"
                      : "border-amber-500/45 bg-amber-500/[0.12] text-amber-200/85 hover:border-amber-400/60 hover:bg-amber-500/[0.18] hover:text-amber-50 app-light:border-amber-600/40 app-light:bg-amber-400/14 app-light:text-amber-900/80 app-light:hover:border-amber-600/55 app-light:hover:bg-amber-400/22 app-light:hover:text-amber-950",
                  ].join(" ")}
                >
                  <PiMegaphone size={11} aria-hidden className="opacity-95" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          className={
            listView === "invites" ? "flex flex-col gap-2 py-1" : "py-1"
          }
          aria-busy={loading && notifications.length === 0 ? true : undefined}
        >
          {loading && notifications.length === 0 ? (
            listView === "invites" ? (
              <NotificationListInviteSkeletonRows />
            ) : (
              <NotificationListActivitySkeletonRows />
            )
          ) : showInviteFilteredEmpty ? (
            <p className="py-6 text-center text-sm text-[var(--text)]/55">
              No matching invites.
            </p>
          ) : listView === "activity" ? (
            visibleNotifications.map((notification) => (
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
            ))
          ) : (
            visibleNotifications.map((notification) => (
              <div
                key={notification.id}
                ref={(el) => {
                  inviteRowRefs.current.set(notification.id, el);
                }}
                className="border-b border-[var(--border)]/45 last:border-b-0"
              >
                <NotificationItem
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  showGoToPostButton
                  highlighted={pushHighlightNotificationId === notification.id}
                  batchedFollowStatus={
                    notification.type === "follow" &&
                    notification.additional_data?.follow_request_status
                      ? batchedFollowStatuses[notification.id]
                      : undefined
                  }
                />
              </div>
            ))
          )}
        </div>

        {hasMore && !(loading && notifications.length === 0) && (
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
