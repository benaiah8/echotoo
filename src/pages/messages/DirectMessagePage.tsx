/**
 * Phase 1B/2/3 — persistent 1:1 text DM screen.
 * Load older + Realtime INSERT + debounced mark-read + focus merge.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  differenceInCalendarDays,
  format,
  isSameDay,
  isToday,
  isYesterday,
} from "date-fns";
import { PiArrowLeft, PiBellSlash, PiGearSix, PiPaperPlaneRight } from "react-icons/pi";
import toast from "react-hot-toast";
import Avatar from "../../components/ui/Avatar";
import ChooserPillAvatar from "../../components/create/ChooserPillAvatar";
import GroupPeopleSheet from "../../components/messages/GroupPeopleSheet";
import GroupMemberAvatarStack, {
  type GroupMemberAvatarStackMember,
} from "../../components/messages/GroupMemberAvatarStack";
import GroupSettingsSheet from "../../components/messages/GroupSettingsSheet";
import AddPeoplePicker from "../../components/messages/AddPeoplePicker";
import SharedPostMessageCard from "../../components/messages/SharedPostMessageCard";
import MatchContextMessage from "../../components/messages/MatchContextMessage";
import PlanSourceContextBar from "../../components/messages/PlanSourceContextBar";
import MentionSuggestionList from "../../components/notifications/invite-thread/MentionSuggestionList";
import {
  filterMentionParticipants,
  mentionInsertForParticipant,
  parseActiveMentionQuery,
} from "../../components/notifications/invite-thread/inviteThreadMentionAutocomplete";
import type { InviteThreadParticipant } from "../../api/services/inviteThreads";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import { postTypeNotificationPhrase } from "../../lib/postTypeLabels";
import { getMyGroupUpForConversation } from "../../api/services/groupUp";
import type { GroupUpSourceContext } from "../../lib/people/types";
import {
  collectSharedPostReferenceIds,
  useSharedPostResolution,
} from "../../hooks/useSharedPostResolution";
import {
  NEAR_BOTTOM_THRESHOLD_PX,
  INVITE_THREAD_SCROLL_PAD_TOP_PX,
  useInviteThreadKeyboardLayout,
} from "../../components/notifications/invite-thread/useInviteThreadKeyboardLayout";
import {
  inviteThreadHeaderBackArrowClass,
  inviteThreadHeaderBackButtonClass,
  inviteThreadHeaderSidePillBorderClass,
  inviteThreadHeaderSidePillSizeClass,
} from "../../components/notifications/invite-thread/InviteThreadOverlayLayout";
import { useOverlayEdgeSwipeDismiss } from "../../hooks/useOverlayEdgeSwipeDismiss";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  createClientMessageId,
  DM_MESSAGING_UNAVAILABLE_COPY,
  dissolveGroupConversation,
  getDirectMessagingAccess,
  isDmDirectAccessDeniedError,
  isDmStrangerLimitError,
  leaveConversation,
  listConversationMembers,
  listMessages,
  markConversationRead,
  removeConversationMember,
  sendMessage,
  setConversationNotificationsMuted,
  updateGroupDetails,
  type ConversationMemberRow,
  type DirectMessagingAccess,
  type MessageKind,
  type MessageListCursor,
  type MessageRow,
} from "../../api/services/messaging";
import {
  getProfileByUserId,
  getViewerAuthUserId,
} from "../../api/services/follows";
import {
  appendDmMessageCache,
  getDmMessagesCache,
  isDmMessagesFresh,
  isDmMessagesUsable,
  removeDmMessagesCache,
  setDmMessagesCache,
  DM_MESSAGES_FRESH_MS,
} from "../../lib/dmMessagesCache";
import {
  getDmConversationParticipantsCache,
  participantsEntryToMemberRows,
  removeDmConversationParticipantsCache,
  setDmConversationParticipantsCache,
} from "../../lib/dmConversationParticipantsCache";
import {
  deriveMemberPreviewFromMembers,
  getGroupConversationIdentity,
  setGroupConversationIdentitySourceContext,
  upsertGroupConversationIdentity,
} from "../../lib/groupConversationIdentityCache";
import {
  getDmInboxCache,
  patchDmInboxConversationSummary,
  patchDmInboxNotificationsMuted,
  patchDmInboxUnread,
  removeDmInboxConversation,
} from "../../lib/dmInboxCache";
import {
  clearConversationUnread,
  setActiveConversationId,
} from "../../lib/messagesUnreadStore";
import { invalidateGroupUpIncoming } from "../../lib/groupUpIncomingCache";
import { invalidateGroupUpMemberships } from "../../lib/groupUpMembershipsCache";
import { invalidateGroupUpOwnForPost } from "../../lib/groupUpCache";
import { invalidateGroupUpRequestGroups } from "../../lib/groupUpRequestGroupsCache";
import { invalidateGroupUpSourceList } from "../../lib/groupUpSourceListCache";
import { emitConversationPreviewPatch } from "../../lib/conversationPreviewEvents";
import { logDmRealtime } from "../../lib/messagesRealtimeDebug";
import {
  useDirectConversationRealtime,
  threadRealtimeHadCoverageGap,
  isThreadRealtimeHealthy,
} from "../../hooks/useDirectConversationRealtime";
import { supabase } from "../../lib/supabaseClient";
import { getErrorMessage } from "../../lib/errorHandling";
import { MESSAGES_TAB_REFRESH_EVENT } from "../../lib/homeRefreshEvents";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import {
  dismissConversationOverlay,
  isGroupManageConversationLaunch,
} from "../../lib/messages/dismissConversationNav";
import { SOCIAL_OVERLAY_LAYER } from "../../lib/socialOverlayLayers";
import { profileByUsername } from "../../router/Paths";

const DM_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "[data-no-overlay-swipe]",
  "[data-mention-row]",
  "a[href]",
  "button",
  '[role="button"]',
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
].join(",");

/** M3B scroll stickiness — pin_bottom / free / pin_anchor (target_message reserved, unused). */
type DmScrollStickiness = "pin_bottom" | "free" | "pin_anchor";

/** Max draft height — matches Invite thread composer. */
const DRAFT_TEXTAREA_MAX_PX = 220;

/** Outer + inner radius when draft is multiline (rounded rect, not stadium). */
const COMPOSER_MULTILINE_CORNER_PX = 21;

/** Single-line composer only — equal inset on all four sides of the outer pill. */
const COMPOSER_PILL_INSET_PX = 6;

/** Shared fixed height for draft shell + send (pill mode). */
const COMPOSER_TRACK_HEIGHT_PX = 34;

/** Textarea line box inside the bordered draft shell (shell has 1px top+bottom border). */
const COMPOSER_PILL_TEXT_LINE_HEIGHT_PX = COMPOSER_TRACK_HEIGHT_PX - 2;

/** Total outer pill height (border-box) in single-line mode. */
const COMPOSER_PILL_OUTER_HEIGHT_PX =
  COMPOSER_TRACK_HEIGHT_PX + 2 * COMPOSER_PILL_INSET_PX + 4;

/** Thin DM composer scroll-pad floor (Invite default remains 148). */
const DM_SCROLL_PAD_BOTTOM_FALLBACK_PX = 76;

type OtherProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type LocationState = {
  kind?: "direct" | "group";
  otherUserId?: string;
  otherDisplayName?: string;
  otherUsername?: string;
  otherAvatarUrl?: string;
  memberCount?: number;
  groupTitle?: string;
  /** Instant group avatar stack seed from inbox (camelCase). */
  memberPreview?: GroupMemberAvatarStackMember[];
  isRequest?: boolean;
  notificationsMuted?: boolean;
};

function rpcLikeMessage(error: unknown, fallback: string): string {
  if (isDmDirectAccessDeniedError(error)) {
    return DM_MESSAGING_UNAVAILABLE_COPY;
  }
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isQualifyingMessageKind(kind: MessageKind | string): boolean {
  return kind === "text" || kind === "shared_post";
}

function unlockMessagingAccess(
  prev: DirectMessagingAccess
): DirectMessagingAccess {
  return {
    ...prev,
    unlocked: true,
    can_send: true,
    messages_remaining: null,
    restriction: null,
    is_request: false,
  };
}

function forceWaitingMessagingAccess(
  prev: DirectMessagingAccess | null,
  conversationId: string
): DirectMessagingAccess {
  if (prev) {
    return {
      ...prev,
      unlocked: false,
      can_send: false,
      messages_remaining: 0,
      qualifying_sent_count: Math.max(prev.qualifying_sent_count, 2),
      restriction: "waiting_for_reply",
      is_request: false,
    };
  }
  return {
    conversation_id: conversationId,
    kind: "direct",
    unlocked: false,
    can_send: false,
    qualifying_sent_count: 2,
    messages_remaining: 0,
    restriction: "waiting_for_reply",
    is_request: false,
  };
}

/** Bump local restricted count from previous access (pure). */
function computeBumpedAccess(
  prev: DirectMessagingAccess
): DirectMessagingAccess {
  const nextCount = prev.qualifying_sent_count + 1;
  if (nextCount >= 2) {
    return {
      ...prev,
      qualifying_sent_count: nextCount,
      messages_remaining: 0,
      can_send: false,
      restriction: "waiting_for_reply",
      is_request: false,
    };
  }
  return {
    ...prev,
    qualifying_sent_count: nextCount,
    messages_remaining: Math.max(0, 2 - nextCount),
    can_send: true,
    restriction: null,
  };
}

function partnerFirstName(profile: OtherProfile | null): string {
  const display = profile?.display_name?.trim();
  if (display) return display;
  const username = profile?.username?.trim();
  if (username) return username;
  return "them";
}

function messageKey(m: MessageRow): string {
  return m.id || m.client_message_id;
}

function inboxPreviewFromMessage(m: MessageRow): string {
  if (m.message_kind === "match_context") {
    return (m.body ?? "").trim().slice(0, 200) || "Match";
  }
  if (m.message_kind === "shared_post") {
    const note = (m.body ?? "").trim();
    const snap = m.reference_snapshot;
    const kind =
      snap && "post_type" in snap && snap.post_type === "experience"
        ? "experience"
        : "hangout";
    const label = `Shared ${postTypeNotificationPhrase(kind)}`;
    if (note.length > 0) return `${label} · ${note}`.slice(0, 200);
    return label;
  }
  return (m.body ?? "").slice(0, 200);
}

/** Mine/other text bubble chrome — shared by plain text and shared_post notes. */
function dmTextBubbleClass(mine: boolean): string {
  return `min-w-0 rounded-[1.15rem] px-3.5 py-2.5 text-[15px] leading-snug shadow-sm ${
    mine
      ? "bg-gradient-to-br from-amber-100/95 via-yellow-50/98 to-amber-50/88 text-neutral-900/[0.91] ring-1 ring-amber-200/55 app-dark:from-amber-300/34 app-dark:via-amber-400/22 app-dark:to-amber-500/26 app-dark:text-[var(--text)]/[0.94] app-dark:ring-amber-400/22"
      : "bg-[color-mix(in_oklab,var(--surface-2)_84%,var(--bg))] text-[var(--text)]/88 ring-1 ring-black/[0.04] app-dark:bg-[color-mix(in_oklab,var(--surface-2)_56%,var(--bg))] app-dark:text-[var(--text)]/92 app-dark:ring-white/[0.08]"
  }`;
}

function sharedPostNote(body: string): string | null {
  const note = body.trim();
  return note.length > 0 ? note : null;
}

function sharedPostFallbackType(
  m: MessageRow
): "hangout" | "experience" | null {
  const snap = m.reference_snapshot;
  if (!snap || !("post_type" in snap)) return null;
  const t = snap.post_type;
  return t === "hangout" || t === "experience" ? t : null;
}

function isMalformedSharedPost(m: MessageRow): boolean {
  if (m.message_kind !== "shared_post") return false;
  const refId = (m.reference_id ?? "").trim();
  if (!refId || m.reference_type !== "post") return true;
  const snap = m.reference_snapshot;
  if (!snap || !("post_type" in snap) || snap.v !== 1) return true;
  if (snap.post_type !== "hangout" && snap.post_type !== "experience") {
    return true;
  }
  return false;
}

function dedupePrepend(
  existing: MessageRow[],
  olderChronological: MessageRow[]
): MessageRow[] {
  const seen = new Set(existing.map(messageKey));
  const toAdd: MessageRow[] = [];
  for (const m of olderChronological) {
    const key = messageKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    toAdd.push(m);
  }
  return [...toAdd, ...existing];
}

/** Merge newest chronological page into existing list; keep older session pages. */
function mergeNewestPage(
  existing: MessageRow[],
  newestChronological: MessageRow[]
): MessageRow[] {
  if (newestChronological.length === 0) return existing;
  const byKey = new Map<string, MessageRow>();
  for (const m of existing) byKey.set(messageKey(m), m);
  for (const m of newestChronological) byKey.set(messageKey(m), m);
  const merged = Array.from(byKey.values());
  merged.sort((a, b) => {
    const at = Date.parse(a.created_at);
    const bt = Date.parse(b.created_at);
    if (at !== bt) return at - bt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return merged;
}

function tipFromMessages(messages: MessageRow[]): MessageListCursor | null {
  if (messages.length === 0) return null;
  const tip = messages[messages.length - 1];
  return { created_at: tip.created_at, id: tip.id };
}

function sameLocalCalendarDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return isSameDay(a, b);
}

/** Centered day-separator label: Today / Yesterday / weekday / short date. */
function formatDmDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const daysAgo = differenceInCalendarDays(new Date(), d);
  if (daysAgo >= 0 && daysAgo < 7) return format(d, "EEEE");
  if (d.getFullYear() !== new Date().getFullYear()) {
    return format(d, "MMM d, yyyy");
  }
  return format(d, "MMM d");
}

function formatDmMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "p");
}

