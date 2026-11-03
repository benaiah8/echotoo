/**
 * Shared People Comment Composer — root overlay (Discover + Duo adapters).
 *
 * Dismiss: backdrop, Cancel/X, Android Back, and rightward content swipe
 * (PairUp / requester portal-root pattern via useOverlayContentSwipeDismiss).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import toast from "react-hot-toast";
import BottomDrawer, {
  BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
} from "../ui/BottomDrawer";
import {
  OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS,
  useOverlayContentSwipeDismiss,
} from "../../hooks/useOverlayContentSwipeDismiss";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { SOCIAL_OVERLAY_LAYER } from "../../lib/socialOverlayLayers";
import { PEOPLE_PERSONAL_NOTE_TEXT_CLASS } from "../../lib/people/peopleFeedLayout";
import PeopleComposerContextCard from "./PeopleComposerContextCard";
import { SHARE_NOTE_MAX } from "../../lib/shareToMessagesSend";
import {
  closePeopleCommentComposer,
  closePeopleCommentComposerTop,
  ensurePeopleCommentComposerClientMessageId,
  getPeopleCommentComposerState,
  isPeopleCommentComposerOpen,
  subscribePeopleCommentComposer,
  type PeopleCommentComposerContext,
} from "../../lib/people/peopleCommentComposerStore";
import {
  peopleCommentComposerPlaceholder,
  sendPeopleContextComment,
} from "../../lib/people/peopleCommentComposerSend";
import { createClientMessageId } from "../../api/services/messaging";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  recordDiscoverSentComment,
  shouldRecordDiscoverSentComment,
} from "../../lib/people/discoverSentComment";
import {
  noteConfirmedDuoComment,
  recoverDuplicateDuoComment,
  type DuoCommentIdentity,
} from "../../lib/people/duoCommentActions";
import {
  duoCommentStateKey,
  getDuoCommentSnapshot,
  getDuoCommentViewerId,
} from "../../lib/people/duoCommentState";

/** Sent-message surface — same note gray/brand edge, no nested popup card, no mt. */
const SENT_MESSAGE_SURFACE_CLASS = [
  "rounded-r-md border-l-2 px-3 py-2.5",
  "border-[color-mix(in_oklab,var(--brand-readable)_58%,transparent)]",
  "bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))]",
  "app-dark:border-[color-mix(in_oklab,var(--brand)_72%,transparent)]",
  "app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]",
].join(" ");

/** Same exclusions as PairUp / requester drawers. */
const COMMENT_COMPOSER_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-no-overlay-swipe]",
].join(", ");

const NOTE_LINE_PX = 26;
const NOTE_MIN_LINES = 3;
const NOTE_MAX_LINES = 5;
const NOTE_MIN_H = NOTE_LINE_PX * NOTE_MIN_LINES;
const NOTE_MAX_H = NOTE_LINE_PX * NOTE_MAX_LINES;
/** Reserve space so typed text does not overlap the in-field counter. */
const NOTE_COUNTER_PAD_BOTTOM_PX = 22;
const NOTE_COUNTER_PAD_RIGHT_PX = 52;

const ACTION_H = "min-h-11 h-11";
const actionBase = [
  "inline-flex min-w-0 flex-1 items-center justify-center",
  "box-border rounded-full border",
  ACTION_H,
  "px-2 text-[13px] font-semibold leading-none tracking-tight",
  "whitespace-nowrap truncate",
  "max-[360px]:px-1.5 sm:px-2.5 sm:text-sm",
].join(" ");

/** Group/Open Plan create — dark pill action tray inside the composition panel. */
const actionTrayClass = [
  "flex w-full items-center gap-1.5 overflow-visible rounded-full p-1.5",
  "max-[360px]:gap-1 max-[360px]:p-1",
  "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
  "backdrop-blur-md",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
].join(" ");

