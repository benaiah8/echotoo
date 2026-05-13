/**
 * Full-screen personal invite thread (P2). DM-style shell; same RPC flow as PersonalInviteThreadDrawer.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useInviteOverlaySyntheticHistory } from "../../hooks/useInviteOverlaySyntheticHistory";
import {
  INVITE_OVERLAY_HISTORY,
  isPostDetailRoutePath,
} from "../../lib/inviteOverlayHistory";
import { PiArrowLeft, PiPaperPlaneRight } from "react-icons/pi";
import {
  getInviteThreadForViewer,
  postInviteThreadMessage,
  toggleInviteMessageReaction,
  type InviteThreadBundle,
  type InviteThreadMessage,
} from "../../api/services/inviteThreads";
import { getViewerAuthUserId } from "../../api/services/follows";
import { postDetailPath, profileByUsername } from "../../router/Paths";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";
import { isIOS } from "../../lib/storage/utils/capacitorDetection";
import { supabase } from "../../lib/supabaseClient";
import InviteExpiryPill from "./InviteExpiryPill";
import Avatar from "../ui/Avatar";
import InviteThreadMessageList from "./invite-thread/InviteThreadMessageList";

/** Space for floating top cluster (bar + quota); tuned with safe-area. */
const SCROLL_PAD_TOP_PX = 118;
/** Fallback scroll bottom inset before bottom chrome is measured. */
const SCROLL_PAD_BOTTOM_FALLBACK_PX = 148;

/** Max draft height — scroll bottom inset tracks composer via ResizeObserver. */
const DRAFT_TEXTAREA_MAX_PX = 220;

/** Outer + inner radius when draft is multiline (rounded rect, not stadium). */
const COMPOSER_MULTILINE_CORNER_PX = 21;

/**
 * Single-line composer only — equal inset on all four sides of the outer pill.
 * Inner controls (timer, draft shell, send) share COMPOSER_TRACK_HEIGHT_PX; only this padding + border
 * contribute to the outer height.
 */
const COMPOSER_PILL_INSET_PX = 6;

/**
 * Shared fixed height for the timer pill, message field shell, and send button (pill mode).
 * To make them taller without changing the bottom tab, raise this value: the outer shell stays
 * COMPOSER_PILL_OUTER_HEIGHT_PX tall and clips visually via overflow (controls may overlap the inset).
 */
const COMPOSER_TRACK_HEIGHT_PX = 34;

/** Textarea line box inside the bordered draft shell (shell has 1px top+bottom border). */
const COMPOSER_PILL_TEXT_LINE_HEIGHT_PX = COMPOSER_TRACK_HEIGHT_PX - 2;

/**
 * Total outer pill height (border-box): fixed — inner controls never expand this row.
 * To allow taller tracks without changing total tab height, only adjust COMPOSER_TRACK_HEIGHT_PX
 * (overlap). To grow the whole tab, raise this and usually match COMPOSER_TRACK_HEIGHT_PX +
 * 2 * COMPOSER_PILL_INSET_PX + 4.
 */
const COMPOSER_PILL_OUTER_HEIGHT_PX =
  COMPOSER_TRACK_HEIGHT_PX + 2 * COMPOSER_PILL_INSET_PX + 4;

/**
 * Top bar: ~65% tighter than gap-x-2 (8px → ~2.8px) for minimal space beside caption.
 * Symmetric grid cols keep caption visually centered between back + avatar.
 */
const TOP_BAR_GAP_CLASS = "gap-x-[3px]";

/** Quota strip stays narrower than the caption pill, centered under it. */
const QUOTA_STRIP_MAX_W_CLASS = "max-w-[12rem]";

const QUICK_REPLY_CHIPS = [
  "I'm in",
  "Maybe",
  "What time?",
  "Send details",
  "Convince me",
] as const;

const QUOTA_SEGMENTS = 5;

/** Active segment count when personal quota is within 5-slot UI: mirrors remaining exactly. Larger caps fall back to proportional rounding. */
function quotaActiveSegmentsCount(bundle: InviteThreadBundle): number {
  const cap = bundle.my_messages_used + bundle.my_messages_remaining;
  if (cap <= QUOTA_SEGMENTS) {
    return Math.min(QUOTA_SEGMENTS, Math.max(0, bundle.my_messages_remaining));
  }
  return Math.min(
    QUOTA_SEGMENTS,
    Math.max(
      0,
      Math.round((bundle.my_messages_remaining / cap) * QUOTA_SEGMENTS),
    ),
  );
}

