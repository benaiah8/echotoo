/**
 * Shared social-action toast host helper (bottom Toaster).
 * Independent dismiss timer ignores react-hot-toast hover pause.
 * Active swipe can pause/resume remaining time so the toast does not
 * vanish under the finger.
 */

import toast from "react-hot-toast";
import type { ReactElement, ReactNode } from "react";
import SocialActionToast, {
  type SocialActionToastDismissAction,
  type SocialActionToastPrimaryAction,
} from "../components/social/SocialActionToast";

/** Dedicated Toaster id — keeps top generic toasts separate. */
export const SOCIAL_ACTION_TOASTER_ID = "social-action";

export const SOCIAL_ACTION_TOAST_DURATION_MS = 6500;

/** Toast id → toaster host (defaults to bottom social-action). */
const socialActionToastHostById = new Map<string, string>();

type SocialActionTimerEntry = {
  handle: ReturnType<typeof setTimeout> | null;
  /**
   * When running: absolute dismiss deadline.
   * When paused: unused (remainingMs holds the freeze).
   */
  deadlineAt: number;
  /** Frozen remaining ms while paused; null while running. */
  remainingMs: number | null;
  paused: boolean;
};

/** Independent auto-dismiss timers — keyed by social toast id. */
const socialActionDismissTimers = new Map<string, SocialActionTimerEntry>();

export type ShowSocialActionToastArgs = {
  id: string;
  title: ReactNode;
  titleCompact?: ReactNode;
  primaryAction?: SocialActionToastPrimaryAction;
  dismissAction?: SocialActionToastDismissAction;
  durationMs?: number;
  /** Compact hug-content pill (Source Groups Request sent). */
  variant?: "default" | "compact";
  /**
   * Extra lift above the shared social-action toaster bottom
   * (e.g. People dock clearance). Safe-area stays on the Toaster host.
   */
  offsetBottomPx?: number;
  /**
   * Host Toaster id. Default: bottom social-action.
   * Discover preference toasts use a dedicated top toaster.
   */
  toasterId?: string;
  /** Default bottom-center (social-action). Discover status uses top-center. */
  position?: "top-center" | "bottom-center";
};

function resolveSocialActionToasterId(id: string): string {
  return socialActionToastHostById.get(id) ?? SOCIAL_ACTION_TOASTER_ID;
}

function clearSocialActionDismissTimer(id: string): void {
  const existing = socialActionDismissTimers.get(id);
  if (!existing) return;
  if (existing.handle !== null) {
    clearTimeout(existing.handle);
  }
  socialActionDismissTimers.delete(id);
}

/**
 * Stop auto-dismiss without removing the toast (swipe exit animation in flight).
 * Prevents resume-after-drag from resurrecting a timer mid-exit.
 */
export function cancelSocialActionAutoDismiss(id: string): void {
  if (!id) return;
  clearSocialActionDismissTimer(id);
}

function armTimerFire(id: string, remainingMs: number): void {
  const handle = setTimeout(() => {
    socialActionDismissTimers.delete(id);
    const toasterId = resolveSocialActionToasterId(id);
    socialActionToastHostById.delete(id);
    toast.dismiss(id, toasterId);
  }, remainingMs);
  socialActionDismissTimers.set(id, {
    handle,
    deadlineAt: Date.now() + remainingMs,
    remainingMs: null,
    paused: false,
  });
}

function scheduleSocialActionDismissTimer(id: string, durationMs: number): void {
  clearSocialActionDismissTimer(id);
  if (durationMs <= 0 || !Number.isFinite(durationMs)) return;
  armTimerFire(id, durationMs);
}

/**
 * Pause independent timer while the user is actively dragging the toast.
 * Freezes remaining time so wall-clock during the drag does not consume it.
 */
export function pauseSocialActionDismissTimer(id: string): void {
  if (!id) return;
  const entry = socialActionDismissTimers.get(id);
  if (!entry || entry.paused) return;
  if (entry.handle !== null) {
    clearTimeout(entry.handle);
  }
  const remaining = Math.max(0, entry.deadlineAt - Date.now());
  socialActionDismissTimers.set(id, {
    handle: null,
    deadlineAt: entry.deadlineAt,
    remainingMs: remaining,
    paused: true,
  });
}

