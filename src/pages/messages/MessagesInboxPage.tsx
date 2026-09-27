/**
 * Phase 3 / M1A.3 — Messages inbox (/messages).
 * Search + bell, compact Inbox/Requests + kind icons, Home gutter, Activities.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PiPencilSimple } from "react-icons/pi";
import toast from "react-hot-toast";
import PrimaryPageContainer from "../../components/container/PrimaryPageContainer";
import ActivitiesOverlay from "../../components/messages/ActivitiesOverlay";
import ConversationMuteActionsDrawer, {
  inboxLongPressShowsDeleteGroup,
} from "../../components/messages/ConversationMuteActionsDrawer";
import InboxConversationRowItem, {
  inboxRowNavigateState,
} from "../../components/messages/InboxConversationRowItem";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import InboxRequestsSwitch, {
  type MessagesInboxTab,
  type MessagesKindFilter,
} from "../../components/messages/InboxRequestsSwitch";
import OpenPlanRequestGroupCard from "../../components/messages/OpenPlanRequestGroupCard";
import GroupUpRequestGroupCard from "../../components/messages/GroupUpRequestGroupCard";
import MessagesTopBar from "../../components/messages/MessagesTopBar";
import MessagesNotificationPermissionNudge from "../../components/messages/MessagesNotificationPermissionNudge";
import NewMessageOverlay from "../../components/messages/NewMessageOverlay";
import {
  dissolveGroupConversation,
  leaveConversation,
  listMyConversations,
  hideDirectConversationForMe,
  hideGroupConversationForMe,
  setConversationNotificationsMuted,
  type InboxConversationRow,
} from "../../api/services/messaging";
import { inboxDirectsToComposePeople } from "../../lib/messages/composeRecentPeople";
import {
  dismissConversationOverlay,
} from "../../lib/messages/dismissConversationNav";
import { getLatestEligibleActivityCreatedAt } from "../../api/services/notifications";
import { getViewerAuthUserId } from "../../api/services/follows";
import { getErrorMessage } from "../../lib/errorHandling";
import {
  getLastActivitiesVisitedAt,
  setLastActivitiesVisitedAt,
} from "../../lib/messagesActivitiesVisitPrefs";
import {
  acknowledgeActivitiesAttention,
  getLatestEligibleActivityMs,
  refreshMessagesActivitiesAttention,
  setActivitiesOverlayOpen,
  useHasNewActivities,
} from "../../lib/messagesActivitiesAttentionStore";
import {
  getDmInboxCache,
  inboxConversationSortAt,
  isDmInboxFresh,
  isDmInboxUsable,
  patchDmInboxConversationSummary,
  patchDmInboxNotificationsMuted,
  patchDmInboxUnread,
  removeDmInboxConversation,
  setDmInboxCache,
} from "../../lib/dmInboxCache";
import { hydrateFromInboxRows, clearConversationUnread } from "../../lib/messagesUnreadStore";
import { removeDmConversationParticipantsCache } from "../../lib/dmConversationParticipantsCache";
import { removeDmMessagesCache } from "../../lib/dmMessagesCache";
import { getGroupConversationIdentity } from "../../lib/groupConversationIdentityCache";
import { invalidateGroupUpOwnForPost } from "../../lib/groupUpCache";
import { invalidateGroupUpIncoming } from "../../lib/groupUpIncomingCache";
import { invalidateGroupUpMemberships } from "../../lib/groupUpMembershipsCache";
import { invalidateGroupUpRequestGroups } from "../../lib/groupUpRequestGroupsCache";
import { invalidateGroupUpSourceList } from "../../lib/groupUpSourceListCache";
import { logDmRealtime } from "../../lib/messagesRealtimeDebug";
import { subscribeConversationPreviewPatches } from "../../lib/conversationPreviewEvents";
import {
  eligibleInboxConversations,
  filterInboxByQuery,
} from "../../lib/dmInboxEligibility";
import { useMessagesInboxRealtime } from "../../hooks/useMessagesInboxRealtime";
import { useOpenPlanRequestGroups } from "../../hooks/useOpenPlanRequestGroups";
import { useGroupUpRequestGroups } from "../../hooks/useGroupUpRequestGroups";
import {
  openOpenPlanRequestersOverlay,
  isOpenPlanRequestersOverlayOpen,
  subscribeOpenPlanRequestersOverlay,
} from "../../lib/openPlanRequestersOverlayStore";
import {
  openGroupUpRequestersOverlay,
  isGroupUpRequestersOverlayOpen,
  subscribeGroupUpRequestersOverlay,
} from "../../lib/groupUpRequestersOverlayStore";
import { sumGroupUpRequestNewCount } from "../../lib/groupUpRequestGroupsCache";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import type {
  GroupUpRequestGroup,
  OpenPlanRequestGroup,
} from "../../lib/people/types";
import {
  isMessagesConversationPath,
  messagesConversationPath,
} from "../../router/Paths";
import { useTabActive } from "../../router/PersistentTabContainer.new";
import { MESSAGES_TAB_REFRESH_EVENT } from "../../lib/homeRefreshEvents";
import { dispatchBottomTabPeek } from "../../lib/bottomTabPeek";
import useScrollDirection from "../../hooks/useScrollDirection";
import { useHomePullToRefresh } from "../../hooks/useHomePullToRefresh";
import { acquirePullToRefreshBlock } from "../../lib/pullToRefreshBlock";

/** Compact Leave / Delete chat / Delete group row exit; matches InboxConversationRowItem duration. */
const INBOX_LEAVE_EXIT_MS = 260;

function getInboxLeaveExitDurationMs(): number {
  if (typeof window === "undefined") return INBOX_LEAVE_EXIT_MS;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return 0;
    }
  } catch {
    /* ignore */
  }
  return INBOX_LEAVE_EXIT_MS;
}

/** Keep animating-out rows visible if a refresh omits them (leave / delete chat / delete group). */
function mergePreservingExitingInboxRows(
  next: InboxConversationRow[],
  prev: InboxConversationRow[],
  exitingIds: Set<string>
): InboxConversationRow[] {
  if (exitingIds.size === 0) return next;
  const nextIds = new Set(next.map((r) => r.conversation_id));
  const preserved = prev.filter(
    (r) =>
      exitingIds.has(r.conversation_id) && !nextIds.has(r.conversation_id)
  );
  if (preserved.length === 0) return next;
  return [...next, ...preserved].sort(
    (a, b) => inboxConversationSortAt(b) - inboxConversationSortAt(a)
  );
}

