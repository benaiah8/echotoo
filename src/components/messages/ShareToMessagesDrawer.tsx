/**
 * Share S2E — Compact density polish (optical CTAs, counters, shrink-wrap grid, dock).
 * Send / eligibility / create-group logic unchanged.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  PiArrowLeft,
  PiCopy,
  PiInstagramLogo,
  PiMagnifyingGlass,
  PiShareFat,
  PiX,
} from "react-icons/pi";
import toast from "react-hot-toast";
import BottomDrawer from "../ui/BottomDrawer";
import InstagramStoryGenerator from "../ui/InstagramStoryGenerator";
import SelectedShareDestinationsSummary from "./SelectedShareDestinationsSummary";
import ShareDestinationTile, {
  type ShareDestinationTileModel,
} from "./ShareDestinationTile";
import {
  searchProfiles,
  type ProfileSearchRow,
} from "../../api/queries/searchProfiles";
import {
  createGroupConversation,
  isDmStrangerLimitError,
  listMyConversations,
  type InboxConversationRow,
} from "../../api/services/messaging";
import { getViewerAuthUserId } from "../../api/services/follows";
import {
  getDmInboxCache,
  isDmInboxFresh,
  isDmInboxUsable,
  setDmInboxCache,
} from "../../lib/dmInboxCache";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import {
  copyPostShareLink,
  trackStoryShare,
  webSharePostLink,
} from "../../lib/shareExternalActions";
import {
  SHARE_DESTINATION_MAX,
  SHARE_GROUP_TITLE_MAX,
  SHARE_NOTE_MAX,
  canonicalizeShareDestinations,
  createShareSendAttempt,
  deriveShareActionLayout,
  groupMemberUserIdsFromDestinations,
  isGroupComposableSelection,
  mergeShareGridDestinations,
  selectConversationDestination,
  selectPersonDestination,
  sendSharedPostToConversations,
  shareFailureCopy,
  shareWaitingForReplyCopy,
  type ShareDestination,
  type ShareSendAttempt,
} from "../../lib/shareToMessagesSend";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 25;
const INBOX_LIMIT = 40;
const NOTE_TEXTAREA_MAX_PX = 88;
const NOTE_FLASH_MS = 800;
/** Show bottom fade only when grid may scroll (~2+ rows). */
const GRID_FADE_MIN_TILES = 7;

type StoryExtras = {
  caption?: string | null;
  postImageUrl?: string | null;
  creatorName?: string;
  creatorHandle?: string;
  creatorAvatarUrl?: string | null;
  selectedDates?: string[] | null;
  isRecurring?: boolean | null;
  recurrenceDays?: string[] | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  postId: string;
  postType: "experience" | "hangout";
} & StoryExtras;

type SheetStep = "picker" | "new_group_title";

const searchPillClass =
  "relative flex min-h-[2.5rem] min-w-0 flex-1 items-center rounded-full border focus-within:ring-2 focus-within:ring-primary/25";

const searchInputClass =
  "min-h-0 min-w-0 flex-1 border-0 bg-transparent py-2 pl-9 pr-2 text-sm text-[var(--text)] placeholder:text-[var(--text)]/50 outline-none";

const glassInputStyle: CSSProperties = {
  backgroundColor: "color-mix(in oklab, var(--glass-bg) 75%, var(--bg))",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  borderColor: "var(--glass-active-border, var(--border))",
};

/**
 * Equal outer flex slots. Secondary gets slightly more px so longer label
 * has optical breathing room without changing slot width.
 */
const ctaShellClass =
  "flex h-10 min-h-10 w-full min-w-0 basis-0 flex-1 items-center justify-center overflow-hidden rounded-full text-center text-[13px] leading-none whitespace-nowrap transition-opacity disabled:pointer-events-none disabled:opacity-45";

const primaryCtaClass = `${ctaShellClass} bg-amber-400/90 px-2.5 font-semibold text-neutral-900`;

const secondaryCtaClass = `${ctaShellClass} border border-[var(--border)]/70 bg-[var(--surface-2)]/70 px-3.5 font-medium tracking-[0.01em] text-[var(--text)]/90`;

const quickPillBase =
  "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-[12px] font-medium transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50";

const quickPillSecondary = `${quickPillBase} border-[var(--border)] bg-[var(--surface-2)]/70 text-[var(--text)]/90`;

const quickPillStory = `${quickPillBase} relative overflow-hidden border-pink-400/45 bg-[var(--surface-2)]/75 text-[var(--text)]/90 shadow-[0_0_0_1px_rgba(168,85,247,0.10),0_0_14px_-6px_rgba(236,72,153,0.28)] before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-br before:from-pink-500/12 before:via-fuchsia-500/8 before:to-amber-400/10 before:content-['']`;

const closeBtnClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/75 transition hover:bg-[var(--text)]/8";

/** Soft dock — clearer top edge + subtle elevation. */
const bottomDockClass = [
  "shrink-0 space-y-2 rounded-t-2xl px-3 pb-3 pt-2.5",
  "border-t border-[var(--border)]/45",
  "bg-[color-mix(in_oklab,var(--surface)_78%,transparent)]",
  "app-dark:border-white/12 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,#050507)]",
  "shadow-[0_-6px_18px_-10px_rgba(0,0,0,0.28)] app-dark:shadow-[0_-8px_22px_-10px_rgba(0,0,0,0.55)]",
].join(" ");

const overlayCounterClass =
  "pointer-events-none absolute bottom-1.5 right-2 text-[10px] tabular-nums leading-none text-[var(--text)]/50";

/** CSS morph: equal flex slots; secondary collapses without changing primary height. */
function ShareActionMorphRow({
  dual,
  primaryLabel,
  dualSecondaryLabel,
  disabled,
  onPrimary,
  onSecondary,
}: {
  dual: boolean;
  primaryLabel: string;
  dualSecondaryLabel: string;
  disabled: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div className="flex h-10 w-full items-stretch gap-2">
      <button
        type="button"
        className={`${primaryCtaClass} transition-[flex-grow,max-width] duration-200 ease-out motion-reduce:transition-none`}
        disabled={disabled}
        onClick={onPrimary}
      >
        <span className="truncate">{primaryLabel}</span>
      </button>
      <div
        className={[
          "flex min-w-0 overflow-hidden transition-[flex-grow,max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          dual
            ? "max-w-none flex-1 basis-0 translate-x-0 opacity-100"
            : "pointer-events-none max-w-0 flex-[0_0_0%] basis-0 translate-x-2 opacity-0",
        ].join(" ")}
        aria-hidden={!dual}
      >
        <button
          type="button"
          tabIndex={dual ? 0 : -1}
          className={secondaryCtaClass}
          disabled={disabled || !dual}
          onClick={onSecondary}
        >
          <span className="truncate">{dualSecondaryLabel}</span>
        </button>
      </div>
    </div>
  );
}

function personLabel(p: ProfileSearchRow): string {
  return p.display_name?.trim() || p.username?.trim() || "Member";
}

function destinationsList(
  map: Map<string, ShareDestination>
): ShareDestination[] {
  return [...map.values()];
}

function tileModelFromDestination(
  dest: ShareDestination
): ShareDestinationTileModel {
  if (dest.kind === "conversation") {
    const isGroup = dest.conversationKind === "group";
    return {
      id: dest.key,
      label: dest.label,
      avatarUrl: dest.avatarUrl,
      userId: dest.otherUserId,
      variant: isGroup ? "group" : "direct",
      ...(isGroup
        ? {
            memberPreview:
              dest.memberPreview === undefined ? null : dest.memberPreview,
          }
        : {}),
    };
  }
  return {
    id: dest.key,
    label: dest.label,
    avatarUrl: dest.avatarUrl,
    userId: dest.userId,
    variant: "person",
  };
}

