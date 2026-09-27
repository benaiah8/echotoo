/**
 * Published immersive fullscreen — native status-bar visibility ownership.
 *
 * Visibility only. Web no-ops. Soft-catches native failures.
 * Create finalize video fullscreen remains on browser Fullscreen API
 * (`navigationUI: "hide"`) and must not share this helper.
 */

import { isNativeApp } from "./storage/utils/capacitorDetection";

export type PublishedImmersiveStatusBarDesired = "visible" | "hidden";

type StatusBarVisibilityApi = {
  hide: () => Promise<void>;
  show: () => Promise<void>;
};

/** App baseline: status bar visible; no other feature hides it today. */
let desired: PublishedImmersiveStatusBarDesired = "visible";
let immersiveActive = false;
let preImmersiveDesired: PublishedImmersiveStatusBarDesired = "visible";
let applyGeneration = 0;
let applyChain: Promise<void> = Promise.resolve();

/** Injected for unit tests; production uses dynamic `@capacitor/status-bar`. */
let testApi: StatusBarVisibilityApi | null = null;

export function getPublishedImmersiveStatusBarDesired(): PublishedImmersiveStatusBarDesired {
  return desired;
}

export function isPublishedImmersiveStatusBarSessionActive(): boolean {
  return immersiveActive;
}

/**
 * Enter published immersive fullscreen status-bar ownership.
 * Idempotent while already active (keeps original pre-session snapshot).
 */
export function enterPublishedImmersiveStatusBar(): void {
  if (immersiveActive) return;
  immersiveActive = true;
  preImmersiveDesired = desired;
  desired = "hidden";
  scheduleApply();
}

/**
 * Leave published immersive fullscreen status-bar ownership.
 * Restores the pre-enter desired state. Idempotent when inactive.
 */
export function exitPublishedImmersiveStatusBar(): void {
  if (!immersiveActive) return;
  immersiveActive = false;
  desired = preImmersiveDesired;
  scheduleApply();
}

function scheduleApply(): void {
  const gen = ++applyGeneration;
  applyChain = applyChain
    .then(() => runApply(gen))
    .catch(() => {
      /* never reject the chain */
    });
}

async function runApply(gen: number): Promise<void> {
  if (gen !== applyGeneration) return;
  const target = desired;

  if (!testApi && !isNativeApp()) return;

  try {
    const api =
      testApi ??
      (await import("@capacitor/status-bar")).StatusBar;
    if (gen !== applyGeneration) return;
    if (target === "hidden") {
      await api.hide();
    } else {
      await api.show();
    }
  } catch (err) {
    if (gen === applyGeneration) {
      console.warn(
        "[publishedImmersiveStatusBar] native visibility failed",
        err,
      );
    }
  }
}

/** Flush pending native applies (tests). */
export async function flushPublishedImmersiveStatusBarForTests(): Promise<void> {
  await applyChain;
}

export function __setPublishedImmersiveStatusBarApiForTests(
  api: StatusBarVisibilityApi | null,
): void {
  testApi = api;
}

export function __resetPublishedImmersiveStatusBarForTests(): void {
  desired = "visible";
  immersiveActive = false;
  preImmersiveDesired = "visible";
  applyGeneration = 0;
  applyChain = Promise.resolve();
  testApi = null;
}
