/**
 * Reusable bottom social-action toast chrome (Duo / Group).
 * Presentation only — callers own persistence / dismiss / undo.
 *
 * Dismiss: auto timeout · centered top X · vertical swipe up/down.
 * No free drag / horizontal dismiss.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { PiX } from "react-icons/pi";
import {
  SOCIAL_ACTION_TOAST_EXIT_EASE,
  SOCIAL_ACTION_TOAST_EXIT_MS,
  isSocialActionToastControlTarget,
  resolveSocialActionToastVerticalDismiss,
  socialActionToastExitDurationMs,
  type SocialActionToastVerticalDismiss,
} from "../../lib/social/socialActionToastSwipe";

export type SocialActionToastPrimaryAction = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
};

export type SocialActionToastDismissAction = {
  ariaLabel: string;
  onClick: () => void;
  icon: ReactNode;
};

export type SocialActionToastProps = {
  title: ReactNode;
  titleCompact?: ReactNode;
  visible?: boolean;
  primaryAction?: SocialActionToastPrimaryAction;
  dismissAction?: SocialActionToastDismissAction;
  variant?: "default" | "compact";
  /** Manual dismiss (X / vertical swipe) — must NOT run Undo / Add note. */
  onDismiss?: () => void;
  /** Fired when vertical exit starts — clear auto-dismiss timer only. */
  onSwipeExitStart?: () => void;
  /**
   * Optional: retained for host wiring compatibility.
   * Vertical swipe no longer pauses on pointerdown.
   */
  onGestureActiveChange?: (active: boolean) => void;
};

const ACTION_H = "h-9";

