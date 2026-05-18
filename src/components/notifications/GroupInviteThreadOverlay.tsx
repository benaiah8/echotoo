import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PiArrowLeft, PiPaperPlaneRight } from "react-icons/pi";
import {
  getInviteThreadForViewer,
  postInviteThreadMessage,
  toggleInviteMessageReaction,
  readInviteThreadBundleCache,
  writeInviteThreadBundleCache,
  type InviteThreadBundle,
  type InviteThreadMessage,
  type InviteThreadParticipant,
} from "../../api/services/inviteThreads";
import { getViewerAuthUserId } from "../../api/services/follows";
import { postDetailPath } from "../../router/Paths";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import {
  INVITE_OVERLAY_HISTORY,
  isPostDetailRoutePath,
} from "../../lib/inviteOverlayHistory";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { supabase } from "../../lib/supabaseClient";
import Avatar from "../ui/Avatar";
import InviteThreadMessageList from "./invite-thread/InviteThreadMessageList";
import InviteExpiryPill from "./InviteExpiryPill";
import {
  InviteThreadExpiredBanner,
  InviteThreadReadOnlyComposerNotice,
  InviteThreadReadOnlyScrollHint,
} from "./invite-thread/InviteThreadExpiredNotice";
import {
  InviteThreadScrollContext,
  InviteThreadTopHeader,
  inviteThreadHeaderBackArrowClass,
  inviteThreadHeaderBackButtonClass,
  GROUP_QUOTA_UI_SEGMENT_TOTAL,
  groupQuotaActiveSegmentsCount,
} from "./invite-thread/InviteThreadOverlayLayout";
import { useInviteThreadKeyboardLayout } from "./invite-thread/useInviteThreadKeyboardLayout";
const DRAFT_TEXTAREA_MAX_PX = 220;
const COMPOSER_MULTILINE_CORNER_PX = 21;
const COMPOSER_PILL_INSET_PX = 6;
const COMPOSER_TRACK_HEIGHT_PX = 34;
const COMPOSER_PILL_TEXT_LINE_HEIGHT_PX = COMPOSER_TRACK_HEIGHT_PX - 2;
const COMPOSER_PILL_OUTER_HEIGHT_PX =
  COMPOSER_TRACK_HEIGHT_PX + 2 * COMPOSER_PILL_INSET_PX + 4;
const QUICK_REPLY_CHIPS = [
  "I'm in",
  "Maybe",
  "What time?",
  "Send details",
  "Convince me",
] as const;
const MAX_VISIBLE_STACK = 3;
/** ~5 participant rows visible before scrolling (~48px row × 5 + header padding). */
const PARTICIPANTS_PANEL_SCROLL_MAX_CLASS =
  "max-h-[min(248px,calc(100dvh-14rem))]";

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  windowStartAt: string;
  windowMs?: number;
};

