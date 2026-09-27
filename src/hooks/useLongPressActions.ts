/**
 * Long-press / context-menu handlers that suppress the following click.
 * Exposes `pressed` for immediate visual feedback (M3A).
 *
 * Suppression applies only to a click from the same long-press / contextmenu
 * gesture — never left armed for a later unrelated tap.
 */

import { useCallback, useRef, useState } from "react";

const DEFAULT_HOLD_MS = 480;
const DEFAULT_MOVE_PX = 12;

type Options = {
  holdMs?: number;
  moveThresholdPx?: number;
  onLongPress: () => void;
  disabled?: boolean;
};

export function useLongPressActions({
  holdMs = DEFAULT_HOLD_MS,
  moveThresholdPx = DEFAULT_MOVE_PX,
  onLongPress,
  disabled = false,
}: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  /** True after long-press fired for the current pointer gesture (until up/cancel). */
  const longPressedThisGestureRef = useRef(false);
  const disarmRafRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelScheduledDisarm = useCallback(() => {
    if (disarmRafRef.current != null) {
      cancelAnimationFrame(disarmRafRef.current);
      disarmRafRef.current = null;
    }
  }, []);

  /**
   * After a long-press / contextmenu, keep suppress armed long enough for a
   * same-gesture synthetic click, then clear so the next short tap is never eaten.
   */
  const armSameGestureClickSuppress = useCallback(() => {
    suppressClickRef.current = true;
    cancelScheduledDisarm();
    if (typeof requestAnimationFrame === "function") {
      disarmRafRef.current = requestAnimationFrame(() => {
        disarmRafRef.current = null;
        // Click (if any) has usually already run in this turn; clear leftover arm.
        queueMicrotask(() => {
          suppressClickRef.current = false;
        });
      });
    } else {
      queueMicrotask(() => {
        suppressClickRef.current = false;
      });
    }
  }, [cancelScheduledDisarm]);

  const endPointer = useCallback(() => {
    clearTimer();
    startRef.current = null;
    setPressed(false);
    if (longPressedThisGestureRef.current) {
      longPressedThisGestureRef.current = false;
      armSameGestureClickSuppress();
    }
  }, [armSameGestureClickSuppress, clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      cancelScheduledDisarm();
      suppressClickRef.current = false;
      longPressedThisGestureRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      setPressed(true);
      clearTimer();
      timerRef.current = setTimeout(() => {
        longPressedThisGestureRef.current = true;
        suppressClickRef.current = true;
        setPressed(false);
        onLongPress();
      }, holdMs);
    },
    [cancelScheduledDisarm, clearTimer, disabled, holdMs, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || !timerRef.current) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > moveThresholdPx || dy > moveThresholdPx) {
        clearTimer();
        startRef.current = null;
        setPressed(false);
      }
    },
    [clearTimer, moveThresholdPx]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimer();
      longPressedThisGestureRef.current = false;
      setPressed(false);
      onLongPress();
      armSameGestureClickSuppress();
    },
    [armSameGestureClickSuppress, clearTimer, disabled, onLongPress]
  );

  /** Wrap the row's navigate click; returns true if the click should proceed. */
  const allowClick = useCallback((): boolean => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      cancelScheduledDisarm();
      return false;
    }
    return !disabled;
  }, [cancelScheduledDisarm, disabled]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onContextMenu,
    allowClick,
    pressed,
  };
}