function rpcLikeMessage(error: unknown, fallback: string): string {
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type MessagesRequestItem =
  | { type: "dm_request"; conversation: InboxConversationRow; sortAt: number }
  | {
      type: "open_plan_request_group";
      group: OpenPlanRequestGroup;
      sortAt: number;
    }
  | {
      type: "group_up_request_group";
      group: GroupUpRequestGroup;
      sortAt: number;
    };

function dmRequestSortAt(row: InboxConversationRow): number {
  const raw = row.last_message_at || row.created_at;
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

function openPlanRequestGroupSortAt(row: OpenPlanRequestGroup): number {
  const t = row.latest_request_at ? Date.parse(row.latest_request_at) : 0;
  return Number.isFinite(t) ? t : 0;
}

function groupUpRequestGroupSortAt(row: GroupUpRequestGroup): number {
  const t = row.latest_request_at ? Date.parse(row.latest_request_at) : 0;
  return Number.isFinite(t) ? t : 0;
}

function openPlanGroupMatchesQuery(
  row: OpenPlanRequestGroup,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.plan_description, row.source_caption]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function groupUpGroupMatchesQuery(
  row: GroupUpRequestGroup,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.group_title, row.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export default function MessagesInboxPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMessagesVisible = useTabActive("messages");
  const scrollDir = useScrollDirection();
  const wasMessagesTabVisibleForScrollRef = useRef(false);

  useEffect(() => {
    if (
      isMessagesVisible &&
      !wasMessagesTabVisibleForScrollRef.current &&
      location.pathname === "/messages"
    ) {
      window.scrollTo(0, 0);
    }
    wasMessagesTabVisibleForScrollRef.current = isMessagesVisible;
  }, [isMessagesVisible, location.pathname]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<InboxConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState<MessagesInboxTab>("inbox");
  const [kindFilter, setKindFilter] = useState<MessagesKindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const hasNewActivities = useHasNewActivities();
  const [muteSheetRow, setMuteSheetRow] = useState<InboxConversationRow | null>(
    null
  );
  const [muteBusy, setMuteBusy] = useState(false);
  const [leaveConfirmRow, setLeaveConfirmRow] =
    useState<InboxConversationRow | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [deleteConfirmRow, setDeleteConfirmRow] =
    useState<InboxConversationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dissolveConfirmRow, setDissolveConfirmRow] =
    useState<InboxConversationRow | null>(null);
  const [dissolveBusy, setDissolveBusy] = useState(false);
  const [leavingConversationIds, setLeavingConversationIds] = useState(
    () => new Set<string>()
  );
  const leavingConversationIdsRef = useRef(new Set<string>());
  const leaveExitTimersRef = useRef(new Map<string, number>());
  const [openPlanRequestsOpened, setOpenPlanRequestsOpened] = useState(false);

  const openPlanGroups = useOpenPlanRequestGroups({
    enabled: openPlanRequestsOpened,
  });
  const {
    groups: openPlanRequestGroups,
    hasLoaded: openPlanHasLoaded,
    hasMore: openPlanHasMore,
    isValidating: openPlanIsValidating,
    loadMore: loadMoreOpenPlanGroups,
    refresh: refreshOpenPlanRequestGroups,
  } = openPlanGroups;

  const groupUpGroups = useGroupUpRequestGroups({
    enabled: openPlanRequestsOpened,
  });
  const {
    groups: groupUpRequestGroups,
    hasLoaded: groupUpHasLoaded,
    refresh: refreshGroupUpRequestGroups,
  } = groupUpGroups;

  const openPlanRequestersDrawerOpen = useSyncExternalStore(
    subscribeOpenPlanRequestersOverlay,
    () => isOpenPlanRequestersOverlayOpen(),
    () => false
  );
  const groupUpRequestersDrawerOpen = useSyncExternalStore(
    subscribeGroupUpRequestersOverlay,
    () => isGroupUpRequestersOverlayOpen(),
    () => false
  );

  const handleInboxTabChange = useCallback((next: MessagesInboxTab) => {
    if (next === "requests") setOpenPlanRequestsOpened(true);
    setInboxTab(next);
  }, []);

  // Deep-link: /messages?tab=requests[&requestId=…] from Open Plan push tap.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") !== "requests") return;
    setOpenPlanRequestsOpened(true);
    setInboxTab("requests");
  }, [location.search]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<InboxConversationRow[]>([]);
  const viewerResolvedOnceRef = useRef(false);
  const activitiesOpenRef = useRef(false);
  activitiesOpenRef.current = activitiesOpen;
  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = viewerUserId;
  const inboxTabRef = useRef(inboxTab);
  inboxTabRef.current = inboxTab;
  const isMessagesVisibleRef = useRef(isMessagesVisible);
  isMessagesVisibleRef.current = isMessagesVisible;
  const messagesPtrInFlightRef = useRef(false);
  const messagesPtrPromiseRef = useRef<Promise<void> | null>(null);
  const inboxRealtimeInactiveWhileHiddenRef = useRef(false);
  const inboxNeedsReconcileRef = useRef(false);
  const inboxChannelHealthyRef = useRef(false);
  const [inboxRecoverEpoch, setInboxRecoverEpoch] = useState(0);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const knownIds = useMemo(
    () => new Set(rows.map((r) => r.conversation_id)),
    [rows]
  );

  const eligible = useMemo(() => eligibleInboxConversations(rows), [rows]);

  const inboxEligible = useMemo(
    () => eligible.filter((r) => !r.is_request),
    [eligible]
  );

  const requestEligible = useMemo(
    () => eligible.filter((r) => r.is_request),
    [eligible]
  );

  const requestsBadge = useMemo(() => {
    const unreadDm = requestEligible.filter((r) => r.unread_count > 0).length;
    const openPlanCount =
      openPlanRequestsOpened && openPlanHasLoaded
        ? openPlanRequestGroups.length
        : 0;
    const groupUpNewCount =
      openPlanRequestsOpened && groupUpHasLoaded
        ? sumGroupUpRequestNewCount(groupUpRequestGroups)
        : 0;
    return unreadDm + openPlanCount + groupUpNewCount;
  }, [
    requestEligible,
    openPlanRequestsOpened,
    openPlanHasLoaded,
    openPlanRequestGroups.length,
    groupUpHasLoaded,
    groupUpRequestGroups,
  ]);

  const composeRecentPeople = useMemo(
    () => inboxDirectsToComposePeople(rows),
    [rows]
  );

  const requestItems = useMemo((): MessagesRequestItem[] => {
    if (inboxTab !== "requests") return [];
    const dmFiltered = filterInboxByQuery(requestEligible, searchQuery);
    const opFiltered = openPlanRequestGroups.filter((row) =>
      openPlanGroupMatchesQuery(row, searchQuery)
    );
    const guFiltered = groupUpRequestGroups.filter((row) =>
      groupUpGroupMatchesQuery(row, searchQuery)
    );
    const merged: MessagesRequestItem[] = [
      ...dmFiltered.map((conversation) => ({
        type: "dm_request" as const,
        conversation,
        sortAt: dmRequestSortAt(conversation),
      })),
      ...opFiltered.map((group) => ({
        type: "open_plan_request_group" as const,
        group,
        sortAt: openPlanRequestGroupSortAt(group),
      })),
      ...guFiltered.map((group) => ({
        type: "group_up_request_group" as const,
        group,
        sortAt: groupUpRequestGroupSortAt(group),
      })),
    ];
    merged.sort((a, b) => b.sortAt - a.sortAt);
    return merged;
  }, [
    inboxTab,
    requestEligible,
    searchQuery,
    openPlanRequestGroups,
    groupUpRequestGroups,
  ]);

  const visible = useMemo(() => {
    if (inboxTab === "requests") return [];
    const byKind =
      kindFilter === "all"
        ? inboxEligible
        : kindFilter === "dms"
          ? inboxEligible.filter((r) => r.kind !== "group")
          : inboxEligible.filter((r) => r.kind === "group");
    return filterInboxByQuery(byKind, searchQuery);
  }, [inboxTab, inboxEligible, kindFilter, searchQuery]);

  const searchMiss =
    searchQuery.trim().length > 0 &&
    (inboxTab === "requests"
      ? requestEligible.length > 0 ||
        openPlanRequestGroups.length > 0 ||
        groupUpRequestGroups.length > 0
      : inboxEligible.length > 0) &&
    (inboxTab === "requests"
      ? requestItems.length === 0
      : visible.length === 0);

  const kindFilterEmpty =
    inboxTab === "inbox" &&
    !loading &&
    !error &&
    inboxEligible.length > 0 &&
    visible.length === 0 &&
    !searchQuery.trim();

  const inboxEmpty =
    inboxTab === "inbox" &&
    !loading &&
    !error &&
    inboxEligible.length === 0;

  const requestsEmpty =
    inboxTab === "requests" &&
    openPlanHasLoaded &&
    groupUpHasLoaded &&
    !error &&
    requestEligible.length === 0 &&
    openPlanRequestGroups.length === 0 &&
    groupUpRequestGroups.length === 0;

  /**
   * Inbox conversation load must not block the Requests tab when Open Plan /
   * Group Up caches (or settled empty loads) can already populate the list.
   * Full-page loader only until both request-group hooks have hydrated once
   * and there is still nothing to show.
   */
  const showRequestsInitialLoader =
    inboxTab === "requests" &&
    requestItems.length === 0 &&
    (!openPlanHasLoaded || !groupUpHasLoaded);

  const showInboxInitialLoader =
    inboxTab === "inbox" && loading && rows.length === 0;

  const loadInbox = useCallback(
    async (
      viewerId: string,
      opts?: { silent?: boolean; showLoaderIfEmpty?: boolean }
    ): Promise<boolean> => {
      const silent = opts?.silent === true;
      const showLoaderIfEmpty = opts?.showLoaderIfEmpty === true;
      if (!silent && showLoaderIfEmpty && rowsRef.current.length === 0) {
        setLoading(true);
      }
      const { data, error: rpcError } = await listMyConversations();
      if (rpcError || !data) {
        if (rowsRef.current.length === 0) {
          setError(rpcLikeMessage(rpcError, "Could not load messages."));
        }
        if (!silent) setLoading(false);
        return false;
      }
      setError(null);
      setRows((prev) =>
        mergePreservingExitingInboxRows(
          data.conversations,
          prev,
          leavingConversationIdsRef.current
        )
      );
      setDmInboxCache(viewerId, data.conversations);
      hydrateFromInboxRows(viewerId, data.conversations);
      if (!silent) setLoading(false);
      return true;
    },
    []
  );

  const refreshActivitiesBadge = useCallback(async () => {
    const uid = viewerUserIdRef.current;
    if (!uid) return;
    if (activitiesOpenRef.current) {
      acknowledgeActivitiesAttention();
      return;
    }
    await refreshMessagesActivitiesAttention(uid);
  }, []);

  const scheduleAuthoritativeRefresh = useCallback(
    (viewerId: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        void loadInbox(viewerId, { silent: true });
      }, 400);
    },
    [loadInbox]
  );

  const runSilentInboxReconcile = useCallback(
    (viewerId: string, reason: string) => {
      const cached = getDmInboxCache(viewerId);
      const cacheAgeMs = cached ? Math.max(0, Date.now() - cached.updatedAt) : null;
      logDmRealtime("inbox-reconcile", {
        reason,
        run: true,
        cacheAgeMs,
      });
      inboxRealtimeInactiveWhileHiddenRef.current = false;
      inboxNeedsReconcileRef.current = false;
      void loadInbox(viewerId, { silent: true });
    },
    [loadInbox]
  );

  const canSkipFreshInbox = useCallback((viewerId: string): boolean => {
    const cached = getDmInboxCache(viewerId);
    if (!cached || !isDmInboxFresh(cached)) return false;
    if (inboxRealtimeInactiveWhileHiddenRef.current) return false;
    if (inboxNeedsReconcileRef.current) return false;
    if (!inboxChannelHealthyRef.current) return false;
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!viewerResolvedOnceRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        const viewer = await getViewerAuthUserId();
        if (cancelled) return;
        if (!viewer) {
          setError("Not authenticated.");
          setLoading(false);
          return;
        }

        setViewerUserId(viewer);
        viewerResolvedOnceRef.current = true;

        const cached = getDmInboxCache(viewer);
        if (cached && isDmInboxUsable(cached)) {
          setRows(cached.conversations);
          hydrateFromInboxRows(viewer, cached.conversations);
          setLoading(false);
          void refreshActivitiesBadge();
          if (!isDmInboxFresh(cached)) {
            void loadInbox(viewer, { silent: true });
          }
          return;
        }

        if (cached) {
          setRows(cached.conversations);
          hydrateFromInboxRows(viewer, cached.conversations);
          setLoading(false);
          void refreshActivitiesBadge();
          void loadInbox(viewer, { silent: true });
          return;
        }

        await loadInbox(viewer, { showLoaderIfEmpty: true });
        if (!cancelled) void refreshActivitiesBadge();
      } catch (e) {
        if (!cancelled) {
          if (rowsRef.current.length === 0) {
            setError(rpcLikeMessage(e, "Could not load messages."));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [loadInbox, refreshActivitiesBadge]);

  // Defense in depth: account switch while Messages stays mounted.
  useEffect(() => {
    if (!isMessagesVisible || !viewerUserId) return;
    let cancelled = false;
    (async () => {
      const viewer = await getViewerAuthUserId();
      if (cancelled || !viewer) return;
      if (viewer === viewerUserId) return;
      setRows([]);
      setError(null);
      setInboxTab("inbox");
      setKindFilter("all");
      setSearchQuery("");
      setViewerUserId(viewer);
      const cached = getDmInboxCache(viewer);
      if (cached && isDmInboxUsable(cached)) {
        setRows(cached.conversations);
        hydrateFromInboxRows(viewer, cached.conversations);
        if (!isDmInboxFresh(cached)) {
          void loadInbox(viewer, { silent: true });
        }
      } else {
        void loadInbox(viewer, { showLoaderIfEmpty: true });
      }
      void refreshActivitiesBadge();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isMessagesVisible,
    viewerUserId,
    loadInbox,
    refreshActivitiesBadge,
  ]);

  useEffect(() => {
    if (!isMessagesVisible) return;
    dispatchBottomTabPeek("messages", scrollDir === "down");
  }, [scrollDir, isMessagesVisible]);

  useEffect(() => {
    if (!isMessagesVisible) {
      inboxRealtimeInactiveWhileHiddenRef.current = true;
      inboxChannelHealthyRef.current = false;
    }
  }, [isMessagesVisible]);

  useEffect(() => {
    if (!isMessagesVisible || !viewerUserId) return;
    if (
      !inboxRealtimeInactiveWhileHiddenRef.current &&
      !inboxNeedsReconcileRef.current
    ) {
      return;
    }
    const reason = inboxRealtimeInactiveWhileHiddenRef.current
      ? "hidden_gap"
      : "channel_unhealthy";
    runSilentInboxReconcile(viewerUserId, reason);
  }, [isMessagesVisible, viewerUserId, runSilentInboxReconcile]);

  useEffect(() => {
    if (inboxRecoverEpoch <= 0 || !viewerUserId) return;
    if (!isMessagesVisibleRef.current) return;
    runSilentInboxReconcile(viewerUserId, "channel_unhealthy");
  }, [inboxRecoverEpoch, viewerUserId, runSilentInboxReconcile]);

  useEffect(() => {
    if (!viewerUserId) return;
    const onTabRefresh = () => {
      if (canSkipFreshInbox(viewerUserId)) {
        logDmRealtime("inbox-reconcile", {
          reason: "fresh_cache",
          run: false,
        });
        if (isMessagesVisible) void refreshActivitiesBadge();
        return;
      }
      if (
        inboxRealtimeInactiveWhileHiddenRef.current ||
        inboxNeedsReconcileRef.current ||
        !inboxChannelHealthyRef.current
      ) {
        runSilentInboxReconcile(
          viewerUserId,
          inboxRealtimeInactiveWhileHiddenRef.current
            ? "hidden_gap"
            : inboxNeedsReconcileRef.current
              ? "channel_unhealthy"
              : "stale_age"
        );
      } else {
        const cached = getDmInboxCache(viewerUserId);
        if (cached && isDmInboxUsable(cached)) {
          void loadInbox(viewerUserId, { silent: true });
        } else {
          void loadInbox(viewerUserId, {
            silent: rowsRef.current.length > 0,
            showLoaderIfEmpty: true,
          });
        }
      }
      if (isMessagesVisible) {
        void refreshActivitiesBadge();
      }
    };
    window.addEventListener(MESSAGES_TAB_REFRESH_EVENT, onTabRefresh);
    return () => {
      window.removeEventListener(MESSAGES_TAB_REFRESH_EVENT, onTabRefresh);
    };
  }, [
    viewerUserId,
    isMessagesVisible,
    loadInbox,
    refreshActivitiesBadge,
    canSkipFreshInbox,
    runSilentInboxReconcile,
  ]);

  useEffect(() => {
    if (!viewerUserId || !isMessagesVisible) return;

    const onFocus = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      if (canSkipFreshInbox(viewerUserId)) {
        logDmRealtime("inbox-reconcile", {
          reason: "fresh_cache",
          run: false,
        });
        void refreshActivitiesBadge();
        return;
      }
      if (
        inboxRealtimeInactiveWhileHiddenRef.current ||
        inboxNeedsReconcileRef.current ||
        !inboxChannelHealthyRef.current
      ) {
        runSilentInboxReconcile(
          viewerUserId,
          inboxRealtimeInactiveWhileHiddenRef.current
            ? "hidden_gap"
            : inboxNeedsReconcileRef.current
              ? "channel_unhealthy"
              : "stale_age"
        );
      } else {
        const cached = getDmInboxCache(viewerUserId);
        if (cached && isDmInboxUsable(cached)) {
          void loadInbox(viewerUserId, { silent: true });
        } else if (!cached || rowsRef.current.length === 0) {
          void loadInbox(viewerUserId, {
            silent: rowsRef.current.length > 0,
            showLoaderIfEmpty: true,
          });
        } else {
          void loadInbox(viewerUserId, { silent: true });
        }
      }
      void refreshActivitiesBadge();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [
    viewerUserId,
    isMessagesVisible,
    loadInbox,
    refreshActivitiesBadge,
    canSkipFreshInbox,
    runSilentInboxReconcile,
  ]);

  useEffect(() => {
    const onNotificationsUpdated = () => {
      void refreshActivitiesBadge();
    };
    window.addEventListener("notifications:updated", onNotificationsUpdated);
    return () => {
      window.removeEventListener(
        "notifications:updated",
        onNotificationsUpdated
      );
    };
  }, [refreshActivitiesBadge]);

  useEffect(() => {
    if (!viewerUserId) return;
    return subscribeConversationPreviewPatches((patch) => {
      const conversationId = patch.conversationId.trim();
      if (!conversationId) return;
      const last_message_at = patch.lastMessageAt ?? null;
      const last_message_preview = patch.preview ?? null;
      const last_message_sender_id = patch.senderUserId ?? null;
      const is_last_from_me =
        !!last_message_sender_id && last_message_sender_id === viewerUserId;
      const next = patchDmInboxConversationSummary(
        viewerUserId,
        conversationId,
        {
          last_message_at,
          last_message_preview,
          last_message_sender_id,
          is_last_from_me,
        }
      );
      if (next) {
        setRows(next);
        return;
      }
      setRows((prev) => {
        const mapped = prev.map((r) =>
          r.conversation_id === conversationId
            ? {
                ...r,
                last_message_at,
                last_message_preview,
                last_message_sender_id,
                is_last_from_me,
              }
            : r
        );
        mapped.sort((a, b) => {
          const at = inboxConversationSortAt(a);
          const bt = inboxConversationSortAt(b);
          if (bt !== at) return bt - at;
          return Date.parse(b.created_at) - Date.parse(a.created_at);
        });
        return mapped;
      });
    });
  }, [viewerUserId]);

  useMessagesInboxRealtime({
    viewerUserId,
    enabled: !!viewerUserId && isMessagesVisible,
    knownConversationIds: knownIds,
    onStatus: (status) => {
      if (status === "SUBSCRIBED") {
        const shouldRecover =
          inboxNeedsReconcileRef.current && isMessagesVisibleRef.current;
        inboxChannelHealthyRef.current = true;
        if (shouldRecover) {
          inboxNeedsReconcileRef.current = false;
          setInboxRecoverEpoch((n) => n + 1);
        }
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        (status === "CLOSED" && isMessagesVisibleRef.current)
      ) {
        inboxChannelHealthyRef.current = false;
        inboxNeedsReconcileRef.current = true;
      }
    },
    onMemberUnread: (conversationId, unreadCount) => {
      if (!viewerUserId) return;
      const next = patchDmInboxUnread(
        viewerUserId,
        conversationId,
        unreadCount
      );
      if (next) setRows(next);
      else {
        setRows((prev) =>
          prev.map((r) =>
            r.conversation_id === conversationId
              ? { ...r, unread_count: Math.max(0, unreadCount) }
              : r
          )
        );
      }
    },
    onMemberInsertUnknown: () => {
      if (!viewerUserId) return;
      scheduleAuthoritativeRefresh(viewerUserId);
    },
    onMemberLeft: (conversationId) => {
      if (!viewerUserId) return;
      // Animated Leave / Delete chat / Delete group owns removal — don't yank mid-exit.
      if (leavingConversationIdsRef.current.has(conversationId)) {
        clearConversationUnread(conversationId);
        return;
      }
      clearConversationUnread(conversationId);
      const next = removeDmInboxConversation(viewerUserId, conversationId);
      if (next) {
        setRows(next);
        return;
      }
      setRows((prev) =>
        prev.filter((r) => r.conversation_id !== conversationId)
      );
    },
    onConversationSummary: ({
      conversationId,
      last_message_at,
      last_message_preview,
      last_message_sender_id,
    }) => {
      if (!viewerUserId) return;
      const is_last_from_me =
        !!last_message_sender_id && last_message_sender_id === viewerUserId;
      const next = patchDmInboxConversationSummary(viewerUserId, conversationId, {
        last_message_at,
        last_message_preview,
        last_message_sender_id,
        is_last_from_me,
      });
      if (next) {
        setRows(next);
        return;
      }
      setRows((prev) => {
        const mapped = prev.map((r) =>
          r.conversation_id === conversationId
            ? {
                ...r,
                last_message_at,
                last_message_preview,
                last_message_sender_id,
                is_last_from_me,
              }
            : r
        );
        mapped.sort((a, b) => {
          const at = inboxConversationSortAt(a);
          const bt = inboxConversationSortAt(b);
          if (bt !== at) return bt - at;
          return Date.parse(b.created_at) - Date.parse(a.created_at);
        });
        return mapped;
      });
    },
  });

  const safeHorizontalPad =
    "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]";

  const handleCloseActivities = () => {
    setActivitiesOpen(false);
    setActivitiesOverlayOpen(false);
    // Visit watermark already persisted — do not re-light from residual unread.
  };

  const handleOpenActivities = () => {
    acknowledgeActivitiesAttention();
    setActivitiesOverlayOpen(true);
    setActivitiesOpen(true);
    const uid = viewerUserIdRef.current;
    if (!uid) return;
    const known = getLatestEligibleActivityMs();
    // Race-safe: visit covers now and any already-known latest eligible row.
    setLastActivitiesVisitedAt(
      uid,
      Math.max(Date.now(), known != null ? known : 0)
    );
    void (async () => {
      try {
        const latestMs = await getLatestEligibleActivityCreatedAt();
        const stillUid = viewerUserIdRef.current;
        if (!stillUid) return;
        const prev = getLastActivitiesVisitedAt(stillUid) ?? 0;
        setLastActivitiesVisitedAt(
          stillUid,
          Math.max(Date.now(), latestMs ?? 0, prev)
        );
      } catch {
        /* keep watermark already written */
      }
    })();
  };

  const openConversation = useCallback(
    (row: InboxConversationRow) => {
      navigate(messagesConversationPath(row.conversation_id), {
        state: inboxRowNavigateState(row, location),
      });
    },
    [navigate, location]
  );

  const handleOpenOpenPlanRequestGroup = useCallback(
    (group: OpenPlanRequestGroup) => {
      openOpenPlanRequestersOverlay(group);
    },
    []
  );

  const handleViewOpenPlanSourcePost = useCallback(
    (group: OpenPlanRequestGroup) => {
      if (!group.source_post_id) return;
      navigateToPostDetailInApp(
        navigate,
        location,
        "experience",
        group.source_post_id
      );
    },
    [navigate, location]
  );

  const handleOpenGroupUpRequestGroup = useCallback(
    (group: GroupUpRequestGroup) => {
      openGroupUpRequestersOverlay(group);
    },
    []
  );

  const handleViewGroupUpSourcePost = useCallback(
    (group: GroupUpRequestGroup) => {
      if (
        !group.source_post_id ||
        (group.source_type !== "hangout" && group.source_type !== "experience")
      ) {
        return;
      }
      navigateToPostDetailInApp(
        navigate,
        location,
        group.source_type,
        group.source_post_id
      );
    },
    [navigate, location]
  );

  const handleMuteToggle = useCallback(async () => {
    if (!muteSheetRow || !viewerUserId || muteBusy) return;
    const conversationId = muteSheetRow.conversation_id;
    const nextMuted = !muteSheetRow.notifications_muted;
    setMuteBusy(true);
    try {
      const { data, error: rpcError } = await setConversationNotificationsMuted(
        conversationId,
        nextMuted
      );
      if (rpcError || !data) {
        toast.error("Couldn't update notification settings.");
        return;
      }
      const muted = data.notifications_muted;
      const patched = patchDmInboxNotificationsMuted(
        viewerUserId,
        conversationId,
        muted
      );
      if (patched) setRows(patched);
      else {
        setRows((prev) =>
          prev.map((r) =>
            r.conversation_id === conversationId
              ? { ...r, notifications_muted: muted }
              : r
          )
        );
      }
      toast.success(
        muted ? "Notifications muted" : "Notifications unmuted"
      );
      setMuteSheetRow(null);
    } finally {
      setMuteBusy(false);
    }
  }, [muteSheetRow, viewerUserId, muteBusy]);

  const sheetActionBusy = muteBusy || leaveBusy || deleteBusy || dissolveBusy;

  const handleLeaveGroupRequest = useCallback(() => {
    if (
      !muteSheetRow ||
      muteSheetRow.kind !== "group" ||
      sheetActionBusy
    ) {
      return;
    }
    const row = muteSheetRow;
    setMuteSheetRow(null);
    setLeaveConfirmRow(row);
  }, [muteSheetRow, sheetActionBusy]);

  const handleDeleteChatRequest = useCallback(() => {
    if (!muteSheetRow || sheetActionBusy) {
      return;
    }
    const row = muteSheetRow;
    setMuteSheetRow(null);
    setDeleteConfirmRow(row);
  }, [muteSheetRow, sheetActionBusy]);

  const handleDeleteGroupRequest = useCallback(() => {
    if (
      !muteSheetRow ||
      muteSheetRow.kind !== "group" ||
      !inboxLongPressShowsDeleteGroup(
        muteSheetRow.kind,
        muteSheetRow.viewer_role
      ) ||
      sheetActionBusy
    ) {
      return;
    }
    const row = muteSheetRow;
    setMuteSheetRow(null);
    setDissolveConfirmRow(row);
  }, [muteSheetRow, sheetActionBusy]);

  const beginInboxRowExit = useCallback(
    (
      viewerId: string,
      conversationId: string,
      opts?: { preserveGroupIdentity?: boolean }
    ) => {
      const commitInboxRemoval = () => {
        leaveExitTimersRef.current.delete(conversationId);
        leavingConversationIdsRef.current.delete(conversationId);
        setLeavingConversationIds((prev) => {
          if (!prev.has(conversationId)) return prev;
          const next = new Set(prev);
          next.delete(conversationId);
          return next;
        });
        const next = removeDmInboxConversation(viewerId, conversationId, {
          preserveGroupIdentity: opts?.preserveGroupIdentity === true,
        });
        if (next) setRows(next);
        else {
          setRows((prev) =>
            prev.filter((r) => r.conversation_id !== conversationId)
          );
        }
      };

      leavingConversationIdsRef.current.add(conversationId);
      setLeavingConversationIds((prev) => {
        if (prev.has(conversationId)) return prev;
        const next = new Set(prev);
        next.add(conversationId);
        return next;
      });

      const durationMs = getInboxLeaveExitDurationMs();
      if (durationMs === 0) {
        commitInboxRemoval();
      } else {
        const existing = leaveExitTimersRef.current.get(conversationId);
        if (existing != null) window.clearTimeout(existing);
        const t = window.setTimeout(commitInboxRemoval, durationMs);
        leaveExitTimersRef.current.set(conversationId, t);
      }
    },
    []
  );

  const dismissIfOpenConversation = useCallback(
    (conversationId: string) => {
      if (
        isMessagesConversationPath(location.pathname) &&
        location.pathname.replace(/\/$/, "") ===
          messagesConversationPath(conversationId)
      ) {
        dismissConversationOverlay(navigate, location.state);
      }
    },
    [location.pathname, location.state, navigate]
  );

  const handleConfirmLeaveGroup = useCallback(async () => {
    if (!leaveConfirmRow || !viewerUserId || leaveBusy) return;
    if (leaveConfirmRow.kind !== "group") return;
    const conversationId = leaveConfirmRow.conversation_id.trim();
    if (!conversationId) return;
    if (leavingConversationIdsRef.current.has(conversationId)) return;

    setLeaveBusy(true);
    try {
      const { error } = await leaveConversation(conversationId);
      if (error) {
        toast.error(getErrorMessage(error) || "Could not leave group.");
        return;
      }

      removeDmConversationParticipantsCache(viewerUserId, conversationId);
      clearConversationUnread(conversationId);
      setLeaveConfirmRow(null);
      dismissIfOpenConversation(conversationId);
      beginInboxRowExit(viewerUserId, conversationId);
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not leave group.");
    } finally {
      setLeaveBusy(false);
    }
  }, [
    leaveConfirmRow,
    viewerUserId,
    leaveBusy,
    dismissIfOpenConversation,
    beginInboxRowExit,
  ]);

  const handleConfirmDeleteChat = useCallback(async () => {
    if (!deleteConfirmRow || !viewerUserId || deleteBusy) return;
    const conversationId = deleteConfirmRow.conversation_id.trim();
    if (!conversationId) return;
    if (leavingConversationIdsRef.current.has(conversationId)) return;

    const isGroup = deleteConfirmRow.kind === "group";

    setDeleteBusy(true);
    try {
      const { error } = isGroup
        ? await hideGroupConversationForMe(conversationId)
        : await hideDirectConversationForMe(conversationId);
      if (error) {
        toast.error(getErrorMessage(error) || "Could not delete chat.");
        return;
      }

      removeDmMessagesCache(viewerUserId, conversationId);
      // Group Delete chat keeps membership — preserve participants/identity.
      if (!isGroup) {
        removeDmConversationParticipantsCache(viewerUserId, conversationId);
      }
      clearConversationUnread(conversationId);
      setDeleteConfirmRow(null);
      dismissIfOpenConversation(conversationId);
      beginInboxRowExit(viewerUserId, conversationId, {
        preserveGroupIdentity: isGroup,
      });
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not delete chat.");
    } finally {
      setDeleteBusy(false);
    }
  }, [
    deleteConfirmRow,
    viewerUserId,
    deleteBusy,
    dismissIfOpenConversation,
    beginInboxRowExit,
  ]);

  const handleConfirmDissolveGroup = useCallback(async () => {
    if (!dissolveConfirmRow || !viewerUserId || dissolveBusy) return;
    if (dissolveConfirmRow.kind !== "group") return;
    if (
      !inboxLongPressShowsDeleteGroup(
        dissolveConfirmRow.kind,
        dissolveConfirmRow.viewer_role
      )
    ) {
      return;
    }
    const conversationId = dissolveConfirmRow.conversation_id.trim();
    if (!conversationId) return;
    if (leavingConversationIdsRef.current.has(conversationId)) return;

    setDissolveBusy(true);
    try {
      const { data, error } = await dissolveGroupConversation(conversationId);
      if (error || !data?.dissolved) {
        toast.error(getErrorMessage(error) || "Could not delete group.");
        return;
      }

      const sourcePostId =
        getGroupConversationIdentity(viewerUserId, conversationId)
          ?.sourceContext?.source_post_id?.trim() || null;

      removeDmMessagesCache(viewerUserId, conversationId);
      removeDmConversationParticipantsCache(viewerUserId, conversationId);
      clearConversationUnread(conversationId);

      invalidateGroupUpMemberships(viewerUserId);
      invalidateGroupUpIncoming(viewerUserId);
      invalidateGroupUpRequestGroups(viewerUserId);
      if (sourcePostId) {
        invalidateGroupUpOwnForPost(sourcePostId);
        invalidateGroupUpSourceList(sourcePostId);
      }

      setDissolveConfirmRow(null);
      dismissIfOpenConversation(conversationId);
      // Default removal clears group identity (do not preserve).
      beginInboxRowExit(viewerUserId, conversationId);
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not delete group.");
    } finally {
      setDissolveBusy(false);
    }
  }, [
    dissolveConfirmRow,
    viewerUserId,
    dissolveBusy,
    dismissIfOpenConversation,
    beginInboxRowExit,
  ]);

  useEffect(() => {
    return () => {
      for (const t of leaveExitTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      leaveExitTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!activitiesOpen) return;
    return acquirePullToRefreshBlock();
  }, [activitiesOpen]);

  useEffect(() => {
    if (!openPlanRequestersDrawerOpen && !groupUpRequestersDrawerOpen) return;
    return acquirePullToRefreshBlock();
  }, [openPlanRequestersDrawerOpen, groupUpRequestersDrawerOpen]);

  const runMessagesPullRefresh = useCallback((): Promise<void> => {
    if (messagesPtrPromiseRef.current) {
      return messagesPtrPromiseRef.current;
    }
    const uid = viewerUserIdRef.current;
    if (!uid) {
      return Promise.resolve();
    }
    messagesPtrInFlightRef.current = true;
    const tab = inboxTabRef.current;
    const run = (async () => {
      try {
        logDmRealtime("inbox-reconcile", {
          reason: tab === "requests" ? "ptr_requests" : "ptr",
          run: true,
        });
        if (tab === "requests") {
          setOpenPlanRequestsOpened(true);
          // Force-refresh DM requests + Open Plan / Group Up summaries in parallel.
          // Do not clear caches first — hooks replace on success and keep prior on error.
          const [inboxOk] = await Promise.all([
            loadInbox(uid, { silent: true }),
            refreshOpenPlanRequestGroups(),
            refreshGroupUpRequestGroups(),
          ]);
          if (!inboxOk && rowsRef.current.length > 0) {
            toast.error("Couldn't refresh. Try again.");
          }
        } else {
          const inboxOk = await loadInbox(uid, { silent: true });
          if (!inboxOk && rowsRef.current.length > 0) {
            toast.error("Couldn't refresh. Try again.");
          }
        }
        await refreshActivitiesBadge();
      } finally {
        messagesPtrInFlightRef.current = false;
        messagesPtrPromiseRef.current = null;
      }
    })();
    messagesPtrPromiseRef.current = run;
    return run;
  }, [
    loadInbox,
    refreshActivitiesBadge,
    refreshOpenPlanRequestGroups,
    refreshGroupUpRequestGroups,
  ]);

  const messagesPtrEnabled =
    isMessagesVisible &&
    !activitiesOpen &&
    !composeOpen &&
    !muteSheetRow &&
    !leaveConfirmRow &&
    !deleteConfirmRow &&
    !dissolveConfirmRow &&
    !openPlanRequestersDrawerOpen &&
    !groupUpRequestersDrawerOpen;

  const {
    pullPx: messagesPullPx,
    pullProgress: messagesPullProgress,
    isRefreshing: messagesPtrRefreshing,
  } = useHomePullToRefresh({
    enabled: messagesPtrEnabled,
    onCommit: () => {
      // Refresh the active tab in place — do not reset Inbox/Requests or filters.
      // Return the promise so the spinner stays up for the real refresh duration.
      return runMessagesPullRefresh();
    },
    // Completion is driven by the onCommit promise (not epoch).
    refreshEpoch: 0,
  });

  return (
    <>
      {messagesPtrEnabled && (messagesPullPx > 2 || messagesPtrRefreshing) ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(messagesPullProgress * 100)}
          aria-label={
            messagesPtrRefreshing ? "Refreshing messages" : "Pull to refresh"
          }
          className="pointer-events-none fixed left-0 right-0 z-[50] flex justify-center"
          style={{
            top: "calc(132px + var(--safe-area-top-layout))",
            opacity: messagesPtrRefreshing
              ? 1
              : Math.min(1, 0.12 + messagesPullProgress * 0.88),
            transition: messagesPtrRefreshing
              ? undefined
              : "opacity 80ms ease-out",
          }}
        >
          <span
            className={`inline-block h-7 w-7 rounded-full border-2 border-[#F7D047]/30 border-t-[#F7D047] ${
              messagesPtrRefreshing ? "animate-spin" : ""
            }`}
            aria-hidden
          />
        </div>
      ) : null}
    <PrimaryPageContainer capacitorNotchScrim>
      {/* Home-matching top gradient: physical top → transparent (under sticky chrome) */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 right-0 top-0 z-[29]"
        style={{
          height: "calc(66px + var(--safe-area-top-layout))",
          width: "100%",
          background: "var(--gradient-from-top)",
        }}
      />
      {/*
        Messages-only: opaque sticky chrome so list rows cannot show through search /
        Inbox|Requests on Capacitor overscroll. Soft fade only at the bottom edge.
        DM / Home keep their transparent + top-gradient treatment.
      */}
      <div
        className="sticky top-0 z-[31] w-full max-w-full bg-[var(--app-canvas)]"
        style={{ paddingTop: "var(--safe-area-top-layout)" }}
      >
        <div className={`relative pt-2 pb-1.5 ${safeHorizontalPad}`}>
          <MessagesTopBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            hasNewActivities={hasNewActivities}
            activitiesOpen={activitiesOpen}
            onOpenActivities={handleOpenActivities}
          />
          <InboxRequestsSwitch
            tab={inboxTab}
            onTabChange={handleInboxTabChange}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            kindFiltersDisabled={inboxTab === "requests"}
            requestsBadge={requestsBadge}
          />
          <MessagesNotificationPermissionNudge />
        </div>
        {/* Soft dissolve under filters — solid above via sticky bg. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-full z-[1] h-7"
          style={{
            background:
              "linear-gradient(to bottom, var(--bg) 0%, var(--bg) 42%, transparent 100%)",
          }}
        />
      </div>

      <div className="w-full max-w-full pt-2 pb-[calc(5.5rem+var(--safe-area-bottom-layout))]">
        {showInboxInitialLoader || showRequestsInitialLoader ? (
          <p className="py-10 text-center text-sm text-[var(--text)]/60">
            Loading…
          </p>
        ) : error && rows.length === 0 && inboxTab === "inbox" ? (
          <p className="py-10 text-center text-sm text-red-500/90" role="alert">
            {error}
          </p>
        ) : requestsEmpty ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-base font-semibold text-[var(--text)]">
              No message requests
            </p>
            <p className="mt-2 max-w-xs text-sm text-[var(--text)]/55">
              New requests will show up here.
            </p>
          </div>
        ) : inboxEmpty ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-base font-semibold text-[var(--text)]">
              Start a conversation
            </p>
            <p className="mt-2 max-w-xs text-sm text-[var(--text)]/55">
              Message someone and start making plans.
            </p>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="mt-5 rounded-full bg-amber-400/90 px-5 py-2.5 text-sm font-semibold text-neutral-900 transition-opacity hover:opacity-95 active:scale-[0.98]"
            >
              Message
            </button>
          </div>
        ) : searchMiss ? (
          <p className="py-10 text-center text-sm text-[var(--text)]/50">
            No chats found
          </p>
        ) : kindFilterEmpty ? (
          <p className="py-10 text-center text-sm text-[var(--text)]/50">
            {kindFilter === "groups"
              ? "No groups"
              : kindFilter === "dms"
                ? "No DMs"
                : "No chats found"}
          </p>
        ) : inboxTab === "requests" ? (
          <>
          <ul className="flex flex-col pt-5">
            {requestItems.map((item) =>
              item.type === "dm_request" ? (
                <InboxConversationRowItem
                  key={`dm:${item.conversation.conversation_id}`}
                  row={item.conversation}
                  onOpen={openConversation}
                  onLongPressActions={setMuteSheetRow}
                  isLeaving={leavingConversationIds.has(
                    item.conversation.conversation_id
                  )}
                />
              ) : item.type === "open_plan_request_group" ? (
                <OpenPlanRequestGroupCard
                  key={`op:${item.group.opportunity_id}`}
                  group={item.group}
                  onOpen={handleOpenOpenPlanRequestGroup}
                  onViewPost={handleViewOpenPlanSourcePost}
                />
              ) : (
                <GroupUpRequestGroupCard
                  key={`gu:${item.group.conversation_id}`}
                  group={item.group}
                  onOpen={handleOpenGroupUpRequestGroup}
                  onViewPost={handleViewGroupUpSourcePost}
                />
              )
            )}
          </ul>
          {openPlanHasMore ? (
            <button
              type="button"
              disabled={openPlanIsValidating}
              onClick={() => void loadMoreOpenPlanGroups()}
              className="mx-auto my-3 block min-h-10 px-4 text-[13px] font-semibold text-[var(--text)]/55"
            >
              {openPlanIsValidating ? "…" : "Load more"}
            </button>
          ) : null}
          </>
        ) : (
          <ul className="flex flex-col">
            {visible.map((row) => (
              <InboxConversationRowItem
                key={row.conversation_id}
                row={row}
                onOpen={openConversation}
                onLongPressActions={setMuteSheetRow}
                isLeaving={leavingConversationIds.has(row.conversation_id)}
              />
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setComposeOpen(true)}
        className="fixed z-[40] flex h-14 w-14 items-center justify-center rounded-full border border-[var(--bottom-tab-border)] bg-amber-400/95 text-neutral-900 shadow-[0_4px_16px_rgba(0,0,0,0.18),0_0_0_1px_var(--bottom-tab-pill-ring)] transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        style={{
          right: "max(1rem, env(safe-area-inset-right, 0px))",
          bottom: "calc(var(--safe-area-bottom-layout, 0px) + 5rem)",
        }}
        aria-label="New message"
      >
        <PiPencilSimple className="h-6 w-6" aria-hidden />
      </button>

      <NewMessageOverlay
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        recentPeople={composeRecentPeople}
      />

      <ActivitiesOverlay
        open={activitiesOpen}
        onClose={handleCloseActivities}
      />

      <ConversationMuteActionsDrawer
        open={!!muteSheetRow}
        onClose={() => {
          if (!sheetActionBusy) setMuteSheetRow(null);
        }}
        muted={muteSheetRow?.notifications_muted === true}
        busy={sheetActionBusy}
        onToggleMute={() => void handleMuteToggle()}
        isGroup={muteSheetRow?.kind === "group"}
        onLeaveGroup={handleLeaveGroupRequest}
        onDeleteChat={handleDeleteChatRequest}
        onDeleteGroup={
          muteSheetRow &&
          inboxLongPressShowsDeleteGroup(
            muteSheetRow.kind,
            muteSheetRow.viewer_role
          )
            ? handleDeleteGroupRequest
            : undefined
        }
        title={
          muteSheetRow?.kind === "group"
            ? muteSheetRow.title?.trim() || "Group"
            : muteSheetRow?.display_name?.trim() ||
              muteSheetRow?.username?.trim() ||
              "Chat"
        }
      />

      <ConfirmDialog
        open={!!leaveConfirmRow}
        onClose={() => {
          if (!leaveBusy) setLeaveConfirmRow(null);
        }}
        onConfirm={() => void handleConfirmLeaveGroup()}
        title="Leave group?"
        message="You’ll leave this group and it will be removed from your Messages."
        confirmLabel="Leave group"
        cancelLabel="Cancel"
        confirmVariant="dangerSoft"
        isLoading={leaveBusy}
        higherZIndex
      />

      <ConfirmDialog
        open={!!deleteConfirmRow}
        onClose={() => {
          if (!deleteBusy) setDeleteConfirmRow(null);
        }}
        onConfirm={() => void handleConfirmDeleteChat()}
        title="Delete chat?"
        message={
          deleteConfirmRow?.kind === "group"
            ? "This chat and its current history will be removed for you. You’ll stay in the group."
            : "This chat and its current history will be removed for you. It won’t be deleted for the other person."
        }
        confirmLabel="Delete chat"
        cancelLabel="Cancel"
        confirmVariant="dangerSoft"
        isLoading={deleteBusy}
        higherZIndex
      />

      <ConfirmDialog
        open={!!dissolveConfirmRow}
        onClose={() => {
          if (!dissolveBusy) setDissolveConfirmRow(null);
        }}
        onConfirm={() => void handleConfirmDissolveGroup()}
        title="Delete group?"
        message="This will end the group for everyone and remove it from Messages. This can’t be undone."
        confirmLabel="Delete group"
        cancelLabel="Cancel"
        confirmVariant="dangerSoft"
        isLoading={dissolveBusy}
        higherZIndex
      />
    </PrimaryPageContainer>
    </>
  );
}