function rpcLikeMessage(error: unknown, fallback: string): string {
  if (typeof (error as { message?: string })?.message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

export type InviteThreadCounterpartyPreview = {
  avatar_url: string | null;
  display_name: string | null;
  username: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  windowStartAt: string;
  windowMs?: number;
  counterparty: InviteThreadCounterpartyPreview | null;
};

export default function PersonalInviteThreadOverlay({
  open,
  onClose,
  threadId,
  windowStartAt,
  windowMs,
  counterparty,
}: Props) {
  const location = useLocation();
  const pathname = location.pathname;
  const engageInviteBack = open && !isPostDetailRoutePath(pathname);
  useInviteOverlaySyntheticHistory({
    engage: engageInviteBack,
    marker: INVITE_OVERLAY_HISTORY.personalChat,
    onDismiss: onClose,
  });
  const { keyboardInsetPx } = useCreateKeyboardInset();

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

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomChromeRef = useRef<HTMLDivElement>(null);
  const [bottomChromeHeightPx, setBottomChromeHeightPx] = useState(
    SCROLL_PAD_BOTTOM_FALLBACK_PX,
  );
  const [composerInputShape, setComposerInputShape] = useState<
    "pill" | "multiline"
  >("pill");

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

  useLayoutEffect(() => {
    if (!open || !bundle?.can_compose) return;
    syncDraftTextareaHeight();
  }, [open, bundle?.can_compose, draft, syncDraftTextareaHeight]);

  useEffect(() => {
    if (!open) {
      setComposerInputShape("pill");
      setBottomChromeHeightPx(SCROLL_PAD_BOTTOM_FALLBACK_PX);
      return;
    }

    const el = bottomChromeRef.current;
    if (!el) return;

    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setBottomChromeHeightPx(h);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("orientationchange", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [
    open,
    threadId,
    bundle?.can_compose,
    draft,
    keyboardInsetPx,
    submitError,
    loading,
  ]);

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

  useEffect(() => {
    if (!open || !threadId) {
      setBundle(null);
      setError(null);
      setLoading(false);
      setDraft("");
      setSubmitError(null);
      setSubmitting(false);
      setReactingMessageId(null);
      setReactionError(null);
      setComposerInputShape("pill");
      return;
    }

    setDraft("");
    setSubmitError(null);
    setSubmitting(false);
    setReactingMessageId(null);
    setReactionError(null);

    let cancelled = false;
    setLoading(true);
    setError(null);
    setBundle(null);

    (async () => {
      try {
        const uid = await getViewerAuthUserId();
        if (cancelled) return;
        setViewerUserId(uid);
        const { data, error: rpcError } = await getInviteThreadForViewer(
          threadId,
        );
        if (cancelled) return;
        if (rpcError) {
          setError(rpcLikeMessage(rpcError, "Could not load invite chat."));
          setLoading(false);
          return;
        }
        if (!data) {
          setError("Could not load invite chat.");
          setLoading(false);
          return;
        }
        setBundle(data);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load invite chat.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

  const bodyLimit =
    bundle != null && bundle.thread.max_body_length > 0
      ? bundle.thread.max_body_length
      : 400;

  const trimmedDraft = draft.trim();
  const draftTooLong = draft.length > bodyLimit;
  const sendDisabled =
    submitting ||
    !bundle?.can_compose ||
    trimmedDraft.length === 0 ||
    draftTooLong;

  const nearCharLimit =
    draftTooLong ||
    draft.length > Math.floor(bodyLimit * 0.75);

  const refreshBundleSilently = useCallback(async () => {
    if (!threadId || !open) return;
    try {
      const { data: refreshed, error: reloadErr } =
        await getInviteThreadForViewer(threadId);
      if (reloadErr || !refreshed) return;
      setBundle(refreshed);
    } catch {
      // Silent background refresh: ignore transient errors.
    }
  }, [open, threadId]);

  const handleSend = useCallback(async () => {
    if (!threadId || !bundle?.can_compose || submitting || sendDisabled) return;
    const body = trimmedDraft;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const { error: postErr } = await postInviteThreadMessage(threadId, body);
      if (postErr) {
        setSubmitError(rpcLikeMessage(postErr, "Could not send message."));
        return;
      }

      const { data: refreshed, error: reloadErr } =
        await getInviteThreadForViewer(threadId);
      if (reloadErr) {
        setDraft("");
        setSubmitError(
          rpcLikeMessage(
            reloadErr,
            "Message sent but could not refresh the chat.",
          ),
        );
        return;
      }
      if (!refreshed) {
        setDraft("");
        setSubmitError("Message sent but could not refresh the chat.");
        return;
      }

      setBundle(refreshed);
      setDraft("");
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Could not send message.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [threadId, bundle?.can_compose, submitting, sendDisabled, trimmedDraft]);

  useEffect(() => {
    if (!open || !threadId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refreshBundleSilently();
      }, 320);
    };

    const onVisibilityOrFocus = () => {
      const docVisible =
        typeof document === "undefined" || document.visibilityState === "visible";
      if (!docVisible) return;
      scheduleRefresh();
    };

    const realtimeChannel = supabase
      .channel(`invite-thread-overlay-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invite_threads",
          filter: `id=eq.${threadId}`,
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      void supabase.removeChannel(realtimeChannel);
    };
  }, [open, threadId, refreshBundleSilently]);

  const reactionsInteractive =
    bundle != null &&
    !bundle.is_expired &&
    !bundle.blocked_pair &&
    bundle.thread.closed_at == null;

  const handleReactionToggle = useCallback(
    async (messageId: string) => {
      if (!reactionsInteractive) return;
      setReactionError(null);
      setReactingMessageId(messageId);
      let previousMessage: InviteThreadMessage | null = null;
      setBundle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => {
            if (m.id !== messageId) return m;
            previousMessage = m;
            const nextViewerHasThumbUp = !(m.viewer_has_thumb_up === true);
            const currentCount =
              typeof m.thumb_up_count === "number" ? m.thumb_up_count : 0;
            const nextCount = nextViewerHasThumbUp
              ? currentCount + 1
              : Math.max(0, currentCount - 1);
            return {
              ...m,
              viewer_has_thumb_up: nextViewerHasThumbUp,
              thumb_up_count: nextCount,
            };
          }),
        };
      });
      try {
        const { data, error } = await toggleInviteMessageReaction(
          messageId,
          "thumb_up",
        );
        if (error || !data) {
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
            rpcLikeMessage(error ?? {}, "Couldn't update reaction."),
          );
          return;
        }

        const targetId = data.message_id;
        setBundle((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === targetId
                ? {
                    ...m,
                    thumb_up_count: data.thumb_up_count,
                    viewer_has_thumb_up: data.viewer_has_thumb_up,
                  }
                : m,
            ),
          };
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
      }
    },
    [reactionsInteractive],
  );

  const linkToPost =
    bundle?.post_peek.post_id != null
      ? postDetailPath(
          bundle.post_peek.post_type === "hangout" ? "hangout" : "experience",
          bundle.post_peek.post_id,
        )
      : null;

  const counterpartyProfilePath =
    counterparty?.username?.trim().length
      ? profileByUsername(counterparty.username.trim())
      : null;

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

  const keyboardInsetRoundedPx = Math.max(0, Math.round(keyboardInsetPx));
  const isIOSDevice = isIOS();
  const composerBottomGap = isIOSDevice
    ? keyboardInsetRoundedPx > 0
      ? `max(0.375rem, calc(${keyboardInsetRoundedPx}px - min(24px, var(--safe-area-bottom-layout)) + 0.875rem))`
      : "max(0.5rem, calc(var(--safe-area-bottom-layout) - 20px))"
    : keyboardInsetRoundedPx > 0
    ? `calc(${keyboardInsetRoundedPx}px + 0.375rem)`
    : "max(0.5rem, var(--safe-area-bottom-layout))";
  const scrollPadBottom =
    keyboardInsetRoundedPx > 0
      ? `max(0px, calc(${bottomChromeHeightPx}px - ${keyboardInsetRoundedPx}px))`
      : `${bottomChromeHeightPx}px`;
  const scrollPadTop = `calc(env(safe-area-inset-top, 0px) + ${SCROLL_PAD_TOP_PX}px)`;

  const safeHorizontalPad =
    "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]";

  const floatClusterClass = `pointer-events-none absolute left-0 right-0 z-20 flex flex-col items-center ${safeHorizontalPad}`;

  if (!open) return null;

  const backdrop = (
    <div className="fixed inset-0 z-[110] isolate overflow-hidden">
      {/* Frosted scrim: underlying route stays faintly visible, de-emphasized */}
      <div
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_28%,transparent)] backdrop-blur-[28px] backdrop-saturate-[1.35] app-dark:bg-black/22 app-dark:backdrop-blur-[30px]"
        aria-hidden
      />
      {/* Scroll layer (under floating chrome) */}
      <div
        className={`absolute inset-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${safeHorizontalPad}`}
        style={{
          paddingTop: scrollPadTop,
          paddingBottom: scrollPadBottom,
        }}
      >
        {!threadId ? (
          <div className="flex min-h-full flex-col justify-end pb-8">
            <p className="text-center text-sm text-[var(--text)]/50">
              No thread.
            </p>
          </div>
        ) : loading ? (
          <div className="flex min-h-full flex-col justify-end pb-8">
            <p className="text-center text-sm text-[var(--text)]/60">
              Loading…
            </p>
          </div>
        ) : error ? (
          <div className="flex min-h-full flex-col justify-end pb-8">
            <p className="text-center text-sm text-red-500/90">{error}</p>
          </div>
        ) : bundle ? (
          <div className="flex min-h-full flex-col justify-end gap-5 pb-2">
            {bundle.invite.invite_note != null &&
            String(bundle.invite.invite_note).trim().length > 0 ? (
              <div className="mx-auto w-full max-w-md rounded-2xl bg-[color-mix(in_oklab,var(--surface-2)_55%,transparent)] px-3 py-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/40">
                  Invite note
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug text-[var(--text)]/72">
                  {bundle.invite.invite_note}
                </p>
              </div>
            ) : null}

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
                counterparty={counterparty}
                onToggleReaction={(messageId) => {
                  void handleReactionToggle(messageId);
                }}
              />
            </div>

            {!bundle.can_compose && (
              <p className="text-center text-[11px] text-[var(--text)]/45">
                Messaging and reactions are read-only here for now.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Floating top: back + caption pill + counterparty avatar */}
      <div
        className={floatClusterClass}
        style={{
          top: "env(safe-area-inset-top, 0px)",
          paddingTop: "0.5rem",
        }}
      >
        <div
          className={`pointer-events-auto mx-auto grid w-full max-w-lg grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-start ${TOP_BAR_GAP_CLASS}`}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-900/16 bg-[color-mix(in_oklab,var(--surface-2)_36%,transparent)] text-[var(--text)]/88 shadow-sm backdrop-blur-xl transition-colors hover:bg-[color-mix(in_oklab,var(--surface-2)_52%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 app-dark:border-white/24 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
            aria-label="Back"
          >
            <PiArrowLeft className="h-5 w-5" aria-hidden />
          </button>

          <div className="flex min-w-0 justify-center">
            {!bundle ? (
              <div className="w-full min-w-0 rounded-full border-2 border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_36%,transparent)] px-3 py-1.5 text-center text-[10px] leading-snug text-[var(--text)]/45 shadow-sm backdrop-blur-xl app-dark:border-white/30 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)]">
                {loading ? "Loading…" : ""}
              </div>
            ) : (
              <Link
                to={linkToPost ?? "#"}
                state={
                  linkToPost ? { backgroundLocation: location } : undefined
                }
                onClick={(e) => {
                  if (!linkToPost) e.preventDefault();
                }}
                className={`block w-full min-w-0 rounded-full border-2 border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_36%,transparent)] px-3 py-1.5 text-center shadow-sm backdrop-blur-xl transition-colors app-dark:border-white/30 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] ${
                  linkToPost
                    ? "hover:bg-[color-mix(in_oklab,var(--surface-2)_50%,transparent)]"
                    : "pointer-events-none opacity-50"
                }`}
              >
                <p className="line-clamp-2 text-center text-[10px] leading-snug text-[var(--text)]/75">
                  {bundle.post_peek.post_caption?.trim() || "Untitled"}
                </p>
              </Link>
            )}
          </div>

          {counterpartyProfilePath ? (
            <Link
              to={counterpartyProfilePath}
              aria-label={`View ${counterparty?.display_name?.trim() || counterparty?.username || "profile"}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-900/16 bg-[color-mix(in_oklab,var(--surface-2)_32%,transparent)] shadow-sm backdrop-blur-xl transition-colors hover:bg-[color-mix(in_oklab,var(--surface-2)_44%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 app-dark:border-white/24 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] app-dark:hover:bg-[color-mix(in_oklab,var(--surface-2)_38%,transparent)]"
            >
              <Avatar
                variant="default"
                url={counterparty?.avatar_url || undefined}
                name={
                  counterparty?.display_name ||
                  counterparty?.username ||
                  undefined
                }
                size={40}
                tightLineBox
                className="rounded-full"
              />
            </Link>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-900/16 bg-[color-mix(in_oklab,var(--surface-2)_32%,transparent)] shadow-sm backdrop-blur-xl app-dark:border-white/24 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)] app-dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
              <Avatar
                variant="default"
                url={counterparty?.avatar_url || undefined}
                name={
                  counterparty?.display_name ||
                  counterparty?.username ||
                  undefined
                }
                size={40}
                tightLineBox
                className="rounded-full"
              />
            </div>
          )}
        </div>

        {bundle ? (
          <div
            className={`pointer-events-none mx-auto mt-2 grid w-full max-w-lg grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center ${TOP_BAR_GAP_CLASS}`}
            role="img"
            aria-label={`${bundle.my_messages_remaining} messages remaining in your quota`}
          >
            {/* In-flow spacers: keeps quota aligned with caption column only */}
            <div className="w-11 shrink-0" aria-hidden />
            <div className="flex min-w-0 justify-center">
              <div
                className={`flex min-h-[7px] w-full ${QUOTA_STRIP_MAX_W_CLASS} gap-1`}
              >
                {Array.from({ length: QUOTA_SEGMENTS }, (_, i) => {
                  const activeLeft = quotaActiveSegmentsCount(bundle);
                  /** Drain right → left: inactive segments on the right. */
                  const isInactive = i >= activeLeft;
                  return (
                    <div
                      key={i}
                      className={`h-1.5 min-h-1.5 min-w-[6px] flex-1 rounded-full transition-colors ${
                        isInactive
                          ? "bg-amber-900/[0.13] ring-1 ring-amber-900/[0.08] app-dark:bg-amber-100/[0.14] app-dark:ring-amber-100/[0.1]"
                          : "bg-gradient-to-r from-amber-300/95 to-amber-200/88 shadow-[0_0_0_1px_rgba(253,224,138,0.55)] app-dark:from-amber-400/82 app-dark:to-amber-400/62 app-dark:shadow-[0_0_0_1px_rgba(251,191,36,0.38)]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="w-11 shrink-0" aria-hidden />
          </div>
        ) : null}
        {bundle ? (
          <div
            className={`pointer-events-none mx-auto mt-1 grid w-full max-w-lg grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center ${TOP_BAR_GAP_CLASS}`}
          >
            <div className="w-11 shrink-0" aria-hidden />
            <p className="text-center text-[10px] leading-none text-[var(--text)]/44 app-dark:text-[var(--text)]/52">
              {bundle.my_messages_remaining === 1
                ? "1 message left"
                : `${bundle.my_messages_remaining} messages left`}
            </p>
            <div className="w-11 shrink-0" aria-hidden />
          </div>
        ) : null}
      </div>

      {/* Floating bottom: quick reply + composer */}
      {open && threadId && bundle ? (
        <div
          ref={bottomChromeRef}
          className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-1.5 pb-1 ${safeHorizontalPad}`}
          style={{
            paddingBottom: composerBottomGap,
          }}
        >
          <div className="space-y-1.5">
            {!bundle.can_compose ? (
              <p className="pointer-events-auto max-w-lg text-center text-[11px] text-[var(--text)]/60">
                {readOnlyExplanation().join(" ")}
              </p>
            ) : null}
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
      ) : open && threadId && !bundle && !loading && !error ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 px-4"
          style={{
            paddingBottom: composerBottomGap,
          }}
        />
      ) : null}
    </div>
  );

  return createPortal(backdrop, document.body);
}