type GestureState = {
  pointerId: number;
  startX: number;
  startY: number;
};

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function SocialActionToast({
  title,
  titleCompact,
  visible = true,
  primaryAction,
  dismissAction,
  variant = "default",
  onDismiss,
  onSwipeExitStart,
}: SocialActionToastProps) {
  const compactTitle = titleCompact ?? title;
  const isCompact = variant === "compact";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const dismissedRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  const onSwipeExitStartRef = useRef(onSwipeExitStart);
  const [exitDir, setExitDir] = useState<"up" | "down" | null>(null);
  const [exitArmed, setExitArmed] = useState(false);

  onDismissRef.current = onDismiss;
  onSwipeExitStartRef.current = onSwipeExitStart;

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!exitDir || exitArmed) return;
    const reduced = readReducedMotion();
    const duration = socialActionToastExitDurationMs(reduced);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setExitArmed(true);
      });
    });

    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      onDismissRef.current?.();
    }, duration);

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [exitDir, exitArmed]);

  const beginVerticalExit = useCallback(
    (dir: Exclude<SocialActionToastVerticalDismiss, null>) => {
      if (dismissedRef.current || exitDir) return;
      onSwipeExitStartRef.current?.();
      setExitDir(dir);
      setExitArmed(false);
    },
    [exitDir]
  );

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onDismiss || dismissedRef.current || exitDir) return;
    beginVerticalExit("up");
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onDismiss || e.button !== 0) return;
    if (dismissedRef.current || exitDir) return;
    if (isSocialActionToastControlTarget(e.target)) return;
    if (gestureRef.current) return;

    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handlePointerUp = (
    e: ReactPointerEvent<HTMLDivElement>,
    cancel: boolean
  ) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;

    if (cancel || dismissedRef.current || exitDir || !onDismiss) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const dir = resolveSocialActionToastVerticalDismiss(dx, dy);
    if (!dir) return;
    beginVerticalExit(dir);
  };

  const exitingClass =
    exitDir === "up"
      ? "social-action-toast--exiting-up"
      : exitDir === "down"
        ? "social-action-toast--exiting-down"
        : "";
  const armedClass = exitArmed ? "social-action-toast--exit-armed" : "";

  return (
    <div
      ref={rootRef}
      role="status"
      data-social-action-toast-variant={variant}
      data-social-action-toast-exit={exitDir ?? undefined}
      data-social-action-toast-exit-armed={exitArmed ? "true" : undefined}
      className={[
        "social-action-toast",
        visible
          ? "social-action-toast--visible"
          : "social-action-toast--hidden",
        exitingClass,
        armedClass,
        "relative overflow-visible pointer-events-auto flex items-center gap-1.5",
        isCompact
          ? "w-fit max-w-[min(100vw-24px,18rem)]"
          : "w-[min(100vw-20px,26rem)]",
        "rounded-full border border-[var(--bottom-tab-border)] p-1.5",
        "bg-[color-mix(in_oklab,var(--surface-2)_78%,var(--surface))] backdrop-blur-xl",
        "shadow-[0_4px_18px_rgba(0,0,0,0.16)]",
        "app-dark:border-white/24 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_62%,transparent)]",
        "app-dark:shadow-[0_6px_22px_rgba(0,0,0,0.42)]",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        exitDir
          ? {
              transition: exitArmed
                ? `transform ${SOCIAL_ACTION_TOAST_EXIT_MS}ms ${SOCIAL_ACTION_TOAST_EXIT_EASE}, opacity ${SOCIAL_ACTION_TOAST_EXIT_MS}ms ${SOCIAL_ACTION_TOAST_EXIT_EASE}`
                : "none",
            }
          : undefined
      }
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => handlePointerUp(e, false)}
      onPointerCancel={(e) => handlePointerUp(e, true)}
    >
      {onDismiss ? (
        <button
          type="button"
          className={[
            "social-action-toast-close",
            "absolute left-1/2 top-0 z-10",
            "-translate-x-1/2 -translate-y-1/2",
            "inline-flex h-7 w-7 items-center justify-center rounded-full",
            "border border-[var(--border)]/50",
            "bg-[color-mix(in_oklab,var(--surface)_92%,var(--bg))]",
            "text-[var(--text)]/70",
            "shadow-[0_1px_4px_rgba(0,0,0,0.10)]",
            "app-dark:border-white/20",
            "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_80%,transparent)]",
            "app-dark:text-white/75",
            "app-dark:shadow-[0_1px_4px_rgba(0,0,0,0.35)]",
          ].join(" ")}
          aria-label="Dismiss"
          onClick={handleCloseClick}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PiX size={11} aria-hidden />
        </button>
      ) : null}

      {dismissAction ? (
        <button
          type="button"
          className={[
            "inline-flex w-9 shrink-0 items-center justify-center rounded-full",
            ACTION_H,
            "border border-[var(--border)]/40",
            "bg-[color-mix(in_oklab,var(--surface)_88%,var(--bg))]",
            "text-[color-mix(in_oklab,var(--danger)_42%,var(--text))]",
            "app-dark:border-white/14",
            "app-dark:bg-[color-mix(in_oklab,white_16%,var(--surface-2))]",
            "app-dark:text-[color-mix(in_oklab,var(--danger)_38%,white)]",
          ].join(" ")}
          aria-label={dismissAction.ariaLabel}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            dismissAction.onClick();
          }}
        >
          <span aria-hidden>{dismissAction.icon}</span>
        </button>
      ) : isCompact ? null : (
        <span className={`w-9 shrink-0 ${ACTION_H}`} aria-hidden />
      )}

      <p
        className={[
          "min-w-0 text-[13px] leading-[1.25] py-0.5 text-[var(--text)]",
          isCompact
            ? "shrink-0 whitespace-nowrap px-2 text-left font-medium"
            : "flex-1 overflow-x-hidden text-ellipsis whitespace-nowrap text-center",
        ].join(" ")}
      >
        {isCompact ? (
          title
        ) : (
          <>
            <span className="min-[360px]:hidden">{compactTitle}</span>
            <span className="hidden min-[360px]:inline">{title}</span>
          </>
        )}
      </p>

      {primaryAction ? (
        <button
          type="button"
          className={[
            "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5",
            ACTION_H,
            "text-xs font-semibold",
            "bg-[var(--bottom-tab-create-active-bg)] text-[var(--bottom-tab-create-active-fg)]",
            "shadow-[0_1px_0_rgba(0,0,0,0.08)]",
            "app-dark:shadow-[0_1px_0_rgba(255,255,255,0.12)]",
          ].join(" ")}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            primaryAction.onClick();
          }}
        >
          {primaryAction.icon ? (
            <span className="shrink-0" aria-hidden>
              {primaryAction.icon}
            </span>
          ) : null}
          {primaryAction.label}
        </button>
      ) : isCompact ? null : (
        <span className={`w-9 shrink-0 ${ACTION_H}`} aria-hidden />
      )}
    </div>
  );
}