function shouldShowDaySeparator(
  messages: MessageRow[],
  index: number
): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const cur = messages[index];
  if (!prev?.created_at || !cur?.created_at) return true;
  return !sameLocalCalendarDay(prev.created_at, cur.created_at);
}

/** Last bubble in a consecutive same-sender run (or before a day boundary). */
function isEndOfSenderRun(messages: MessageRow[], index: number): boolean {
  const cur = messages[index];
  if (!cur) return false;
  const next = messages[index + 1];
  if (!next) return true;
  if (next.sender_user_id !== cur.sender_user_id) return true;
  if (
    cur.created_at &&
    next.created_at &&
    !sameLocalCalendarDay(cur.created_at, next.created_at)
  ) {
    return true;
  }
  return false;
}

/** First bubble in a consecutive same-sender run (or after a day boundary). */
function isStartOfSenderRun(messages: MessageRow[], index: number): boolean {
  const cur = messages[index];
  if (!cur) return false;
  if (index === 0) return true;
  const prev = messages[index - 1];
  if (!prev) return true;
  if (prev.sender_user_id !== cur.sender_user_id) return true;
  if (
    cur.created_at &&
    prev.created_at &&
    !sameLocalCalendarDay(prev.created_at, cur.created_at)
  ) {
    return true;
  }
  return false;
}

function memberPrimaryLabel(m: ConversationMemberRow | undefined): string {
  if (!m) return "Member";
  return (
    m.display_name?.trim() || m.username?.trim() || "Member"
  );
}

function formatMemberCountLabel(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}

function conversationMemberToMentionParticipant(
  m: ConversationMemberRow
): InviteThreadParticipant {
  return {
    user_id: m.user_id,
    username: m.username,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  };
}

function sanitizeRouteMemberPreview(
  raw: unknown
): GroupMemberAvatarStackMember[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GroupMemberAvatarStackMember[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const userId =
      typeof o.userId === "string"
        ? o.userId.trim()
        : typeof o.user_id === "string"
          ? o.user_id.trim()
          : "";
    if (!userId) continue;
    out.push({
      userId,
      avatarUrl:
        typeof o.avatarUrl === "string"
          ? o.avatarUrl
          : typeof o.avatar_url === "string"
            ? o.avatar_url
            : null,
      displayName:
        typeof o.displayName === "string"
          ? o.displayName
          : typeof o.display_name === "string"
            ? o.display_name
            : null,
      username:
        typeof o.username === "string" ? o.username : null,
    });
    if (out.length >= 3) break;
  }
  return out;
}

