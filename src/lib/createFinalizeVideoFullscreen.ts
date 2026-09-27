/**
 * Create finalize video fullscreen — immersive Android presentation + swipe-down exit.
 * Uses Fullscreen API `navigationUI: "hide"` + safe-area insets (not Capacitor StatusBar).
 * C3.4A: smooth finger-follow dismiss (exit only after release + commit animation).
 */

import { Capacitor } from "@capacitor/core";
import {
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
  lightboxSwipeBackdropRgba,
} from "./lightboxSwipeDim";
import { isNativeApp } from "./storage/utils/capacitorDetection";

/** Release commit distance (C3.4A; was mid-move ~80 in C3.3). */
export const VIDEO_FULLSCREEN_SWIPE_DOWN_THRESHOLD_PX = 100;
export const VIDEO_FULLSCREEN_SWIPE_DOWN_DOMINANCE = 1.25;

/** Vertical lock start (matches lightbox). */
export const VIDEO_FULLSCREEN_DISMISS_LOCK_PX =
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD;

/** Release must travel at least this far downward to commit dismiss. */
export const VIDEO_FULLSCREEN_DISMISS_COMMIT_PX = 100;

export const VIDEO_FULLSCREEN_DISMISS_PROGRESS_RANGE_PX = 220;
export const VIDEO_FULLSCREEN_DISMISS_SNAP_BACK_MS = 320;
export const VIDEO_FULLSCREEN_DISMISS_EASING =
  "cubic-bezier(0.22, 1, 0.32, 1)";
export const VIDEO_FULLSCREEN_DISMISS_RADIUS_MAX_PX = 14;
/** Live drag scale floor (C3.4A.1 — was 0.84). */
export const VIDEO_FULLSCREEN_DISMISS_SCALE_MIN = 0.8;
/** Live drag content opacity floor (C3.4A.1 — was 0.22). */
export const VIDEO_FULLSCREEN_DISMISS_OPACITY_MIN = 0.15;

/** Base inset for mute / fullscreen chrome (non-safe-area). */
export const VIDEO_FULLSCREEN_CONTROL_INSET_CSS = "0.5rem";

export const VIDEO_FULLSCREEN_CONTROLS_TOP_CSS = `max(${VIDEO_FULLSCREEN_CONTROL_INSET_CSS}, calc(env(safe-area-inset-top, 0px) + ${VIDEO_FULLSCREEN_CONTROL_INSET_CSS}))`;

export const VIDEO_FULLSCREEN_CONTROLS_RIGHT_CSS = `max(${VIDEO_FULLSCREEN_CONTROL_INSET_CSS}, calc(env(safe-area-inset-right, 0px) + ${VIDEO_FULLSCREEN_CONTROL_INSET_CSS}))`;

export const VIDEO_FULLSCREEN_SCRUB_BOTTOM_INSET_CSS = "0.75rem";

export const VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS = `max(${VIDEO_FULLSCREEN_SCRUB_BOTTOM_INSET_CSS}, calc(env(safe-area-inset-bottom, 0px) + ${VIDEO_FULLSCREEN_SCRUB_BOTTOM_INSET_CSS}))`;

export type AndroidImmersivePresentationMode =
  | "fullscreen-navigationUI-hide"
  | "safe-area-fallback";

export type AndroidImmersiveSession = {
  applied: boolean;
  mode: AndroidImmersivePresentationMode;
};

export type FullscreenDismissVisual = {
  translateY: number;
  scale: number;
  opacity: number;
  borderRadiusPx: number;
  backdrop: string;
  progress: number;
};

let androidImmersiveSession: AndroidImmersiveSession | null = null;
let fullscreenExitHandler: (() => void | Promise<void>) | null = null;

export function shouldAttemptAndroidImmersiveSystemBars(options?: {
  platform?: string | null;
  native?: boolean;
}): boolean {
  const native = options?.native ?? isNativeApp();
  const platform =
    options?.platform ??
    (native && typeof window !== "undefined"
      ? Capacitor.getPlatform()
      : null);
  return platform === "android" && native;
}

export function getAndroidImmersiveSession(): AndroidImmersiveSession | null {
  return androidImmersiveSession;
}

/**
 * Mark Android immersive attempt. Without the Capacitor StatusBar plugin on this
 * path, Chromium Fullscreen with navigationUI hide is the immersive approach;
 * safe-area covers cutouts.
 */
