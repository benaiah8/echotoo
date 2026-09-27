/**
 * Stabilized Post Detail scroll-to-location (feed pin → `scrollToLocation`).
 *
 * Waits for `[data-location-section]` + published hero shell readiness, lands with
 * `behavior: "auto"`, allows one bounded drift correction, and flashes a brief
 * arrival highlight. Does not touch body/html/window scroll locking.
 */

import {
  LOCATION_SECTION_ATTR,
  POST_DETAIL_MODAL_SCROLL_ROOT,
  scrollLocationSectionIntoView,
} from "./postDetailCommentsScroll";

export { LOCATION_SECTION_ATTR };

/** Max time to wait for target + hero readiness before best-effort scroll. */
export const LOCATION_SCROLL_MAX_WAIT_MS = 900;
/** Poll interval while waiting for readiness. */
export const LOCATION_SCROLL_POLL_MS = 50;
/** Window after the initial land for at most one drift correction. */
export const LOCATION_SCROLL_CORRECTION_WINDOW_MS = 500;
/** Ignore layout drift at or below this many CSS pixels. */
export const LOCATION_SCROLL_DRIFT_PX = 24;
/** Arrival highlight duration. */
export const LOCATION_ARRIVE_HIGHLIGHT_MS = 1000;
/** Modal inset matching `scrollLocationSectionIntoView`. */
export const LOCATION_SCROLL_TOP_GAP_PX = 12;

export const LOCATION_ARRIVE_ATTR = "data-location-arrive-highlight";

const ARRIVE_BASE_CLASSES = [
  "rounded-xl",
  "ring-1",
  "ring-[var(--border)]",
  "bg-[color-mix(in_oklab,var(--text)_5%,transparent)]",
] as const;

const ARRIVE_MOTION_CLASSES = [
  "transition-[box-shadow,background-color,opacity]",
  "duration-1000",
  "ease-out",
] as const;

export type StabilizedLocationScrollHandle = {
  cancel: () => void;
};

