/**
 * Foreground-aware start / stall / absolute watchdog for native prepare & TUS.
 * No global state — one instance per in-flight native job.
 */

export type NativeOperationWatchdogTimeoutReason =
  | "start"
  | "stall"
  | "absolute";

export type NativeOperationWatchdogClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

export type NativeOperationWatchdogVisibility = {
  isForeground: () => boolean;
  subscribe: (listener: (foreground: boolean) => void) => () => void;
};

export type NativeOperationWatchdogOptions = {
  /** Max foreground ms after accept before first meaningful activity. */
  startTimeoutMs: number;
  /** Max foreground ms between meaningful progress events (after activity). */
  stallTimeoutMs: number;
  /**
   * Optional absolute foreground-time cap from accept.
   * Omit / null / ≤0 to disable.
   */
  absoluteTimeoutMs?: number | null;
  onTimeout: (reason: NativeOperationWatchdogTimeoutReason) => void;
  clock?: NativeOperationWatchdogClock;
  visibility?: NativeOperationWatchdogVisibility;
};

export type NativeOperationWatchdog = {
  /** Native job accepted — arms start (+ absolute) timers. */
  markAccepted: () => void;
  /**
   * Meaningful activity that clears the start window and (re)arms stall.
   * Call for first progress / uploadCreated / first byte advance.
   */
  markActivity: () => void;
  /**
   * Meaningful progress after activity begun — resets stall to a full window.
   * Alias of markActivity once past start (safe to call either).
   */
  markProgress: () => void;
  /** Cancel all timers; ignore further marks. Idempotent. */
  dispose: () => void;
};

const defaultClock: NativeOperationWatchdogClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

function defaultVisibility(): NativeOperationWatchdogVisibility {
  const isForeground = () => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  };
  return {
    isForeground,
    subscribe: (listener) => {
      if (typeof document === "undefined") return () => undefined;
      const onVis = () => {
        listener(document.visibilityState !== "hidden");
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        document.removeEventListener("visibilitychange", onVis);
      };
    },
  };
}

/**
 * True when prepare progress may reset the watchdog.
 * Requires finite 0..1 and a strict advance over `prior` (null prior = first valid).
 */
export function isMeaningfulPrepareProgress(
  progress: number | null | undefined,
  prior: number | null,
): boolean {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return false;
  if (progress < 0 || progress > 1) return false;
  if (prior == null) return true;
  return progress > prior;
}