export function applyAndroidImmersiveOnFullscreenEnter(options?: {
  platform?: string | null;
  native?: boolean;
}): AndroidImmersiveSession {
  if (!shouldAttemptAndroidImmersiveSystemBars(options)) {
    const session: AndroidImmersiveSession = {
      applied: false,
      mode: "safe-area-fallback",
    };
    androidImmersiveSession = session;
    return session;
  }
  const session: AndroidImmersiveSession = {
    applied: true,
    mode: "fullscreen-navigationUI-hide",
  };
  androidImmersiveSession = session;
  return session;
}

/** Clear immersive session so app chrome is never left permanently hidden. */
export function restoreAndroidSystemBarsAfterVideoFullscreen(
  session: AndroidImmersiveSession | null = androidImmersiveSession,
): void {
  if (session == null && androidImmersiveSession == null) return;
  androidImmersiveSession = null;
}

export async function requestCreateFinalizeVideoFullscreen(
  element: HTMLElement,
): Promise<"entered" | "failed"> {
  if (typeof element.requestFullscreen !== "function") return "failed";
  try {
    try {
      await element.requestFullscreen({ navigationUI: "hide" });
    } catch {
      await element.requestFullscreen();
    }
    applyAndroidImmersiveOnFullscreenEnter();
    return "entered";
  } catch {
    return "failed";
  }
}

export async function exitCreateFinalizeVideoFullscreen(): Promise<void> {
  if (typeof document !== "undefined" && document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* already exited */
    }
  }
  restoreAndroidSystemBarsAfterVideoFullscreen();
}

export function isCreateFinalizeVideoFullscreenElement(
  element: HTMLElement | null,
): boolean {
  if (!element || typeof document === "undefined") return false;
  return document.fullscreenElement === element;
}

export function isDocumentVideoFullscreenActive(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement != null;
}

export function setCreateFinalizeVideoFullscreenExitHandler(
  handler: (() => void | Promise<void>) | null,
): void {
  fullscreenExitHandler = handler;
}

export function isCreateFinalizeVideoFullscreenOpen(): boolean {
  return (
    fullscreenExitHandler != null || isDocumentVideoFullscreenActive()
  );
}

/** Android Back / Leave guard: exit fullscreen first; returns true if handled. */
export async function tryExitCreateFinalizeVideoFullscreen(): Promise<boolean> {
  if (!isCreateFinalizeVideoFullscreenOpen()) return false;
  if (fullscreenExitHandler) {
    await fullscreenExitHandler();
    return true;
  }
  await exitCreateFinalizeVideoFullscreen();
  return true;
}

/** Lock vertical dismiss while fullscreen (downward only). */
export function shouldLockFullscreenDismiss(
  dx: number,
  dy: number,
  lockPx = VIDEO_FULLSCREEN_DISMISS_LOCK_PX,
): boolean {
  return dy > lockPx && dy > Math.abs(dx);
}

/** Release commit — not for pointermove exit. */
export function shouldCommitFullscreenDismissOnRelease(
  dy: number,
  thresholdPx = VIDEO_FULLSCREEN_DISMISS_COMMIT_PX,
): boolean {
  return dy >= thresholdPx;
}

/**
 * Release-threshold helper with vertical dominance.
 * Must NOT be used to exit during pointermove (C3.4A).
 */
export function shouldExitFullscreenOnSwipeDown(
  dx: number,
  dy: number,
  thresholdPx = VIDEO_FULLSCREEN_SWIPE_DOWN_THRESHOLD_PX,
  dominance = VIDEO_FULLSCREEN_SWIPE_DOWN_DOMINANCE,
): boolean {
  return dy >= thresholdPx && dy > Math.abs(dx) * dominance;
}

export function shouldIgnoreSwipeDownExitForControlTarget(
  target: EventTarget | null,
): boolean {
  if (
    !target ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return false;
  }
  return Boolean((target as Element).closest("[data-video-control]"));
}

export function computeFullscreenDismissProgress(
  dy: number,
  rangePx = VIDEO_FULLSCREEN_DISMISS_PROGRESS_RANGE_PX,
): number {
  return Math.min(1, Math.max(0, dy) / rangePx);
}

