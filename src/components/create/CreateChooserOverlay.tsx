import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";
import { useOverlayEdgeSwipeDismiss } from "../../hooks/useOverlayEdgeSwipeDismiss";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import CreateChooserPanel from "./CreateChooserPanel";
import CreateDraftEntryDialog from "./CreateDraftEntryDialog";
import { useCreateDraftEntryGate } from "../../hooks/useCreateDraftEntryGate";

const EXIT_MS = 300;
const NAV_DELAY_MS = 280;
/** Backdrop: cancel tap-to-close if pointer moves farther than this (px) from down position. */
const BACKDROP_TAP_MAX_MOVE_PX = 10;

/** Wider than hook defaults (~48px) for easier swipe-close; capped below old invite 42vw/180px. */
const CREATE_CHOOSER_EDGE_SWIPE_MAX_WIDTH_VW = 0.32;
const CREATE_CHOOSER_EDGE_SWIPE_MAX_WIDTH_PX = 128;

/** Cards + CTA are `<button>` — allow panel swipe from card/label text, not form controls. */
const CREATE_CHOOSER_PANEL_SWIPE_EXCLUDE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [data-no-overlay-swipe], a[href]';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen dim + blur below bottom tab (z-40); z-[38] so tab bar stays tappable.
 * Body scroll locked while open. Enter/exit transitions; confirmed backdrop tap closes smoothly.
 */
export default function CreateChooserOverlay({ open, onClose }: Props) {
  const { onPickerContinue, draftEntryDialogProps } = useCreateDraftEntryGate({
    closeChooserOverlay: onClose,
    navDelayMs: NAV_DELAY_MS,
  });
  const draftDialogOpenRef = useRef(false);
  const onDismissDraftRef = useRef(draftEntryDialogProps.onDismiss);
  draftDialogOpenRef.current = draftEntryDialogProps.open;
  onDismissDraftRef.current = draftEntryDialogProps.onDismiss;

  const [visible, setVisible] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setVisible(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setAnimateIn(false);
    exitTimerRef.current = setTimeout(() => {
      setVisible(false);
      exitTimerRef.current = null;
    }, EXIT_MS);
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  const swipeActive = visible;
  const swipeEngaged = open && animateIn;
  const swipeDisabled = draftEntryDialogProps.open;

  // Edge strip: single owner of overlay transform + exit animation.
  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      active: swipeActive,
      engageSwipe: swipeEngaged,
      gestureDisabled: swipeDisabled,
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      edgeMaxWidthVw: CREATE_CHOOSER_EDGE_SWIPE_MAX_WIDTH_VW,
      edgeMaxWidthPx: CREATE_CHOOSER_EDGE_SWIPE_MAX_WIDTH_PX,
      edgeStripZClass: "z-[5]",
      onDismiss: onClose,
    });

  const {
    panelSwipeProps,
    contentSwipeMotionStyle,
  } = useOverlayContentSwipeDismiss({
    active: swipeActive,
    engageSwipe: swipeEngaged,
    gestureDisabled: swipeDisabled,
    startZoneMaxXVw: 0.45,
    startZoneMaxPx: 180,
    leftInsetPx: isNativeApp() ? 8 : 12,
    excludeSelector: CREATE_CHOOSER_PANEL_SWIPE_EXCLUDE_SELECTOR,
    allowButtonTargets: true,
    commitThresholdPx: 48,
    horizontalLockPx: 12,
    onSwipeCommit: playAnimatedDismiss,
  });

  useEffect(() => {
    if (!visible || !animateIn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (draftDialogOpenRef.current) {
        onDismissDraftRef.current();
        return;
      }
      playAnimatedDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, animateIn, playAnimatedDismiss]);

  useEffect(() => {
    if (!open) return;
    return subscribeAndroidHardwareBack(() => {
      if (draftDialogOpenRef.current) {
        onDismissDraftRef.current();
        return;
      }
      playAnimatedDismiss();
    });
  }, [open, playAnimatedDismiss]);

  const backdropTapRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    cancelled: boolean;
  }>({ pointerId: null, startX: 0, startY: 0, cancelled: false });

  const releaseBackdropPointerCapture = (
    el: HTMLDivElement,
    pointerId: number,
  ) => {
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      /* already released */
    }
  };

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const el = e.currentTarget;
    backdropTapRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      cancelled: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      backdropTapRef.current = {
        pointerId: null,
        startX: 0,
        startY: 0,
        cancelled: false,
      };
    }
  };

  const handleBackdropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = backdropTapRef.current;
    if (s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (Math.hypot(dx, dy) > BACKDROP_TAP_MAX_MOVE_PX) {
      s.cancelled = true;
    }
  };

  const handleBackdropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    releaseBackdropPointerCapture(el, e.pointerId);

    const s = backdropTapRef.current;
    if (s.pointerId !== e.pointerId) return;

    const cancelled = s.cancelled;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const movedTooMuch = Math.hypot(dx, dy) > BACKDROP_TAP_MAX_MOVE_PX;

    backdropTapRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      cancelled: false,
    };

    if (cancelled || movedTooMuch) return;

    if (draftDialogOpenRef.current) {
      onDismissDraftRef.current();
      return;
    }
    playAnimatedDismiss();
  };

  const handleBackdropPointerCancel = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    const el = e.currentTarget;
    releaseBackdropPointerCapture(el, e.pointerId);

    const s = backdropTapRef.current;
    if (s.pointerId !== e.pointerId) return;

    backdropTapRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      cancelled: false,
    };
  };

  const handleContinue = (type: "hangout" | "experience") => {
    onPickerContinue(type);
  };

  if (!visible) return null;

  const transition =
    "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]";
  const show = animateIn;

  const effectiveOverlayMotionStyle = contentSwipeMotionStyle
    ? { ...overlayMotionStyle, ...contentSwipeMotionStyle }
    : overlayMotionStyle;

  return createPortal(
    <div
      className="fixed inset-0 z-[38] flex flex-col justify-end pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Choose what to create"
      style={effectiveOverlayMotionStyle}
    >
      <div
        className={[
          "absolute inset-0 pointer-events-auto touch-manipulation",
          transition,
          show ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.58)",
          backdropFilter: "blur(22px) saturate(1.15)",
          WebkitBackdropFilter: "blur(22px) saturate(1.15)",
        }}
        onPointerDown={handleBackdropPointerDown}
        onPointerMove={handleBackdropPointerMove}
        onPointerUp={handleBackdropPointerUp}
        onPointerCancel={handleBackdropPointerCancel}
        aria-hidden
      />
      <div
        {...panelSwipeProps}
        className={[
          "relative z-10 w-full max-w-[min(440px,calc(100vw-24px))] mx-auto px-3 pointer-events-auto",
          transition,
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        ].join(" ")}
        style={{
          paddingBottom: "calc(70px + var(--safe-area-bottom-layout, 0px))",
          touchAction: "pan-y",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CreateChooserPanel variant="overlay" onContinue={handleContinue} />
      </div>
      <CreateDraftEntryDialog {...draftEntryDialogProps} />
      <div {...edgeStripProps} />
    </div>,
    document.body
  );
}
