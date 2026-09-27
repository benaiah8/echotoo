/**
 * Full-height Activities sheet — edge-to-edge root; Home gutter on inner content only.
 * M3D.1b: Post Details–style dismiss lifecycle — animate out, then onClose / unmount.
 * M3D.2: Nested pull-to-refresh on activity list scroll root.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PiArrowLeft } from "react-icons/pi";
import toast from "react-hot-toast";
import NotificationList, {
  type NotificationListHandle,
} from "../notifications/NotificationList";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { useOverlayEdgeSwipeDismiss } from "../../hooks/useOverlayEdgeSwipeDismiss";
import { useOverlayContentSwipeDismiss } from "../../hooks/useOverlayContentSwipeDismiss";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { useHomePullToRefresh } from "../../hooks/useHomePullToRefresh";
import { getLatestEligibleActivityCreatedAt } from "../../api/services/notifications";
import { getViewerAuthUserId } from "../../api/services/follows";
import {
  getLastActivitiesVisitedAt,
  setLastActivitiesVisitedAt,
} from "../../lib/messagesActivitiesVisitPrefs";
import { acknowledgeActivitiesAttention } from "../../lib/messagesActivitiesAttentionStore";
import { isNativeApp } from "../../lib/storage/utils/capacitorDetection";

type Props = {
  open: boolean;
  onClose: () => void;
};

const backCircleClass = [
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
  "border border-[var(--create-border-top-circle,rgba(0,0,0,0.2))]",
  "bg-neutral-950 text-white",
  "shadow-[0_2px_10px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.14)]",
  "transition hover:brightness-110 active:scale-[0.96]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40",
  "app-dark:bg-white app-dark:text-neutral-950",
  "app-dark:shadow-[0_4px_16px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]",
  "app-dark:hover:brightness-95",
].join(" ");

const ACTIVITIES_CONTENT_SWIPE_EXCLUDE_SELECTOR = [
  "[data-no-overlay-swipe]",
  // Do NOT exclude a[href]: activityCalm rows are Links — excluding them kills content swipe.
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  // Explicit in-row action controls (e.g. Open / Profile), not the row Link itself.
  "button",
  '[role="button"]',
].join(",");

async function bumpActivitiesVisitWatermark(): Promise<void> {
  const uid = await getViewerAuthUserId();
  if (!uid) return;
  let latestMs: number | null = null;
  try {
    latestMs = await getLatestEligibleActivityCreatedAt();
  } catch {
    /* keep partial watermark from Date.now() */
  }
  const prev = getLastActivitiesVisitedAt(uid) ?? 0;
  setLastActivitiesVisitedAt(
    uid,
    Math.max(Date.now(), latestMs ?? 0, prev)
  );
}

