/**
 * Place Duo overlay: compact create (note + date/time) + view/leave manage.
 * Keyboard: BottomDrawer + useCreateKeyboardInset via liftWithKeyboard (Android
 * docks above overlay IME; hook guards double-lift when WebView already resized).
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
  PiCalendarBlank,
  PiClock,
  PiStarFill,
  PiThumbsUp,
} from "react-icons/pi";
import { cancelOpenPlan, createOpenPlan } from "../../api/services/openPlans";
import FutureDateTimePanel, {
  type FutureDatePickerSurface,
  type FutureDateTimeSegment,
} from "../date/FutureDateTimePanel";
import type { CreateFlowStartTime } from "../../lib/createFlowStartTime";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import {
  isPlaceDuoCreateDraftDirty,
  resolvePlaceDuoCreateBackAction,
  resolvePlaceDuoCreateDismissRequest,
} from "../../lib/placeDuoCreateDraftGuard";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import {
  closeOpenPlanCancelConfirm,
  closeOpenPlanOverlay,
  closeOpenPlanOverlayTop,
  getOpenPlanActiveOverlayState,
  isOpenPlanActiveOverlayStackOpen,
  openOpenPlanCancelConfirm,
  subscribeOpenPlanActiveOverlay,
} from "../../lib/openPlanActiveOverlayStore";
import {
  getOpenPlanOwnOpportunity,
  subscribeOpenPlanOwnState,
} from "../../lib/openPlanOwnStore";
import {
  buildOpenPlanCreateSchedule,
  formatOpenPlanSchedule,
} from "../../lib/openPlanSchedule";
import { formatPlaceDuoScheduleSummary } from "../../lib/placeDuoRelativeDate";
import { showOpenPlanJoinToast } from "../../lib/showOpenPlanJoinToast";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS,
  useOverlayContentSwipeDismiss,
} from "../../hooks/useOverlayContentSwipeDismiss";
import BottomDrawer, {
  BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
} from "./BottomDrawer";
import ConfirmDialog from "./ConfirmDialog";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";

const OPEN_PLAN_NOTE_MAX = 200;

/** Shared Place Duo action height — identical for Cancel / Date & time / Save. */
const PLACE_DUO_ACTION_H = "h-9";

/** text-base + leading-relaxed ≈ 26px/line */
const NOTE_LINE_PX = 26;
const NOTE_MIN_LINES = 3;
const NOTE_MAX_LINES = 5;
const NOTE_MIN_H = NOTE_LINE_PX * NOTE_MIN_LINES;
const NOTE_MAX_H = NOTE_LINE_PX * NOTE_MAX_LINES;

/** Same exclusions as requester / Pair Up / Source Groups drawers. */
const OPEN_PLAN_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "button",
  '[role="button"]',
  "a[href]",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  "[data-no-overlay-swipe]",
].join(", ");

const OPEN_PLAN_CREATE_CONTENT_SWIPE_EXCLUDE_SELECTOR =
  OPEN_PLAN_CONTENT_SWIPE_EXCLUDE_SELECTOR;
const OPEN_PLAN_MANAGE_CONTENT_SWIPE_EXCLUDE_SELECTOR =
  OPEN_PLAN_CONTENT_SWIPE_EXCLUDE_SELECTOR;

const placeDuoActionBase = [
  "inline-flex min-w-0 flex-1 items-center justify-center",
  "box-border rounded-full border",
  PLACE_DUO_ACTION_H,
  "px-1.5 text-xs font-semibold leading-none tracking-tight",
  "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
].join(" ");

const placeDuoActionTrayClass = [
  "flex w-full items-center gap-1 overflow-visible rounded-full p-1.5",
  "max-[360px]:gap-0.5 max-[360px]:p-1",
  "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
  "backdrop-blur-md",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
].join(" ");

function PlaceDuoSaveLabel({ busy = false }: { busy?: boolean }) {
  if (busy) return <>…</>;
  return (
    <span className="inline-flex items-center justify-center gap-1">
      <span>{peopleUiCopy.openPlanCreateCta}</span>
      <PiThumbsUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </span>
  );
}