export function prefersReducedMotion(
  matchMediaFn: typeof window.matchMedia | undefined = typeof window !==
  "undefined"
    ? window.matchMedia.bind(window)
    : undefined,
): boolean {
  try {
    return Boolean(matchMediaFn?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * Published Detail hero is ready when:
 * - there is no `[data-published-detail-media-shell]` (no-media / non-published shell), OR
 * - the shell's carousel reports `data-ready="true"`.
 */
export function isPublishedDetailHeroLayoutReady(scope: ParentNode): boolean {
  const shell = scope.querySelector("[data-published-detail-media-shell]");
  if (!shell) return true;
  const carousel = shell.querySelector("[data-published-media-carousel]");
  if (!carousel) return false;
  return carousel.getAttribute("data-ready") === "true";
}

export function shouldCorrectLocationDrift(
  expectedTop: number,
  actualTop: number,
  thresholdPx: number = LOCATION_SCROLL_DRIFT_PX,
): boolean {
  return Math.abs(actualTop - expectedTop) > thresholdPx;
}

export type LocationScrollTickDecision =
  | { action: "wait"; reason: "no_target" | "hero_not_ready" }
  | { action: "land"; reason: "ready" | "timeout_fallback" }
  | { action: "give_up" };

/** Pure readiness gate used by the stabilized location scroll loop. */
export function decideLocationScrollTick(input: {
  hasTarget: boolean;
  heroReady: boolean;
  timedOut: boolean;
}): LocationScrollTickDecision {
  if (!input.hasTarget) {
    return input.timedOut
      ? { action: "give_up" }
      : { action: "wait", reason: "no_target" };
  }
  if (!input.heroReady && !input.timedOut) {
    return { action: "wait", reason: "hero_not_ready" };
  }
  return {
    action: "land",
    reason: input.heroReady ? "ready" : "timeout_fallback",
  };
}

function getModalScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(
    POST_DETAIL_MODAL_SCROLL_ROOT,
  ) as HTMLElement | null;
}

function getQueryScope(isModal: boolean): ParentNode {
  if (!isModal) return document;
  return getModalScrollRoot() ?? document;
}

export function findLocationSectionTarget(
  isModal: boolean,
): HTMLElement | null {
  const scope = getQueryScope(isModal);
  return scope.querySelector(
    `[${LOCATION_SECTION_ATTR}]`,
  ) as HTMLElement | null;
}

/** Viewport Y where the location section top should sit after landing. */
export function measureExpectedLocationTop(isModal: boolean): number | null {
  if (isModal) {
    const root = getModalScrollRoot();
    if (!root) return null;
    return root.getBoundingClientRect().top + LOCATION_SCROLL_TOP_GAP_PX;
  }
  return LOCATION_SCROLL_TOP_GAP_PX;
}

export function flashLocationSectionArrival(
  target: HTMLElement,
  opts?: {
    reducedMotion?: boolean;
    durationMs?: number;
  },
): () => void {
  const reduced =
    opts?.reducedMotion ?? prefersReducedMotion();
  const duration = opts?.durationMs ?? LOCATION_ARRIVE_HIGHLIGHT_MS;
  const motionClasses = reduced ? [] : [...ARRIVE_MOTION_CLASSES];
  const allClasses = [...ARRIVE_BASE_CLASSES, ...motionClasses];

  target.setAttribute(LOCATION_ARRIVE_ATTR, reduced ? "static" : "pulse");
  target.classList.add(...allClasses);

  const timeoutId = window.setTimeout(() => {
    target.removeAttribute(LOCATION_ARRIVE_ATTR);
    target.classList.remove(...allClasses);
  }, duration);

  return () => {
    window.clearTimeout(timeoutId);
    target.removeAttribute(LOCATION_ARRIVE_ATTR);
    target.classList.remove(...allClasses);
  };
}

function doubleRaf(run: () => void): () => void {
  let id2 = 0;
  const id1 = requestAnimationFrame(() => {
    id2 = requestAnimationFrame(run);
  });
  return () => {
    cancelAnimationFrame(id1);
    if (id2) cancelAnimationFrame(id2);
  };
}

/**
 * One-shot stabilized location scroll for modal or full-page Detail.
 * Call once per open; cancel on unmount / route change.
 */
export function scheduleStabilizedLocationScroll(opts: {
  isModal: boolean;
  maxWaitMs?: number;
  correctionWindowMs?: number;
  driftPx?: number;
  pollMs?: number;
}): StabilizedLocationScrollHandle {
  const maxWaitMs = opts.maxWaitMs ?? LOCATION_SCROLL_MAX_WAIT_MS;
  const correctionWindowMs =
    opts.correctionWindowMs ?? LOCATION_SCROLL_CORRECTION_WINDOW_MS;
  const driftPx = opts.driftPx ?? LOCATION_SCROLL_DRIFT_PX;
  const pollMs = opts.pollMs ?? LOCATION_SCROLL_POLL_MS;

  let cancelled = false;
  let landed = false;
  let correctionUsed = false;
  let skipCorrection = false;
  let expectedTop: number | null = null;
  let clearHighlight: (() => void) | null = null;
  let cancelRaf: (() => void) | null = null;
  const timeoutIds = new Set<number>();
  let removeUserListeners: (() => void) | null = null;

  const scheduleTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeoutIds.delete(id);
      fn();
    }, ms);
    timeoutIds.add(id);
    return id;
  };

  const detachUserListeners = () => {
    removeUserListeners?.();
    removeUserListeners = null;
  };

  const cleanup = () => {
    cancelRaf?.();
    cancelRaf = null;
    for (const id of timeoutIds) window.clearTimeout(id);
    timeoutIds.clear();
    detachUserListeners();
    clearHighlight?.();
    clearHighlight = null;
  };

  const onUserInteract = () => {
    if (!landed) return;
    skipCorrection = true;
    detachUserListeners();
  };

  const attachUserListeners = () => {
    detachUserListeners();
    const root = opts.isModal ? getModalScrollRoot() : document;
    if (!root) return;
    const optsListener: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const events = ["pointerdown", "touchstart", "wheel"] as const;
    for (const type of events) {
      root.addEventListener(type, onUserInteract, optsListener);
    }
    removeUserListeners = () => {
      for (const type of events) {
        root.removeEventListener(type, onUserInteract, optsListener);
      }
    };
  };

  const performLand = (target: HTMLElement) => {
    if (cancelled || landed) return;
    cancelRaf = doubleRaf(() => {
      cancelRaf = null;
      if (cancelled || landed) return;
      scrollLocationSectionIntoView({
        isModal: opts.isModal,
        behavior: "auto",
        block: "start",
      });
      landed = true;
      expectedTop = measureExpectedLocationTop(opts.isModal);
      clearHighlight = flashLocationSectionArrival(target);
      attachUserListeners();
      scheduleTimeout(() => {
        if (cancelled || skipCorrection || correctionUsed) return;
        if (expectedTop == null) return;
        const latest = findLocationSectionTarget(opts.isModal);
        if (!latest) return;
        const actualTop = latest.getBoundingClientRect().top;
        if (!shouldCorrectLocationDrift(expectedTop, actualTop, driftPx)) {
          return;
        }
        correctionUsed = true;
        scrollLocationSectionIntoView({
          isModal: opts.isModal,
          behavior: "auto",
          block: "start",
        });
      }, correctionWindowMs);
    });
  };

  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const tick = () => {
    if (cancelled || landed) return;
    const elapsed =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startedAt;
    const timedOut = elapsed >= maxWaitMs;
    const scope = getQueryScope(opts.isModal);
    const target = findLocationSectionTarget(opts.isModal);
    const decision = decideLocationScrollTick({
      hasTarget: Boolean(target),
      heroReady: isPublishedDetailHeroLayoutReady(scope),
      timedOut,
    });
    if (decision.action === "wait") {
      scheduleTimeout(tick, pollMs);
      return;
    }
    if (decision.action === "give_up" || !target) return;
    performLand(target);
  };

  tick();

  return {
    cancel: () => {
      cancelled = true;
      cleanup();
    },
  };
}