export default function ShareToMessagesDrawer({
  open,
  onClose,
  postId,
  postType,
  caption,
  postImageUrl,
  creatorName,
  creatorHandle,
  creatorAvatarUrl,
  selectedDates,
  isRecurring,
  recurrenceDays,
}: Props) {
  const [viewerAuthUserId, setViewerAuthUserId] = useState<string | null>(
    null
  );
  const [step, setStep] = useState<SheetStep>("picker");
  const [groupTitle, setGroupTitle] = useState("");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentRows, setRecentRows] = useState<InboxConversationRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [results, setResults] = useState<ProfileSearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, ShareDestination>>(
    () => new Map()
  );
  const [selectionExpanded, setSelectionExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [failedKeys, setFailedKeys] = useState<string[]>([]);
  const [failedLabels, setFailedLabels] = useState<Record<string, string>>(
    {}
  );
  const [lastBatchHadPartial, setLastBatchHadPartial] = useState(false);
  const [showStoryGenerator, setShowStoryGenerator] = useState(false);
  const [busyExternal, setBusyExternal] = useState(false);
  const [noteFlash, setNoteFlash] = useState(false);

  const searchGenRef = useRef(0);
  const sendLockRef = useRef(false);
  const attemptRef = useRef<ShareSendAttempt | null>(null);
  const searchMemoRef = useRef<Map<string, ProfileSearchRow[]>>(new Map());
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSelectionCountRef = useRef(0);
  const noteFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    searchGenRef.current += 1;
    sendLockRef.current = false;
    attemptRef.current = null;
    searchMemoRef.current = new Map();
    if (noteFlashTimerRef.current) {
      clearTimeout(noteFlashTimerRef.current);
      noteFlashTimerRef.current = null;
    }
    prevSelectionCountRef.current = 0;
    setStep("picker");
    setGroupTitle("");
    setNote("");
    setNoteError(null);
    setNoteFlash(false);
    setSearchQuery("");
    setRecentRows([]);
    setRecentLoading(false);
    setResults([]);
    setSearchLoading(false);
    setSelected(new Map());
    setSelectionExpanded(false);
    setSending(false);
    setFailedKeys([]);
    setFailedLabels({});
    setLastBatchHadPartial(false);
    setBusyExternal(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    let cancelled = false;
    (async () => {
      const viewer = await getViewerAuthUserId();
      if (cancelled) return;
      setViewerAuthUserId(viewer);
      if (!viewer) return;

      const cached = getDmInboxCache(viewer);
      if (cached && isDmInboxUsable(cached)) {
        setRecentRows(cached.conversations);
        setRecentLoading(false);
        if (!isDmInboxFresh(cached)) {
          void listMyConversations(INBOX_LIMIT).then(({ data, error }) => {
            if (cancelled || error || !data?.conversations) return;
            setRecentRows(data.conversations);
            setDmInboxCache(viewer, data.conversations);
          });
        }
        return;
      }

      if (cached) {
        setRecentRows(cached.conversations);
        setRecentLoading(false);
      } else {
        setRecentLoading(true);
      }
      try {
        const { data, error } = await listMyConversations(INBOX_LIMIT);
        if (cancelled) return;
        if (!error && data?.conversations) {
          setRecentRows(data.conversations);
          setDmInboxCache(viewer, data.conversations);
        }
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, resetState]);

  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (!q) {
      setResults([]);
      setSearchLoading(false);
      return;
    }

    const normalized = q.toLowerCase();
    const memoHit = searchMemoRef.current.get(normalized);
    if (memoHit) {
      setResults(memoHit);
      setSearchLoading(false);
      return;
    }

    const gen = ++searchGenRef.current;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchProfiles(q, undefined, {
            limit: SEARCH_PAGE_SIZE,
            offset: 0,
          });
          if (gen !== searchGenRef.current) return;
          const filtered = rows.filter((r) => {
            const uid = (r.user_id ?? "").trim();
            if (!uid) return false;
            if (viewerAuthUserId && uid === viewerAuthUserId) return false;
            return true;
          });
          searchMemoRef.current.set(normalized, filtered);
          setResults(filtered);
        } catch (e) {
          if (gen !== searchGenRef.current) return;
          console.error("[ShareToMessagesDrawer] search failed", e);
          setResults([]);
        } finally {
          if (gen === searchGenRef.current) setSearchLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [open, searchQuery, viewerAuthUserId]);

  const gridDestinations = useMemo(
    () =>
      mergeShareGridDestinations({
        recentRows,
        searchQuery,
        people: results.map((row) => ({
          userId: row.user_id,
          label: personLabel(row),
          avatarUrl: row.avatar_url,
        })),
      }),
    [recentRows, results, searchQuery]
  );

  const selectedList = useMemo(() => destinationsList(selected), [selected]);
  const selectionCount = selectedList.length;
  const actionLayout = useMemo(
    () => deriveShareActionLayout(selectedList),
    [selectedList]
  );
  const dualEligible = actionLayout === "dual";

  useEffect(() => {
    if (selected.size === 0) setSelectionExpanded(false);
  }, [selected.size]);

  const syncNoteTextareaHeight = useCallback(() => {
    const el = noteTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, NOTE_TEXTAREA_MAX_PX);
    el.style.height = `${Math.max(next, 24)}px`;
  }, []);

  useLayoutEffect(() => {
    syncNoteTextareaHeight();
  }, [note, selectionCount, syncNoteTextareaHeight]);

  // Flash "Add a note…" only on 0 → first selection (not every add / reopen).
  useEffect(() => {
    const prev = prevSelectionCountRef.current;
    prevSelectionCountRef.current = selectionCount;

    if (!(prev === 0 && selectionCount > 0)) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) return;

    if (noteFlashTimerRef.current) {
      clearTimeout(noteFlashTimerRef.current);
      noteFlashTimerRef.current = null;
    }
    setNoteFlash(true);
    noteFlashTimerRef.current = setTimeout(() => {
      setNoteFlash(false);
      noteFlashTimerRef.current = null;
    }, NOTE_FLASH_MS);

    return () => {
      if (noteFlashTimerRef.current) {
        clearTimeout(noteFlashTimerRef.current);
        noteFlashTimerRef.current = null;
      }
    };
  }, [selectionCount]);

  const clearSendUi = useCallback(() => {
    setFailedKeys([]);
    setFailedLabels({});
    setLastBatchHadPartial(false);
  }, []);

  const toggleDestination = useCallback(
    (dest: ShareDestination) => {
      setSelected((prev) => {
        if (prev.has(dest.key)) {
          const next = new Map(prev);
          next.delete(dest.key);
          return next;
        }
        if (dest.kind === "conversation") {
          const { next, blockedReason } = selectConversationDestination(
            prev,
            dest
          );
          if (blockedReason) {
            toast(blockedReason);
            return prev;
          }
          return next;
        }
        const { next, blockedReason, alreadyCovered } =
          selectPersonDestination(prev, dest);
        if (alreadyCovered) {
          toast("Already selected in chats");
          return prev;
        }
        if (blockedReason) {
          toast(blockedReason);
          return prev;
        }
        return next;
      });
      clearSendUi();
    },
    [clearSendUi]
  );

  const removeDestination = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const applySeparateSendOutcome = useCallback(
    (input: {
      destinations: ShareDestination[];
      personResolveFailures: Array<{
        key: string;
        label: string;
        error: unknown;
      }>;
      personKeyToConversationId: Map<string, string>;
      labelsByConversationId: Map<string, string>;
      sendResults: Array<{
        conversationId: string;
        label: string;
        ok: boolean;
        error?: unknown;
      }>;
      attempt: ShareSendAttempt;
    }) => {
      const {
        destinations,
        personResolveFailures,
        personKeyToConversationId,
        labelsByConversationId,
        sendResults,
        attempt,
      } = input;

      const failedConversationIds = new Set<string>();
      const nextFailedKeys: string[] = [];
      const nextFailedLabels: Record<string, string> = {};
      const strangerWaitingLabels: string[] = [];

      for (const fail of personResolveFailures) {
        nextFailedKeys.push(fail.key);
        nextFailedLabels[fail.key] = shareFailureCopy(fail.label, fail.error);
      }

      let successCount = 0;
      for (const r of sendResults) {
        if (r.ok) {
          successCount += 1;
          attempt.succeededConversationIds.add(r.conversationId);
        } else if (isDmStrangerLimitError(r.error)) {
          strangerWaitingLabels.push(shareWaitingForReplyCopy(r.label));
        } else {
          failedConversationIds.add(r.conversationId);
        }
      }

      for (const dest of destinations) {
        if (dest.kind === "conversation") {
          if (failedConversationIds.has(dest.conversationId)) {
            nextFailedKeys.push(dest.key);
            const sendFail = sendResults.find(
              (s) => s.conversationId === dest.conversationId && !s.ok
            );
            nextFailedLabels[dest.key] = shareFailureCopy(
              dest.label,
              sendFail?.error ??
                new Error(
                  labelsByConversationId.get(dest.conversationId) ||
                    "Send failed"
                )
            );
          }
          continue;
        }
        const resolvedId = personKeyToConversationId.get(dest.key);
        if (!resolvedId) continue;
        if (failedConversationIds.has(resolvedId)) {
          nextFailedKeys.push(dest.key);
          const sendFail = sendResults.find(
            (s) => s.conversationId === resolvedId && !s.ok
          );
          nextFailedLabels[dest.key] = shareFailureCopy(
            dest.label,
            sendFail?.error ?? new Error("Send failed")
          );
        }
      }

      const attemptedKeys = new Set<string>(destinations.map((d) => d.key));
      const failedKeySet = new Set<string>(nextFailedKeys);
      attempt.failedKeys = nextFailedKeys;

      setSelected((prev) => {
        const out = new Map<string, ShareDestination>();
        for (const [key, dest] of prev) {
          if (!attemptedKeys.has(key)) {
            out.set(key, dest);
            continue;
          }
          if (failedKeySet.has(key)) out.set(key, dest);
        }
        return out;
      });

      setFailedKeys(nextFailedKeys);
      setFailedLabels(nextFailedLabels);

      const failCount = nextFailedKeys.length;
      const strangerCount = strangerWaitingLabels.length;

      if (failCount === 0 && strangerCount === 0 && successCount > 0) {
        toast.success(
          successCount === 1 ? "Shared" : `Shared to ${successCount} chats`
        );
        handleClose();
        return;
      }

      if (failCount === 0 && strangerCount > 0 && successCount > 0) {
        toast(
          `Shared to ${successCount} chat${successCount === 1 ? "" : "s"}. ${
            strangerCount === 1
              ? strangerWaitingLabels[0]
              : `${strangerCount} waiting for a reply.`
          }`
        );
        handleClose();
        return;
      }

      if (failCount === 0 && strangerCount > 0 && successCount === 0) {
        toast.error(
          strangerCount === 1
            ? strangerWaitingLabels[0]
            : `Waiting for replies (${strangerCount})`
        );
        return;
      }

      if (successCount > 0 && failCount > 0) {
        setLastBatchHadPartial(true);
        toast(
          `Shared to ${successCount} chat${successCount === 1 ? "" : "s"}. ${failCount} failed.`
        );
        return;
      }

      if (failCount > 0 && successCount === 0) {
        toast.error(
          failCount === 1
            ? nextFailedLabels[nextFailedKeys[0]] || "Couldn't share"
            : `Couldn't share to ${failCount} chats`
        );
        return;
      }

      if (successCount === 0 && failCount === 0) {
        toast("Nothing to send");
      }
    },
    [handleClose]
  );

  const runSendSeparately = useCallback(
    async (destinations: ShareDestination[], isRetry: boolean) => {
      if (sendLockRef.current || sending) return;
      const trimmedPostId = postId.trim();
      if (!trimmedPostId) {
        toast.error("Missing post");
        return;
      }

      const noteTrimmed = note.trim();
      if (noteTrimmed.length > SHARE_NOTE_MAX) {
        setNoteError(`Note must be ${SHARE_NOTE_MAX} characters or fewer`);
        return;
      }
      setNoteError(null);

      if (destinations.length === 0) {
        toast("Select at least one chat or person");
        return;
      }

      const attempt = isRetry
        ? attemptRef.current?.mode === "separate"
          ? attemptRef.current
          : createShareSendAttempt("separate")
        : createShareSendAttempt("separate");
      attemptRef.current = attempt;
      if (!isRetry) {
        attempt.failedKeys = [];
      }

      sendLockRef.current = true;
      setSending(true);
      setFailedKeys([]);
      setFailedLabels({});
      setLastBatchHadPartial(false);

      try {
        const {
          conversationIds,
          labelsByConversationId,
          personKeyToConversationId,
          personResolveFailures,
        } = await canonicalizeShareDestinations(destinations);

        const toSend = conversationIds.filter(
          (id) => !attempt.succeededConversationIds.has(id)
        );

        const sendResults =
          toSend.length > 0
            ? await sendSharedPostToConversations({
                conversationIds: toSend,
                labelsByConversationId,
                postId: trimmedPostId,
                note: noteTrimmed.length > 0 ? noteTrimmed : null,
                attemptClientIds: attempt.clientIdsByConversation,
              })
            : [];

        applySeparateSendOutcome({
          destinations,
          personResolveFailures,
          personKeyToConversationId,
          labelsByConversationId,
          sendResults,
          attempt,
        });
      } finally {
        sendLockRef.current = false;
        setSending(false);
      }
    },
    [applySeparateSendOutcome, note, postId, sending]
  );

  const runSendToNewGroup = useCallback(
    async (options?: { retrySendOnly?: boolean }) => {
      if (sendLockRef.current || sending) return;
      const trimmedPostId = postId.trim();
      if (!trimmedPostId) {
        toast.error("Missing post");
        return;
      }

      const noteTrimmed = note.trim();
      if (noteTrimmed.length > SHARE_NOTE_MAX) {
        setNoteError(`Note must be ${SHARE_NOTE_MAX} characters or fewer`);
        return;
      }
      setNoteError(null);

      const composable = destinationsList(selected);
      if (
        !isGroupComposableSelection(composable) &&
        !options?.retrySendOnly
      ) {
        toast("Select people only to create a new group");
        return;
      }

      const title = groupTitle.trim();
      if (!options?.retrySendOnly && !title) {
        toast.error("Enter a group name");
        return;
      }
      if (title.length > SHARE_GROUP_TITLE_MAX) {
        toast.error(
          `Group name must be ${SHARE_GROUP_TITLE_MAX} characters or fewer`
        );
        return;
      }

      const attempt =
        options?.retrySendOnly && attemptRef.current?.mode === "new_group"
          ? attemptRef.current
          : createShareSendAttempt("new_group");
      attemptRef.current = attempt;

      sendLockRef.current = true;
      setSending(true);
      setFailedKeys([]);
      setFailedLabels({});
      setLastBatchHadPartial(false);

      try {
        let conversationId = attempt.createdGroupConversationId?.trim() || "";

        if (!conversationId) {
          const memberIds = groupMemberUserIdsFromDestinations(
            composable,
            viewerAuthUserId
          );
          if (memberIds.length < 2) {
            toast.error("Select at least two people for a new group");
            return;
          }
          const { data, error } = await createGroupConversation(
            title,
            memberIds
          );
          if (error || !data?.conversation_id) {
            toast.error(
              shareFailureCopy(
                "new group",
                error ?? new Error("Could not create group")
              )
            );
            return;
          }
          conversationId = data.conversation_id;
          attempt.createdGroupConversationId = conversationId;
        }

        if (attempt.succeededConversationIds.has(conversationId)) {
          toast.success("Shared");
          handleClose();
          return;
        }

        const labelsByConversationId = new Map<string, string>([
          [conversationId, title || "Group"],
        ]);
        const sendResults = await sendSharedPostToConversations({
          conversationIds: [conversationId],
          labelsByConversationId,
          postId: trimmedPostId,
          note: noteTrimmed.length > 0 ? noteTrimmed : null,
          attemptClientIds: attempt.clientIdsByConversation,
        });

        const result = sendResults[0];
        if (result?.ok) {
          attempt.succeededConversationIds.add(conversationId);
          attempt.failedKeys = [];
          toast.success("Shared");
          handleClose();
          return;
        }

        const failKey = `conversation:${conversationId}`;
        attempt.failedKeys = [failKey];
        setFailedKeys([failKey]);
        setFailedLabels({
          [failKey]: shareFailureCopy(
            title || "Group",
            result?.error ?? new Error("Send failed")
          ),
        });
        toast.error(
          shareFailureCopy(
            title || "Group",
            result?.error ?? new Error("Send failed")
          )
        );
      } finally {
        sendLockRef.current = false;
        setSending(false);
      }
    },
    [
      groupTitle,
      handleClose,
      note,
      postId,
      selected,
      sending,
      viewerAuthUserId,
    ]
  );

  const handleSendPrimary = useCallback(() => {
    void runSendSeparately(destinationsList(selected), false);
  }, [runSendSeparately, selected]);

  const handleRetryFailed = useCallback(() => {
    const attempt = attemptRef.current;
    if (attempt?.mode === "new_group" && attempt.createdGroupConversationId) {
      void runSendToNewGroup({ retrySendOnly: true });
      return;
    }
    const failedSet = new Set(failedKeys);
    const retryDests = destinationsList(selected).filter((d) =>
      failedSet.has(d.key)
    );
    if (retryDests.length === 0) {
      void runSendSeparately(destinationsList(selected), true);
      return;
    }
    void runSendSeparately(retryDests, true);
  }, [failedKeys, runSendSeparately, runSendToNewGroup, selected]);

  const handleCopy = useCallback(async () => {
    if (busyExternal) return;
    setBusyExternal(true);
    try {
      await copyPostShareLink({ postId, postType });
    } finally {
      setBusyExternal(false);
    }
  }, [busyExternal, postId, postType]);

  const handleWebShare = useCallback(async () => {
    if (busyExternal) return;
    setBusyExternal(true);
    try {
      await webSharePostLink({ postId, postType });
    } finally {
      setBusyExternal(false);
    }
  }, [busyExternal, postId, postType]);

  const showRetry = failedKeys.length > 0 && !sending;
  const noteCount = note.length;
  const shareLabel =
    typeof navigator.share === "function" || isNativeApp() ? "Share" : "Copy";

  const emptyQuery = searchQuery.trim().length === 0;
  const showEmptyLoading = recentLoading && gridDestinations.length === 0;
  const showEmptyMessage =
    !showEmptyLoading && gridDestinations.length === 0;
  const showGridFade =
    !showEmptyLoading &&
    !showEmptyMessage &&
    gridDestinations.length >= GRID_FADE_MIN_TILES;

  const primaryActionLabel =
    sending
      ? "Sharing…"
      : actionLayout === "send"
        ? "Send"
        : "Send separately";

  return (
    <>
      <BottomDrawer
        open={open}
        onClose={handleClose}
        transparentSheet
        disableBodyScrollLock
        portalClassName="z-[130]"
        maxHeight="88vh"
        shrinkSheetToContent
        showCloseButton={false}
        contentClassName="px-3 pt-1 sm:px-4"
      >
        <div
          className={`${glassPeoplePanelClass} mx-auto flex max-h-[min(78vh,36rem)] w-full max-w-lg flex-col`}
        >
          {step === "new_group_title" ? (
            <>
              <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (sending) return;
                    setStep("picker");
                  }}
                  className={closeBtnClass}
                  disabled={sending}
                  aria-label="Back"
                >
                  <PiArrowLeft className="h-4 w-4" aria-hidden />
                </button>
                <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--text)]">
                  New group
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className={closeBtnClass}
                  aria-label="Close"
                >
                  <PiX className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="space-y-2.5 overflow-y-auto px-3 py-2.5">
                <label className="sr-only" htmlFor="share-new-group-title">
                  Group name
                </label>
                <div className="relative">
                  <input
                    id="share-new-group-title"
                    type="text"
                    value={groupTitle}
                    onChange={(e) =>
                      setGroupTitle(
                        e.target.value.slice(0, SHARE_GROUP_TITLE_MAX)
                      )
                    }
                    placeholder="Group name"
                    disabled={sending}
                    maxLength={SHARE_GROUP_TITLE_MAX}
                    className="w-full rounded-2xl border border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)] py-2.5 pl-3 pr-12 text-sm text-[var(--text)] placeholder:text-[var(--text)]/45 outline-none focus:ring-2 focus:ring-primary/25"
                    autoFocus
                  />
                  <span className={overlayCounterClass} aria-hidden>
                    {groupTitle.length}/{SHARE_GROUP_TITLE_MAX}
                  </span>
                </div>
                <SelectedShareDestinationsSummary
                  destinations={selectedList}
                  expanded={selectionExpanded}
                  onToggle={() => setSelectionExpanded((v) => !v)}
                  onRemove={removeDestination}
                  disabled={sending}
                />
              </div>

              <div className={bottomDockClass}>
                {failedKeys.length > 0 ? (
                  <p
                    className="truncate text-[11px] text-red-500/90"
                    role="status"
                  >
                    {failedLabels[failedKeys[0]] || "Couldn't share"}
                    {" · Retry send"}
                  </p>
                ) : null}
                {showRetry ? (
                  <button
                    type="button"
                    className={primaryCtaClass}
                    disabled={sending}
                    onClick={handleRetryFailed}
                  >
                    Retry send
                  </button>
                ) : (
                  <button
                    type="button"
                    className={primaryCtaClass}
                    disabled={sending || !groupTitle.trim()}
                    onClick={() => void runSendToNewGroup()}
                  >
                    {sending ? "Sharing…" : "Create & send"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 px-3 pb-1.5 pt-2.5">
                <div className={searchPillClass} style={glassInputStyle}>
                  <PiMagnifyingGlass
                    className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text)]/45"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search people or chats…"
                    disabled={sending}
                    className={searchInputClass}
                    autoCapitalize="off"
                    autoCorrect="off"
                    enterKeyHint="search"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className={closeBtnClass}
                  aria-label="Close"
                >
                  <PiX className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="relative min-h-0 shrink">
                <div
                  className={[
                    "overflow-y-auto overscroll-contain px-3 pt-0.5",
                    "max-h-[min(42vh,18rem)]",
                    showGridFade ? "pb-8" : "pb-2",
                  ].join(" ")}
                >
                  {showEmptyLoading ? (
                    <p className="py-4 text-center text-sm text-[var(--text)]/50">
                      Loading chats…
                    </p>
                  ) : showEmptyMessage ? (
                    <p className="py-4 text-center text-sm text-[var(--text)]/50">
                      {emptyQuery
                        ? "No recent chats yet."
                        : searchLoading
                          ? "Searching…"
                          : "No matches."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
                      {gridDestinations.map((dest) => {
                        const tile = tileModelFromDestination(dest);
                        return (
                          <ShareDestinationTile
                            key={dest.key}
                            tile={tile}
                            selected={selected.has(dest.key)}
                            disabled={sending}
                            onSelect={() => toggleDestination(dest)}
                          />
                        );
                      })}
                    </div>
                  )}

                  {searchQuery.trim() &&
                  searchLoading &&
                  results.length === 0 ? (
                    <p className="mt-1.5 text-center text-[11px] text-[var(--text)]/45">
                      Searching people…
                    </p>
                  ) : null}

                  {selectionCount >= SHARE_DESTINATION_MAX ? (
                    <p className="mt-1.5 text-center text-[11px] text-[var(--text)]/45">
                      Max {SHARE_DESTINATION_MAX} destinations
                    </p>
                  ) : null}
                </div>
                {showGridFade ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
                    style={{
                      background:
                        "linear-gradient(to top, color-mix(in oklab, var(--surface) 55%, transparent), transparent)",
                    }}
                    aria-hidden
                  />
                ) : null}
              </div>

              <div className={bottomDockClass}>
                {selectionCount === 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={quickPillSecondary}
                      disabled={busyExternal || sending}
                      onClick={() => void handleCopy()}
                    >
                      <PiCopy className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">Copy</span>
                    </button>
                    <button
                      type="button"
                      className={quickPillSecondary}
                      disabled={busyExternal || sending}
                      onClick={() => void handleWebShare()}
                      aria-label={shareLabel}
                    >
                      <PiShareFat className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{shareLabel}</span>
                    </button>
                    <button
                      type="button"
                      className={quickPillStory}
                      disabled={busyExternal || sending}
                      onClick={() => setShowStoryGenerator(true)}
                    >
                      <PiInstagramLogo
                        className="relative z-10 h-4 w-4 shrink-0"
                        aria-hidden
                      />
                      <span className="relative z-10 truncate">Story</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {failedKeys.length > 0 ? (
                      <p
                        className="truncate text-[11px] text-red-500/90"
                        role="status"
                      >
                        {failedKeys.length === 1
                          ? failedLabels[failedKeys[0]] || "Couldn't share"
                          : `${failedKeys.length} shares failed`}
                        {lastBatchHadPartial ? " · Retry remaining" : null}
                      </p>
                    ) : null}

                    <div className="relative">
                      <label
                        className="sr-only"
                        htmlFor="share-to-messages-note"
                      >
                        Optional note
                      </label>
                      <textarea
                        id="share-to-messages-note"
                        ref={noteTextareaRef}
                        value={note}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.length <= SHARE_NOTE_MAX) {
                            setNote(v);
                            setNoteError(null);
                          } else {
                            setNote(v.slice(0, SHARE_NOTE_MAX));
                            setNoteError(
                              `Note must be ${SHARE_NOTE_MAX} characters or fewer`
                            );
                          }
                        }}
                        rows={1}
                        placeholder="Add a note…"
                        disabled={sending}
                        className={[
                          "w-full resize-none overflow-y-auto border-0 bg-transparent py-0.5 pl-0.5 pr-10 text-sm leading-snug outline-none",
                          "placeholder:transition-colors placeholder:duration-300 motion-reduce:placeholder:transition-none",
                          noteFlash
                            ? "placeholder:text-amber-500 app-dark:placeholder:text-amber-300"
                            : "placeholder:text-[var(--text)]/40",
                          "text-[var(--text)]",
                        ].join(" ")}
                        style={{ maxHeight: NOTE_TEXTAREA_MAX_PX }}
                      />
                      <span className={overlayCounterClass} aria-hidden>
                        {noteCount}/{SHARE_NOTE_MAX}
                      </span>
                      {noteError ? (
                        <p className="mt-0.5 text-[10px] text-red-500/90">
                          {noteError}
                        </p>
                      ) : null}
                    </div>

                    <SelectedShareDestinationsSummary
                      destinations={selectedList}
                      expanded={selectionExpanded}
                      onToggle={() => setSelectionExpanded((v) => !v)}
                      onRemove={removeDestination}
                      disabled={sending}
                    />

                    {showRetry ? (
                      <button
                        type="button"
                        className={primaryCtaClass}
                        disabled={sending}
                        onClick={handleRetryFailed}
                      >
                        Retry failures
                      </button>
                    ) : (
                      <ShareActionMorphRow
                        dual={dualEligible}
                        primaryLabel={primaryActionLabel}
                        dualSecondaryLabel="Send to new group"
                        disabled={sending || selectionCount === 0}
                        onPrimary={handleSendPrimary}
                        onSecondary={() => {
                          if (!isGroupComposableSelection(selectedList)) {
                            return;
                          }
                          clearSendUi();
                          setGroupTitle("");
                          setStep("new_group_title");
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </BottomDrawer>

      {showStoryGenerator ? (
        <InstagramStoryGenerator
          caption={caption || `Check out this ${postType}!`}
          postImageUrl={postImageUrl}
          postId={postId}
          postType={postType}
          creatorName={creatorName}
          creatorHandle={creatorHandle}
          creatorAvatarUrl={creatorAvatarUrl}
          selectedDates={selectedDates}
          isRecurring={isRecurring}
          recurrenceDays={recurrenceDays}
          onClose={() => setShowStoryGenerator(false)}
          onImageGenerated={async () => {
            await trackStoryShare(postId);
          }}
        />
      ) : null}
    </>
  );
}