function focusTextareaWithoutScroll(el: HTMLTextAreaElement): void {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

export default function PeopleCommentComposerOverlay() {
  const snap = useSyncExternalStore(
    subscribePeopleCommentComposer,
    getPeopleCommentComposerState,
    getPeopleCommentComposerState
  );
  const open = isPeopleCommentComposerOpen(snap);
  const ctx = snap.context;

  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const sendStartedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Clean-swipe exit: keep hook `active` until BD unmounts. */
  const [swipeExitHold, setSwipeExitHold] = useState(false);
  const swipeExitGenerationRef = useRef(0);
  const swipeExitCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const swipeExitLingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const swipeExitResetTokenRef = useRef<string | null>(null);
  const lastCtxRef = useRef<PeopleCommentComposerContext | null>(null);
  if (ctx) lastCtxRef.current = ctx;

  useEffect(() => {
    if (!open) {
      setDraft("");
      setSendBusy(false);
      sendStartedRef.current = false;
      return;
    }
    setDraft("");
    setSendBusy(false);
    sendStartedRef.current = false;
  }, [open, ctx?.opportunityId]);

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const contentH = el.scrollHeight;
    const next = Math.min(NOTE_MAX_H, Math.max(NOTE_MIN_H, contentH));
    el.style.height = `${next}px`;
    el.style.overflowY = contentH > NOTE_MAX_H ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    if (!open || ctx?.presentation === "sent") return;
    syncTextareaHeight();
  }, [open, draft, ctx?.presentation, syncTextareaHeight]);

  const swipeBlocked = sendBusy || swipeExitHold;

  useEffect(() => {
    if (!open && !swipeExitHold) return;
    return subscribeAndroidHardwareBack(() => {
      if (sendBusy || swipeExitHold) return;
      if (blurActiveEditableFirst()) return;
      closePeopleCommentComposerTop();
    });
  }, [open, sendBusy, swipeExitHold]);

  const handleCancel = useCallback(() => {
    if (sendBusy || swipeExitHold) return;
    closePeopleCommentComposer();
  }, [sendBusy, swipeExitHold]);

  const clearSwipeExitTimers = useCallback(() => {
    if (swipeExitCloseTimerRef.current) {
      clearTimeout(swipeExitCloseTimerRef.current);
      swipeExitCloseTimerRef.current = null;
    }
    if (swipeExitLingerTimerRef.current) {
      clearTimeout(swipeExitLingerTimerRef.current);
      swipeExitLingerTimerRef.current = null;
    }
  }, []);

  const abortSwipeExitHold = useCallback(() => {
    swipeExitGenerationRef.current += 1;
    clearSwipeExitTimers();
    swipeExitResetTokenRef.current = null;
    setSwipeExitHold(false);
  }, [clearSwipeExitTimers]);

  // Reopen / remount: drop any stale exit hold so transform starts clean.
  useEffect(() => {
    if (!open) return;
    abortSwipeExitHold();
  }, [open, ctx?.opportunityId, abortSwipeExitHold]);

  useEffect(() => {
    return () => {
      swipeExitGenerationRef.current += 1;
      clearSwipeExitTimers();
    };
  }, [clearSwipeExitTimers]);

  const closeComposerRef = useRef(closePeopleCommentComposer);
  closeComposerRef.current = closePeopleCommentComposer;

  const handleSwipeCommit = useCallback(() => {
    if (sendBusy) return;
    if (swipeExitHold) return;
    // Keep portal exit transform alive through commit animation + BD delayed unmount.
    const generation = swipeExitGenerationRef.current + 1;
    swipeExitGenerationRef.current = generation;
    swipeExitResetTokenRef.current =
      ctx?.opportunityId ?? lastCtxRef.current?.opportunityId ?? "none";
    setSwipeExitHold(true);
    clearSwipeExitTimers();
    swipeExitCloseTimerRef.current = setTimeout(() => {
      swipeExitCloseTimerRef.current = null;
      if (swipeExitGenerationRef.current !== generation) return;
      closeComposerRef.current();
      swipeExitLingerTimerRef.current = setTimeout(() => {
        swipeExitLingerTimerRef.current = null;
        if (swipeExitGenerationRef.current !== generation) return;
        swipeExitResetTokenRef.current = null;
        setSwipeExitHold(false);
      }, BOTTOM_DRAWER_CLOSE_UNMOUNT_MS);
    }, OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
  }, [clearSwipeExitTimers, ctx?.opportunityId, sendBusy, swipeExitHold]);

  const swipeHookActive = open || swipeExitHold;
  const swipeResetToken = swipeExitHold
    ? swipeExitResetTokenRef.current
    : ctx?.opportunityId ?? null;

  const {
    panelSwipeProps,
    contentSwipeMotionStyle,
    isContentSwipeVisualActive,
  } = useOverlayContentSwipeDismiss({
    active: swipeHookActive,
    engageSwipe: open && !swipeBlocked,
    gestureDisabled: swipeBlocked,
    // Centered max-w-lg panel — full portal start zone (same as PairUp).
    startZoneMaxXVw: 1,
    startZoneMaxPx: 10000,
    leftInsetPx: 0,
    excludeSelector: COMMENT_COMPOSER_CONTENT_SWIPE_EXCLUDE_SELECTOR,
    allowButtonTargets: false,
    commitThresholdPx: 48,
    horizontalLockPx: 12,
    onSwipeCommit: handleSwipeCommit,
    resetToken: swipeResetToken,
  });

  // Selection preserved at rest; suppress only while swipe visual is active.
  const overlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    ...(isContentSwipeVisualActive
      ? { userSelect: "none", WebkitUserSelect: "none" }
      : {}),
    ...(contentSwipeMotionStyle ?? {}),
  };

  const onOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>
  ) => {
    panelSwipeProps.onPointerDownCapture(e);
  };

  const handleSend = async () => {
    if (!ctx || ctx.presentation === "sent" || sendBusy || sendStartedRef.current)
      return;
    const note = draft.trim();
    if (!note) return;

    sendStartedRef.current = true;
    setSendBusy(true);
    const clientMessageId = ensurePeopleCommentComposerClientMessageId(() =>
      createClientMessageId()
    );
    const sourcePostId = ctx.sourcePostId;
    const commentSurface = ctx.surface;
    const commentOpportunityId = ctx.opportunityId;
    const onDiscoverCommentJoined = ctx.onDiscoverCommentJoined;
    const sentIdentity = {
      opportunityId: ctx.opportunityId,
      sourcePostId: ctx.sourcePostId,
      recipientUserId: ctx.recipientUserId,
      displayName: ctx.displayName,
      identitySource: ctx.identitySource,
      caption: ctx.caption,
      scheduleLabel: ctx.scheduleLabel,
      scheduleLabelKind: ctx.scheduleLabelKind,
      sourceType: ctx.sourceType,
    };

    try {
      const result = await sendPeopleContextComment({
        recipientUserId: ctx.recipientUserId,
        sourcePostId,
        note,
        clientMessageId,
        recipientLabel: ctx.displayName,
      });

      if (!result.ok) {
        const alreadySent = result.userMessage
          .toLowerCase()
          .includes("already commented");
        if (alreadySent) {
          const outcome = await recoverDuplicateDuoComment({
            identity: { ...sentIdentity, surface: commentSurface },
            onJoined:
              commentSurface === "discover"
                ? () => onDiscoverCommentJoined?.(commentOpportunityId)
                : undefined,
          });
          if (outcome === "opened") {
            closePeopleCommentComposer();
            const viewer = getDuoCommentViewerId();
            const pool = viewer
              ? getDuoCommentSnapshot(
                  duoCommentStateKey(
                    viewer,
                    sourcePostId,
                    sentIdentity.recipientUserId
                  )
                ).viewerHasActivePairUp
              : null;
            if (pool === false) {
              toast.error(peopleUiCopy.commentComposerSentInterestFailed);
            }
          } else {
            toast.error(
              outcome === "unavailable"
                ? peopleUiCopy.commentComposerUnavailable
                : result.userMessage
            );
          }
        } else {
          toast.error(result.userMessage);
        }
        sendStartedRef.current = false;
        return;
      }

      if (
        shouldRecordDiscoverSentComment({
          surface: commentSurface,
          created: result.created,
          body: result.body,
        })
      ) {
        recordDiscoverSentComment({
          ...sentIdentity,
          body: result.body,
        });
      }

      const commentIdentity: DuoCommentIdentity = {
        ...sentIdentity,
        surface: commentSurface,
      };
      const onJoined =
        commentSurface === "discover"
          ? () => onDiscoverCommentJoined?.(commentOpportunityId)
          : undefined;

      closePeopleCommentComposer();
      toast.success(peopleUiCopy.commentComposerSent);

      if (result.created && result.body.trim()) {
        const pool = await noteConfirmedDuoComment({
          identity: commentIdentity,
          body: result.body,
          created: true,
          onJoined,
        });
        if (pool === "failed") {
          toast.error(peopleUiCopy.commentComposerSentInterestFailed);
        }
      } else if (!result.created) {
        const outcome = await recoverDuplicateDuoComment({
          identity: commentIdentity,
          onJoined,
        });
        if (outcome === "opened") {
          const viewer = getDuoCommentViewerId();
          const pool = viewer
            ? getDuoCommentSnapshot(
                duoCommentStateKey(
                  viewer,
                  sourcePostId,
                  sentIdentity.recipientUserId
                )
              ).viewerHasActivePairUp
            : null;
          if (pool === false) {
            toast.error(peopleUiCopy.commentComposerSentInterestFailed);
          }
        }
      }
    } catch {
      toast.error(peopleUiCopy.commentComposerSendError);
      sendStartedRef.current = false;
    } finally {
      setSendBusy(false);
    }
  };

  const handleTextareaPointerDown = (
    e: ReactPointerEvent<HTMLTextAreaElement>
  ) => {
    if (sendBusy) return;
    const el = e.currentTarget;
    if (document.activeElement === el) return;
    e.preventDefault();
    focusTextareaWithoutScroll(el);
  };

  /**
   * Live store context while open; after clear, keep last painted context so
   * BottomDrawer's 300ms unmount linger never falls into empty default Close chrome.
   */
  const displayCtx = ctx ?? lastCtxRef.current;
  // PairUp lifecycle: BD open follows store only. Exit-hold preserves offscreen
  // swipe transform — it must not keep the drawer artificially open.
  const closeDisabled = sendBusy || swipeExitHold;
  const captionText = displayCtx?.caption?.trim() || "";
  const dateText = displayCtx?.scheduleLabel?.trim() || "";
  const sentView = displayCtx?.presentation === "sent";
  const sentText = displayCtx?.sentBody?.trim() || "";
  const placeholder = peopleCommentComposerPlaceholder(
    displayCtx?.displayName ?? ""
  );
  const trimmedLen = draft.trim().length;
  const canSend = Boolean(displayCtx) && !sentView && trimmedLen > 0 && !sendBusy;

  const composeActionTray = (
    <div
      className={actionTrayClass}
      data-people-comment-composer-action-tray="true"
      data-no-overlay-swipe
    >
      <button
        type="button"
        className={[
          actionBase,
          "border-[var(--border)]/50",
          "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
          "text-[var(--text)]",
          "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
        ].join(" ")}
        disabled={closeDisabled}
        onClick={handleCancel}
      >
        <span className="truncate">{peopleUiCopy.commentComposerCancel}</span>
      </button>
      <button
        type="button"
        className={[
          actionBase,
          "border-transparent",
          "bg-[var(--brand)] text-[var(--brand-ink)]",
          "shadow-[0_2px_6px_rgba(0,0,0,0.14)]",
          "disabled:opacity-50",
        ].join(" ")}
        disabled={!canSend}
        aria-busy={sendBusy || undefined}
        onClick={() => void handleSend()}
      >
        <span className="truncate">
          {sendBusy
            ? peopleUiCopy.commentComposerSending
            : peopleUiCopy.commentComposerSend}
        </span>
      </button>
    </div>
  );

  const panelBody = displayCtx ? (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-2 pb-1 min-[320px]:w-full"
      data-people-comment-composer="true"
      data-people-comment-composer-surface={displayCtx.surface}
      data-people-comment-composer-mode={sentView ? "sent" : "compose"}
      data-people-comment-composer-swipe-panel="true"
    >
      {sentView ? (
        <div
          className={glassPeoplePanelClass}
          data-people-comment-composer-context="true"
          data-people-comment-composer-sent-panel="true"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PeopleComposerContextCard
            identitySource={displayCtx.identitySource}
            displayName={displayCtx.displayName}
            caption={captionText || null}
            scheduleLabel={dateText || null}
            scheduleLabelKind={displayCtx.scheduleLabelKind}
            onClose={handleCancel}
            closeDisabled={closeDisabled}
            embedded
          />
          <div
            role="separator"
            aria-hidden
            data-people-comment-composer-sent-divider="true"
            className="mx-3 border-t border-[var(--border)]/40 app-dark:border-white/14 sm:mx-4"
          />
          <div className="flex flex-col gap-3 px-3 pb-3 pt-3 sm:px-4">
            <p
              id="people-comment-composer-sent-body"
              data-people-comment-composer-sent-body="true"
              data-no-overlay-swipe
              className={[
                SENT_MESSAGE_SURFACE_CLASS,
                PEOPLE_PERSONAL_NOTE_TEXT_CLASS,
                "select-text text-[13.5px] font-medium leading-snug",
              ].join(" ")}
            >
              {sentText}
            </p>
          </div>
        </div>
      ) : (
        <>
          <PeopleComposerContextCard
            identitySource={displayCtx.identitySource}
            displayName={displayCtx.displayName}
            caption={captionText || null}
            scheduleLabel={dateText || null}
            scheduleLabelKind={displayCtx.scheduleLabelKind}
            onClose={handleCancel}
            closeDisabled={closeDisabled}
          />

          <div
            className={glassPeoplePanelClass}
            data-people-comment-composer-compose="true"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1.5 px-3 pb-3 pt-3 sm:px-4">
              <div
                className="relative w-full"
                data-people-comment-composer-textarea-wrap="true"
              >
                <textarea
                  ref={textareaRef}
                  id="people-comment-composer-body"
                  value={draft}
                  maxLength={SHARE_NOTE_MAX}
                  onChange={(e) => {
                    setDraft(e.target.value);
                  }}
                  onPointerDown={handleTextareaPointerDown}
                  placeholder={placeholder}
                  rows={NOTE_MIN_LINES}
                  disabled={sendBusy}
                  data-no-overlay-swipe
                  className={[
                    "w-full resize-none rounded-xl border border-[var(--border)]/45",
                    "bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
                    "px-3 py-2.5 text-base leading-relaxed text-[var(--text)]",
                    "outline-none ring-0 placeholder:text-[var(--text)]/42",
                    "focus:border-[var(--brand)]/45",
                    "overscroll-contain touch-pan-y",
                  ].join(" ")}
                  style={{
                    minHeight: NOTE_MIN_H,
                    maxHeight: NOTE_MAX_H,
                    paddingBottom: NOTE_COUNTER_PAD_BOTTOM_PX,
                    paddingRight: NOTE_COUNTER_PAD_RIGHT_PX,
                  }}
                  aria-label={placeholder}
                />
                <span
                  className={[
                    "pointer-events-none absolute bottom-2.5 right-3",
                    "text-[10px] tabular-nums leading-none",
                    "text-[var(--text)]/38",
                    "app-dark:text-[var(--text)]/42",
                  ].join(" ")}
                  data-people-comment-composer-char-count="true"
                  aria-hidden
                >
                  {trimmedLen}/{SHARE_NOTE_MAX}
                </span>
              </div>

              {composeActionTray}
            </div>
          </div>
        </>
      )}
    </div>
  ) : null;

  // Single BottomDrawer instance — never fall back to default showCloseButton.
  return (
    <BottomDrawer
      open={open}
      onClose={() => {
        if (swipeExitHold) return;
        if (!sendBusy) closePeopleCommentComposer();
      }}
      overlayStyle={overlaySwipeStyle}
      onOverlayPointerDownCapture={onOverlayPointerDownCapture}
      shrinkSheetToContent
      bodyScrollable
      liftWithKeyboard
      maxHeight="88vh"
      portalClassName={SOCIAL_OVERLAY_LAYER.browseOrNote}
      transparentSheet
      contentClassName="px-3 pt-1 sm:px-4"
      showCloseButton={false}
    >
      {panelBody}
    </BottomDrawer>
  );
}
