/**
 * Unified Duo editor: note canvas + Leave / Cancel / Save.
 * Active Duo tap and toast Add note open this same sheet.
 *
 * Keyboard: BottomDrawer + useCreateKeyboardInset. Opt into liftWithKeyboard so
 * Android docks above overlay IME (Capacitor resize is iOS-only).
 *
 * Dismiss: backdrop tap, Cancel, Android Back, and rightward content swipe
 * (same portal-root gesture as Group/Open Plan requester drawers).
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
import {
  leavePairUp,
  PAIR_UP_NOTE_MAX_LENGTH,
  updatePairUpNote,
} from "../../api/services/pairUp";
import {
  OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS,
  useOverlayContentSwipeDismiss,
} from "../../hooks/useOverlayContentSwipeDismiss";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import {
  closePairUpManage,
  closePairUpOverlayTop,
  getPairUpActiveOverlayState,
  isPairUpActiveOverlayStackOpen,
  subscribePairUpActiveOverlay,
} from "../../lib/pairUpActiveOverlayStore";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  getCachedPairUpDescription,
  setOptimisticPairUpJoinState,
  subscribePairUpJoinState,
} from "../../lib/pairUpJoinStore";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import BottomDrawer, {
  BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
} from "./BottomDrawer";

/** Shared Duo editor action height — identical for Leave / Cancel / Save (36px). */
const DUO_EDITOR_ACTION_H = "h-9";

/** text-base + leading-relaxed ≈ 26px/line */
const NOTE_LINE_PX = 26;
const NOTE_MIN_LINES = 3;
const NOTE_MAX_LINES = 5;
const NOTE_MIN_H = NOTE_LINE_PX * NOTE_MIN_LINES;
const NOTE_MAX_H = NOTE_LINE_PX * NOTE_MAX_LINES;

/** Same exclusions as requester drawers — form + chrome must not start a swipe. */
const PAIR_UP_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-no-overlay-swipe]",
].join(", ");

const duoEditorActionBase = [
  "inline-flex min-w-0 flex-1 items-center justify-center",
  "box-border rounded-full border",
  DUO_EDITOR_ACTION_H,
  "px-2 text-[11px] font-semibold leading-none tracking-tight",
  "max-[360px]:px-1.5 sm:px-2.5 sm:text-xs",
].join(" ");