function rpcLikeMessage(error: unknown, fallback: string): string {
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function participantLabel(p: InviteThreadParticipant): string {
  return p.display_name || p.username || "Member";
}

function participantPrimaryLine(p: InviteThreadParticipant): string {
  const d = (p.display_name ?? "").trim();
  const u = (p.username ?? "").trim();
  return d || u || "EchoToo user";
}

/** @username line when both display name and handle exist (avoids duplicate single-field rows). */
function participantSecondaryLine(p: InviteThreadParticipant): string | null {
  const d = (p.display_name ?? "").trim();
  const u = (p.username ?? "").trim();
  if (!u || !d) return null;
  return `@${u}`;
}

export default function GroupInviteThreadOverlay({
  open,
  onClose,
  threadId,
  windowStartAt,
  windowMs,
}: Props) {
  const location = useLocation();
  const pathname = location.pathname;
  const engageInviteBack = open && !isPostDetailRoutePath(pathname);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<InviteThreadBundle | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(
    null,
  );
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [composerInputShape, setComposerInputShape] = useState<
    "pill" | "multiline"
  >("pill");
  const [participantsOpen, setParticipantsOpen] = useState(false);

  const bundleRef = useRef<InviteThreadBundle | null>(null);
  const suppressSilentThreadRefreshRef = useRef(false);

  const skipPopstateRef = useRef(false);
  const pushedGroupRef = useRef(false);
  const pushedParticipantsRef = useRef(false);
  const participantsOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const prevParticipantsOpenForHist = useRef(false);
  participantsOpenRef.current = participantsOpen;
  onCloseRef.current = onClose;

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const syncDraftTextareaHeight = useCallback(() => {
    const el = draftTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const scrollH = el.scrollHeight;
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const fontSize = parseFloat(cs.fontSize || "15");
    let lhParsed = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lhParsed) || lhParsed < 8) {
      lhParsed = fontSize * 1.45;
    }
    const lineHeightPx = lhParsed;
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

  useLayoutEffect(() => {
    if (!open || !bundle?.can_compose) return;
    syncDraftTextareaHeight();
  }, [open, bundle?.can_compose, draft, syncDraftTextareaHeight]);

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    if (!open) return;
    syncAppSafeAreaBottom();
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  /** Synthetic history: group chat layer */
  useEffect(() => {
    if (!open || !engageInviteBack) return;
    if (pushedGroupRef.current) return;
    window.history.pushState(
      { [INVITE_OVERLAY_HISTORY.groupChat]: true } as Record<string, boolean>,
      "",
      window.location.href,
    );
    pushedGroupRef.current = true;
  }, [open, engageInviteBack]);

  /** Synthetic history: participants sheet above chat */
  useEffect(() => {
    if (!participantsOpen || !open || !engageInviteBack) return;
    if (pushedParticipantsRef.current) return;
    window.history.pushState(
      {
        [INVITE_OVERLAY_HISTORY.groupParticipants]: true,
      } as Record<string, boolean>,
      "",
      window.location.href,
    );
    pushedParticipantsRef.current = true;
  }, [participantsOpen, open, engageInviteBack]);

  /** Browser Back: participants first, then whole overlay */
  useEffect(() => {
    if (!open || !engageInviteBack) return;
    const onPopState = () => {
      if (skipPopstateRef.current) {
        skipPopstateRef.current = false;
        return;
      }
      if (participantsOpenRef.current) {
        setParticipantsOpen(false);
        pushedParticipantsRef.current = false;
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open, engageInviteBack]);

  /** Android Back + Escape: same ordering as popstate */
  useEffect(() => {
    if (!open || !engageInviteBack) return;
    const dismissParticipantsIfNeeded = () => {
      if (!participantsOpenRef.current) return false;
      setParticipantsOpen(false);
      if (pushedParticipantsRef.current) {
        const st = window.history.state as Record<string, boolean> | null;
        if (st && st[INVITE_OVERLAY_HISTORY.groupParticipants] === true) {
          skipPopstateRef.current = true;
          window.history.back();
        }
        pushedParticipantsRef.current = false;
      }
      return true;
    };
    const unsub = subscribeAndroidHardwareBack(() => {
      if (dismissParticipantsIfNeeded()) return;
      onCloseRef.current();
    });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dismissParticipantsIfNeeded()) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, engageInviteBack]);

  /** Backdrop / UI closed participants only — drop synthetic participants entry */
  useEffect(() => {
    const was = prevParticipantsOpenForHist.current;
    prevParticipantsOpenForHist.current = participantsOpen;
    if (!open) return;
    if (!was || participantsOpen || !pushedParticipantsRef.current) return;
    const st = window.history.state as Record<string, boolean> | null;
    if (st && st[INVITE_OVERLAY_HISTORY.groupParticipants] === true) {
      skipPopstateRef.current = true;
      window.history.back();
    }
    pushedParticipantsRef.current = false;
  }, [participantsOpen, open]);

  /** Post detail route active: strip synthetic markers without relying on overlay unmount */
  useEffect(() => {
    if (engageInviteBack) return;
    if (!pushedGroupRef.current && !pushedParticipantsRef.current) return;
    const st = window.history.state as Record<string, boolean> | null;
    if (st && st[INVITE_OVERLAY_HISTORY.groupParticipants] === true) {
      skipPopstateRef.current = true;
      window.history.back();
      queueMicrotask(() => {
        const st2 = window.history.state as Record<string, boolean> | null;
        if (st2 && st2[INVITE_OVERLAY_HISTORY.groupChat] === true) {
          skipPopstateRef.current = true;
          window.history.back();
        }
        pushedGroupRef.current = false;
        pushedParticipantsRef.current = false;
      });
      return;
    }
    if (st && st[INVITE_OVERLAY_HISTORY.groupChat] === true) {
      skipPopstateRef.current = true;
      window.history.back();
    }
    pushedGroupRef.current = false;
    pushedParticipantsRef.current = false;
  }, [engageInviteBack]);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setSubmitError(null);
      setSubmitting(false);
      setReactingMessageId(null);
      setReactionError(null);
      setComposerInputShape("pill");
      setParticipantsOpen(false);
      setLoading(false);
      return;
    }

    if (!threadId) {
      setBundle(null);
      setError(null);
      setLoading(false);
      setDraft("");
      setSubmitError(null);
      setSubmitting(false);
      setReactingMessageId(null);
      setReactionError(null);
      setComposerInputShape("pill");
      setParticipantsOpen(false);
      return;
    }

    setDraft("");
    setSubmitError(null);
    setSubmitting(false);
    setReactingMessageId(null);
    setReactionError(null);

    const cached = readInviteThreadBundleCache(threadId);
    const inMemory =
      bundleRef.current?.thread.id === threadId ? bundleRef.current : null;
    const hydrate = cached ?? inMemory ?? null;
    const hadHydrate = hydrate != null;

    if (hydrate) {
      setBundle(hydrate);
      setLoading(false);
      setError(null);
    } else {
      setBundle(null);
      setLoading(true);
      setError(null);
    }

    let cancelled = false;

    void (async () => {
      try {
        const uid = await getViewerAuthUserId();
        if (cancelled) return;
        setViewerUserId(uid);
        const { data, error: rpcError } = await getInviteThreadForViewer(
          threadId,
          { allowCache: true, forceRefresh: true },
        );
        if (cancelled) return;
        if (rpcError || !data) {
          if (!hadHydrate) {
            setError(rpcLikeMessage(rpcError, "Could not load invite chat."));
            setLoading(false);
          }
          return;
        }
        setBundle(data);
        setLoading(false);
      } catch (e) {
        if (!cancelled && !hadHydrate) {
          setError(
            e instanceof Error ? e.message : "Could not load invite chat.",
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

  const refreshBundleSilently = useCallback(async () => {
    if (!open || !threadId) return;
    if (suppressSilentThreadRefreshRef.current) return;
    try {
      const { data, error: rpcError } = await getInviteThreadForViewer(
        threadId,
        { allowCache: true, forceRefresh: true },
      );
      if (rpcError || !data) return;
      setBundle(data);
    } catch {
      // no-op
    }
  }, [open, threadId]);

  useEffect(() => {
    if (!open || !threadId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshBundleSilently();
      }, 320);
    };

    const channel = supabase
      .channel(`group-invite-thread-overlay-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invite_threads",
          filter: `id=eq.${threadId}`,
        },
        schedule,
      )
      .subscribe();

    const onFocus = () => {
      const visible =
        typeof document === "undefined" ||
        document.visibilityState === "visible";
      if (visible) schedule();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [open, threadId, refreshBundleSilently]);

  const {
    scrollLayerRef,
    bottomChromeOuterRef,
    bottomChromeContentRef,
    scrollPadTop,
    scrollPadBottom,
    composerBottomGap,
    onComposerFocus,
    onComposerBlur,
    scrollToBottomAfterSend,
  } = useInviteThreadKeyboardLayout({
    open,
    measureChrome: open && Boolean(threadId && bundle),
    remeasureDeps: [
      threadId,
      bundle?.can_compose,
      draft,
      submitError,
      loading,
      composerInputShape,
      participantsOpen,
    ],
  });

  const linkToPost = useMemo(() => {
    if (!bundle?.post_peek.post_id) return null;
    return postDetailPath(
      bundle.post_peek.post_type === "hangout" ? "hangout" : "experience",
      bundle.post_peek.post_id,
    );
  }, [bundle]);

  const participants = bundle?.participants ?? [];
  const visibleParticipants = participants.slice(0, MAX_VISIBLE_STACK);
  const participantCount = bundle?.participant_count ?? participants.length;
  const extraCount = Math.max(0, participantCount - visibleParticipants.length);

  const reactionsInteractive =
    bundle != null &&
    !bundle.is_expired &&
    !bundle.blocked_pair &&
    bundle.thread.closed_at == null;

  const bodyLimit =
    bundle != null && bundle.thread.max_body_length > 0
      ? bundle.thread.max_body_length
      : 400;
  const trimmedDraft = draft.trim();
  const draftTooLong = draft.length > bodyLimit;
  const nearCharLimit =
    draftTooLong || draft.length > Math.floor(bodyLimit * 0.75);
  const sendDisabled =
    submitting ||
    !bundle?.can_compose ||
    trimmedDraft.length === 0 ||
    draftTooLong;

  const handleSend = useCallback(async () => {
    if (!threadId || !bundle?.can_compose || sendDisabled || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    suppressSilentThreadRefreshRef.current = true;
    try {
      const { error: postError } = await postInviteThreadMessage(
        threadId,
        trimmedDraft,
      );
      if (postError) {
        setSubmitError(rpcLikeMessage(postError, "Could not send message."));
        return;
      }
      const { data: refreshed, error: reloadError } =
        await getInviteThreadForViewer(threadId, {
          allowCache: true,
          forceRefresh: true,
        });
      if (reloadError || !refreshed) {
        setSubmitError(
          rpcLikeMessage(
            reloadError,
            "Message sent but could not refresh chat.",
          ),
        );
        setDraft("");
        return;
      }
      setBundle(refreshed);
      setDraft("");
      if (draftTextareaRef.current) draftTextareaRef.current.style.height = "";
      scrollToBottomAfterSend();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Could not send message.",
      );
    } finally {
      setSubmitting(false);
      suppressSilentThreadRefreshRef.current = false;
    }
  }, [
    threadId,
    bundle?.can_compose,
    sendDisabled,
    submitting,
    trimmedDraft,
    scrollToBottomAfterSend,
  ]);

  const handleReactionToggle = useCallback(
    async (messageId: string) => {
      if (!reactionsInteractive) return;
      setReactionError(null);
      setReactingMessageId(messageId);
      suppressSilentThreadRefreshRef.current = true;
      let previousMessage: InviteThreadMessage | null = null;
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => {
            if (m.id !== messageId) return m;
            previousMessage = m;
            const next = !(m.viewer_has_thumb_up === true);
            const nextCount = next
              ? (Number(m.thumb_up_count) || 0) + 1
              : Math.max(0, (Number(m.thumb_up_count) || 0) - 1);
            return {
              ...m,
              viewer_has_thumb_up: next,
              thumb_up_count: nextCount,
            };
          }),
        };
      });

      try {
        const { data, error: toggleError } = await toggleInviteMessageReaction(
          messageId,
          "thumb_up",
        );
        if (toggleError || !data) {
          if (previousMessage) {
            setBundle((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === messageId ? previousMessage! : m,
                ),
              };
            });
          }
          setReactionError(
            rpcLikeMessage(toggleError, "Couldn't update reaction."),
          );
          return;
        }
        setBundle((prev) => {
          if (!prev) return prev;
          const next: InviteThreadBundle = {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === data.message_id
                ? {
                    ...m,
                    thumb_up_count: data.thumb_up_count,
                    viewer_has_thumb_up: data.viewer_has_thumb_up,
                  }
                : m,
            ),
          };
          if (threadId) writeInviteThreadBundleCache(threadId, next);
          return next;
        });
      } catch (e) {
        if (previousMessage) {
          setBundle((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === messageId ? previousMessage! : m,
              ),
            };
          });
        }
        setReactionError(
          e instanceof Error ? e.message : "Couldn't update reaction.",
        );
      } finally {
        setReactingMessageId(null);
        suppressSilentThreadRefreshRef.current = false;
      }
    },
    [reactionsInteractive, threadId],
  );

  const safeHorizontalPad =
    "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]";

  if (!open) return null;

  const readOnlyExplanation = (): string[] => {
    if (!bundle || bundle.can_compose) return [];
    const bits: string[] = [];
    if (bundle.blocked_pair) bits.push("This chat is read-only (restricted).");
    if (bundle.thread.closed_at != null) bits.push("This thread was closed.");
    if (bundle.is_expired) bits.push("This thread has expired.");
    if (bundle.my_messages_remaining <= 0)
      bits.push("You've used all your messages in this chat.");
    if (bits.length === 0) bits.push("This chat is read-only.");
    return Array.from(new Set(bits));
  };

  const sheetParticipants = bundle?.participants ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[110] isolate overflow-hidden">
      <div
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_28%,transparent)] backdrop-blur-[28px] backdrop-saturate-[1.35] app-dark:bg-black/22 app-dark:backdrop-blur-[30px]"
        aria-hidden
      />

      <div
        ref={scrollLayerRef}
        className={`absolute inset-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${safeHorizontalPad}`}
        style={{ paddingTop: scrollPadTop, paddingBottom: scrollPadBottom }}
      >
        {!threadId ? (
          <div className="flex min-h-full flex-col justify-end pb-8">
            <p className="text-center text-sm text-[var(--text)]/50">
              No thread.
            </p>
          </div>
        ) : loading && !bundle ? (
          <div className="flex min-h-full flex-col justify-end pb-8">
            <p className="text-center text-sm text-[var(--text)]/60">
              Loading…
            </p>
          </div>
        ) : error && !bundle ? (
          <div className="flex min-h-full flex-col justify-end pb-8">
            <p className="text-center text-sm text-red-500/90">{error}</p>
          </div>
        ) : bundle ? (
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-end gap-5 pb-2">
            {bundle.is_expired ? <InviteThreadExpiredBanner /> : null}
            <InviteThreadScrollContext
              bundle={bundle}
              linkToPost={linkToPost}
              backgroundLocation={location}
              inviteNoteFooter={
                <p className="mt-1.5 text-[10px] leading-none text-[var(--text)]/48">
                  {participantCount === 1
                    ? "1 member"
                    : `${participantCount} members`}
                </p>
              }
            />

            <div>
              {reactionError ? (
                <p
                  className="mb-2 text-center text-xs text-red-500/95"
                  role="alert"
                >
                  {reactionError}
                </p>
              ) : null}
              <InviteThreadMessageList
                messages={bundle.messages}
                viewerUserId={viewerUserId}
                reactionsInteractive={reactionsInteractive}
                reactingMessageId={reactingMessageId}
                counterparty={null}
                onToggleReaction={(messageId) => {
                  void handleReactionToggle(messageId);
                }}
              />
            </div>

            <InviteThreadReadOnlyScrollHint bundle={bundle} />
          </div>
        ) : null}
      </div>

      {participantsOpen ? (
        <button
          type="button"
          aria-label="Close member list"
          className="absolute inset-0 z-[25] cursor-default bg-[color-mix(in_oklab,var(--bg)_18%,transparent)]"
          onClick={() => setParticipantsOpen(false)}
        />
      ) : null}

      <div
        className={`pointer-events-none absolute left-0 right-0 flex flex-col items-center ${safeHorizontalPad} ${
          participantsOpen ? "z-[40]" : "z-20"
        }`}
        style={{ top: "env(safe-area-inset-top, 0px)", paddingTop: "0.5rem" }}
      >
        <div className="pointer-events-auto mx-auto w-full max-w-lg">
          <InviteThreadTopHeader
            bundle={bundle}
            loading={loading && !bundle}
            segmentTotal={GROUP_QUOTA_UI_SEGMENT_TOTAL}
            segmentActive={
              bundle
                ? groupQuotaActiveSegmentsCount(
                    bundle,
                    GROUP_QUOTA_UI_SEGMENT_TOTAL,
                  )
                : 0
            }
            back={
              <button
                type="button"
                onClick={onClose}
                className={inviteThreadHeaderBackButtonClass}
                aria-label="Back"
              >
                <PiArrowLeft
                  className={inviteThreadHeaderBackArrowClass}
                  aria-hidden
                />
              </button>
            }
            right={
              <div className="flex h-[32px] shrink-0 items-center justify-end">
                <button
                  type="button"
                  disabled={!bundle}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!bundle) return;
                    setParticipantsOpen((prev) => !prev);
                  }}
                  className="relative flex min-h-[32px] min-w-[44px] cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent px-0.5 shadow-none backdrop-blur-none transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Group members"
                >
                  <div className="flex items-center justify-center -space-x-2.5">
                    {visibleParticipants.length === 0 ? (
                      <div className="h-8 w-8 rounded-full border border-neutral-900/16 bg-[color-mix(in_oklab,var(--surface-2)_32%,transparent)] app-dark:border-white/24" />
                    ) : (
                      visibleParticipants.map((p, idx) => (
                        <div
                          key={`${p.user_id ?? p.username ?? idx}`}
                          className="rounded-full ring-2 ring-[var(--bg)]"
                          title={participantLabel(p)}
                        >
                          <Avatar
                            variant="default"
                            url={p.avatar_url || undefined}
                            name={participantLabel(p)}
                            size={32}
                            tightLineBox
                            className="rounded-full"
                          />
                        </div>
                      ))
                    )}
                  </div>
                  {extraCount > 0 ? (
                    <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 flex h-4.5 min-w-4.5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1 text-[8px] font-semibold leading-none text-[var(--text)]/80 ring-2 ring-[var(--bg)]">
                      +{extraCount}
                    </div>
                  ) : null}
                </button>
              </div>
            }
          />
        </div>

        {participantsOpen && bundle ? (
          <div
            className="pointer-events-auto mt-1.5 w-full max-w-lg"
            role="dialog"
            aria-label="Group members"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full overflow-hidden rounded-2xl border-2 border-neutral-900/26 bg-[color-mix(in_oklab,var(--surface-2)_34%,transparent)] shadow-sm backdrop-blur-xl app-dark:border-white/34 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)]">
              {sheetParticipants.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-[var(--text)]/55">
                  No members listed.
                </p>
              ) : (
                <div
                  className={`space-y-2 overflow-y-auto overscroll-contain px-4 pb-4 pt-3.5 [-webkit-overflow-scrolling:touch] ${PARTICIPANTS_PANEL_SCROLL_MAX_CLASS}`}
                >
                  {sheetParticipants.map((p, idx) => {
                    const uname = (p.username ?? "").trim();
                    const canNavigate = uname.length > 0;
                    const rowKey = `${p.user_id ?? (uname || `p-${idx}`)}`;
                    const primary = participantPrimaryLine(p);
                    const secondary = participantSecondaryLine(p);

                    const rowInner = (
                      <>
                        <Avatar
                          variant="default"
                          url={p.avatar_url || undefined}
                          name={participantLabel(p)}
                          size={34}
                          tightLineBox
                          className="shrink-0 rounded-full"
                          userId={p.user_id ?? undefined}
                        />
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-medium leading-snug text-[var(--text)]">
                            {primary}
                          </p>
                          {secondary ? (
                            <p className="mt-0.5 truncate text-xs leading-none text-[var(--text)]/58">
                              {secondary}
                            </p>
                          ) : null}
                        </div>
                      </>
                    );

                    const rowShell =
                      "flex w-full min-w-0 items-center gap-2.5 rounded-full border-2 border-neutral-900/18 bg-[color-mix(in_oklab,var(--surface-2)_22%,transparent)] py-1.5 pl-1.5 pr-3 backdrop-blur-md transition-colors app-dark:border-white/22 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_14%,transparent)]";

                    if (canNavigate) {
                      return (
                        <button
                          key={rowKey}
                          type="button"
                          className={`${rowShell} cursor-pointer hover:bg-[color-mix(in_oklab,var(--surface-2)_42%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 app-dark:hover:bg-[color-mix(in_oklab,var(--surface-2)_22%,transparent)]`}
                          onClick={() => {
                            setParticipantsOpen(false);
                            navigate(`/u/${encodeURIComponent(uname)}`);
                          }}
                        >
                          {rowInner}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={rowKey}
                        className={`${rowShell} opacity-95`}
                        aria-disabled="true"
                      >
                        {rowInner}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {open && threadId && bundle ? (
        <div
          ref={bottomChromeOuterRef}
          className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 ${safeHorizontalPad}`}
          style={{
            paddingBottom: composerBottomGap,
          }}
        >
          <div
            ref={bottomChromeContentRef}
            className="flex w-full flex-col items-center gap-1.5 pb-1"
          >
          <div className="space-y-1.5">
            <InviteThreadReadOnlyComposerNotice
              bundle={bundle}
              readOnlyExplanation={readOnlyExplanation}
            />
            {submitError ? (
              <p
                className="pointer-events-auto max-w-lg text-center text-xs text-red-500/95"
                role="alert"
              >
                {submitError}
              </p>
            ) : null}
          </div>

          {bundle.can_compose ? (
            <>
              <div
                className="pointer-events-auto relative w-full max-w-lg py-0"
                role="toolbar"
                aria-label="Quick replies"
              >
                <div className="-mx-0.5 [mask-image:linear-gradient(90deg,transparent,black_14px,black_calc(100%-26px),transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,black_14px,black_calc(100%-26px),transparent)]">
                  <div className="flex gap-1.5 overflow-x-auto scroll-hide px-1 py-px [-webkit-overflow-scrolling:touch]">
                    {QUICK_REPLY_CHIPS.map((label) => (
                      <button
                        key={label}
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setDraft(label);
                          setSubmitError(null);
                        }}
                        className="shrink-0 rounded-full border border-neutral-900/8 bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)] px-2.5 py-px text-[11px] font-medium text-[var(--text)]/70 backdrop-blur-md transition-opacity hover:bg-[color-mix(in_oklab,var(--surface-2)_36%,transparent)] disabled:pointer-events-none disabled:opacity-45 app-dark:border-white/10 app-dark:bg-white/[0.04]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className={`pointer-events-auto flex w-full max-w-lg gap-2 border-2 border-neutral-900/17 bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] app-dark:border-white/28 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_18%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ${
                  composerInputShape === "pill"
                    ? "overflow-visible p-0"
                    : "p-1.5"
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
                  className={`flex shrink-0 items-center ${
                    composerInputShape === "multiline" ? "self-end" : ""
                  }`}
                  style={
                    composerInputShape === "pill"
                      ? {
                          height: COMPOSER_TRACK_HEIGHT_PX,
                          minHeight: COMPOSER_TRACK_HEIGHT_PX,
                        }
                      : undefined
                  }
                >
                  <InviteExpiryPill
                    windowStartAt={windowStartAt}
                    windowMs={windowMs}
                    variant="composer"
                    className={`shadow-sm ${
                      composerInputShape === "pill" ? "h-full min-h-0" : "!h-9"
                    }`}
                  />
                </div>

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
                      disabled={submitting}
                      placeholder="Message…"
                      aria-label="Message"
                      rows={1}
                      className={`box-border w-full resize-none border-0 bg-transparent text-[15px] text-[var(--text)] placeholder:text-[var(--text)]/38 focus:outline-none focus:ring-0 ${
                        composerInputShape === "pill"
                          ? `py-0 leading-none ${
                              nearCharLimit ? "pb-7 pr-11" : ""
                            }`
                          : `leading-[1.45] py-1.5 ${
                              nearCharLimit ? "pb-7 pr-11" : ""
                            }`
                      }`}
                      style={{
                        maxHeight: DRAFT_TEXTAREA_MAX_PX,
                        ...(composerInputShape === "pill"
                          ? {
                              height: COMPOSER_PILL_TEXT_LINE_HEIGHT_PX,
                              minHeight: COMPOSER_PILL_TEXT_LINE_HEIGHT_PX,
                              lineHeight: `${COMPOSER_PILL_TEXT_LINE_HEIGHT_PX}px`,
                            }
                          : {}),
                      }}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (submitError) setSubmitError(null);
                      }}
                      onFocus={onComposerFocus}
                      onBlur={onComposerBlur}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.shiftKey) return;
                        if (sendDisabled) return;
                        e.preventDefault();
                        void handleSend();
                      }}
                    />
                    {nearCharLimit ? (
                      <span
                        className={`pointer-events-none absolute bottom-2 right-3 tabular-nums text-[9px] ${
                          draftTooLong
                            ? "text-red-500/90"
                            : "text-[var(--text)]/28"
                        }`}
                        aria-live="polite"
                      >
                        {draft.length}/{bodyLimit}
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={sendDisabled}
                  onClick={() => void handleSend()}
                  aria-label={submitting ? "Sending…" : "Send message"}
                  className={`flex shrink-0 items-center justify-center rounded-full border text-base transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 disabled:pointer-events-none ${
                    composerInputShape === "pill" ? "" : "h-9 w-9"
                  } ${
                    composerInputShape === "multiline"
                      ? "self-end"
                      : "self-center"
                  } ${
                    sendDisabled && !submitting
                      ? "border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_34%,transparent)] text-neutral-700/88 shadow-sm app-dark:border-white/32 app-dark:bg-white/[0.1] app-dark:text-white/72 app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                      : "border-amber-500/42 bg-gradient-to-br from-amber-200/90 via-amber-100/82 to-yellow-50/74 text-amber-950/90 shadow-sm app-dark:border-amber-400/38 app-dark:from-amber-400/55 app-dark:via-amber-500/42 app-dark:to-amber-600/38 app-dark:text-amber-50/94"
                  } ${submitting ? "opacity-90" : ""}`}
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
                  {submitting ? (
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
            </>
          ) : null}
          </div>
        </div>
      ) : open && threadId && !bundle && !loading && !error ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-4"
          style={{
            paddingBottom: composerBottomGap,
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
