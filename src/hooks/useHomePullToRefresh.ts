import { useEffect, useRef, useState } from "react";
import { isPullToRefreshBlocked } from "../lib/pullToRefreshBlock";

const SCROLL_TOP_TOLERANCE = 6;
const COMMIT_DAMPED_PX = 52;
const RUBBER = 0.42;
const MAX_DAMPED_PX = 96;
const MIN_INTERVAL_MS = 1400;
const REFRESHING_HOLD_MS = 720;

export type HomePullToRefreshUi = {
  pullProgress: number;
  pullPx: number;
  isRefreshing: boolean;
};

export type UseHomePullToRefreshOptions = {
  enabled: boolean;
  /**
   * Fired when the pull commits. Return a Promise to keep `isRefreshing`
   * until that work settles (+ hold). Void commits still end via `refreshEpoch`.
   */
  onCommit: () => void | Promise<void>;
  refreshEpoch: number;
  /** Default: () => window.scrollY */
  getScrollTop?: () => number;
  /** Default: window — touch listeners attach here */
  touchTarget?: HTMLElement | Window | Document | null;
};

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Instagram-style pull: rubber-band distance, spinner fades in with pull.
 * Commits only on release past threshold; otherwise animates closed.
 */
export function useHomePullToRefresh(
  options: UseHomePullToRefreshOptions
): HomePullToRefreshUi {
  const { enabled, onCommit, refreshEpoch, getScrollTop, touchTarget } =
    options;
  const lastCommitRef = useRef(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const getScrollTopRef = useRef(getScrollTop ?? (() => window.scrollY));
  getScrollTopRef.current = getScrollTop ?? (() => window.scrollY);

  const [pullPx, setPullPx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullPxRef = useRef(0);
  pullPxRef.current = pullPx;

  const animRef = useRef<number | null>(null);
  const refreshingHoldTimerRef = useRef<number | null>(null);
  /** When onCommit returns a Promise, epoch bumps must not end the spinner early. */
  const awaitCommitPromiseRef = useRef(false);

  const stopAnim = () => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const clearRefreshingHoldTimer = () => {
    if (refreshingHoldTimerRef.current != null) {
      window.clearTimeout(refreshingHoldTimerRef.current);
      refreshingHoldTimerRef.current = null;
    }
  };

  const endRefreshingUi = () => {
    clearRefreshingHoldTimer();
    awaitCommitPromiseRef.current = false;
    setIsRefreshing(false);
    setPullPx(0);
  };

  const scheduleEndRefreshingUi = () => {
    clearRefreshingHoldTimer();
    refreshingHoldTimerRef.current = window.setTimeout(() => {
      refreshingHoldTimerRef.current = null;
      awaitCommitPromiseRef.current = false;
      setIsRefreshing(false);
      setPullPx(0);
    }, REFRESHING_HOLD_MS);
  };

  const readScrollTop = () => getScrollTopRef.current();

  useEffect(() => {
    if (refreshEpoch <= 0) return;
    // Promise-aware commits own the hold; ignore epoch until that settles.
    if (awaitCommitPromiseRef.current) return;
    scheduleEndRefreshingUi();
    return () => clearRefreshingHoldTimer();
  }, [refreshEpoch]);

  useEffect(() => {
    if (!enabled) {
      stopAnim();
      endRefreshingUi();
      return;
    }

    const target = touchTarget ?? window;
    if (!target) return;

    let startY = 0;
    let startX = 0;
    let tracking = false;
    let verticalPull = false;

    const abortGesture = () => {
      tracking = false;
      verticalPull = false;
      stopAnim();
      // Keep refreshing hold if a commit is already in flight.
      if (!awaitCommitPromiseRef.current && refreshingHoldTimerRef.current == null) {
        pullPxRef.current = 0;
        setPullPx(0);
      }
    };

    const animateTo = (targetPx: number) => {
      stopAnim();
      const start = performance.now();
      const from = pullPxRef.current;
      if (Math.abs(from - targetPx) < 0.5) {
        setPullPx(targetPx);
        return;
      }
      const dur = 220;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - (1 - t) * (1 - t);
        const v = from + (targetPx - from) * eased;
        pullPxRef.current = v;
        setPullPx(v);
        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          animRef.current = null;
        }
      };
      animRef.current = requestAnimationFrame(step);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (isPullToRefreshBlocked()) return;
      if (readScrollTop() > SCROLL_TOP_TOLERANCE) return;
      const t = e.touches[0];
      if (!t) return;
      startY = t.clientY;
      startX = t.clientX;
      tracking = true;
      verticalPull = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      if (!verticalPull) {
        if (dy > 10 && dy > Math.abs(dx) * 1.2) {
          verticalPull = true;
        } else if (Math.abs(dx) > 10 && Math.abs(dx) > dy) {
          abortGesture();
          return;
        }
      }

      if (!verticalPull) return;
      if (readScrollTop() > SCROLL_TOP_TOLERANCE) {
        abortGesture();
        return;
      }

      const damped = Math.min(Math.max(0, dy * RUBBER), MAX_DAMPED_PX);
      pullPxRef.current = damped;
      setPullPx(damped);
      if (damped > 4) {
        e.preventDefault();
      }
    };

    const onTouchCancel = () => {
      abortGesture();
    };

    const onTouchEnd = () => {
      if (isPullToRefreshBlocked()) {
        abortGesture();
        return;
      }
      if (!tracking) return;
      tracking = false;
      if (!verticalPull) {
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }
      if (readScrollTop() > SCROLL_TOP_TOLERANCE) {
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      const px = pullPxRef.current;
      const now = Date.now();
      if (px < COMMIT_DAMPED_PX - 0.5) {
        animateTo(0);
        return;
      }
      if (now - lastCommitRef.current < MIN_INTERVAL_MS) {
        animateTo(0);
        return;
      }
      lastCommitRef.current = now;
      clearRefreshingHoldTimer();
      setIsRefreshing(true);
      const hold = Math.min(px, 44);
      pullPxRef.current = hold;
      setPullPx(hold);
      const commitResult = onCommitRef.current();
      if (isThenable(commitResult)) {
        awaitCommitPromiseRef.current = true;
        void Promise.resolve(commitResult).finally(() => {
          scheduleEndRefreshingUi();
        });
      }
    };

    target.addEventListener("touchstart", onTouchStart as EventListener, {
      passive: true,
    });
    target.addEventListener("touchmove", onTouchMove as EventListener, {
      passive: false,
    });
    target.addEventListener("touchend", onTouchEnd as EventListener, {
      passive: true,
    });
    target.addEventListener("touchcancel", onTouchCancel as EventListener, {
      passive: true,
    });

    return () => {
      target.removeEventListener("touchstart", onTouchStart as EventListener);
      target.removeEventListener("touchmove", onTouchMove as EventListener);
      target.removeEventListener("touchend", onTouchEnd as EventListener);
      target.removeEventListener("touchcancel", onTouchCancel as EventListener);
      stopAnim();
    };
  }, [enabled, touchTarget]);

  const pullProgress = Math.min(1, pullPx / COMMIT_DAMPED_PX);

  return { pullPx, pullProgress, isRefreshing };
}