const duoEditorActionTrayClass = [
  "flex w-full items-center gap-1.5 rounded-full p-1.5",
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

export default function PairUpActiveOverlay() {
  const overlay = useSyncExternalStore(
    subscribePairUpActiveOverlay,
    getPairUpActiveOverlayState
  );
  useSyncExternalStore(subscribePairUpJoinState, () =>
    overlay.postId ? getCachedPairUpDescription(overlay.postId) : null
  );

  const postId = overlay.postId;
  const editorOpen = Boolean(postId && overlay.editorOpen);

  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [placeholderPulse, setPlaceholderPulse] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (!editorOpen || !postId) {
      setPlaceholderPulse(false);
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
      return;
    }

    const cached = getCachedPairUpDescription(postId) ?? "";
    setNoteDraft(cached);
    setNoteBusy(false);
    setLeaveBusy(false);

    const empty = !cached.trim();
    if (!empty) {
      setPlaceholderPulse(false);
      return;
    }

    setPlaceholderPulse(true);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => {
      setPlaceholderPulse(false);
      pulseTimerRef.current = null;
    }, 720);

    return () => {
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
    };
  }, [editorOpen, postId]);

  useLayoutEffect(() => {
    if (!editorOpen) return;
    syncTextareaHeight();
  }, [editorOpen, noteDraft, syncTextareaHeight]);

  const stackOpen = isPairUpActiveOverlayStackOpen(overlay);
  const busy = noteBusy || leaveBusy;
  const swipeBlocked = busy || swipeExitHold;

  useEffect(() => {
    if (!stackOpen) return;
    return subscribeAndroidHardwareBack(() => {
      if (noteBusy || leaveBusy || swipeExitHold) return;
      // Keyboard open → blur first; keep editor (do not treat as dismiss).
      if (blurActiveEditableFirst()) return;
      closePairUpOverlayTop();
    });
  }, [stackOpen, noteBusy, leaveBusy, swipeExitHold]);

  const showGuide = noteDraft.length === 0;

  const handleCancel = () => {
    if (busy || swipeExitHold) return;
    closePairUpManage();
  };

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

  // Reopen / remount editor: drop any stale exit hold so transform starts clean.
  useEffect(() => {
    if (!editorOpen) return;
    abortSwipeExitHold();
  }, [editorOpen, abortSwipeExitHold]);

  useEffect(() => {
    return () => {
      swipeExitGenerationRef.current += 1;
      clearSwipeExitTimers();
    };
  }, [clearSwipeExitTimers]);

  const closePairUpManageRef = useRef(closePairUpManage);
  closePairUpManageRef.current = closePairUpManage;

  const handleSwipeCommit = useCallback(() => {
    // Same path as BottomDrawer onClose / Cancel — respect busy.
    if (busy) return;
    if (swipeExitHold) return;
    // Keep portal exit transform alive through commit animation + BD delayed unmount.
    const generation = swipeExitGenerationRef.current + 1;
    swipeExitGenerationRef.current = generation;
    swipeExitResetTokenRef.current = postId ?? "none";
    setSwipeExitHold(true);
    clearSwipeExitTimers();
    swipeExitCloseTimerRef.current = setTimeout(() => {
      swipeExitCloseTimerRef.current = null;
      if (swipeExitGenerationRef.current !== generation) return;
      closePairUpManageRef.current();
      swipeExitLingerTimerRef.current = setTimeout(() => {
        swipeExitLingerTimerRef.current = null;
        if (swipeExitGenerationRef.current !== generation) return;
        swipeExitResetTokenRef.current = null;
        setSwipeExitHold(false);
      }, BOTTOM_DRAWER_CLOSE_UNMOUNT_MS);
    }, OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
  }, [busy, clearSwipeExitTimers, postId, swipeExitHold]);

  const swipeHookActive = editorOpen || swipeExitHold;
  const swipeResetToken = swipeExitHold
    ? swipeExitResetTokenRef.current
    : postId;

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: swipeHookActive,
      engageSwipe: editorOpen && !swipeBlocked,
      gestureDisabled: swipeBlocked,
      // Centered max-w-lg panel — full portal start zone (same as requesters).
      startZoneMaxXVw: 1,
      startZoneMaxPx: 10000,
      leftInsetPx: 0,
      excludeSelector: PAIR_UP_CONTENT_SWIPE_EXCLUDE_SELECTOR,
      allowButtonTargets: false,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: handleSwipeCommit,
      // Frozen while exit hold is active so store clear does not reset transform.
      resetToken: swipeResetToken,
    });

  const overlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(contentSwipeMotionStyle ?? {}),
  };

  const onOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>
  ) => {
    panelSwipeProps.onPointerDownCapture(e);
  };

  const handleSave = async () => {
    if (!postId || busy) return;
    setNoteBusy(true);
    try {
      await updatePairUpNote(postId, noteDraft);
      closePairUpManage();
    } catch {
      toast.error(peopleUiCopy.noteSaveError);
    } finally {
      setNoteBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!postId || busy) return;
    setLeaveBusy(true);
    const revert = setOptimisticPairUpJoinState(postId, false);
    try {
      await leavePairUp(postId);
      closePairUpManage();
    } catch {
      revert?.();
      toast.error(peopleUiCopy.leaveError);
    } finally {
      setLeaveBusy(false);
    }
  };

  /** Prefer preventScroll focus so drawer keyboard lift is the only move. */
  const handleTextareaPointerDown = (
    e: ReactPointerEvent<HTMLTextAreaElement>
  ) => {
    if (busy) return;
    const el = e.currentTarget;
    if (document.activeElement === el) return;
    e.preventDefault();
    focusTextareaWithoutScroll(el);
  };

  return (
    <BottomDrawer
      open={editorOpen}
      onClose={() => {
        if (swipeExitHold) return;
        if (!busy) closePairUpManage();
      }}
      overlayStyle={overlaySwipeStyle}
      onOverlayPointerDownCapture={onOverlayPointerDownCapture}
      shrinkSheetToContent
      bodyScrollable={false}
      liftWithKeyboard
      maxHeight="88vh"
      portalClassName="z-[140]"
      transparentSheet
      contentClassName="px-3 pt-1 sm:px-4"
      showCloseButton={false}
    >
      <div
        data-pair-up-swipe-panel
        className={`${glassPeoplePanelClass} mx-auto max-w-lg`}
      >
        <div className="relative flex flex-col gap-2 px-3 pb-3 pt-3 sm:px-4">
          {showGuide ? (
            <div
              className={[
                "pointer-events-none absolute inset-x-3 top-3 z-[1] sm:inset-x-4",
                "px-1 py-1 text-base leading-relaxed text-[var(--text)]/42",
                placeholderPulse ? "duo-note-guide--pulse" : "",
              ].join(" ")}
              aria-hidden
            >
              <p className="m-0">{peopleUiCopy.noteSheetPlaceholderLine1}</p>
              <p className="m-0 mt-0.5">
                {peopleUiCopy.noteSheetPlaceholderLine2}
              </p>
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            id="pair-up-note-editor"
            value={noteDraft}
            maxLength={PAIR_UP_NOTE_MAX_LENGTH}
            onChange={(e) => setNoteDraft(e.target.value)}
            onPointerDown={handleTextareaPointerDown}
            placeholder=""
            rows={NOTE_MIN_LINES}
            disabled={busy}
            autoFocus={false}
            data-duo-note-canvas
            className={[
              "duo-note-canvas relative z-0 w-full resize-none border-0 bg-transparent",
              "px-1 py-1 text-base leading-relaxed text-[var(--text)]",
              "outline-none ring-0 focus:outline-none focus:ring-0",
              "overscroll-contain touch-pan-y",
            ].join(" ")}
            style={{
              minHeight: NOTE_MIN_H,
              maxHeight: NOTE_MAX_H,
              overflowY: "hidden",
            }}
            aria-label={peopleUiCopy.noteSheetPlaceholderLine1}
          />

          <p className="px-1 text-right text-[10px] tabular-nums text-[var(--text)]/35">
            {noteDraft.trim().length}/{PAIR_UP_NOTE_MAX_LENGTH}
          </p>

          <div className={duoEditorActionTrayClass}>
            <button
              type="button"
              className={[
                duoEditorActionBase,
                "border-red-500/20 bg-red-500/[0.07]",
                "text-red-700/85 dark:text-red-300/80",
              ].join(" ")}
              disabled={busy || swipeExitHold}
              onClick={() => void handleLeave()}
            >
              {leaveBusy ? "…" : peopleUiCopy.manageLeave}
            </button>
            <button
              type="button"
              className={[
                duoEditorActionBase,
                "border-[var(--border)]/50",
                "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
                "text-[var(--text)]",
                "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
              ].join(" ")}
              disabled={busy || swipeExitHold}
              onClick={handleCancel}
            >
              {peopleUiCopy.noteSheetCancel}
            </button>
            <button
              type="button"
              className={[
                duoEditorActionBase,
                "border-transparent",
                "bg-[var(--brand)] text-[var(--brand-ink)]",
                "shadow-[0_1px_0_rgba(0,0,0,0.06)]",
                "disabled:opacity-50",
              ].join(" ")}
              disabled={busy || swipeExitHold}
              onClick={() => void handleSave()}
            >
              {noteBusy ? "…" : peopleUiCopy.noteSheetSave}
            </button>
          </div>
        </div>
      </div>
    </BottomDrawer>
  );
}