/**
 * Resume after a cancelled / below-threshold drag.
 * Uses frozen remaining time; dismisses immediately if already elapsed.
 */
export function resumeSocialActionDismissTimer(id: string): void {
  if (!id) return;
  const entry = socialActionDismissTimers.get(id);
  if (!entry || !entry.paused) return;
  const remaining =
    entry.remainingMs !== null
      ? entry.remainingMs
      : Math.max(0, entry.deadlineAt - Date.now());
  if (remaining <= 0) {
    socialActionDismissTimers.delete(id);
    const toasterId = resolveSocialActionToasterId(id);
    socialActionToastHostById.delete(id);
    toast.dismiss(id, toasterId);
    return;
  }
  armTimerFire(id, remaining);
}

/** Test helper — whether an independent timer entry exists for id. */
export function __hasSocialActionDismissTimerForTests(id: string): boolean {
  return socialActionDismissTimers.has(id);
}

/** Test helper — whether the timer is paused for id. */
export function __isSocialActionDismissTimerPausedForTests(id: string): boolean {
  return socialActionDismissTimers.get(id)?.paused === true;
}

/** Test helper — clear all independent timers without dismissing toasts. */
export function __resetSocialActionDismissTimersForTests(): void {
  for (const entry of socialActionDismissTimers.values()) {
    if (entry.handle !== null) clearTimeout(entry.handle);
  }
  socialActionDismissTimers.clear();
  socialActionToastHostById.clear();
}

export function dismissSocialActionToast(id: string): void {
  if (!id) return;
  clearSocialActionDismissTimer(id);
  const toasterId = resolveSocialActionToasterId(id);
  socialActionToastHostById.delete(id);
  toast.dismiss(id, toasterId);
}

export function showSocialActionToast(args: ShowSocialActionToastArgs): string {
  const {
    id,
    title,
    titleCompact,
    primaryAction,
    dismissAction,
    durationMs = SOCIAL_ACTION_TOAST_DURATION_MS,
    variant = "default",
    offsetBottomPx,
    toasterId = SOCIAL_ACTION_TOASTER_ID,
    position = "bottom-center",
  } = args;
  if (!id) return "";

  clearSocialActionDismissTimer(id);
  socialActionToastHostById.set(id, toasterId);

  const liftPx =
    typeof offsetBottomPx === "number" &&
    Number.isFinite(offsetBottomPx) &&
    offsetBottomPx > 0
      ? offsetBottomPx
      : 0;

  const toastId = toast.custom(
    (t): ReactElement => {
      const node = (
        <SocialActionToast
          title={title}
          titleCompact={titleCompact}
          visible={t.visible}
          variant={variant}
          onDismiss={() => {
            dismissSocialActionToast(t.id);
          }}
          onSwipeExitStart={() => {
            cancelSocialActionAutoDismiss(t.id);
          }}
          onGestureActiveChange={(active) => {
            if (active) pauseSocialActionDismissTimer(t.id);
            else resumeSocialActionDismissTimer(t.id);
          }}
          primaryAction={
            primaryAction
              ? {
                  ...primaryAction,
                  onClick: () => {
                    dismissSocialActionToast(t.id);
                    primaryAction.onClick();
                  },
                }
              : undefined
          }
          dismissAction={
            dismissAction
              ? {
                  ...dismissAction,
                  onClick: () => {
                    dismissSocialActionToast(t.id);
                    dismissAction.onClick();
                  },
                }
              : undefined
          }
        />
      );
      if (liftPx <= 0) return node;
      return (
        <div
          style={{ marginBottom: liftPx }}
          data-social-action-toast-offset-bottom={liftPx}
        >
          {node}
        </div>
      );
    },
    {
      id,
      duration: durationMs,
      position,
      toasterId,
    }
  );

  scheduleSocialActionDismissTimer(toastId, durationMs);
  return toastId;
}
