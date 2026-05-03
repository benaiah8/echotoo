import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PiX } from "react-icons/pi";
import {
  applyLightboxSwipeContentStyle,
  clearLightboxSwipeContentStyle,
  lightboxSwipeBackdropRgba,
  LIGHTBOX_SWIPE_VERTICAL_THRESHOLD,
} from "../../lib/lightboxSwipeDim";
import { acquirePullToRefreshBlock } from "../../lib/pullToRefreshBlock";

/** Same stacking tier as {@link ImageLightbox} (below MediaCarousel if any). */
const AVATAR_PREVIEW_Z = 10050;

type Props = {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
  /** Optional bottom action row (e.g. edit / share); keep profile-specific logic in parents. */
  actions?: ReactNode;
};

export type AvatarPreviewLightboxActionProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Shows a spinner inside the icon circle (e.g. follow status loading). */
  busy?: boolean;
};

/**
 * Single circular control + caption for {@link AvatarPreviewLightbox} action rows.
 */
export function AvatarPreviewLightboxAction({
  label,
  icon,
  onClick,
  disabled = false,
  busy = false,
}: AvatarPreviewLightboxActionProps) {
  return (
    <button
      type="button"
      data-avatar-preview-discard-clicks
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={[
        "flex min-w-[4rem] flex-col items-center gap-1.5 px-0.5",
        "touch-manipulation disabled:pointer-events-none disabled:opacity-45",
        busy || disabled ? "cursor-wait" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
          "border-2 border-[color-mix(in_oklab,var(--text)_46%,transparent)]",
          "bg-[color-mix(in_oklab,var(--text)_7%,transparent)]",
          "text-[var(--text)] shadow-[0_1px_6px_rgba(0,0,0,0.06)]",
          "transition-[transform,opacity] active:scale-[0.96]",
        ].join(" ")}
        aria-hidden={busy}
      >
        {busy ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
      </span>
      <span className="max-w-[5.5rem] text-center text-[11px] font-semibold leading-tight text-[var(--text)]">
        {label}
      </span>
    </button>
  );
}

/**
 * Full-screen circular avatar preview (own / other profile tap).
 * Does not replace {@link ImageLightbox} used for rectangular comment/post images.
 */
export default function AvatarPreviewLightbox({
  src,
  alt = "",
  open,
  onClose,
  actions,
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const swipeContentRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
    window.setTimeout(() => {
      closingRef.current = false;
    }, 160);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return acquirePullToRefreshBlock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finishClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, finishClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const overlayEl = overlayRef.current;
    if (!overlayEl) return;

    let swipeStartY = 0;
    let swipeStartX = 0;
    let isVerticalSwipe = false;

    const handleSwipeStart = (e: TouchEvent) => {
      swipeStartY = e.touches[0].clientY;
      swipeStartX = e.touches[0].clientX;
      isVerticalSwipe = false;
    };

    const handleSwipeMove = (e: TouchEvent) => {
      if (!swipeStartY) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const diffY = currentY - swipeStartY;
      const diffX = Math.abs(currentX - swipeStartX);
      if (diffY > LIGHTBOX_SWIPE_VERTICAL_THRESHOLD && diffY > diffX) {
        isVerticalSwipe = true;
        overlayEl.style.backgroundColor = lightboxSwipeBackdropRgba(diffY);
        applyLightboxSwipeContentStyle(swipeContentRef.current, diffY);
      }
    };

    const handleSwipeEnd = (e: TouchEvent) => {
      if (!swipeStartY) return;
      const endY = e.changedTouches[0].clientY;
      const diffY = endY - swipeStartY;
      if (isVerticalSwipe && diffY > 100) {
        finishClose();
      } else {
        overlayEl.style.backgroundColor = "";
        clearLightboxSwipeContentStyle(swipeContentRef.current);
      }
      swipeStartY = 0;
      swipeStartX = 0;
      isVerticalSwipe = false;
    };

    overlayEl.addEventListener("touchstart", handleSwipeStart, {
      passive: true,
    });
    overlayEl.addEventListener("touchmove", handleSwipeMove, { passive: true });
    overlayEl.addEventListener("touchend", handleSwipeEnd, { passive: true });

    return () => {
      overlayEl.removeEventListener("touchstart", handleSwipeStart);
      overlayEl.removeEventListener("touchmove", handleSwipeMove);
      overlayEl.removeEventListener("touchend", handleSwipeEnd);
      overlayEl.style.backgroundColor = "";
      clearLightboxSwipeContentStyle(swipeContentRef.current);
    };
  }, [open, finishClose, src]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closingRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-avatar-preview-close]") || t.closest("[data-avatar-preview-discard-clicks]")) {
        return;
      }
      finishClose();
    },
    [finishClose]
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex flex-col bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-[var(--glass-blur)]"
      style={{
        zIndex: AVATAR_PREVIEW_Z,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Profile photo: ${alt}` : "Profile photo"}
      onClick={handleBackdropClick}
    >
      {/* Subtle blurred echo of the avatar (theme-safe scrim on top) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-[-18%] bg-cover bg-center"
          style={{
            backgroundImage: `url(${src})`,
            filter: "blur(32px)",
            opacity: 0.42,
            transform: "scale(1.08)",
          }}
        />
        <div
          className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_52%,transparent)]"
          aria-hidden
        />
      </div>

      {actions == null ? (
        <button
          type="button"
          data-avatar-preview-close
          onClick={(e) => {
            e.stopPropagation();
            finishClose();
          }}
          aria-label="Close"
          className="pointer-events-auto absolute right-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] text-[var(--text)] shadow-[var(--glass-active-shadow)] backdrop-blur-[var(--glass-blur)] transition hover:opacity-95 active:opacity-85"
          style={{
            top: "max(10px, calc(8px + env(safe-area-inset-top, 0px)))",
          }}
        >
          <PiX className="h-5 w-5" aria-hidden />
        </button>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div
          ref={swipeContentRef}
          className="flex min-h-0 flex-1 flex-col items-center justify-center px-6"
          style={{
            paddingTop: "max(56px, calc(12px + env(safe-area-inset-top, 0px)))",
            paddingBottom:
              actions != null
                ? "8px"
                : "max(24px, var(--safe-area-bottom-layout))",
          }}
          role="presentation"
        >
          <div
            data-avatar-preview-discard-clicks
            className="pointer-events-auto flex max-h-[min(78vmin,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-7rem))] max-w-[min(22rem,calc(100vw-48px))] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-square w-[min(22rem,min(78vmin,calc(100vw-48px)))] max-w-full shrink-0">
              <img
                src={src}
                alt={alt}
                className="h-full w-full rounded-full border-2 border-[var(--text)] object-cover shadow-[0_8px_32px_rgba(0,0,0,0.35)] select-none ring-2 ring-[color-mix(in_oklab,var(--text)_18%,transparent)]"
                draggable={false}
              />
            </div>
          </div>
        </div>

        {actions != null ? (
          <div
            data-avatar-preview-discard-clicks
            className="pointer-events-auto flex shrink-0 flex-wrap items-start justify-center gap-2 px-2 pt-1"
            style={{
              /* Extra lift above home indicator / Capacitor nav (~prior glass tray height) */
              paddingBottom:
                "max(52px, calc(40px + env(safe-area-inset-bottom, 0px) + 28px))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
            <AvatarPreviewLightboxAction
              label="Close"
              icon={<PiX className="h-5 w-5" aria-hidden />}
              onClick={() => finishClose()}
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
