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
  readInviteThreadBundleCache,
  writeInviteThreadBundleCache,
  type InviteThreadBundle,
  type InviteThreadMessage,
} from "../../api/services/inviteThreads";
import { getViewerAuthUserId } from "../../api/services/follows";
import { postDetailPath, profileByUsername } from "../../router/Paths";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { supabase } from "../../lib/supabaseClient";
import InviteExpiryPill from "./InviteExpiryPill";
import ChooserPillAvatar from "../create/ChooserPillAvatar";
import InviteThreadMessageList from "./invite-thread/InviteThreadMessageList";
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
  inviteThreadHeaderSidePillBorderClass,
  inviteThreadHeaderSidePillSizeClass,
  PERSONAL_QUOTA_SEGMENT_TOTAL,
  personalQuotaActiveSegmentsCount,
} from "./invite-thread/InviteThreadOverlayLayout";
import { useInviteThreadKeyboardLayout } from "./invite-thread/useInviteThreadKeyboardLayout";

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

const QUICK_REPLY_CHIPS = [
  "I'm in",
  "Maybe",
  "What time?",
  "Send details",
  "Convince me",
] as const;

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

  const bundleRef = useRef<InviteThreadBundle | null>(null);
  const suppressSilentThreadRefreshRef = useRef(false);

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
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
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    if (!open) setComposerInputShape("pill");
  }, [open]);

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
    ],
  });

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
    if (!open) {
      setDraft("");
      setSubmitError(null);
      setSubmitting(false);
      setReactingMessageId(null);
      setReactionError(null);
      setComposerInputShape("pill");
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
            setError(
              rpcLikeMessage(rpcError ?? {}, "Could not load invite chat."),
            );
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
    draftTooLong || draft.length > Math.floor(bodyLimit * 0.75);

  const refreshBundleSilently = useCallback(async () => {
    if (!threadId || !open) return;
    if (suppressSilentThreadRefreshRef.current) return;
    try {
      const { data: refreshed, error: reloadErr } =
        await getInviteThreadForViewer(threadId, {
          allowCache: true,
          forceRefresh: true,
        });
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
    suppressSilentThreadRefreshRef.current = true;
    try {
      const { error: postErr } = await postInviteThreadMessage(threadId, body);
      if (postErr) {
        setSubmitError(rpcLikeMessage(postErr, "Could not send message."));
        return;
      }

      const { data: refreshed, error: reloadErr } =
        await getInviteThreadForViewer(threadId, {
          allowCache: true,
          forceRefresh: true,
        });
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
    submitting,
    sendDisabled,
    trimmedDraft,
    scrollToBottomAfterSend,
  ]);

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
        typeof document === "undefined" ||
        document.visibilityState === "visible";
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
      suppressSilentThreadRefreshRef.current = true;
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
          const next: InviteThreadBundle = {
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

  const linkToPost =
    bundle?.post_peek.post_id != null
      ? postDetailPath(
          bundle.post_peek.post_type === "hangout" ? "hangout" : "experience",
          bundle.post_peek.post_id,
        )
      : null;

  const counterpartyProfilePath = counterparty?.username?.trim().length
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
        ref={scrollLayerRef}
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
          <div className="flex min-h-full flex-col justify-end gap-5 pb-2">
            {bundle.is_expired ? <InviteThreadExpiredBanner /> : null}
            <InviteThreadScrollContext
              bundle={bundle}
              linkToPost={linkToPost}
              backgroundLocation={location}
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
                counterparty={counterparty}
                onToggleReaction={(messageId) => {
                  void handleReactionToggle(messageId);
                }}
              />
            </div>

            <InviteThreadReadOnlyScrollHint bundle={bundle} />
          </div>
        ) : null}
      </div>

      {/* Floating top: back + message status + counterparty avatar */}
      <div
        className={floatClusterClass}
        style={{
          top: "env(safe-area-inset-top, 0px)",
          paddingTop: "0.5rem",
        }}
      >
        <div className="pointer-events-auto mx-auto w-full max-w-lg">
          <InviteThreadTopHeader
            bundle={bundle}
            loading={loading && !bundle}
            segmentTotal={PERSONAL_QUOTA_SEGMENT_TOTAL}
            segmentActive={
              bundle ? personalQuotaActiveSegmentsCount(bundle) : 0
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
              counterpartyProfilePath ? (
                <Link
                  to={counterpartyProfilePath}
                  aria-label={`View ${
                    counterparty?.display_name?.trim() ||
                    counterparty?.username ||
                    "profile"
                  }`}
                  className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  <ChooserPillAvatar
                    url={counterparty?.avatar_url}
                    name={
                      counterparty?.display_name ||
                      counterparty?.username ||
                      undefined
                    }
                    className={inviteThreadHeaderSidePillSizeClass}
                    borderClassName={inviteThreadHeaderSidePillBorderClass}
                  />
                </Link>
              ) : (
                <ChooserPillAvatar
                  url={counterparty?.avatar_url}
                  name={
                    counterparty?.display_name ||
                    counterparty?.username ||
                    undefined
                  }
                  className={inviteThreadHeaderSidePillSizeClass}
                  borderClassName={inviteThreadHeaderSidePillBorderClass}
                />
              )
            }
          />
        </div>
      </div>

      {/* Floating bottom: quick reply + composer */}
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
    </div>
  );

  return createPortal(backdrop, document.body);
}
