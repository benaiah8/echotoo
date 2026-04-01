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

/**
 * Instagram-style pull: rubber-band distance, spinner fades in with pull.
 * Commits only on release past threshold; otherwise animates closed.
 */
export function useHomePullToRefresh(options: {
  enabled: boolean;
  onCommit: () => void;
  refreshEpoch: number;
}): HomePullToRefreshUi {
  const { enabled, onCommit, refreshEpoch } = options;
  const lastCommitRef = useRef(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const [pullPx, setPullPx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullPxRef = useRef(0);
  pullPxRef.current = pullPx;

  const animRef = useRef<number | null>(null);

  const stopAnim = () => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  useEffect(() => {
    if (refreshEpoch <= 0) return;
    const t = window.setTimeout(() => {
      setIsRefreshing(false);
      setPullPx(0);
    }, REFRESHING_HOLD_MS);
    return () => clearTimeout(t);
  }, [refreshEpoch]);

  useEffect(() => {
    if (!enabled) {
      stopAnim();
      setPullPx(0);
      setIsRefreshing(false);
      return;
    }

    let startY = 0;
    let startX = 0;
    let tracking = false;
    let verticalPull = false;

    const animateTo = (target: number) => {
      stopAnim();
      const start = performance.now();
      const from = pullPxRef.current;
      if (Math.abs(from - target) < 0.5) {
        setPullPx(target);
        return;
      }
      const dur = 220;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - (1 - t) * (1 - t);
        const v = from + (target - from) * eased;
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
      if (window.scrollY > SCROLL_TOP_TOLERANCE) return;
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
          tracking = false;
          pullPxRef.current = 0;
          setPullPx(0);
          return;
        }
      }

      if (!verticalPull) return;
      if (window.scrollY > SCROLL_TOP_TOLERANCE) {
        tracking = false;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }

      const damped = Math.min(Math.max(0, dy * RUBBER), MAX_DAMPED_PX);
      pullPxRef.current = damped;
      setPullPx(damped);
      if (damped > 4) {
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (isPullToRefreshBlocked()) {
        tracking = false;
        verticalPull = false;
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }
      if (!tracking) return;
      tracking = false;
      if (!verticalPull) {
        pullPxRef.current = 0;
        setPullPx(0);
        return;
      }
      if (window.scrollY > SCROLL_TOP_TOLERANCE) {
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
      setIsRefreshing(true);
      const hold = Math.min(px, 44);
      pullPxRef.current = hold;
      setPullPx(hold);
      onCommitRef.current();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      stopAnim();
    };
  }, [enabled]);

  const pullProgress = Math.min(1, pullPx / COMMIT_DAMPED_PX);

  return { pullPx, pullProgress, isRefreshing };
}