export function computeFullscreenDismissVisual(
  dy: number,
): FullscreenDismissVisual {
  const translateY = Math.max(0, dy);
  const progress = computeFullscreenDismissProgress(translateY);
  return {
    translateY,
    scale: Math.max(
      VIDEO_FULLSCREEN_DISMISS_SCALE_MIN,
      1 - progress * 0.2,
    ),
    opacity: Math.max(
      VIDEO_FULLSCREEN_DISMISS_OPACITY_MIN,
      1 - progress * 0.8,
    ),
    borderRadiusPx: progress * VIDEO_FULLSCREEN_DISMISS_RADIUS_MAX_PX,
    backdrop: lightboxSwipeBackdropRgba(translateY),
    progress,
  };
}

export function applyFullscreenDismissVisual(
  surface: HTMLElement | null,
  backdropHost: HTMLElement | null,
  dy: number,
  options?: { transitionMs?: number | null },
): FullscreenDismissVisual {
  const visual = computeFullscreenDismissVisual(dy);
  const transitionMs = options?.transitionMs;
  const transition =
    transitionMs == null || transitionMs <= 0
      ? "none"
      : `${transitionMs}ms ${VIDEO_FULLSCREEN_DISMISS_EASING}`;

  if (surface) {
    if (transition === "none") {
      surface.style.transition = "none";
    } else {
      surface.style.transition = `transform ${transition}, opacity ${transition}, border-radius ${transition}`;
    }
    surface.style.transformOrigin = "center center";
    surface.style.transform = `translateY(${visual.translateY}px) scale(${visual.scale})`;
    surface.style.opacity = String(visual.opacity);
    surface.style.borderRadius = `${visual.borderRadiusPx}px`;
    surface.style.overflow = "hidden";
  }
  if (backdropHost) {
    backdropHost.style.transition =
      transition === "none" ? "none" : `background-color ${transition}`;
    backdropHost.style.backgroundColor = visual.backdrop;
  }
  return visual;
}

export function clearFullscreenDismissVisual(
  surface: HTMLElement | null,
  backdropHost: HTMLElement | null,
): void {
  if (surface) {
    surface.style.transition = "";
    surface.style.transform = "";
    surface.style.transformOrigin = "";
    surface.style.opacity = "";
    surface.style.borderRadius = "";
    surface.style.overflow = "";
  }
  if (backdropHost) {
    backdropHost.style.transition = "";
    backdropHost.style.backgroundColor = "";
  }
}

function waitForDismissTransition(
  surface: HTMLElement,
  ms: number,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      surface.removeEventListener("transitionend", onEnd);
      window.clearTimeout(failsafe);
      resolve();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== surface) return;
      if (e.propertyName && e.propertyName !== "transform") return;
      finish();
    };
    surface.addEventListener("transitionend", onEnd);
    const failsafe = window.setTimeout(finish, ms + 48);
  });
}

/** Snap back to rest while remaining fullscreen. */
export async function animateFullscreenDismissSnapBack(
  surface: HTMLElement | null,
  backdropHost: HTMLElement | null,
  fromDy: number,
  ms = VIDEO_FULLSCREEN_DISMISS_SNAP_BACK_MS,
): Promise<void> {
  if (!surface) return;
  applyFullscreenDismissVisual(surface, backdropHost, fromDy, {
    transitionMs: null,
  });
  void surface.offsetWidth;
  const t = `${ms}ms ${VIDEO_FULLSCREEN_DISMISS_EASING}`;
  surface.style.transition = `transform ${t}, opacity ${t}, border-radius ${t}`;
  if (backdropHost) {
    backdropHost.style.transition = `background-color ${t}`;
  }
  surface.style.transform = "translateY(0px) scale(1)";
  surface.style.opacity = "1";
  surface.style.borderRadius = "0px";
  if (backdropHost) {
    backdropHost.style.backgroundColor = "rgb(0, 0, 0)";
  }
  await waitForDismissTransition(surface, ms);
  clearFullscreenDismissVisual(surface, backdropHost);
}

/** Sync React state from fullscreenchange; restores bars when leaving. */
export function syncFullscreenChangeState(params: {
  container: HTMLElement | null;
  wasFullscreen: boolean;
}): { isFullscreen: boolean; exited: boolean } {
  const isFullscreen = isCreateFinalizeVideoFullscreenElement(params.container);
  const exited = params.wasFullscreen && !isFullscreen;
  if (exited) {
    restoreAndroidSystemBarsAfterVideoFullscreen();
    setCreateFinalizeVideoFullscreenExitHandler(null);
  }
  return { isFullscreen, exited };
}