export default function ActivitiesOverlay({ open, onClose }: Props) {
  const listRef = useRef<NotificationListHandle>(null);
  const [unreadInView, setUnreadInView] = useState(0);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [activitiesRefreshEpoch, setActivitiesRefreshEpoch] = useState(0);
  const activitiesPtrInFlightRef = useRef(false);
  /**
   * Mounted/visible sheet lifetime (including exit animation). Kept true until
   * playAnimatedDismiss finishes so edge hooks do not zero translateX early.
   */
  const [presented, setPresented] = useState(open);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const playAnimatedDismissRef = useRef<() => void>(() => {});

  const attachScrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollEl(node);
  }, []);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setPresented(true);
      return;
    }
    // Parent forced closed without our pipeline — drop immediately.
    if (!closingRef.current) {
      setPresented(false);
    }
  }, [open]);

  // Lock while the sheet is visually present (through exit), not merely while `open`.
  useOverlayBackgroundScrollLock(presented);

  const finishDismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const runClose = () => {
      onCloseRef.current();
      setPresented(false);
    };
    // Match PostDetailModal: let the last exit frame paint on native WebViews.
    if (isNativeApp()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(runClose);
      });
    } else {
      runClose();
    }
  }, []);

  const sheetActive = presented;
  const swipeEngaged = presented && open && !closingRef.current;

  const { overlayMotionStyle, edgeStripProps, playAnimatedDismiss } =
    useOverlayEdgeSwipeDismiss({
      // Keep active for full presented lifetime (Post Details pattern).
      active: sheetActive,
      engageSwipe: swipeEngaged,
      gestureDisabled: closingRef.current,
      edgeStripLeftInsetPx: isNativeApp() ? 8 : 12,
      edgeStripZClass: "z-[28]",
      onDismiss: finishDismiss,
    });

  const { panelSwipeProps, contentSwipeMotionStyle } =
    useOverlayContentSwipeDismiss({
      active: sheetActive,
      engageSwipe: swipeEngaged,
      gestureDisabled: closingRef.current,
      startZoneMaxXVw: 0.45,
      startZoneMaxPx: 180,
      leftInsetPx: isNativeApp() ? 8 : 12,
      excludeSelector: ACTIVITIES_CONTENT_SWIPE_EXCLUDE_SELECTOR,
      commitThresholdPx: 48,
      horizontalLockPx: 12,
      onSwipeCommit: playAnimatedDismiss,
    });

  const effectiveOverlayMotionStyle = contentSwipeMotionStyle
    ? { ...overlayMotionStyle, ...contentSwipeMotionStyle }
    : overlayMotionStyle;

  const runActivitiesPullRefresh = useCallback(async () => {
    if (activitiesPtrInFlightRef.current) {
      setActivitiesRefreshEpoch((n) => n + 1);
      return;
    }
    activitiesPtrInFlightRef.current = true;
    try {
      await listRef.current?.refresh();
      await bumpActivitiesVisitWatermark();
      acknowledgeActivitiesAttention();
    } catch {
      toast.error("Couldn't refresh. Try again.");
    } finally {
      activitiesPtrInFlightRef.current = false;
      setActivitiesRefreshEpoch((n) => n + 1);
    }
  }, []);

  const activitiesPtrEnabled = presented && open;

  const {
    pullPx: activitiesPullPx,
    pullProgress: activitiesPullProgress,
    isRefreshing: activitiesPtrRefreshing,
  } = useHomePullToRefresh({
    enabled: activitiesPtrEnabled && scrollEl != null,
    onCommit: () => {
      void runActivitiesPullRefresh();
    },
    refreshEpoch: activitiesRefreshEpoch,
    getScrollTop: () => scrollEl?.scrollTop ?? 0,
    touchTarget: scrollEl,
  });

  useEffect(() => {
    playAnimatedDismissRef.current = playAnimatedDismiss;
  }, [playAnimatedDismiss]);

  useEffect(() => {
    if (!presented) {
      setUnreadInView(0);
      return;
    }
    syncAppSafeAreaBottom();
  }, [presented]);

  const requestDismiss = useCallback(() => {
    if (closingRef.current || !presented) return;
    playAnimatedDismissRef.current();
  }, [presented]);

  useEffect(() => {
    if (!open || !presented) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      requestDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, presented, requestDismiss]);

  useEffect(() => {
    if (!open || !presented) return;
    return subscribeAndroidHardwareBack(() => {
      requestDismiss();
    });
  }, [open, presented, requestDismiss]);

  const handleClearUnread = useCallback(() => {
    void listRef.current?.clearUnread();
  }, []);

  if (typeof document === "undefined") return null;
  if (!presented) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-[var(--bg)] pointer-events-auto"
      style={effectiveOverlayMotionStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Activities"
    >
      {activitiesPtrEnabled &&
      (activitiesPullPx > 2 || activitiesPtrRefreshing) ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(activitiesPullProgress * 100)}
          aria-label={
            activitiesPtrRefreshing
              ? "Refreshing activities"
              : "Pull to refresh"
          }
          className="pointer-events-none absolute left-0 right-0 z-[5] flex justify-center"
          style={{
            top: "calc(var(--safe-area-top-layout, env(safe-area-inset-top, 0px)) + 3.25rem)",
            opacity: activitiesPtrRefreshing
              ? 1
              : Math.min(1, 0.12 + activitiesPullProgress * 0.88),
            transition: activitiesPtrRefreshing
              ? undefined
              : "opacity 80ms ease-out",
          }}
        >
          <span
            className={`inline-block h-7 w-7 rounded-full border-2 border-[#F7D047]/30 border-t-[#F7D047] ${
              activitiesPtrRefreshing ? "animate-spin" : ""
            }`}
            aria-hidden
          />
        </div>
      ) : null}
      {/* Single inner column: Home gutter only — not on root */}
      <div
        className="mx-auto flex min-h-0 w-full max-w-[640px] flex-1 flex-col px-[var(--gutter)]"
        style={{
          paddingTop:
            "calc(var(--safe-area-top-layout, env(safe-area-inset-top, 0px)) + 0.5rem)",
          paddingBottom: "max(1rem, var(--safe-area-bottom-layout))",
        }}
      >
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-[var(--text)]">
              Activities
            </h1>
            {unreadInView > 0 ? (
              <button
                type="button"
                onClick={handleClearUnread}
                className="shrink-0 text-xs text-[var(--text)]/50 underline-offset-2 hover:text-[var(--text)]/75 hover:underline"
                aria-label="Clear unread activities"
              >
                Clear unread
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestDismiss}
            className={backCircleClass}
            aria-label="Back to messages"
          >
            <PiArrowLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <div
          ref={attachScrollRef}
          {...panelSwipeProps}
          className="relative mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ touchAction: "pan-y" }}
        >
          <NotificationList
            ref={listRef}
            isVisible={presented}
            mode="activityOnly"
            embedded
            onUnreadInViewChange={setUnreadInView}
          />
        </div>
      </div>
      {swipeEngaged ? <div {...edgeStripProps} /> : null}
    </div>,
    document.body
  );
}