export function createNativeOperationWatchdog(
  options: NativeOperationWatchdogOptions,
): NativeOperationWatchdog {
  const clock = options.clock ?? defaultClock;
  const visibility = options.visibility ?? defaultVisibility();
  const absoluteCap =
    typeof options.absoluteTimeoutMs === "number" &&
    Number.isFinite(options.absoluteTimeoutMs) &&
    options.absoluteTimeoutMs > 0
      ? options.absoluteTimeoutMs
      : null;

  let disposed = false;
  let fired = false;
  let accepted = false;
  /** Still waiting for first markActivity after accept. */
  let awaitingStart = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeVis: (() => void) | null = null;

  let foreground = visibility.isForeground();
  /** Start/stall budget remaining when last armed or paused. */
  let startRemainingMs = options.startTimeoutMs;
  let stallRemainingMs = options.stallTimeoutMs;
  /** Wall clock when current foreground countdown segment began (null if paused/bg). */
  let segmentStartedAt: number | null = null;
  /** Absolute foreground ms accumulated while accepted. */
  let absoluteAccumMs = 0;

  const clearTimer = () => {
    if (timer != null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };

  const fire = (reason: NativeOperationWatchdogTimeoutReason) => {
    if (disposed || fired) return;
    fired = true;
    clearTimer();
    options.onTimeout(reason);
  };

  const flushSegmentAbsolute = () => {
    if (!accepted || absoluteCap == null || segmentStartedAt == null) return;
    if (!foreground) return;
    const elapsed = Math.max(0, clock.now() - segmentStartedAt);
    absoluteAccumMs += elapsed;
  };

  const pauseSegment = () => {
    if (segmentStartedAt == null) return;
    const now = clock.now();
    const elapsed = Math.max(0, now - segmentStartedAt);
    if (accepted && absoluteCap != null && foreground) {
      absoluteAccumMs += elapsed;
    }
    if (awaitingStart) {
      startRemainingMs = Math.max(0, startRemainingMs - elapsed);
    } else if (accepted) {
      stallRemainingMs = Math.max(0, stallRemainingMs - elapsed);
    }
    segmentStartedAt = null;
    clearTimer();
  };

  const arm = () => {
    clearTimer();
    if (disposed || fired || !accepted || !foreground) return;

    const now = clock.now();
    if (segmentStartedAt == null) {
      segmentStartedAt = now;
    }

    let untilMs = Infinity;
    if (awaitingStart) {
      untilMs = Math.min(untilMs, startRemainingMs);
    } else {
      untilMs = Math.min(untilMs, stallRemainingMs);
    }
    if (absoluteCap != null) {
      untilMs = Math.min(untilMs, Math.max(0, absoluteCap - absoluteAccumMs));
    }
    if (!Number.isFinite(untilMs)) return;

    if (untilMs <= 0) {
      if (absoluteCap != null && absoluteAccumMs >= absoluteCap) {
        fire("absolute");
        return;
      }
      if (awaitingStart) {
        fire("start");
        return;
      }
      fire("stall");
      return;
    }

    timer = clock.setTimeout(() => {
      timer = null;
      if (disposed || fired || !accepted) return;
      if (!foreground) return;

      const started = segmentStartedAt ?? clock.now();
      const elapsed = Math.max(0, clock.now() - started);
      segmentStartedAt = clock.now();

      if (absoluteCap != null) {
        absoluteAccumMs += elapsed;
        if (absoluteAccumMs >= absoluteCap) {
          fire("absolute");
          return;
        }
      }

      if (awaitingStart) {
        startRemainingMs = Math.max(0, startRemainingMs - elapsed);
        if (startRemainingMs <= 0) {
          fire("start");
          return;
        }
      } else {
        stallRemainingMs = Math.max(0, stallRemainingMs - elapsed);
        if (stallRemainingMs <= 0) {
          fire("stall");
          return;
        }
      }
      arm();
    }, untilMs);
  };

  const onVisibility = (nextForeground: boolean) => {
    if (disposed || fired) return;
    if (nextForeground === foreground) return;
    if (!nextForeground) {
      pauseSegment();
      foreground = false;
      return;
    }
    // Resume: freeze absolute already flushed in pause; give FRESH stall window.
    foreground = true;
    stallRemainingMs = options.stallTimeoutMs;
    // Start remaining keeps paused remainder (not refreshed) — only stall is fresh.
    segmentStartedAt = clock.now();
    arm();
  };

  unsubscribeVis = visibility.subscribe(onVisibility);

  const markAccepted = () => {
    if (disposed || fired || accepted) return;
    accepted = true;
    awaitingStart = true;
    startRemainingMs = options.startTimeoutMs;
    stallRemainingMs = options.stallTimeoutMs;
    absoluteAccumMs = 0;
    foreground = visibility.isForeground();
    if (foreground) {
      segmentStartedAt = clock.now();
      arm();
    } else {
      segmentStartedAt = null;
    }
  };

  const markActivity = () => {
    if (disposed || fired || !accepted) return;
    awaitingStart = false;
    stallRemainingMs = options.stallTimeoutMs;
    if (foreground) {
      // Restart countdown segment so stall is a full fresh window.
      flushSegmentAbsolute();
      segmentStartedAt = clock.now();
      arm();
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    segmentStartedAt = null;
    unsubscribeVis?.();
    unsubscribeVis = null;
  };

  return {
    markAccepted,
    markActivity,
    markProgress: markActivity,
    dispose,
  };
}

/** Prepare: 60s start / 5m stall / 20m absolute (foreground). */
export const PREPARE_WATCHDOG_START_MS = 60_000;
export const PREPARE_WATCHDOG_STALL_MS = 5 * 60_000;
export const PREPARE_WATCHDOG_ABSOLUTE_MS = 20 * 60_000;

/** TUS: 90s start / 12m stall; no absolute cap in R1. */
export const TUS_WATCHDOG_START_MS = 90_000;
export const TUS_WATCHDOG_STALL_MS = 12 * 60_000;