function focusTextareaWithoutScroll(el: HTMLTextAreaElement): void {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function blurActiveInput(): void {
  const el = document.activeElement;
  if (
    el instanceof HTMLElement &&
    (el.tagName === "TEXTAREA" || el.tagName === "INPUT")
  ) {
    el.blur();
  }
}

export default function OpenPlanActiveOverlay() {
  const overlay = useSyncExternalStore(
    subscribeOpenPlanActiveOverlay,
    getOpenPlanActiveOverlayState,
  );
  const opportunity = useSyncExternalStore(subscribeOpenPlanOwnState, () =>
    overlay.postId ? getOpenPlanOwnOpportunity(overlay.postId) : null,
  );

  const postId = overlay.postId;
  const mode = overlay.mode;
  const sheetOpen = Boolean(postId && mode);
  const createOpen = mode === "create";
  const manageOpen = mode === "manage";

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<CreateFlowStartTime | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [calendarResetToken, setCalendarResetToken] = useState(0);
  const [showDatePanel, setShowDatePanel] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [panelSegment, setPanelSegment] =
    useState<FutureDateTimeSegment>("date");
  const [dateSurface, setDateSurface] =
    useState<FutureDatePickerSurface>("calendar");
  const [datePulse, setDatePulse] = useState(false);
  const [placeholderPulse, setPlaceholderPulse] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const datePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreBackdropCloseUntilRef = useRef(0);
  const noteGestureCleanupRef = useRef<(() => void) | null>(null);
  /** Clean-swipe exit: keep hook `active` + stable resetToken until BD unmounts. */
  const [createSwipeExitHold, setCreateSwipeExitHold] = useState(false);
  const createSwipeExitGenerationRef = useRef(0);
  const createSwipeExitCloseTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const createSwipeExitLingerTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const createSwipeExitResetTokenRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    if (!createOpen || !postId) return;
    setSelectedDate(null);
    setSelectedTime(null);
    setNoteDraft("");
    setCreateBusy(false);
    setShowDatePanel(false);
    setDiscardConfirmOpen(false);
    setPanelSegment("date");
    setDateSurface("calendar");
    setDatePulse(false);
    setCalendarResetToken((n) => n + 1);

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
      if (openPanelTimerRef.current) {
        clearTimeout(openPanelTimerRef.current);
        openPanelTimerRef.current = null;
      }
      noteGestureCleanupRef.current?.();
      noteGestureCleanupRef.current = null;
    };
  }, [createOpen, postId]);

  useEffect(() => {
    if (!manageOpen) {
      setCancelBusy(false);
    }
  }, [manageOpen, postId]);

  useLayoutEffect(() => {
    if (!createOpen) return;
    syncTextareaHeight();
  }, [createOpen, noteDraft, syncTextareaHeight]);

  const stackOpen = isOpenPlanActiveOverlayStackOpen(overlay);

  const createDraftDirty = isPlaceDuoCreateDraftDirty({
    noteDraft,
    selectedDate,
    selectedTime,
  });

  const requestCreateClose = useCallback(() => {
    const plan = resolvePlaceDuoCreateDismissRequest({
      createOpen,
      discardConfirmOpen,
      dirty: createDraftDirty,
      busy: createBusy,
    });
    switch (plan.kind) {
      case "noop-busy":
      case "noop-confirm-open":
        return;
      case "open-discard-confirm":
        setDiscardConfirmOpen(true);
        return;
      case "close-overlay":
        setDiscardConfirmOpen(false);
        closeOpenPlanOverlay();
        return;
      default:
        return;
    }
  }, [createBusy, createDraftDirty, createOpen, discardConfirmOpen]);
  const requestCreateCloseRef = useRef(requestCreateClose);
  requestCreateCloseRef.current = requestCreateClose;

  const clearCreateSwipeExitTimers = useCallback(() => {
    if (createSwipeExitCloseTimerRef.current) {
      clearTimeout(createSwipeExitCloseTimerRef.current);
      createSwipeExitCloseTimerRef.current = null;
    }
    if (createSwipeExitLingerTimerRef.current) {
      clearTimeout(createSwipeExitLingerTimerRef.current);
      createSwipeExitLingerTimerRef.current = null;
    }
  }, []);

  const abortCreateSwipeExitHold = useCallback(() => {
    createSwipeExitGenerationRef.current += 1;
    clearCreateSwipeExitTimers();
    createSwipeExitResetTokenRef.current = null;
    setCreateSwipeExitHold(false);
  }, [clearCreateSwipeExitTimers]);

  // Reopen / remount create: drop any stale exit hold so transform starts clean.
  useEffect(() => {
    if (!createOpen) return;
    abortCreateSwipeExitHold();
  }, [createOpen, abortCreateSwipeExitHold]);

  useEffect(() => {
    return () => {
      createSwipeExitGenerationRef.current += 1;
      clearCreateSwipeExitTimers();
    };
  }, [clearCreateSwipeExitTimers]);

  const createSheetVisible = sheetOpen && createOpen;
  /**
   * Block create swipe while busy, discard confirm open, date panel open,
   * or a clean-swipe exit is already in progress.
   */
  const createSwipeBlocked =
    !createSheetVisible ||
    createBusy ||
    discardConfirmOpen ||
    showDatePanel ||
    createSwipeExitHold;

  const handleCreateSwipeCommit = useCallback(() => {
    // Same dismiss planner as backdrop / Cancel — never closeOpenPlanOverlay() directly.
    const plan = resolvePlaceDuoCreateDismissRequest({
      createOpen,
      discardConfirmOpen,
      dirty: createDraftDirty,
      busy: createBusy,
    });
    switch (plan.kind) {
      case "noop-busy":
      case "noop-confirm-open":
        return;
      case "open-discard-confirm":
        // Dirty: open confirm immediately; resetToken snaps drawer back under it.
        requestCreateCloseRef.current();
        return;
      case "close-overlay": {
        // Clean: keep hook active through exit translate + BD delayed unmount.
        if (createSwipeExitHold) return;
        const generation = createSwipeExitGenerationRef.current + 1;
        createSwipeExitGenerationRef.current = generation;
        createSwipeExitResetTokenRef.current = `${postId ?? "none"}:edit`;
        setCreateSwipeExitHold(true);
        clearCreateSwipeExitTimers();
        createSwipeExitCloseTimerRef.current = setTimeout(() => {
          createSwipeExitCloseTimerRef.current = null;
          if (createSwipeExitGenerationRef.current !== generation) return;
          requestCreateCloseRef.current();
          createSwipeExitLingerTimerRef.current = setTimeout(() => {
            createSwipeExitLingerTimerRef.current = null;
            if (createSwipeExitGenerationRef.current !== generation) return;
            createSwipeExitResetTokenRef.current = null;
            setCreateSwipeExitHold(false);
          }, BOTTOM_DRAWER_CLOSE_UNMOUNT_MS);
        }, OVERLAY_CONTENT_SWIPE_COMMIT_EXIT_MS);
        return;
      }
      default:
        return;
    }
  }, [
    clearCreateSwipeExitTimers,
    createBusy,
    createDraftDirty,
    createOpen,
    createSwipeExitHold,
    discardConfirmOpen,
    postId,
  ]);

  const createSwipeHookActive = createSheetVisible || createSwipeExitHold;
  const createSwipeResetToken = createSwipeExitHold
    ? createSwipeExitResetTokenRef.current
    : createSheetVisible
      ? `${postId ?? "none"}:${discardConfirmOpen ? "discard" : "edit"}`
      : null;

  const {
    panelSwipeProps: createPanelSwipeProps,
    contentSwipeMotionStyle: createContentSwipeMotionStyle,
  } = useOverlayContentSwipeDismiss({
    active: createSwipeHookActive,
    engageSwipe: createSheetVisible && !createSwipeBlocked,
    gestureDisabled: createSwipeBlocked,
    startZoneMaxXVw: 1,
    startZoneMaxPx: 10000,
    leftInsetPx: 0,
    excludeSelector: OPEN_PLAN_CREATE_CONTENT_SWIPE_EXCLUDE_SELECTOR,
    allowButtonTargets: false,
    commitThresholdPx: 48,
    horizontalLockPx: 12,
    onSwipeCommit: handleCreateSwipeCommit,
    // Flip when discard opens so exit translate snaps back under the confirm.
    // Frozen while clean-swipe exit hold is active so store clear does not reset.
    resetToken: createSwipeResetToken,
  });

  const createOverlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(createContentSwipeMotionStyle ?? {}),
  };

  const onCreateOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    createPanelSwipeProps.onPointerDownCapture(e);
  };

  const applyCreateBackPlan = useCallback(() => {
    if (manageOpen) {
      if (cancelBusy) return;
      closeOpenPlanOverlayTop();
      return;
    }
    if (!createOpen) {
      closeOpenPlanOverlayTop();
      return;
    }

    const keyboardEditableFocused = blurActiveEditableFirst();
    const plan = resolvePlaceDuoCreateBackAction({
      createOpen: true,
      discardConfirmOpen,
      dirty: createDraftDirty,
      keyboardEditableFocused,
      busy: createBusy,
    });

    switch (plan.kind) {
      case "noop-busy":
      case "blur-keyboard":
        return;
      case "dismiss-discard-confirm":
        setDiscardConfirmOpen(false);
        return;
      case "open-discard-confirm":
        setDiscardConfirmOpen(true);
        return;
      case "close-overlay":
        setDiscardConfirmOpen(false);
        closeOpenPlanOverlay();
        return;
      default:
        return;
    }
  }, [
    cancelBusy,
    createBusy,
    createDraftDirty,
    createOpen,
    discardConfirmOpen,
    manageOpen,
  ]);

  useEffect(() => {
    if (!stackOpen) return;
    return subscribeAndroidHardwareBack(() => {
      applyCreateBackPlan();
    });
  }, [stackOpen, applyCreateBackPlan]);

  const schedule = buildOpenPlanCreateSchedule(selectedDate, selectedTime);
  const isPastSchedule =
    schedule != null && schedule.occursAt.getTime() <= Date.now();

  const openSchedulePanel = useCallback(
    (segment: FutureDateTimeSegment = "date") => {
      blurActiveInput();
      if (openPanelTimerRef.current) clearTimeout(openPanelTimerRef.current);
      // Let keyboard/viewport settle before expanding the schedule panel.
      openPanelTimerRef.current = setTimeout(() => {
        setPanelSegment(segment);
        if (segment === "date") setDateSurface("calendar");
        setShowDatePanel(true);
        openPanelTimerRef.current = null;
      }, 160);
    },
    [],
  );

  const pulseDateTime = () => {
    setDatePulse(true);
    if (datePulseTimerRef.current) clearTimeout(datePulseTimerRef.current);
    datePulseTimerRef.current = setTimeout(() => {
      setDatePulse(false);
      datePulseTimerRef.current = null;
    }, 900);
    openSchedulePanel("date");
  };

  const handleCreate = async () => {
    if (!postId || createBusy) return;
    if (!selectedDate) {
      pulseDateTime();
      return;
    }
    if (!schedule || isPastSchedule) {
      pulseDateTime();
      return;
    }
    setCreateBusy(true);
    try {
      const opportunityCreated = await createOpenPlan({
        sourcePostId: postId,
        occursAt: schedule.occursAt.toISOString(),
        description: noteDraft.trim() || null,
        occursTimeExplicit: schedule.occursTimeExplicit,
      });
      closeOpenPlanOverlay();
      showOpenPlanJoinToast(postId, opportunityCreated.id);
    } catch {
      toast.error(peopleUiCopy.openPlanCreateError);
    } finally {
      setCreateBusy(false);
    }
  };

  /** Exit-dialog Save 👍 — same create path; close confirm first so date pulse can show. */
  const handleDiscardSave = () => {
    setDiscardConfirmOpen(false);
    void handleCreate();
  };

  const handleDiscardExit = () => {
    setDiscardConfirmOpen(false);
    closeOpenPlanOverlay();
  };

  const handleCancelConfirm = async () => {
    if (!opportunity?.id || cancelBusy) return;
    setCancelBusy(true);
    try {
      await cancelOpenPlan(opportunity.id);
      toast.success(peopleUiCopy.openPlanCancelSuccess);
      closeOpenPlanOverlay();
    } catch {
      toast.error(peopleUiCopy.openPlanCancelError);
    } finally {
      setCancelBusy(false);
    }
  };

  /**
   * Note tap while schedule is open: collapsing the panel immediately shortens
   * the bottom-anchored sheet, so the same gesture's click can retarget onto the
   * backdrop and close the drawer. Defer collapse until pointerup and briefly
   * suppress backdrop close.
   */
  const handleTextareaPointerDown = (
    e: ReactPointerEvent<HTMLTextAreaElement>,
  ) => {
    if (createBusy) return;
    e.stopPropagation();
    const el = e.currentTarget;

    if (showDatePanel) {
      e.preventDefault();
      noteGestureCleanupRef.current?.();
      ignoreBackdropCloseUntilRef.current = Date.now() + 450;

      const finish = () => {
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        noteGestureCleanupRef.current = null;
        setShowDatePanel(false);
        requestAnimationFrame(() => {
          focusTextareaWithoutScroll(el);
        });
      };

      noteGestureCleanupRef.current = () => {
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
      };
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", finish, true);
      return;
    }

    if (document.activeElement === el) return;
    e.preventDefault();
    focusTextareaWithoutScroll(el);
  };

  const showGuide = noteDraft.length === 0;
  const busy = createBusy;
  const dateTimeActive = showDatePanel;
  const needsDate = selectedDate == null;
  const composeSummary = selectedDate
    ? formatPlaceDuoScheduleSummary(selectedDate, selectedTime)
    : null;

  /**
   * Inverse face + hard left/bottom extrusion (Duo/Group tactile language).
   * Face presses into fixed backing; green backing while schedule is open.
   */
  const dateTimeExtrusionClass = dateTimeActive
    ? [
        "pointer-events-none absolute inset-0 z-0 rounded-full",
        "translate-x-[-2.5px] translate-y-[2.5px]",
        "bg-[var(--green-text)]",
        "app-dark:bg-[color-mix(in_oklab,var(--green-text)_88%,#0a0a0a)]",
      ].join(" ")
    : [
        "pointer-events-none absolute inset-0 z-0 rounded-full",
        "translate-x-[-2.5px] translate-y-[2.5px]",
        "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
        "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
      ].join(" ");

  const dateTimeFaceClass = [
    "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
    "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
    "bg-[var(--text)] text-[var(--bg)]",
    "px-1.5 text-xs font-semibold leading-none tracking-tight",
    "max-[360px]:px-1 max-[360px]:text-[11px] sm:px-2 sm:text-[13px]",
    "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
    "motion-safe:group-active/social:translate-x-[-2px] motion-safe:group-active/social:translate-y-[2px]",
    "motion-safe:group-active/social:duration-75",
  ].join(" ");

  const createPanel = (
    <div
      data-open-plan-create-swipe-panel
      className={`${glassPeoplePanelClass} mx-auto max-w-lg`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative flex flex-col gap-2 px-3 pb-3 pt-3 sm:px-4">
        {showDatePanel ? (
          <div className="flex w-full min-w-0 flex-col gap-2 py-1">
            <FutureDateTimePanel
              selectedDate={selectedDate}
              onSelectedDateChange={setSelectedDate}
              selectedTime={selectedTime}
              onSelectedTimeChange={setSelectedTime}
              active={createOpen && showDatePanel}
              calendarResetToken={calendarResetToken}
              segment={panelSegment}
              onSegmentChange={setPanelSegment}
              dateSurface={dateSurface}
              onDateSurfaceChange={setDateSurface}
              onDone={() => setShowDatePanel(false)}
            />
          </div>
        ) : null}

        <div className="relative">
          {showGuide ? (
            <div
              className={[
                "pointer-events-none absolute inset-x-0 top-0 z-[1]",
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
            id="open-plan-note-editor"
            value={noteDraft}
            maxLength={OPEN_PLAN_NOTE_MAX}
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
            {noteDraft.trim().length}/{OPEN_PLAN_NOTE_MAX}
          </p>
        </div>

        {composeSummary ? (
          <div
            className={[
              "inline-flex max-w-full min-h-[40px] w-fit items-center gap-1.5",
              "rounded-full",
              "border border-[color-mix(in_oklab,var(--border)_36%,transparent)]",
              "bg-[color-mix(in_oklab,var(--surface)_55%,var(--bg))]",
              "py-1 pl-1 pr-5",
              "shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
              "app-dark:border-[color-mix(in_oklab,white_10%,transparent)]",
              "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_42%,black)]",
              "app-dark:shadow-[0_1px_3px_rgba(0,0,0,0.28)]",
            ].join(" ")}
            aria-live="polite"
          >
            <span
              className={[
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                "border border-[color-mix(in_oklab,var(--brand)_48%,transparent)]",
                "bg-[color-mix(in_oklab,var(--brand)_82%,var(--bg))]",
                "text-[var(--brand-ink)]",
                "app-dark:bg-[color-mix(in_oklab,var(--brand)_88%,#1a1a1a)]",
                "app-dark:border-[color-mix(in_oklab,var(--brand)_58%,transparent)]",
              ].join(" ")}
              aria-hidden
            >
              {composeSummary.hasExplicitTime ? (
                <PiClock className="h-3.5 w-3.5" />
              ) : (
                <PiCalendarBlank className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 max-w-[min(100%,14.5rem)] leading-tight sm:max-w-[16.5rem]">
              <span className="block truncate text-xs font-semibold tracking-tight text-[var(--text)]">
                {composeSummary.primary}
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--text)]/68">
                {composeSummary.secondary}
              </span>
            </span>
          </div>
        ) : null}

        <div className={placeDuoActionTrayClass}>
          <button
            type="button"
            className={[
              placeDuoActionBase,
              "border-[var(--border)]/50",
              "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
              "text-[var(--text)]",
              "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
            ].join(" ")}
            disabled={busy || createSwipeExitHold}
            onClick={() => {
              if (createSwipeExitHold) return;
              requestCreateClose();
            }}
          >
            {peopleUiCopy.noteSheetCancel}
          </button>

          <button
            type="button"
            disabled={busy}
            aria-pressed={showDatePanel}
            aria-label={peopleUiCopy.openPlanDateTime}
            onClick={() => {
              if (showDatePanel) {
                setShowDatePanel(false);
                return;
              }
              openSchedulePanel("date");
            }}
            className={[
              "group/social relative min-w-0 flex-1 overflow-visible",
              PLACE_DUO_ACTION_H,
              datePulse
                ? "social-pill-attention-active social-pill-attention-press"
                : "",
            ].join(" ")}
          >
            <span className={dateTimeExtrusionClass} aria-hidden />
            <span
              data-social-ripple
              className="pointer-events-none absolute inset-0 z-[1] rounded-full bg-[color-mix(in_oklab,var(--bg)_16%,transparent)]"
              aria-hidden
            />
            <span data-social-face className={dateTimeFaceClass}>
              <span className="truncate">{peopleUiCopy.openPlanDateTime}</span>
            </span>
            {needsDate ? (
              <span
                className={[
                  "pointer-events-none absolute left-1/2 top-0 z-[3]",
                  "-translate-x-1/2 -translate-y-1/2",
                  "flex h-3.5 w-3.5 items-center justify-center",
                  "text-[color-mix(in_oklab,var(--brand)_92%,#f5c542)]",
                  "drop-shadow-[0_0_2px_color-mix(in_oklab,var(--brand)_45%,transparent)]",
                ].join(" ")}
                aria-hidden
              >
                <PiStarFill className="h-3 w-3" />
              </span>
            ) : null}
          </button>

          <button
            type="button"
            className={[
              placeDuoActionBase,
              "border-transparent",
              "bg-[var(--brand)] text-[var(--brand-ink)]",
              "shadow-[0_1px_0_rgba(0,0,0,0.06)]",
              "disabled:opacity-50",
            ].join(" ")}
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            <PlaceDuoSaveLabel busy={createBusy} />
          </button>
        </div>
      </div>
    </div>
  );

  const manageNote = opportunity?.description?.trim() || null;
  const manageSchedule = opportunity?.occurs_at
    ? formatOpenPlanSchedule(
        opportunity.occurs_at,
        opportunity.occurs_time_explicit !== false,
      )
    : null;

  const manageSheetVisible = sheetOpen && manageOpen;
  const cancelConfirmOpen = Boolean(overlay.cancelConfirmOpen && manageOpen);
  /** Manage swipe only — create drawer uses its own hook above. */
  const manageSwipeBlocked =
    !manageSheetVisible || cancelBusy || cancelConfirmOpen || showDatePanel;

  const handleManageSwipeCommit = useCallback(() => {
    // Same as manage BottomDrawer onClose / Cancel — close sheet, do not cancel plan.
    if (cancelBusy || overlay.cancelConfirmOpen) return;
    closeOpenPlanOverlay();
  }, [cancelBusy, overlay.cancelConfirmOpen]);

  const {
    panelSwipeProps: managePanelSwipeProps,
    contentSwipeMotionStyle: manageContentSwipeMotionStyle,
  } = useOverlayContentSwipeDismiss({
    active: manageSheetVisible,
    engageSwipe: manageSheetVisible && !manageSwipeBlocked,
    gestureDisabled: manageSwipeBlocked,
    startZoneMaxXVw: 1,
    startZoneMaxPx: 10000,
    leftInsetPx: 0,
    excludeSelector: OPEN_PLAN_MANAGE_CONTENT_SWIPE_EXCLUDE_SELECTOR,
    allowButtonTargets: false,
    commitThresholdPx: 48,
    horizontalLockPx: 12,
    onSwipeCommit: handleManageSwipeCommit,
    resetToken: manageSheetVisible ? postId : null,
  });

  const manageOverlaySwipeStyle: CSSProperties = {
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...(manageContentSwipeMotionStyle ?? {}),
  };

  const onManageOverlayPointerDownCapture = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    managePanelSwipeProps.onPointerDownCapture(e);
  };

  const managePanel = (
    <div
      data-open-plan-manage-swipe-panel
      className={`${glassPeoplePanelClass} mx-auto max-w-lg`}
    >
      {" "}
      <div className="relative flex flex-col gap-2 px-3 pb-3 pt-3 sm:px-4">
        {manageSchedule ? (
          <p className="px-1 text-sm font-medium text-[var(--text)]">
            {manageSchedule}
          </p>
        ) : null}
        {manageNote ? (
          <p className="whitespace-pre-wrap px-1 text-base leading-relaxed text-[var(--text)]/85">
            {manageNote}
          </p>
        ) : (
          <p className="px-1 text-base leading-relaxed text-[var(--text)]/42">
            {peopleUiCopy.noteSheetPlaceholderLine1}
          </p>
        )}

        <div className={placeDuoActionTrayClass}>
          <button
            type="button"
            className={[
              placeDuoActionBase,
              "border-red-500/20 bg-red-500/[0.07]",
              "text-red-700/85 dark:text-red-300/80",
            ].join(" ")}
            disabled={cancelBusy}
            onClick={() => openOpenPlanCancelConfirm()}
          >
            {cancelBusy ? "…" : peopleUiCopy.manageLeave}
          </button>
          <button
            type="button"
            className={[
              placeDuoActionBase,
              "border-[var(--border)]/50",
              "bg-[color-mix(in_oklab,var(--surface)_50%,transparent)]",
              "text-[var(--text)]",
              "app-dark:bg-[color-mix(in_oklab,white_8%,transparent)]",
            ].join(" ")}
            disabled={cancelBusy}
            onClick={() => closeOpenPlanOverlay()}
          >
            {peopleUiCopy.noteSheetCancel}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <BottomDrawer
        open={sheetOpen && createOpen}
        onClose={() => {
          if (Date.now() < ignoreBackdropCloseUntilRef.current) return;
          if (createSwipeExitHold) return;
          requestCreateClose();
        }}
        overlayStyle={createOverlaySwipeStyle}
        onOverlayPointerDownCapture={onCreateOverlayPointerDownCapture}
        shrinkSheetToContent
        bodyScrollable={false}
        liftWithKeyboard
        maxHeight="92vh"
        portalClassName="z-[130]"
        transparentSheet
        contentClassName="px-3 pt-1 sm:px-4"
        showCloseButton={false}
      >
        {createPanel}
      </BottomDrawer>

      <BottomDrawer
        open={sheetOpen && manageOpen}
        onClose={() => {
          if (!cancelBusy) closeOpenPlanOverlay();
        }}
        overlayStyle={manageOverlaySwipeStyle}
        onOverlayPointerDownCapture={onManageOverlayPointerDownCapture}
        shrinkSheetToContent
        bodyScrollable={false}
        liftWithKeyboard
        maxHeight="88vh"
        portalClassName="z-[130]"
        transparentSheet
        contentClassName="px-3 pt-1 sm:px-4"
        showCloseButton={false}
      >
        {managePanel}
      </BottomDrawer>

      <FrostedCenterModal
        open={discardConfirmOpen && createOpen}
        onBackdropClick={
          createBusy ? undefined : () => setDiscardConfirmOpen(false)
        }
        zTier="aboveDialog"
        aria-labelledby="place-duo-discard-title"
      >
        <div
          className={frostedModalPanelClassName}
          style={frostedModalPanelStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            id="place-duo-discard-title"
            className="mb-1 text-[15px] font-semibold text-[var(--text)]"
          >
            {peopleUiCopy.openPlanDiscardTitle}
          </div>
          <p className="mb-3 text-[13px] text-[var(--text)]/70">
            {peopleUiCopy.openPlanDiscardBody}
          </p>
          <div className="flex w-full min-w-0 items-center gap-1.5">
            <button
              type="button"
              disabled={createBusy}
              className={[
                "inline-flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center",
                "rounded-full border border-[var(--border)]",
                "bg-[var(--surface-2)] px-1.5 text-[13px] font-semibold leading-tight",
                "text-[var(--text)] transition",
                "hover:bg-[var(--surface)]/80 disabled:opacity-50",
              ].join(" ")}
              onClick={() => setDiscardConfirmOpen(false)}
            >
              {peopleUiCopy.openPlanDiscardKeep}
            </button>

            <button
              type="button"
              disabled={createBusy}
              className={[
                "inline-flex h-9 min-h-9 min-w-0 flex-1 items-center justify-center",
                "rounded-full border px-1.5 text-[13px] font-semibold leading-tight transition",
                "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]",
                "bg-[color-mix(in_oklab,var(--surface-2)_92%,transparent)]",
                "text-red-700/80 app-dark:text-red-300/75",
                "hover:bg-[color-mix(in_oklab,var(--danger)_10%,var(--surface-2))]",
                "disabled:opacity-50",
              ].join(" ")}
              onClick={handleDiscardExit}
            >
              {peopleUiCopy.openPlanDiscardExit}
            </button>

            <button
              type="button"
              disabled={createBusy}
              aria-label={peopleUiCopy.openPlanCreateCta}
              onClick={handleDiscardSave}
              className={[
                "group/social relative h-9 min-h-9 min-w-0 flex-1 overflow-visible",
                "disabled:opacity-50",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none absolute inset-0 z-0 rounded-full",
                  "translate-x-[-2.5px] translate-y-[2.5px]",
                  "bg-[color-mix(in_oklab,var(--brand)_72%,var(--bg))]",
                  "app-dark:bg-[color-mix(in_oklab,var(--brand)_78%,#1a1a1a)]",
                ].join(" ")}
                aria-hidden
              />
              <span
                className={[
                  "relative z-[1] inline-flex h-full w-full min-w-0 items-center justify-center",
                  "rounded-full border border-[color-mix(in_oklab,var(--bg)_22%,transparent)]",
                  "bg-[var(--brand)] text-[var(--brand-ink)]",
                  "px-1.5 text-[13px] font-semibold leading-tight",
                  "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
                  "motion-safe:group-active/social:translate-x-[-2px]",
                  "motion-safe:group-active/social:translate-y-[2px]",
                  "motion-safe:group-active/social:duration-75",
                ].join(" ")}
              >
                <span className="truncate">
                  <PlaceDuoSaveLabel busy={createBusy} />
                </span>
              </span>
            </button>
          </div>
        </div>
      </FrostedCenterModal>

      <ConfirmDialog
        open={Boolean(overlay.cancelConfirmOpen && manageOpen)}
        onClose={() => {
          if (!cancelBusy) closeOpenPlanCancelConfirm();
        }}
        title={peopleUiCopy.openPlanCancelTitle}
        message={peopleUiCopy.openPlanCancelBody}
        cancelLabel={peopleUiCopy.openPlanCancelKeep}
        confirmLabel={peopleUiCopy.openPlanCancelConfirm}
        confirmVariant="dangerSoft"
        higherZIndex
        isLoading={cancelBusy}
        onConfirm={() => void handleCancelConfirm()}
      />
    </>
  );
}