export default function DirectMessagePage() {
  const { conversationId: conversationIdParam } = useParams<{
    conversationId: string;
  }>();
  const conversationId = (conversationIdParam ?? "").trim();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | null) ?? null;
  const routeOtherUserId = locationState?.otherUserId?.trim();
  const routeOtherDisplayName = locationState?.otherDisplayName?.trim() || null;
  const routeOtherUsername = locationState?.otherUsername?.trim() || null;
  const routeOtherAvatarUrl = locationState?.otherAvatarUrl?.trim() || null;
  const routeMemberCount =
    typeof locationState?.memberCount === "number" &&
    Number.isFinite(locationState.memberCount)
      ? Math.max(0, Math.floor(locationState.memberCount))
      : null;
  const routeGroupTitle = locationState?.groupTitle?.trim() || null;
  const routeMemberPreview = sanitizeRouteMemberPreview(
    locationState?.memberPreview
  );
  const routeKind =
    locationState?.kind === "group" || locationState?.kind === "direct"
      ? locationState.kind
      : null;
  const routeNotificationsMuted =
    typeof locationState?.notificationsMuted === "boolean"
      ? locationState.notificationsMuted
      : null;

  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [conversationKind, setConversationKind] = useState<
    "direct" | "group" | null
  >(() => routeKind);
  const isGroup = conversationKind === "group";
  const [groupTitle, setGroupTitle] = useState<string | null>(routeGroupTitle);
  const [groupDescription, setGroupDescription] = useState<string | null>(
    null
  );
  const [groupCreatedBy, setGroupCreatedBy] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<ConversationMemberRow[]>(
    []
  );
  const [seededMemberCount, setSeededMemberCount] = useState<number | null>(
    routeMemberCount
  );
  const [notificationsMuted, setNotificationsMuted] = useState(
    routeNotificationsMuted === true
  );
  const [groupUpSourceContext, setGroupUpSourceContext] =
    useState<GroupUpSourceContext | null>(null);
  const [sourceContextExpanded, setSourceContextExpanded] = useState(false);
  const headerDockRef = useRef<HTMLDivElement>(null);
  const [headerDockHeightPx, setHeaderDockHeightPx] = useState(0);
  const [muteBusy, setMuteBusy] = useState(false);
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  const [peopleManageMode, setPeopleManageMode] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [dissolveConfirmOpen, setDissolveConfirmOpen] = useState(false);
  const [dissolveBusy, setDissolveBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    label: string;
  } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [membershipInactive, setMembershipInactive] = useState(false);
  const [otherUserId, setOtherUserId] = useState<string | null>(
    routeOtherUserId || null
  );
  const [otherProfile, setOtherProfile] = useState<OtherProfile | null>(() => {
    if (!routeOtherUserId) return null;
    if (!routeOtherDisplayName && !routeOtherUsername && !routeOtherAvatarUrl) {
      return null;
    }
    return {
      user_id: routeOtherUserId,
      username: routeOtherUsername,
      display_name: routeOtherDisplayName,
      avatar_url: routeOtherAvatarUrl,
    };
  });
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const { entries: sharedPostEntries, ensureResolved: ensureSharedPostsResolved } =
    useSharedPostResolution(conversationId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [composerCaret, setComposerCaret] = useState(0);
  const [mentionSuggestionsDismissed, setMentionSuggestionsDismissed] =
    useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [messagingAccess, setMessagingAccess] =
    useState<DirectMessagingAccess | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<MessageListCursor | null>(
    null
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const [composerInputShape, setComposerInputShape] = useState<
    "pill" | "multiline"
  >("pill");

  const pendingScrollRestoreRef = useRef<{
    prevHeight: number;
    prevTop: number;
    returnStickiness: "pin_bottom" | "free";
  } | null>(null);
  /** M3B: scroll stickiness state machine (ref-driven; no UI). */
  const stickinessRef = useRef<DmScrollStickiness>("pin_bottom");
  const shouldPinBottomRef = useRef(true);
  const messageListContentRef = useRef<HTMLDivElement>(null);
  const setStickiness = useCallback((mode: DmScrollStickiness) => {
    stickinessRef.current = mode;
    shouldPinBottomRef.current = mode === "pin_bottom";
  }, []);
  const messagesRef = useRef<MessageRow[]>([]);
  messagesRef.current = messages;
  const messagingAccessRef = useRef<DirectMessagingAccess | null>(null);
  messagingAccessRef.current = messagingAccess;
  const countedQualifyingIdsRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkedTipRef = useRef<MessageListCursor | null>(null);
  const accessFetchedAtRef = useRef<number>(0);
  const focusMergeInFlightRef = useRef(false);
  const viewerUserIdRef = useRef<string | null>(null);
  viewerUserIdRef.current = viewerUserId;
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretAfterMentionRef = useRef<number | null>(null);
  const prevMentionAtIndexRef = useRef<number | null>(null);
  const prevMentionQueryRef = useRef<string | null>(null);
  const lastComposerSelectionRef = useRef<{
    start: number;
    end: number;
    valueLength: number;
  }>({ start: 0, end: 0, valueLength: 0 });
  const mentionListboxRef = useRef<HTMLDivElement | null>(null);
  /** Per-conversation: at most one cold members RPC for mentions. */
  const mentionMembersFetchAttemptedRef = useRef<string | null>(null);
  const mentionMembersFetchInFlightRef = useRef(false);
  const threadChannelHealthyRef = useRef(false);

  const patchInboxPreviewFromLiveMessage = useCallback((incoming: MessageRow) => {
    const viewer = viewerUserIdRef.current;
    if (!viewer) return;
    const is_last_from_me = incoming.sender_user_id === viewer;
    const preview = inboxPreviewFromMessage(incoming);
    patchDmInboxConversationSummary(viewer, incoming.conversation_id, {
      last_message_at: incoming.created_at,
      last_message_preview: preview,
      last_message_sender_id: incoming.sender_user_id,
      is_last_from_me,
    });
    emitConversationPreviewPatch({
      conversationId: incoming.conversation_id,
      preview,
      lastMessageAt: incoming.created_at,
      senderUserId: incoming.sender_user_id,
    });
    logDmRealtime("inbox-patch", {
      conversationId: incoming.conversation_id,
      preview,
    });
  }, []);

  useEffect(() => {
    const id = conversationId.trim();
    if (!id) return;
    setActiveConversationId(id);
    return () => {
      setActiveConversationId(null);
    };
  }, [conversationId]);

  /**
   * Synchronously bump restricted access from the live ref + counted-id set.
   * Avoids functional setState races where Realtime marks an id counted before
   * a pending updater runs and returns stale prev (stuck on "1 message left").
   */
  const applyOwnQualifyingBump = useCallback((messageId: string): boolean => {
    const id = (messageId ?? "").trim();
    if (!id) return false;
    if (countedQualifyingIdsRef.current.has(id)) return false;
    const prev = messagingAccessRef.current;
    if (!prev || prev.unlocked || prev.restriction === "blocked") return false;
    countedQualifyingIdsRef.current.add(id);
    const next = computeBumpedAccess(prev);
    messagingAccessRef.current = next;
    setMessagingAccess(next);
    return true;
  }, []);

  const applyUnlockAccess = useCallback(() => {
    const prev = messagingAccessRef.current;
    if (!prev || prev.unlocked) return;
    const next = unlockMessagingAccess(prev);
    messagingAccessRef.current = next;
    setMessagingAccess(next);
  }, []);

  const syncDraftTextareaHeight = useCallback(() => {
    const el = draftTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const scrollH = el.scrollHeight;
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const fontSize = parseFloat(cs.fontSize || "16");
    let lhParsed = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lhParsed) || lhParsed < 8) {
      lhParsed = fontSize * 1.45;
    }
    const lineHeightPx = lhParsed;

    /** Text block height excluding vertical padding (avoids false multiline from py-*). */
    const innerContentH = scrollH - pt - pb;
    const multiline =
      el.value.includes("\n") || innerContentH > Math.ceil(lineHeightPx * 1.15);

    const next = Math.min(scrollH, DRAFT_TEXTAREA_MAX_PX);
    const minScrollOneLine = Math.ceil(lineHeightPx + pt + pb);
    el.style.height = `${Math.max(next, minScrollOneLine)}px`;

    setComposerInputShape((prev) => {
      const nextShape = multiline ? "multiline" : "pill";
      return prev === nextShape ? prev : nextShape;
    });
  }, []);

  const captureComposerSelection = useCallback(
    (el: HTMLTextAreaElement | null, valueLength: number) => {
      if (!el) return;
      const rawS = el.selectionStart;
      const rawE = el.selectionEnd;
      if (typeof rawS !== "number" || typeof rawE !== "number") return;
      const lo = Math.min(rawS, rawE);
      const hi = Math.max(rawS, rawE);
      lastComposerSelectionRef.current = {
        start: Math.max(0, Math.min(valueLength, lo)),
        end: Math.max(0, Math.min(valueLength, hi)),
        valueLength,
      };
    },
    []
  );

  useLayoutEffect(() => {
    const pending = pendingCaretAfterMentionRef.current;
    if (pending != null) {
      pendingCaretAfterMentionRef.current = null;
      const el = draftTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pending, pending);
        setComposerCaret(pending);
        captureComposerSelection(el, el.value.length);
      }
    }
    syncDraftTextareaHeight();
  }, [draft, syncDraftTextareaHeight, captureComposerSelection]);

  useEffect(() => {
    if (!conversationId || conversationKind !== "group") {
      setGroupUpSourceContext(null);
      return;
    }
    const viewer = viewerUserId;
    if (viewer) {
      const cached = getGroupConversationIdentity(viewer, conversationId);
      if (cached?.sourceContext) {
        setGroupUpSourceContext(cached.sourceContext);
      }
    }
    let cancelled = false;
    void getMyGroupUpForConversation(conversationId)
      .then((state) => {
        if (cancelled) return;
        setGroupUpSourceContext(state.sourceContext);
        const v = viewerUserIdRef.current;
        if (v) {
          setGroupConversationIdentitySourceContext(
            v,
            conversationId,
            state.sourceContext
          );
        }
      })
      .catch(() => {
        if (!cancelled) setGroupUpSourceContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversationKind, viewerUserId]);

  useEffect(() => {
    setSourceContextExpanded(false);
  }, [conversationId]);

  useEffect(() => {
    if (!groupUpSourceContext) {
      setHeaderDockHeightPx(0);
      return;
    }
    const el = headerDockRef.current;
    if (!el) return;
    const measure = () => {
      setHeaderDockHeightPx(el.getBoundingClientRect().height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    groupUpSourceContext,
    sourceContextExpanded,
    isGroup,
    groupTitle,
    notificationsMuted,
  ]);

  const planSourceContextExtraPx = groupUpSourceContext
    ? Math.max(
        0,
        Math.ceil(headerDockHeightPx - INVITE_THREAD_SCROLL_PAD_TOP_PX)
      )
    : 0;

  const {
    scrollLayerRef,
    bottomChromeOuterRef,
    bottomChromeContentRef,
    scrollPadTop,
    scrollPadBottom,
    bottomChromeContentHeightPx,
    composerBottomGap,
    keyboardOpen,
    composerFocused,
    onComposerFocus,
    onComposerBlur,
    scrollToBottomAfterSend,
  } = useInviteThreadKeyboardLayout({
    open: true,
    measureChrome: true,
    remeasureDeps: [
      submitError,
      draft,
      composerInputShape,
      hasMoreOlder,
      planSourceContextExtraPx,
    ],
    scrollPadTopExtraPx: planSourceContextExtraPx,
    scrollPadBottomFallbackPx: DM_SCROLL_PAD_BOTTOM_FALLBACK_PX,
    shouldPinBottomRef,
  });

  // M3B: user scroll updates stickiness (T = NEAR_BOTTOM_THRESHOLD_PX).
  useEffect(() => {
    const el = scrollLayerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (stickinessRef.current === "pin_anchor") return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance > NEAR_BOTTOM_THRESHOLD_PX) {
        setStickiness("free");
      } else {
        setStickiness("pin_bottom");
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollLayerRef, conversationId, setStickiness]);

  // M3B: content height growth re-pins when pin_bottom (shared_post / images / separators).
  useEffect(() => {
    const content = messageListContentRef.current;
    if (!content) return;
    let prevHeight = content.scrollHeight;
    const ro = new ResizeObserver(() => {
      const nextHeight = content.scrollHeight;
      const delta = nextHeight - prevHeight;
      prevHeight = nextHeight;
      if (delta === 0) return;
      if (stickinessRef.current !== "pin_bottom") return;
      const el = scrollLayerRef.current;
      if (!el) return;
      el.scrollTop += delta;
    });
    ro.observe(content);
    return () => {
      ro.disconnect();
    };
  }, [scrollLayerRef, conversationId, loading, loadError]);

  const dismissConversation = useCallback(() => {
    dismissConversationOverlay(navigate, location.state);
  }, [navigate, location.state]);

  useOverlayBackgroundScrollLock(true);

  const mentionParticipants = useMemo(() => {
    if (!isGroup) return [] as InviteThreadParticipant[];
    return groupMembers.map(conversationMemberToMentionParticipant);
  }, [isGroup, groupMembers]);

  const activeMentionToken = useMemo(() => {
    if (!isGroup || membershipInactive) return null;
    return parseActiveMentionQuery(draft, composerCaret);
  }, [isGroup, membershipInactive, draft, composerCaret]);

  const mentionSuggestions = useMemo(
    () =>
      filterMentionParticipants(
        mentionParticipants,
        viewerUserId,
        activeMentionToken?.query ?? "",
        5
      ),
    [mentionParticipants, viewerUserId, activeMentionToken?.query]
  );

  const showGroupMentionSuggestions =
    isGroup &&
    !membershipInactive &&
    !sending &&
    !loadError &&
    activeMentionToken != null &&
    !mentionSuggestionsDismissed &&
    mentionSuggestions.length > 0;

  useEffect(() => {
    const at = activeMentionToken?.atIndex ?? null;
    const q = activeMentionToken?.query ?? "";
    if (at == null) {
      setMentionSuggestionsDismissed(false);
      prevMentionAtIndexRef.current = null;
      prevMentionQueryRef.current = null;
      return;
    }
    if (
      prevMentionAtIndexRef.current !== null &&
      prevMentionAtIndexRef.current !== at
    ) {
      setMentionSuggestionsDismissed(false);
    }
    if (
      prevMentionQueryRef.current !== null &&
      prevMentionQueryRef.current !== q
    ) {
      setMentionSuggestionsDismissed(false);
    }
    prevMentionAtIndexRef.current = at;
    prevMentionQueryRef.current = q;
  }, [activeMentionToken?.atIndex, activeMentionToken?.query]);

  const gestureDisabled =
    keyboardOpen ||
    composerFocused ||
    peopleSheetOpen ||
    settingsSheetOpen ||
    addPeopleOpen ||
    leaveConfirmOpen ||
    dissolveConfirmOpen ||
    !!removeTarget ||
    showGroupMentionSuggestions;

  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      active: true,
      engageSwipe: true,
      gestureDisabled,
      // M3D.1: Post Details narrow edge — not Invite 42vw strip (blocks avatar taps).
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      edgeStripZClass: "z-[28]",
      onDismiss: dismissConversation,
      resetToken: conversationId,
    });

  useEffect(() => {
    return subscribeAndroidHardwareBack(() => {
      if (blurActiveEditableFirst()) return;
      if (removeTarget) {
        setRemoveTarget(null);
        return;
      }
      if (leaveConfirmOpen) {
        setLeaveConfirmOpen(false);
        return;
      }
      if (dissolveConfirmOpen) {
        setDissolveConfirmOpen(false);
        return;
      }
      if (addPeopleOpen) {
        setAddPeopleOpen(false);
        return;
      }
      if (settingsSheetOpen) {
        setSettingsSheetOpen(false);
        return;
      }
      if (peopleSheetOpen) {
        setPeopleSheetOpen(false);
        setPeopleManageMode(false);
        return;
      }
      playAnimatedDismiss();
    });
  }, [
    addPeopleOpen,
    dissolveConfirmOpen,
    leaveConfirmOpen,
    peopleSheetOpen,
    playAnimatedDismiss,
    removeTarget,
    settingsSheetOpen,
  ]);

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: true,
      engageSwipe: true,
      gestureDisabled,
      startZoneMaxXVw: 0.45,
      startZoneMaxPx: 180,
      leftInsetPx: isNativeApp() ? 8 : 12,
      excludeSelector: DM_CONTENT_SWIPE_EXCLUDE_SELECTOR,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: playAnimatedDismiss,
      resetToken: conversationId,
    });

  const effectiveOverlayMotionStyle = contentSwipeMotionStyle
    ? { ...overlayMotionStyle, ...contentSwipeMotionStyle }
    : overlayMotionStyle;

  const scheduleMarkRead = useCallback(
    (tip: MessageListCursor | null) => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      if (!conversationId || !tip?.created_at || !tip?.id) return;

      const viewer = viewerUserIdRef.current;
      let localUnread: number | null = null;
      if (viewer) {
        const inbox = getDmInboxCache(viewer);
        const row = inbox?.conversations.find(
          (r) => r.conversation_id === conversationId
        );
        if (row) localUnread = row.unread_count;
      }
      const last = lastMarkedTipRef.current;
      if (
        localUnread === 0 &&
        last &&
        last.id === tip.id &&
        last.created_at === tip.created_at
      ) {
        return;
      }

      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = setTimeout(() => {
        markReadTimerRef.current = null;
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden"
        ) {
          return;
        }
        lastMarkedTipRef.current = {
          created_at: tip.created_at,
          id: tip.id,
        };
        const viewerForPatch = viewerUserIdRef.current;
        if (viewerForPatch) {
          patchDmInboxUnread(viewerForPatch, conversationId, 0);
        }
        clearConversationUnread(conversationId);
        void markConversationRead(conversationId, tip);
      }, 400);
    },
    [conversationId]
  );

  const handleRealtimeInsert = useCallback(
    (incoming: MessageRow) => {
      if (incoming.conversation_id !== conversationId) return;

      const fromSelf =
        !!viewerUserId && incoming.sender_user_id === viewerUserId;
      const qualifying = isQualifyingMessageKind(incoming.message_kind);

      const already = messagesRef.current.some(
        (m) =>
          m.id === incoming.id ||
          m.client_message_id === incoming.client_message_id ||
          messageKey(m) === messageKey(incoming)
      );

      // Access transitions even when the row was already appended by handleSend
      // (Realtime must not skip bump/unlock solely because the message list deduped).
      if (qualifying) {
        if (fromSelf) {
          applyOwnQualifyingBump(incoming.id);
        } else if (viewerUserId && incoming.sender_user_id !== viewerUserId) {
          applyUnlockAccess();
        }
      }

      if (already) return;

      setMessages((prev) => {
        if (
          prev.some(
            (m) =>
              m.id === incoming.id ||
              m.client_message_id === incoming.client_message_id
          )
        ) {
          return prev;
        }
        return [...prev, incoming];
      });
      appendDmMessageCache(
        viewerUserIdRef.current ?? "",
        conversationId,
        incoming
      );
      patchInboxPreviewFromLiveMessage(incoming);

      if (
        incoming.message_kind === "shared_post" &&
        incoming.reference_type === "post" &&
        incoming.reference_id
      ) {
        void ensureSharedPostsResolved([incoming.reference_id]);
      }

      if (fromSelf) {
        setStickiness("pin_bottom");
      }
      if (stickinessRef.current === "pin_bottom" || fromSelf) {
        scrollToBottomAfterSend();
      }
      scheduleMarkRead({
        created_at: incoming.created_at,
        id: incoming.id,
      });
    },
    [
      conversationId,
      viewerUserId,
      scrollToBottomAfterSend,
      scheduleMarkRead,
      ensureSharedPostsResolved,
      applyOwnQualifyingBump,
      applyUnlockAccess,
      setStickiness,
      patchInboxPreviewFromLiveMessage,
    ]
  );

  useDirectConversationRealtime({
    conversationId,
    enabled:
      !!conversationId && !loading && !loadError && !membershipInactive,
    onInsert: handleRealtimeInsert,
    onStatus: (status) => {
      threadChannelHealthyRef.current = status === "SUBSCRIBED";
    },
  });

  // Own membership becomes inactive while this group is open → exit gracefully.
  useEffect(() => {
    const me = (viewerUserId ?? "").trim();
    const id = conversationId.trim();
    if (
      !me ||
      !id ||
      conversationKind !== "group" ||
      loading ||
      loadError ||
      membershipInactive
    ) {
      return;
    }

    const channel = supabase
      .channel(`dm-membership:${id}:${me}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${me}`,
        },
        (payload) => {
          const row = payload.new as {
            conversation_id?: string;
            left_at?: string | null;
          };
          if (row.conversation_id !== id) return;
          if (row.left_at == null) return;
          setMembershipInactive(true);
          setPeopleSheetOpen(false);
          setPeopleManageMode(false);
          setSettingsSheetOpen(false);
          setAddPeopleOpen(false);
          setLeaveConfirmOpen(false);
          setDissolveConfirmOpen(false);
          setRemoveTarget(null);
          toast("You are no longer in this group");
          playAnimatedDismiss();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    viewerUserId,
    conversationId,
    conversationKind,
    loading,
    loadError,
    membershipInactive,
    playAnimatedDismiss,
  ]);

  // Resolve conversation kind + messages (deep-link safe; inbox seeds kind/title for groups).
  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      setLoadError("Missing conversation.");
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      setLoadOlderError(null);
      setMembershipInactive(false);
      setPeopleSheetOpen(false);
      setPeopleManageMode(false);
      setSettingsSheetOpen(false);
      setAddPeopleOpen(false);
      setLeaveConfirmOpen(false);
      setDissolveConfirmOpen(false);
      setRemoveTarget(null);
      // Keep inbox-seeded group/direct kind so header does not flash "Message"/"M".
      setConversationKind(routeKind);
      setMessagingAccess(null);
      accessFetchedAtRef.current = 0;
      lastMarkedTipRef.current = null;
      countedQualifyingIdsRef.current = new Set();
      setGroupTitle(routeGroupTitle);
      setGroupDescription(null);
      setGroupCreatedBy(null);
      // M3B: restore participant / identity cache for group header (no members RPC on open).
      setGroupMembers([]);
      setSeededMemberCount(routeMemberCount);
      setStickiness("pin_bottom");
      pendingScrollRestoreRef.current = null;
      setComposerCaret(0);
      setMentionSuggestionsDismissed(false);
      pendingCaretAfterMentionRef.current = null;
      prevMentionAtIndexRef.current = null;
      prevMentionQueryRef.current = null;
      mentionMembersFetchAttemptedRef.current = null;
      mentionMembersFetchInFlightRef.current = false;
      if (routeNotificationsMuted != null) {
        setNotificationsMuted(routeNotificationsMuted);
      }

      try {
        const viewer = await getViewerAuthUserId();
        if (cancelled) return;
        if (!viewer) {
          setLoadError("Not authenticated.");
          setLoading(false);
          return;
        }
        setViewerUserId(viewer);

        const identity = getGroupConversationIdentity(viewer, conversationId);
        if (identity && !cancelled) {
          if (routeKind == null) {
            setConversationKind("group");
          }
          if (identity.title) {
            setGroupTitle((prev) => prev || identity.title);
          }
          if (
            typeof identity.memberCount === "number" &&
            identity.memberCount >= 0
          ) {
            setSeededMemberCount((prev) =>
              prev != null ? prev : identity.memberCount
            );
          }
          if (identity.members && identity.members.length > 0) {
            setGroupMembers(identity.members);
            setSeededMemberCount(identity.members.length);
          }
          if (identity.sourceContext) {
            setGroupUpSourceContext(identity.sourceContext);
          }
        }

        if (!identity?.members?.length) {
          // Prefer identity.members (real joined_at). Participants fallback also
          // preserves joined_at after Phase 1 cache corrections.
          const cachedParticipants = getDmConversationParticipantsCache(
            viewer,
            conversationId
          );
          if (cachedParticipants && !cancelled) {
            const rows = participantsEntryToMemberRows(cachedParticipants);
            setGroupMembers(rows);
            setSeededMemberCount(
              cachedParticipants.memberCount > 0
                ? cachedParticipants.memberCount
                : rows.length
            );
          }
        }

        if (routeKind == null && !identity) {
          const inbox = getDmInboxCache(viewer);
          const cachedRow = inbox?.conversations.find(
            (r) => r.conversation_id === conversationId
          );
          if (cachedRow?.kind === "group") {
            setConversationKind("group");
            if (cachedRow.title?.trim()) {
              setGroupTitle((prev) => prev || cachedRow.title!.trim());
            }
            if (typeof cachedRow.member_count === "number") {
              setSeededMemberCount((prev) =>
                prev != null ? prev : cachedRow.member_count
              );
            }
            upsertGroupConversationIdentity(viewer, conversationId, {
              title: cachedRow.title?.trim() ? cachedRow.title.trim() : null,
              memberCount:
                typeof cachedRow.member_count === "number"
                  ? cachedRow.member_count
                  : null,
            });
          } else if (cachedRow?.kind === "direct") {
            setConversationKind("direct");
          }
        }

        if (routeNotificationsMuted == null) {
          const inbox = getDmInboxCache(viewer);
          const cachedRow = inbox?.conversations.find(
            (r) => r.conversation_id === conversationId
          );
          if (cachedRow) {
            setNotificationsMuted(cachedRow.notifications_muted === true);
          } else {
            const { data: memberRow } = await supabase
              .from("conversation_members")
              .select("notifications_muted")
              .eq("conversation_id", conversationId)
              .eq("user_id", viewer)
              .is("left_at", null)
              .maybeSingle();
            if (!cancelled && memberRow) {
              setNotificationsMuted(
                (memberRow as { notifications_muted?: boolean })
                  .notifications_muted === true
              );
            }
          }
        }

        const cached = getDmMessagesCache(viewer, conversationId);
        const hasCachedMessages = !!(cached && cached.messages.length > 0);
        if (hasCachedMessages && cached) {
          setMessages(cached.messages);
          setHasMoreOlder(cached.hasMoreOlder);
          setOlderCursor(cached.olderCursor);
          setLoading(false);
          void ensureSharedPostsResolved(
            collectSharedPostReferenceIds(cached.messages)
          );
        }

        const { data: conv, error: convErr } = await supabase
          .from("conversations")
          .select(
            "id, kind, title, description, created_by, direct_user_low, direct_user_high"
          )
          .eq("id", conversationId)
          .maybeSingle();

        if (cancelled) return;
        if (convErr) {
          setLoadError(rpcLikeMessage(convErr, "Could not load conversation."));
          setLoading(false);
          return;
        }
        if (!conv) {
          setLoadError("Conversation not found.");
          setLoading(false);
          return;
        }

        const kindRaw =
          typeof conv.kind === "string" ? conv.kind.trim() : "";
        const kind: "direct" | "group" | null =
          kindRaw === "group"
            ? "group"
            : kindRaw === "direct"
              ? "direct"
              : null;
        if (!kind) {
          setLoadError("Unsupported conversation type.");
          setLoading(false);
          return;
        }
        setConversationKind(kind);

        const cacheFresh = !!(cached && isDmMessagesFresh(cached));
        const cacheUsable = !!(cached && isDmMessagesUsable(cached));
        const hadRealtimeGap = cached
          ? threadRealtimeHadCoverageGap(conversationId, cached.updatedAt)
          : false;
        const skipFirstPageList =
          cacheFresh && hasCachedMessages && !hadRealtimeGap;
        const silentMerge = !skipFirstPageList && cacheUsable && hasCachedMessages;
        if (hasCachedMessages && hadRealtimeGap) {
          logDmRealtime("thread-reconcile", {
            conversationId,
            realtime_gap: true,
            forceMerge: true,
          });
        }

        if (kind === "group") {
          setOtherUserId(null);
          setOtherProfile(null);
          setMessagingAccess(null);
          const title =
            typeof conv.title === "string" && conv.title.trim()
              ? conv.title.trim()
              : routeGroupTitle;
          setGroupTitle(title);
          upsertGroupConversationIdentity(viewer, conversationId, {
            title,
            memberCount:
              typeof routeMemberCount === "number" ? routeMemberCount : null,
          });
          const descRaw =
            typeof conv.description === "string" ? conv.description.trim() : "";
          setGroupDescription(descRaw.length > 0 ? descRaw : null);
          const createdBy =
            typeof conv.created_by === "string" && conv.created_by.trim()
              ? conv.created_by.trim()
              : null;
          setGroupCreatedBy(createdBy);

          if (skipFirstPageList && cached) {
            scheduleMarkRead(tipFromMessages(cached.messages));
            setLoading(false);
            return;
          }

          const listResult = await listMessages(conversationId);
          if (cancelled) return;

          if (listResult.error || !listResult.data) {
            if (!hasCachedMessages) {
              setLoadError(
                rpcLikeMessage(listResult.error, "Could not load messages.")
              );
            }
            setLoading(false);
            return;
          }

          const chronological = [...listResult.data.messages].reverse();
          if (silentMerge) {
            setMessages((prev) => {
              const merged = mergeNewestPage(prev, chronological);
              setDmMessagesCache(
                viewer,
                conversationId,
                merged,
                listResult.data!.has_more,
                listResult.data!.next_cursor
              );
              return merged;
            });
            setHasMoreOlder(listResult.data.has_more);
            setOlderCursor(listResult.data.next_cursor);
          } else {
            setMessages(chronological);
            setHasMoreOlder(listResult.data.has_more);
            setOlderCursor(listResult.data.next_cursor);
            setDmMessagesCache(
              viewer,
              conversationId,
              chronological,
              listResult.data.has_more,
              listResult.data.next_cursor
            );
          }
          void ensureSharedPostsResolved(
            collectSharedPostReferenceIds(chronological)
          );
          scheduleMarkRead(tipFromMessages(chronological));
          setLoading(false);
          return;
        }

        // Direct: resolve partner (route hint optional).
        let resolvedOther = routeOtherUserId || null;
        if (!resolvedOther) {
          const low =
            typeof conv.direct_user_low === "string"
              ? conv.direct_user_low
              : null;
          const high =
            typeof conv.direct_user_high === "string"
              ? conv.direct_user_high
              : null;
          if (low && high) {
            resolvedOther =
              viewer === low ? high : viewer === high ? low : null;
          }
        }
        if (!resolvedOther) {
          setLoadError("Could not resolve the other participant.");
          setLoading(false);
          return;
        }

        setOtherUserId(resolvedOther);

        const seedComplete =
          !!routeOtherUserId &&
          routeOtherUserId === resolvedOther &&
          !!(routeOtherDisplayName || routeOtherUsername || routeOtherAvatarUrl);

        if (seedComplete) {
          setOtherProfile({
            user_id: resolvedOther,
            username: routeOtherUsername,
            display_name: routeOtherDisplayName,
            avatar_url: routeOtherAvatarUrl,
          });
        }

        const needProfile = !seedComplete;
        const needMessages = !skipFirstPageList;

        const [listResult, profile, accessResult] = await Promise.all([
          needMessages
            ? listMessages(conversationId)
            : Promise.resolve({
                data: null as Awaited<
                  ReturnType<typeof listMessages>
                >["data"],
                error: null as unknown,
              }),
          needProfile
            ? getProfileByUserId(resolvedOther)
            : Promise.resolve(null),
          getDirectMessagingAccess(conversationId),
        ]);

        if (cancelled) return;

        if (needMessages) {
          if (listResult.error || !listResult.data) {
            if (!hasCachedMessages) {
              setLoadError(
                rpcLikeMessage(listResult.error, "Could not load messages.")
              );
            }
            setLoading(false);
            return;
          }

          const chronological = [...listResult.data.messages].reverse();
          if (silentMerge) {
            setMessages((prev) => {
              const merged = mergeNewestPage(prev, chronological);
              setDmMessagesCache(
                viewer,
                conversationId,
                merged,
                listResult.data!.has_more,
                listResult.data!.next_cursor
              );
              return merged;
            });
            setHasMoreOlder(listResult.data.has_more);
            setOlderCursor(listResult.data.next_cursor);
          } else {
            setMessages(chronological);
            setHasMoreOlder(listResult.data.has_more);
            setOlderCursor(listResult.data.next_cursor);
            setDmMessagesCache(
              viewer,
              conversationId,
              chronological,
              listResult.data.has_more,
              listResult.data.next_cursor
            );
          }
          void ensureSharedPostsResolved(
            collectSharedPostReferenceIds(chronological)
          );
          scheduleMarkRead(tipFromMessages(chronological));
        } else if (cached) {
          scheduleMarkRead(tipFromMessages(cached.messages));
        }

        if (!accessResult.error && accessResult.data) {
          setMessagingAccess(accessResult.data);
          accessFetchedAtRef.current = Date.now();
        } else if (accessResult.error) {
          console.warn(
            "[DirectMessagePage] getDirectMessagingAccess",
            accessResult.error
          );
        }

        if (needProfile) {
          if (profile) {
            setOtherProfile({
              user_id: profile.user_id,
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
            });
          } else {
            setOtherProfile((prev) =>
              prev?.user_id === resolvedOther
                ? prev
                : {
                    user_id: resolvedOther,
                    username: null,
                    display_name: null,
                    avatar_url: null,
                  }
            );
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(rpcLikeMessage(e, "Could not open conversation."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    routeOtherUserId,
    routeOtherDisplayName,
    routeOtherUsername,
    routeOtherAvatarUrl,
    routeMemberCount,
    routeGroupTitle,
    routeKind,
    routeNotificationsMuted,
    scheduleMarkRead,
    ensureSharedPostsResolved,
    setStickiness,
  ]);

  // Mounted focus/reconnect: merge newest page; preserve older loaded pages.
  useEffect(() => {
    if (!conversationId || loading || loadError || membershipInactive) return;

    const reconcile = async (opts?: { force?: boolean }) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (focusMergeInFlightRef.current) return;

      const viewer = viewerUserIdRef.current;
      const cached = viewer
        ? getDmMessagesCache(viewer, conversationId)
        : null;
      const force = opts?.force === true;
      const threadHealthy =
        threadChannelHealthyRef.current ||
        isThreadRealtimeHealthy(conversationId);
      if (
        !force &&
        cached &&
        isDmMessagesFresh(cached) &&
        threadHealthy
      ) {
        return;
      }
      if (force || !threadHealthy) {
        logDmRealtime("thread-reconcile", {
          conversationId,
          realtime_gap: !threadHealthy,
          forceMerge: true,
        });
      }

      focusMergeInFlightRef.current = true;
      try {
        const shouldRepinAfterMerge =
          stickinessRef.current === "pin_bottom";

        const accessFresh =
          accessFetchedAtRef.current > 0 &&
          Date.now() - accessFetchedAtRef.current < DM_MESSAGES_FRESH_MS;
        const accessPromise =
          conversationKind === "direct" && !accessFresh
            ? getDirectMessagingAccess(conversationId)
            : null;

        const { data, error } = await listMessages(conversationId);
        if (error || !data) {
          if (accessPromise) {
            const accessResult = await accessPromise;
            if (!accessResult.error && accessResult.data) {
              setMessagingAccess(accessResult.data);
              accessFetchedAtRef.current = Date.now();
            }
          }
          return;
        }

        const newestChronological = [...data.messages].reverse();
        setMessages((prev) => {
          const merged = mergeNewestPage(prev, newestChronological);
          if (viewer) {
            setDmMessagesCache(
              viewer,
              conversationId,
              merged,
              hasMoreOlder,
              olderCursor
            );
          }
          return merged;
        });
        void ensureSharedPostsResolved(
          collectSharedPostReferenceIds(newestChronological)
        );
        // Keep hasMoreOlder / olderCursor from current session (do not reset).
        scheduleMarkRead(tipFromMessages(newestChronological));
        if (
          shouldRepinAfterMerge &&
          stickinessRef.current === "pin_bottom"
        ) {
          scrollToBottomAfterSend();
        }

        if (accessPromise) {
          const accessResult = await accessPromise;
          if (!accessResult.error && accessResult.data) {
            setMessagingAccess(accessResult.data);
            accessFetchedAtRef.current = Date.now();
          }
        }
      } finally {
        focusMergeInFlightRef.current = false;
      }
    };

    const onFocus = () => {
      void reconcile({ force: false });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (markReadTimerRef.current) {
          clearTimeout(markReadTimerRef.current);
          markReadTimerRef.current = null;
        }
        return;
      }
      void reconcile({ force: true });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    conversationId,
    conversationKind,
    loading,
    loadError,
    membershipInactive,
    hasMoreOlder,
    olderCursor,
    scrollToBottomAfterSend,
    scheduleMarkRead,
    ensureSharedPostsResolved,
  ]);

  useEffect(() => {
    return () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    };
  }, []);

  // Restore scroll after Load older prepend; exit pin_anchor.
  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    const el = scrollLayerRef.current;
    pendingScrollRestoreRef.current = null;
    if (el) {
      el.scrollTop = el.scrollHeight - pending.prevHeight + pending.prevTop;
    }
    setStickiness(pending.returnStickiness);
  }, [messages, scrollLayerRef, setStickiness]);

  // M3B: pin bottom after initial load / cache paint when stickiness is pin_bottom.
  // messageId deep links are intentionally ignored for scroll (URL may remain).
  useLayoutEffect(() => {
    if (loading || loadError) return;
    if (stickinessRef.current !== "pin_bottom") return;
    scrollToBottomAfterSend();
  }, [loading, loadError, conversationId, scrollToBottomAfterSend]);

  const handleLoadOlder = useCallback(async () => {
    if (
      !conversationId ||
      !hasMoreOlder ||
      !olderCursor ||
      loadingOlder ||
      loading
    ) {
      return;
    }

    setLoadingOlder(true);
    setLoadOlderError(null);
    try {
      const el = scrollLayerRef.current;
      const returnStickiness: "pin_bottom" | "free" =
        stickinessRef.current === "pin_bottom" ? "pin_bottom" : "free";
      setStickiness("pin_anchor");
      if (el) {
        pendingScrollRestoreRef.current = {
          prevHeight: el.scrollHeight,
          prevTop: el.scrollTop,
          returnStickiness,
        };
      }

      const { data, error } = await listMessages(
        conversationId,
        20,
        olderCursor
      );
      if (error || !data) {
        pendingScrollRestoreRef.current = null;
        setStickiness(returnStickiness);
        setLoadOlderError(
          rpcLikeMessage(error, "Could not load older messages.")
        );
        return;
      }

      const olderChronological = [...data.messages].reverse();
      setMessages((prev) => {
        const merged = dedupePrepend(prev, olderChronological);
        const viewer = viewerUserIdRef.current;
        if (viewer) {
          setDmMessagesCache(
            viewer,
            conversationId,
            merged,
            data.has_more,
            data.next_cursor
          );
        }
        return merged;
      });
      void ensureSharedPostsResolved(
        collectSharedPostReferenceIds(olderChronological)
      );
      setHasMoreOlder(data.has_more);
      setOlderCursor(data.next_cursor);
    } catch (e) {
      const pending = pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
      setStickiness(pending?.returnStickiness ?? "free");
      setLoadOlderError(rpcLikeMessage(e, "Could not load older messages."));
    } finally {
      setLoadingOlder(false);
    }
  }, [
    conversationId,
    hasMoreOlder,
    olderCursor,
    loadingOlder,
    loading,
    scrollLayerRef,
    ensureSharedPostsResolved,
    setStickiness,
  ]);

  const trimmedDraft = draft.trim();
  const accessBlocksSend =
    conversationKind === "direct" &&
    messagingAccess != null &&
    !messagingAccess.can_send;
  const sendDisabled =
    sending ||
    trimmedDraft.length === 0 ||
    !conversationId ||
    membershipInactive ||
    accessBlocksSend;

  const handleSend = useCallback(async () => {
    if (sendDisabled || !conversationId || membershipInactive) return;
    if (accessBlocksSend) return;

    const body = trimmedDraft;
    const clientMessageId = createClientMessageId();
    const wasRequest = messagingAccessRef.current?.is_request === true;

    setSubmitError(null);
    setSending(true);
    try {
      const { data, error } = await sendMessage(
        conversationId,
        body,
        clientMessageId
      );
      if (error || !data) {
        if (isDmStrangerLimitError(error)) {
          const next = forceWaitingMessagingAccess(
            messagingAccessRef.current,
            conversationId
          );
          messagingAccessRef.current = next;
          setMessagingAccess(next);
          return;
        }
        setSubmitError(rpcLikeMessage(error, "Could not send message."));
        return;
      }

      setMessages((prev) => {
        const key = messageKey(data.message);
        if (
          prev.some(
            (m) =>
              m.id === data.message.id ||
              m.client_message_id === data.message.client_message_id ||
              messageKey(m) === key
          )
        ) {
          return prev;
        }
        return [...prev, data.message];
      });
      appendDmMessageCache(
        viewerUserIdRef.current ?? "",
        conversationId,
        data.message
      );
      patchInboxPreviewFromLiveMessage(data.message);

      if (wasRequest) {
        applyUnlockAccess();
        window.dispatchEvent(new CustomEvent(MESSAGES_TAB_REFRESH_EVENT));
      } else if (
        data.created === true &&
        isQualifyingMessageKind(data.message.message_kind)
      ) {
        // Immediate local transition — do not wait for Realtime.
        applyOwnQualifyingBump(data.message.id);
      }

      setDraft("");
      setComposerCaret(0);
      setMentionSuggestionsDismissed(false);
      setStickiness("pin_bottom");
      scrollToBottomAfterSend();
      scheduleMarkRead({
        created_at: data.message.created_at,
        id: data.message.id,
      });
    } catch (e) {
      if (isDmStrangerLimitError(e)) {
        const next = forceWaitingMessagingAccess(
          messagingAccessRef.current,
          conversationId
        );
        messagingAccessRef.current = next;
        setMessagingAccess(next);
      } else {
        setSubmitError(rpcLikeMessage(e, "Could not send message."));
      }
    } finally {
      setSending(false);
    }
  }, [
    sendDisabled,
    accessBlocksSend,
    conversationId,
    trimmedDraft,
    membershipInactive,
    scrollToBottomAfterSend,
    scheduleMarkRead,
    applyOwnQualifyingBump,
    applyUnlockAccess,
    setStickiness,
    patchInboxPreviewFromLiveMessage,
  ]);

  const partnerLabel = partnerFirstName(otherProfile);
  const showWaitingComposer =
    !isGroup &&
    messagingAccess != null &&
    (messagingAccess.restriction === "waiting_for_reply" ||
      messagingAccess.restriction === "blocked" ||
      messagingAccess.restriction === "private" ||
      !messagingAccess.can_send);
  const isBlockedComposer =
    messagingAccess?.restriction === "blocked" ||
    messagingAccess?.restriction === "private";
  const composerHelperKind: "limit" | "request" | null = (() => {
    if (isGroup || !messagingAccess || showWaitingComposer) return null;
    if (messagingAccess.is_request) return "request";
    if (messagingAccess.unlocked) return null;
    if (messagingAccess.qualifying_sent_count <= 1) return "limit";
    return null;
  })();
  const composerHelperText = (() => {
    if (!composerHelperKind || !messagingAccess) return null;
    if (composerHelperKind === "request") {
      return "Reply to move this conversation to Inbox.";
    }
    if (messagingAccess.qualifying_sent_count <= 0) {
      return `You can send up to 2 messages until ${partnerLabel} replies.`;
    }
    if (messagingAccess.qualifying_sent_count === 1) {
      return `1 message left until ${partnerLabel} replies.`;
    }
    return null;
  })();

  const membersByUserId = useMemo(() => {
    const map = new Map<string, ConversationMemberRow>();
    for (const m of groupMembers) {
      map.set(m.user_id, m);
    }
    return map;
  }, [groupMembers]);

  const groupMemberCount = groupMembers.length;
  const displayMemberCount =
    groupMemberCount > 0
      ? groupMemberCount
      : seededMemberCount != null && seededMemberCount > 0
        ? seededMemberCount
        : 0;
  const groupHeaderTitle = groupTitle?.trim() || "Group";
  const groupHeaderSubtitle =
    displayMemberCount > 0
      ? formatMemberCountLabel(displayMemberCount)
      : null;

  const groupAvatarStack = useMemo(() => {
    if (!isGroup) {
      return {
        status: "loading" as const,
        members: [] as GroupMemberAvatarStackMember[],
      };
    }
    if (groupMembers.length > 0) {
      return {
        status: "ready" as const,
        members: deriveMemberPreviewFromMembers(groupMembers),
      };
    }
    if (routeMemberPreview) {
      return {
        status:
          routeMemberPreview.length === 0
            ? ("empty" as const)
            : ("ready" as const),
        members: routeMemberPreview,
      };
    }
    const identity =
      viewerUserId && conversationId
        ? getGroupConversationIdentity(viewerUserId, conversationId)
        : null;
    if (identity?.memberPreview) {
      return {
        status:
          identity.memberPreview.length === 0
            ? ("empty" as const)
            : ("ready" as const),
        members: identity.memberPreview,
      };
    }
    if (seededMemberCount === 0) {
      return {
        status: "empty" as const,
        members: [] as GroupMemberAvatarStackMember[],
      };
    }
    return {
      status: "loading" as const,
      members: [] as GroupMemberAvatarStackMember[],
    };
  }, [
    isGroup,
    groupMembers,
    routeMemberPreview,
    viewerUserId,
    conversationId,
    seededMemberCount,
  ]);

  const viewerGroupMember = useMemo(() => {
    if (!viewerUserId) return null;
    return groupMembers.find((m) => m.user_id === viewerUserId) ?? null;
  }, [groupMembers, viewerUserId]);
  const isGroupAdmin = viewerGroupMember?.role === "admin";

  const activeMemberIds = useMemo(
    () => groupMembers.map((m) => m.user_id),
    [groupMembers]
  );

  const refreshGroupMembers = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await listConversationMembers(conversationId);
    if (error || !data) {
      toast.error(getErrorMessage(error) || "Could not refresh members.");
      return;
    }
    setGroupMembers(data.members);
    setSeededMemberCount(data.members.length);
    const viewer = viewerUserIdRef.current;
    if (viewer) {
      setDmConversationParticipantsCache(
        viewer,
        conversationId,
        data.members
      );
    }
  }, [conversationId]);

  /**
   * Mentions need the full member list. Warm caches hydrate on open; cold groups
   * get at most one background list_conversation_members (same bridge as refreshGroupMembers).
   */
  useEffect(() => {
    if (!isGroup || !conversationId || membershipInactive || loading) return;
    if (groupMembers.length > 0) {
      mentionMembersFetchAttemptedRef.current = conversationId;
      return;
    }
    if (mentionMembersFetchAttemptedRef.current === conversationId) return;
    if (mentionMembersFetchInFlightRef.current) return;

    const id = conversationId;
    mentionMembersFetchAttemptedRef.current = id;
    mentionMembersFetchInFlightRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await listConversationMembers(id);
        if (cancelled) return;
        if (error || !data) return;
        setGroupMembers(data.members);
        setSeededMemberCount(data.members.length);
        const viewer = viewerUserIdRef.current;
        if (viewer) {
          setDmConversationParticipantsCache(viewer, id, data.members);
        }
      } finally {
        if (!cancelled) {
          mentionMembersFetchInFlightRef.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
      mentionMembersFetchInFlightRef.current = false;
    };
  }, [
    isGroup,
    conversationId,
    membershipInactive,
    loading,
    groupMembers.length,
  ]);

  const insertMentionParticipant = useCallback(
    (p: InviteThreadParticipant) => {
      if (!isGroup || membershipInactive) return;
      const el = draftTextareaRef.current;
      const currentDraft = el?.value ?? draft;
      const len = currentDraft.length;

      let caretForParse: number;
      const focused = el != null && document.activeElement === el;
      const rawS = el?.selectionStart;
      const rawE = el?.selectionEnd;
      const domLooksValid =
        focused &&
        typeof rawS === "number" &&
        typeof rawE === "number" &&
        rawS >= 0 &&
        rawS <= len &&
        rawE >= 0 &&
        rawE <= len;

      if (domLooksValid) {
        caretForParse = Math.min(rawS as number, rawE as number);
      } else {
        const snap = lastComposerSelectionRef.current;
        const lo = Math.min(snap.start, snap.end);
        caretForParse = Math.max(0, Math.min(len, lo));
      }

      const token = parseActiveMentionQuery(currentDraft, caretForParse);
      if (!token) return;
      const ins = mentionInsertForParticipant(p);
      const before = currentDraft.slice(0, token.atIndex);
      const after = currentDraft.slice(caretForParse);
      const next = before + ins + after;
      const pos = before.length + ins.length;
      pendingCaretAfterMentionRef.current = pos;
      setMentionSuggestionsDismissed(false);
      setDraft(next);
    },
    [draft, isGroup, membershipInactive]
  );

  /** Lightweight title/description reconcile when opening Settings (no messages/members). */
  const refreshGroupDetails = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("title, description")
        .eq("id", conversationId)
        .maybeSingle();
      if (error || !data) return;
      const title =
        typeof data.title === "string" && data.title.trim()
          ? data.title.trim()
          : null;
      setGroupTitle(title);
      const viewer = viewerUserIdRef.current;
      if (viewer && conversationId) {
        upsertGroupConversationIdentity(viewer, conversationId, { title });
      }
      const descRaw =
        typeof data.description === "string" ? data.description.trim() : "";
      setGroupDescription(descRaw.length > 0 ? descRaw : null);
    } catch {
      /* keep already-loaded local values */
    }
  }, [conversationId]);

  const openGroupSettings = useCallback(() => {
    setPeopleSheetOpen(false);
    setPeopleManageMode(false);
    setSettingsSheetOpen(true);
    void refreshGroupDetails();
    void refreshGroupMembers();
  }, [refreshGroupDetails, refreshGroupMembers]);

  const handleToggleNotificationsMuted = useCallback(async () => {
    if (!conversationId || muteBusy) return;
    const nextMuted = !notificationsMuted;
    setMuteBusy(true);
    try {
      const { data, error } = await setConversationNotificationsMuted(
        conversationId,
        nextMuted
      );
      if (error || !data) {
        toast.error("Couldn't update notification settings.");
        return;
      }
      const muted = data.notifications_muted;
      setNotificationsMuted(muted);
      const viewer = viewerUserIdRef.current;
      if (viewer) {
        patchDmInboxNotificationsMuted(viewer, conversationId, muted);
      }
      toast.success(
        muted ? "Notifications muted" : "Notifications unmuted"
      );
    } finally {
      setMuteBusy(false);
    }
  }, [conversationId, muteBusy, notificationsMuted]);

  const openGroupPeople = useCallback(
    (manageMode = false) => {
      setSettingsSheetOpen(false);
      setPeopleManageMode(manageMode);
      setPeopleSheetOpen(true);
      void refreshGroupMembers();
    },
    [refreshGroupMembers]
  );

  const handleLeaveGroupRequest = useCallback(() => {
    setSettingsSheetOpen(false);
    setLeaveConfirmOpen(true);
  }, []);

  const handleDeleteGroupRequest = useCallback(() => {
    setSettingsSheetOpen(false);
    setDissolveConfirmOpen(true);
  }, []);

  const handleSaveGroupDetails = useCallback(
    async (nextTitle: string, nextDescription: string | null) => {
      const { data, error } = await updateGroupDetails(
        conversationId,
        nextTitle,
        nextDescription
      );
      if (error || !data) {
        return { error: error || new Error("Could not save group details.") };
      }
      setGroupTitle(data.title);
      setGroupDescription(data.description);
    },
    [conversationId]
  );

  const handleConfirmLeave = useCallback(async () => {
    if (leaveBusy) return;
    setLeaveBusy(true);
    try {
      const { error } = await leaveConversation(conversationId);
      if (error) {
        toast.error(getErrorMessage(error) || "Could not leave group.");
        return;
      }
      const viewer = viewerUserIdRef.current;
      if (viewer) {
        removeDmConversationParticipantsCache(viewer, conversationId);
      }
      setLeaveConfirmOpen(false);
      setSettingsSheetOpen(false);
      setPeopleSheetOpen(false);
      setPeopleManageMode(false);
      setAddPeopleOpen(false);
      setMembershipInactive(true);
      playAnimatedDismiss();
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not leave group.");
    } finally {
      setLeaveBusy(false);
    }
  }, [leaveBusy, conversationId, playAnimatedDismiss]);

  const handleConfirmDissolveGroup = useCallback(async () => {
    if (dissolveBusy || membershipInactive) return;
    setDissolveBusy(true);
    try {
      const { data, error } = await dissolveGroupConversation(conversationId);
      if (error || !data?.dissolved) {
        toast.error(getErrorMessage(error) || "Could not delete group.");
        return;
      }

      const viewer = viewerUserIdRef.current;
      const sourcePostId = groupUpSourceContext?.source_post_id?.trim() || null;
      if (viewer) {
        removeDmMessagesCache(viewer, conversationId);
        removeDmConversationParticipantsCache(viewer, conversationId);
        removeDmInboxConversation(viewer, conversationId);
        invalidateGroupUpMemberships(viewer);
        invalidateGroupUpIncoming(viewer);
        invalidateGroupUpRequestGroups(viewer);
      }
      if (sourcePostId) {
        invalidateGroupUpOwnForPost(sourcePostId);
        invalidateGroupUpSourceList(sourcePostId);
      }
      clearConversationUnread(conversationId);
      setGroupUpSourceContext(null);
      setDissolveConfirmOpen(false);
      setSettingsSheetOpen(false);
      setPeopleSheetOpen(false);
      setPeopleManageMode(false);
      setAddPeopleOpen(false);
      setMembershipInactive(true);
      playAnimatedDismiss();
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not delete group.");
    } finally {
      setDissolveBusy(false);
    }
  }, [
    dissolveBusy,
    membershipInactive,
    conversationId,
    groupUpSourceContext?.source_post_id,
    playAnimatedDismiss,
  ]);

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget || removeBusy) return;
    setRemoveBusy(true);
    try {
      const { error } = await removeConversationMember(
        conversationId,
        removeTarget.userId
      );
      if (error) {
        toast.error(getErrorMessage(error) || "Could not remove member.");
        return;
      }
      setRemoveTarget(null);
      await refreshGroupMembers();
    } catch (e) {
      toast.error(getErrorMessage(e) || "Could not remove member.");
    } finally {
      setRemoveBusy(false);
    }
  }, [removeTarget, removeBusy, conversationId, refreshGroupMembers]);

  const headerTitle = isGroup
    ? groupHeaderTitle
    : otherProfile?.display_name?.trim() ||
      otherProfile?.username?.trim() ||
      "Message";
  const headerSubtitle = isGroup
    ? null
    : otherProfile?.username?.trim()
      ? `@${otherProfile.username.trim()}`
      : null;
  const showHeaderSubtitle =
    !!headerSubtitle &&
    headerSubtitle.toLowerCase() !==
      `@${(otherProfile?.display_name || "").trim().toLowerCase()}`;
  const otherProfilePath =
    !isGroup && otherProfile?.username?.trim()
      ? profileByUsername(otherProfile.username.trim())
      : null;

  const safeHorizontalPad =
    "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]";

  /** Home-like breathing: safe-area + ~8px (matches Home scrolled `8px + safe-area`). */
  const headerTopPad = "calc(8px + var(--safe-area-top-layout))";

  const showMessageList = !loading && !loadError;

  const mutedHeaderIcon = notificationsMuted ? (
    <PiBellSlash
      className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/42"
      aria-label="Notifications muted"
    />
  ) : null;

  const conversationShellZ = isGroupManageConversationLaunch(location.state)
    ? SOCIAL_OVERLAY_LAYER.socialConversation
    : "z-[110]";

  return (
    <div
      className={`fixed inset-0 ${conversationShellZ} isolate overflow-hidden bg-[var(--bg)] text-[var(--text)]`}
      style={effectiveOverlayMotionStyle}
    >
      {/* Home-matching top gradient from physical overlay top (not a solid status slab) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 z-[19]"
        style={{
          height: "calc(66px + var(--safe-area-top-layout))",
          width: "100%",
          background: "var(--gradient-from-top)",
        }}
      />

      {/* Header dock — pill + optional Group Up source context */}
      <div
        ref={headerDockRef}
        className="pointer-events-none absolute left-0 right-0 top-0 z-30 overflow-visible"
        style={{
          paddingTop: headerTopPad,
        }}
      >
        <div
          className={`pointer-events-auto relative mx-auto w-full max-w-lg overflow-visible ${safeHorizontalPad}`}
        >
          <div
            className={[
              "relative z-20 box-border w-full min-w-0 overflow-visible rounded-full",
              "border border-[var(--bottom-tab-border)] p-1.5",
              "shadow-[0_2px_10px_rgba(0,0,0,0.12),0_0_0_1px_var(--bottom-tab-pill-ring)]",
              "app-dark:shadow-[0_2px_12px_rgba(0,0,0,0.28),0_0_0_1px_var(--bottom-tab-pill-ring)]",
              isGroup
                ? "min-h-[48px] items-center"
                : "h-[48px] min-h-[48px] max-h-[48px]",
            ].join(" ")}
          >
            {/* Blur on a sibling layer so overflow (borders / member count) is not clipped */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))]"
            />
            <div className="relative z-10 flex h-full min-h-[32px] w-full items-center justify-between overflow-visible">
            <div className="relative z-10 shrink-0">
              <button
                type="button"
                onClick={playAnimatedDismiss}
                className={inviteThreadHeaderBackButtonClass}
                aria-label="Back"
              >
                <PiArrowLeft
                  className={inviteThreadHeaderBackArrowClass}
                  aria-hidden
                />
              </button>
            </div>

            {isGroup ? (
              <button
                type="button"
                onClick={openGroupSettings}
                className="absolute left-1/2 top-1/2 z-0 flex max-w-[calc(100%-9.5rem)] -translate-x-1/2 -translate-y-1/2 items-start gap-1.5 rounded-md px-1 py-0.5 text-left outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-400/40"
                aria-label="Group settings"
              >
                <span className="mt-[2px] flex h-[14px] w-[14px] shrink-0 items-center justify-center text-[var(--text)]/72 app-dark:text-white/78">
                  <PiGearSix className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span
                  className="mt-[3px] h-3 w-px shrink-0 bg-[var(--text)]/20 app-dark:bg-white/24"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 items-start gap-1">
                  <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[var(--text)] line-clamp-2">
                    {headerTitle}
                  </span>
                  {mutedHeaderIcon ? (
                    <span className="mt-[2px] shrink-0">{mutedHeaderIcon}</span>
                  ) : null}
                </span>
              </button>
            ) : otherProfilePath ? (
              <Link
                to={otherProfilePath}
                aria-label={`View ${headerTitle}`}
                className="absolute left-1/2 top-1/2 z-0 flex max-w-[calc(100%-8.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-md px-1 py-0.5 text-center leading-tight outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-400/40"
              >
                <p className="flex max-w-full items-center justify-center gap-1 truncate text-sm font-semibold text-[var(--text)]">
                  <span className="truncate">{headerTitle}</span>
                  {mutedHeaderIcon}
                </p>
                {showHeaderSubtitle ? (
                  <p className="max-w-full truncate text-[11px] text-[var(--text)]/55">
                    {headerSubtitle}
                  </p>
                ) : null}
              </Link>
            ) : (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 flex max-w-[calc(100%-8.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center px-1 text-center leading-tight">
                <p className="flex max-w-full items-center justify-center gap-1 truncate text-sm font-semibold text-[var(--text)]">
                  <span className="truncate">{headerTitle}</span>
                  {mutedHeaderIcon}
                </p>
                {showHeaderSubtitle ? (
                  <p className="truncate text-[11px] text-[var(--text)]/55">
                    {headerSubtitle}
                  </p>
                ) : null}
              </div>
            )}

            <div className="relative z-10 flex shrink-0 items-center justify-end gap-1.5 overflow-visible">
              {isGroup ? (
                <button
                  type="button"
                  onClick={() => openGroupPeople(false)}
                  aria-label="Group people"
                  className="relative flex min-h-[32px] min-w-[44px] cursor-pointer items-center justify-center overflow-visible rounded-full border border-transparent bg-transparent px-0.5 shadow-none outline-none backdrop-blur-none transition-opacity focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  <GroupMemberAvatarStack
                    members={groupAvatarStack.members}
                    status={groupAvatarStack.status}
                    size={32}
                    layout="horizontal"
                  />
                  {displayMemberCount > 0 ? (
                    <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 flex h-5 min-w-5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-amber-500/70 bg-amber-400 px-1.5 text-[10px] font-semibold leading-none tabular-nums text-neutral-900 ring-2 ring-[var(--bg)]">
                      {displayMemberCount}
                    </div>
                  ) : null}
                </button>
              ) : otherProfilePath ? (
                <Link
                  to={otherProfilePath}
                  aria-label={`View ${headerTitle}`}
                  className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  <ChooserPillAvatar
                    url={otherProfile?.avatar_url}
                    name={headerTitle}
                    userId={otherUserId}
                    className={inviteThreadHeaderSidePillSizeClass}
                    borderClassName={inviteThreadHeaderSidePillBorderClass}
                  />
                </Link>
              ) : (
                <ChooserPillAvatar
                  url={otherProfile?.avatar_url}
                  name={headerTitle}
                  userId={otherUserId}
                  className={inviteThreadHeaderSidePillSizeClass}
                  borderClassName={inviteThreadHeaderSidePillBorderClass}
                />
              )}
            </div>
            </div>
          </div>

          {isGroup && groupUpSourceContext ? (
            <div
              className="relative z-10 -mt-3 overflow-hidden rounded-t-none rounded-b-2xl border-x border-b border-[var(--bottom-tab-border)] border-t-0 bg-[var(--glass-bg)] shadow-[0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] app-dark:shadow-[0_2px_12px_rgba(0,0,0,0.22)]"
            >
              <PlanSourceContextBar
                variant="thread"
                sourceContext={groupUpSourceContext}
                expanded={sourceContextExpanded}
                onToggleExpand={() =>
                  setSourceContextExpanded((expanded) => !expanded)
                }
                onTap={() =>
                  navigateToPostDetailInApp(
                    navigate,
                    location,
                    groupUpSourceContext.post_type,
                    groupUpSourceContext.source_post_id
                  )
                }
              />
            </div>
          ) : null}

          <div className="pb-2.5" />
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollLayerRef}
        {...panelSwipeProps}
        className={`absolute inset-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${safeHorizontalPad}`}
        style={{
          paddingTop: scrollPadTop,
          paddingBottom: scrollPadBottom,
          touchAction: "pan-y",
        }}
      >
        <div
          ref={messageListContentRef}
          className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-end pb-2"
        >
          {loading && messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text)]/60">
              Loading…
            </p>
          ) : loadError ? (
            <p className="py-8 text-center text-sm text-red-500/90" role="alert">
              {loadError}
            </p>
          ) : showMessageList && messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text)]/50">
              No messages yet. Say hello.
            </p>
          ) : (
            <>
              {hasMoreOlder ? (
                <div className="mb-3 flex flex-col items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleLoadOlder()}
                    disabled={loadingOlder || !olderCursor}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-2)]/90 px-3 py-1.5 text-[11px] font-medium text-[var(--text)]/75 transition-opacity disabled:pointer-events-none disabled:opacity-45"
                  >
                    {loadingOlder ? "Loading…" : "Load older messages"}
                  </button>
                  {loadOlderError ? (
                    <p
                      className="text-center text-[11px] text-red-500/90"
                      role="alert"
                    >
                      {loadOlderError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ul className="flex flex-col">
                {messages.map((m, index) => {
                  const mine =
                    !!viewerUserId && m.sender_user_id === viewerUserId;
                  const showDaySep = shouldShowDaySeparator(messages, index);
                  const showTime = isEndOfSenderRun(messages, index);
                  const showSenderStart =
                    isGroup && !mine && isStartOfSenderRun(messages, index);
                  const dayLabel = showDaySep
                    ? formatDmDayLabel(m.created_at)
                    : "";
                  const timeLabel = showTime
                    ? formatDmMessageTime(m.created_at)
                    : "";
                  const senderMember = isGroup
                    ? membersByUserId.get(m.sender_user_id)
                    : undefined;
                  const senderLabel = isGroup
                    ? memberPrimaryLabel(senderMember)
                    : headerTitle;
                  const senderAvatarUrl = isGroup
                    ? senderMember?.avatar_url
                    : otherProfile?.avatar_url;
                  const senderAvatarUserId = isGroup
                    ? senderMember?.user_id ?? null
                    : otherUserId;
                  const senderProfilePath = isGroup
                    ? senderMember?.username?.trim()
                      ? profileByUsername(senderMember.username.trim())
                      : null
                    : otherProfilePath;
                  const isMatchContext = m.message_kind === "match_context";
                  const matchSnapshot =
                    isMatchContext &&
                    m.reference_snapshot &&
                    "subtype" in m.reference_snapshot
                      ? m.reference_snapshot
                      : null;
                  const isSharedPost = m.message_kind === "shared_post";
                  const sharedNote = isSharedPost
                    ? sharedPostNote(m.body)
                    : null;
                  const sharedMalformed = isSharedPost
                    ? isMalformedSharedPost(m)
                    : false;
                  const sharedRefId = isSharedPost
                    ? (m.reference_id ?? "").trim()
                    : "";
                  const sharedEntry = sharedRefId
                    ? sharedPostEntries[sharedRefId]
                    : undefined;
                  const sharedCardStatus = sharedMalformed
                    ? ("malformed" as const)
                    : (sharedEntry?.status ?? "pending");

                  if (isMatchContext) {
                    return (
                      <Fragment key={messageKey(m)}>
                        {showDaySep && dayLabel ? (
                          <li className="mb-4 mt-3 flex justify-center first:mt-1">
                            <span className="rounded-full bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)] px-3 py-0.5 text-[10px] font-medium text-[var(--text)]/40 shadow-sm backdrop-blur-sm tabular-nums">
                              {dayLabel}
                            </span>
                          </li>
                        ) : null}
                        <li className="mb-3 flex justify-center last:mb-1">
                          {matchSnapshot ? (
                            <MatchContextMessage snapshot={matchSnapshot} />
                          ) : null}
                        </li>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={messageKey(m)}>
                      {showDaySep && dayLabel ? (
                        <li className="mb-4 mt-3 flex justify-center first:mt-1">
                          <span className="rounded-full bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)] px-3 py-0.5 text-[10px] font-medium text-[var(--text)]/40 shadow-sm backdrop-blur-sm tabular-nums">
                            {dayLabel}
                          </span>
                        </li>
                      ) : null}
                      <li
                        className={`mb-3 flex last:mb-1 ${
                          mine ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex max-w-[min(79%,20.35rem)] flex-col gap-1 ${
                            mine ? "items-end" : "items-start"
                          }`}
                        >
                          <div
                            className={`flex items-start gap-1.5 ${
                              mine ? "flex-row-reverse" : "flex-row"
                            }`}
                          >
                            {!mine ? (
                              <span className="flex h-[44px] min-w-[44px] shrink-0 items-start justify-center pt-[1px]">
                                {isGroup && !showSenderStart ? (
                                  <span className="h-[30px] w-[30px]" aria-hidden />
                                ) : senderProfilePath ? (
                                  <Link
                                    to={senderProfilePath}
                                    aria-label={`View ${senderLabel}`}
                                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                                  >
                                    <Avatar
                                      url={senderAvatarUrl}
                                      name={senderLabel}
                                      userId={senderAvatarUserId}
                                      size={30}
                                      tightLineBox
                                      disableInnerPointer
                                      className="rounded-full"
                                    />
                                  </Link>
                                ) : (
                                  <Avatar
                                    url={senderAvatarUrl}
                                    name={senderLabel}
                                    userId={senderAvatarUserId}
                                    size={30}
                                    tightLineBox
                                    className="rounded-full"
                                  />
                                )}
                              </span>
                            ) : null}
                            {isSharedPost ? (
                              <div className="flex min-w-0 flex-col gap-1.5">
                                {sharedNote ? (
                                  <div className={dmTextBubbleClass(mine)}>
                                    <p className="whitespace-pre-wrap break-words">
                                      {sharedNote}
                                    </p>
                                  </div>
                                ) : null}
                                <SharedPostMessageCard
                                  status={sharedCardStatus}
                                  data={sharedEntry?.data}
                                  fallbackPostType={sharedPostFallbackType(m)}
                                  onOpen={
                                    sharedCardStatus === "ready" &&
                                    sharedEntry?.data
                                      ? () =>
                                          navigateToPostDetailInApp(
                                            navigate,
                                            location,
                                            sharedEntry.data!.post_type,
                                            sharedEntry.data!.id
                                          )
                                      : undefined
                                  }
                                  onRetry={
                                    sharedCardStatus === "error" && sharedRefId
                                      ? () => {
                                          void ensureSharedPostsResolved([
                                            sharedRefId,
                                          ]);
                                        }
                                      : undefined
                                  }
                                />
                              </div>
                            ) : (
                              <div className={dmTextBubbleClass(mine)}>
                                <p className="whitespace-pre-wrap break-words">
                                  {m.body}
                                </p>
                              </div>
                            )}
                          </div>
                          {showTime && timeLabel ? (
                            <p
                              className={`px-0.5 text-[10px] tabular-nums leading-none text-[var(--text)]/40 ${
                                mine
                                  ? "text-right"
                                  : "pl-[calc(44px+0.375rem)] text-left"
                              }`}
                            >
                              {timeLabel}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Bottom message fade — above composer; does not cover input */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 z-[19] h-7 bg-gradient-to-t from-[var(--bg)] to-transparent"
        style={{
          bottom: `calc(${bottomChromeContentHeightPx}px + (${composerBottomGap}))`,
        }}
      />

      {/* Composer */}
      <div
        ref={bottomChromeOuterRef}
        className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-[var(--bg)] ${safeHorizontalPad}`}
        style={{ paddingBottom: composerBottomGap }}
      >
        <div
          ref={bottomChromeContentRef}
          className="mx-auto flex w-full max-w-lg flex-col items-center gap-1.5 pb-1"
        >
          {submitError ? (
            <p
              className="pointer-events-auto max-w-lg text-center text-xs text-red-500/95"
              role="alert"
            >
              {submitError}
            </p>
          ) : null}

          {composerHelperText && composerHelperKind === "limit" ? (
            <p
              className="pointer-events-none max-w-lg rounded-full bg-amber-400/18 px-3 py-1 text-center text-[12px] font-medium leading-snug text-amber-900/90 ring-1 ring-amber-500/25 app-dark:bg-amber-400/16 app-dark:text-amber-200/92 app-dark:ring-amber-400/28"
              role="status"
            >
              {composerHelperText}
            </p>
          ) : null}

          {composerHelperText && composerHelperKind === "request" ? (
            <p
              className="pointer-events-none max-w-lg rounded-full bg-amber-400/10 px-3 py-1 text-center text-[11px] leading-snug text-amber-900/72 ring-1 ring-amber-500/15 app-dark:bg-amber-400/10 app-dark:text-amber-200/70 app-dark:ring-amber-400/18"
              role="status"
            >
              {composerHelperText}
            </p>
          ) : null}

          {showWaitingComposer ? (
            <>
              {!isBlockedComposer ? (
                <p
                  className="pointer-events-none max-w-lg px-2 text-center text-[11px] leading-snug text-[var(--text)]/48"
                  role="status"
                >
                  You can continue messaging once they reply or you become
                  friends.
                </p>
              ) : null}
              <div
                className="pointer-events-none flex w-full max-w-lg items-center justify-center border-2 border-neutral-400/55 bg-neutral-200/90 px-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] app-dark:border-white/28 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_72%,#0a0a0b)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                style={{
                  borderRadius: 9999,
                  boxSizing: "border-box",
                  height: COMPOSER_PILL_OUTER_HEIGHT_PX,
                  minHeight: COMPOSER_PILL_OUTER_HEIGHT_PX,
                  maxHeight: COMPOSER_PILL_OUTER_HEIGHT_PX,
                }}
                role="status"
                aria-live="polite"
              >
                <p className="truncate px-1 text-center text-[13px] font-medium leading-none text-neutral-800 app-dark:text-[var(--text)]/88">
                  {isBlockedComposer
                    ? "Messaging is unavailable."
                    : `Waiting for ${partnerLabel} to reply.`}
                </p>
              </div>
            </>
          ) : (
          <div className="pointer-events-auto relative w-full max-w-lg">
            {showGroupMentionSuggestions ? (
              <MentionSuggestionList
                suggestions={mentionSuggestions}
                onSelect={insertMentionParticipant}
                listboxRef={mentionListboxRef}
              />
            ) : null}
          <div
            className={`flex w-full max-w-lg gap-2 border-2 border-neutral-900/17 bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-xl app-dark:border-white/28 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ${
              composerInputShape === "pill" ? "overflow-visible p-0" : "p-1.5"
            } ${
              composerInputShape === "multiline"
                ? "min-h-0 items-end"
                : "items-center"
            }`}
            style={{
              borderRadius:
                composerInputShape === "pill"
                  ? 9999
                  : COMPOSER_MULTILINE_CORNER_PX,
              ...(composerInputShape === "pill"
                ? {
                    boxSizing: "border-box",
                    height: COMPOSER_PILL_OUTER_HEIGHT_PX,
                    minHeight: COMPOSER_PILL_OUTER_HEIGHT_PX,
                    maxHeight: COMPOSER_PILL_OUTER_HEIGHT_PX,
                    padding: COMPOSER_PILL_INSET_PX,
                  }
                : {}),
            }}
          >
            <div
              className={`relative min-h-0 min-w-0 flex-1 ${
                composerInputShape === "multiline" ? "self-end" : ""
              }`}
            >
              <div
                className={`relative overflow-hidden border border-neutral-900/14 bg-[color-mix(in_oklab,var(--surface-2)_52%,var(--bg))] px-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] app-dark:border-white/14 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_36%,var(--bg))] app-dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] ${
                  composerInputShape === "pill" ? "box-border" : "min-h-0"
                }`}
                style={{
                  borderRadius:
                    composerInputShape === "pill"
                      ? 9999
                      : COMPOSER_MULTILINE_CORNER_PX,
                  ...(composerInputShape === "pill"
                    ? {
                        height: COMPOSER_TRACK_HEIGHT_PX,
                        minHeight: COMPOSER_TRACK_HEIGHT_PX,
                        maxHeight: COMPOSER_TRACK_HEIGHT_PX,
                      }
                    : {}),
                }}
              >
                <textarea
                  ref={draftTextareaRef}
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    const sel = e.target.selectionStart ?? v.length;
                    setDraft(v);
                    setComposerCaret(sel);
                    captureComposerSelection(e.currentTarget, v.length);
                    if (submitError) setSubmitError(null);
                  }}
                  onSelect={(e) => {
                    const len = e.currentTarget.value.length;
                    const sel = e.currentTarget.selectionStart ?? len;
                    setComposerCaret(sel);
                    captureComposerSelection(e.currentTarget, len);
                  }}
                  onClick={(e) => {
                    const len = e.currentTarget.value.length;
                    const sel = e.currentTarget.selectionStart ?? len;
                    setComposerCaret(sel);
                    captureComposerSelection(e.currentTarget, len);
                  }}
                  onKeyUp={(e) => {
                    const len = e.currentTarget.value.length;
                    const sel = e.currentTarget.selectionStart ?? len;
                    setComposerCaret(sel);
                    captureComposerSelection(e.currentTarget, len);
                  }}
                  onFocus={onComposerFocus}
                  onBlur={onComposerBlur}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Escape" &&
                      showGroupMentionSuggestions
                    ) {
                      e.preventDefault();
                      setMentionSuggestionsDismissed(true);
                      return;
                    }
                    if (e.key !== "Enter" || e.shiftKey) return;
                    if (sendDisabled || !!loadError) return;
                    e.preventDefault();
                    void handleSend();
                  }}
                  placeholder="Message…"
                  aria-label="Message"
                  rows={1}
                  disabled={sending || !!loadError || membershipInactive}
                  className={`box-border w-full resize-none border-0 bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text)]/38 focus:outline-none focus:ring-0 disabled:opacity-50 ${
                    composerInputShape === "pill"
                      ? "py-0 leading-none"
                      : "py-1.5 leading-[1.45]"
                  }`}
                  style={{
                    maxHeight: DRAFT_TEXTAREA_MAX_PX,
                    overflowY: "auto",
                    ...(composerInputShape === "pill"
                      ? {
                          height: COMPOSER_PILL_TEXT_LINE_HEIGHT_PX,
                          minHeight: COMPOSER_PILL_TEXT_LINE_HEIGHT_PX,
                          lineHeight: `${COMPOSER_PILL_TEXT_LINE_HEIGHT_PX}px`,
                        }
                      : {}),
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sendDisabled || !!loadError || membershipInactive}
              aria-label={sending ? "Sending…" : "Send message"}
              className={`flex shrink-0 items-center justify-center rounded-full border text-base transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 disabled:pointer-events-none ${
                composerInputShape === "pill" ? "" : "h-9 w-9"
              } ${
                composerInputShape === "multiline"
                  ? "self-end"
                  : "self-center"
              } ${
                sendDisabled && !sending
                  ? "border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_34%,transparent)] text-neutral-700/88 shadow-sm app-dark:border-white/32 app-dark:bg-white/[0.1] app-dark:text-white/72 app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                  : "border-amber-500/42 bg-gradient-to-br from-amber-200/90 via-amber-100/82 to-yellow-50/74 text-amber-950/90 shadow-sm app-dark:border-amber-400/38 app-dark:from-amber-400/55 app-dark:via-amber-500/42 app-dark:to-amber-600/38 app-dark:text-amber-50/94"
              } ${sending ? "opacity-90" : ""}`}
              style={
                composerInputShape === "pill"
                  ? {
                      width: COMPOSER_TRACK_HEIGHT_PX,
                      height: COMPOSER_TRACK_HEIGHT_PX,
                      minWidth: COMPOSER_TRACK_HEIGHT_PX,
                      minHeight: COMPOSER_TRACK_HEIGHT_PX,
                    }
                  : undefined
              }
            >
              {sending ? (
                <span className="text-xs font-semibold leading-none tracking-tighter text-current">
                  …
                </span>
              ) : (
                <PiPaperPlaneRight
                  className="h-[1.2rem] w-[1.2rem]"
                  aria-hidden
                />
              )}
            </button>
          </div>
          </div>
          )}
        </div>
      </div>

      <div {...edgeStripProps} />

      {isGroup ? (
        <>
          <GroupPeopleSheet
            open={peopleSheetOpen}
            onClose={() => {
              setPeopleSheetOpen(false);
              setPeopleManageMode(false);
            }}
            title={groupHeaderTitle}
            memberCountLabel={groupHeaderSubtitle}
            members={groupMembers}
            createdByUserId={groupCreatedBy}
            safeHorizontalPadClass={safeHorizontalPad}
            manageMode={peopleManageMode}
            viewerUserId={viewerUserId}
            onRemoveMember={(userId) => {
              const m = groupMembers.find((row) => row.user_id === userId);
              const label =
                m?.display_name?.trim() ||
                m?.username?.trim() ||
                "this member";
              setRemoveTarget({ userId, label });
            }}
          />
          <GroupSettingsSheet
            open={settingsSheetOpen}
            onClose={() => setSettingsSheetOpen(false)}
            conversationId={conversationId}
            title={groupHeaderTitle}
            description={groupDescription}
            isGroupAdmin={isGroupAdmin}
            notificationsMuted={notificationsMuted}
            muteBusy={muteBusy}
            onToggleMute={() => void handleToggleNotificationsMuted()}
            onOpenPeople={() => openGroupPeople(false)}
            onAddPeople={() => setAddPeopleOpen(true)}
            onManagePeople={() => openGroupPeople(true)}
            onLeaveGroup={handleLeaveGroupRequest}
            onDeleteGroup={
              isGroupAdmin ? handleDeleteGroupRequest : undefined
            }
            onSaveDetails={handleSaveGroupDetails}
          />
          <AddPeoplePicker
            open={addPeopleOpen}
            onClose={() => setAddPeopleOpen(false)}
            conversationId={conversationId}
            activeMemberIds={activeMemberIds}
            activeMemberCount={groupMemberCount}
            onAdded={refreshGroupMembers}
          />
          <ConfirmDialog
            open={leaveConfirmOpen}
            onClose={() => {
              if (!leaveBusy) setLeaveConfirmOpen(false);
            }}
            onConfirm={() => void handleConfirmLeave()}
            title="Leave this group?"
            message="You will stop receiving messages from this group."
            confirmLabel="Leave"
            confirmVariant="dangerSoft"
            isLoading={leaveBusy}
            higherZIndex
          />
          <ConfirmDialog
            open={dissolveConfirmOpen}
            onClose={() => {
              if (!dissolveBusy) setDissolveConfirmOpen(false);
            }}
            onConfirm={() => void handleConfirmDissolveGroup()}
            title="Delete group?"
            message="This will end the group for everyone and remove it from Messages. This can’t be undone."
            confirmLabel="Delete group"
            confirmVariant="dangerSoft"
            isLoading={dissolveBusy}
            higherZIndex
          />
          <ConfirmDialog
            open={!!removeTarget}
            onClose={() => {
              if (!removeBusy) setRemoveTarget(null);
            }}
            onConfirm={() => void handleConfirmRemove()}
            title="Remove member?"
            message={
              removeTarget
                ? `Remove ${removeTarget.label} from this group?`
                : "Remove this member from the group?"
            }
            confirmLabel="Remove"
            confirmVariant="dangerSoft"
            isLoading={removeBusy}
            higherZIndex
          />
        </>
      ) : null}
    </div>
  );
}
