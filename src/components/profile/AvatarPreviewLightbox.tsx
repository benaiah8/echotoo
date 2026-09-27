import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";

/** Same stacking tier as {@link ImageLightbox} (below MediaCarousel if any). */
const AVATAR_PREVIEW_Z = 10050;

const MIN_SCALE = 1;
const MAX_SCALE = 3.5;
const DOUBLE_TAP_SCALE = 2;
const DOUBLE_TAP_MS = 280;
const TAP_MOVE_PX = 8;
const OPEN_MS = 200;

type ChromeTone = "theme" | "onDark";

const LightboxChromeContext = createContext<ChromeTone>("theme");

type Props = {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
  /** Optional bottom action row (e.g. edit / share); keep profile-specific logic in parents. */
  actions?: ReactNode;
  /**
   * `circle` — classic avatar / Echo preview (default).
   * `portrait` — clean fullscreen Profile photo with pinch/pan zoom.
   */
  variant?: "circle" | "portrait";
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
  const tone = useContext(LightboxChromeContext);
  const onDark = tone === "onDark";

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
          "border-2 transition-[transform,opacity] active:scale-[0.96]",
          onDark
            ? "border-white/45 bg-white/12 text-white shadow-[0_1px_8px_rgba(0,0,0,0.35)]"
            : [
                "border-[color-mix(in_oklab,var(--text)_46%,transparent)]",
                "bg-[color-mix(in_oklab,var(--text)_7%,transparent)]",
                "text-[var(--text)] shadow-[0_1px_6px_rgba(0,0,0,0.06)]",
              ].join(" "),
        ].join(" ")}
        aria-hidden={busy}
      >
        {busy ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
      </span>
      <span
        className={[
          "max-w-[5.5rem] text-center text-[11px] font-semibold leading-tight",
          onDark ? "text-white/90" : "text-[var(--text)]",
        ].join(" ")}
      >
        {label}
      </span>
    </button>
  );
}

type ZoomState = { scale: number; x: number; y: number };

type Geom = {
  baseW: number;
  baseH: number;
  viewerW: number;
  viewerH: number;
  left: number;
  top: number;
};

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * Pan bounds from fullscreen viewer vs scale-1 photo surface size.
 * Overflow = max(0, (base * scale - viewer) / 2).
 */
function clampPan(
  scale: number,
  x: number,
  y: number,
  baseW: number,
  baseH: number,
  viewerW: number,
  viewerH: number,
): { x: number; y: number } {
  if (scale <= 1.001) return { x: 0, y: 0 };
  const scaledW = baseW * scale;
  const scaledH = baseH * scale;
  const maxX = Math.max(0, (scaledW - viewerW) / 2);
  const maxY = Math.max(0, (scaledH - viewerH) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

function zoomToward(
  state: ZoomState,
  nextScaleRaw: number,
  focalX: number,
  focalY: number,
  baseW: number,
  baseH: number,
  viewerW: number,
  viewerH: number,
): ZoomState {
  const nextScale = clampScale(nextScaleRaw);
  if (nextScale === state.scale) {
    return {
      scale: nextScale,
      ...clampPan(nextScale, state.x, state.y, baseW, baseH, viewerW, viewerH),
    };
  }
  const ratio = nextScale / state.scale;
  const nextX = focalX - (focalX - state.x) * ratio;
  const nextY = focalY - (focalY - state.y) * ratio;
  const pan = clampPan(
    nextScale,
    nextX,
    nextY,
    baseW,
    baseH,
    viewerW,
    viewerH,
  );
  return { scale: nextScale, ...pan };
}

const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/**
 * Full-screen avatar / Profile-photo preview (own / other profile tap).
 * Does not replace {@link ImageLightbox} used for rectangular comment/post images.
 */
export default function AvatarPreviewLightbox({
  src,
  alt = "",
  open,
  onClose,
  actions,
  variant = "circle",
}: Props) {
  const isPortrait = variant === "portrait";
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const swipeContentRef = useRef<HTMLDivElement | null>(null);
  /** Fullscreen gesture / clip viewport (portrait). */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** Scale-1 photo surface — receives translate + scale as one object. */
  const zoomSurfaceRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const zoomRef = useRef<ZoomState>(IDENTITY);
  const [zoom, setZoom] = useState<ZoomState>(IDENTITY);
  const [entered, setEntered] = useState(false);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    scale: number;
    midX: number;
    midY: number;
    origin: ZoomState;
  } | null>(null);
  const panStartRef = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const gestureMovedRef = useRef(false);
  const interactingRef = useRef(false);
  /** Skip backdrop close after a pan/pinch on the photo. */
  const suppressBackdropCloseRef = useRef(false);

  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
    window.setTimeout(() => {
      closingRef.current = false;
    }, 160);
  }, []);

  const applyZoom = useCallback((next: ZoomState) => {
    zoomRef.current = next;
    setZoom(next);
    const surface = zoomSurfaceRef.current;
    if (surface) {
      surface.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  }, []);

  const resetZoom = useCallback(() => {
    applyZoom(IDENTITY);
  }, [applyZoom]);

  useEffect(() => {
    if (!open) {
      resetZoom();
      setEntered(false);
      return;
    }
    resetZoom();
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, src, resetZoom]);

  useOverlayBackgroundScrollLock(open);

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

  /** Vertical swipe-to-dismiss — disabled while zoomed / multi-touch / interacting with photo. */
  useLayoutEffect(() => {
    if (!open) return;
    const overlayEl = overlayRef.current;
    if (!overlayEl) return;
    const swipeEl = swipeContentRef.current;

    let swipeStartY = 0;
    let swipeStartX = 0;
    let isVerticalSwipe = false;

    const shouldIgnoreSwipe = (e: TouchEvent) => {
      if (!isPortrait) return false;
      if (zoomRef.current.scale > 1.01) return true;
      if (e.touches.length > 1) return true;
      if (interactingRef.current) return true;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-portrait-zoom-viewport]")) return true;
      return false;
    };

    const handleSwipeStart = (e: TouchEvent) => {
      if (shouldIgnoreSwipe(e)) {
        swipeStartY = 0;
        return;
      }
      swipeStartY = e.touches[0]!.clientY;
      swipeStartX = e.touches[0]!.clientX;
      isVerticalSwipe = false;
    };

    const handleSwipeMove = (e: TouchEvent) => {
      if (!swipeStartY || shouldIgnoreSwipe(e)) return;
      const currentY = e.touches[0]!.clientY;
      const currentX = e.touches[0]!.clientX;
      const diffY = currentY - swipeStartY;
      const diffX = Math.abs(currentX - swipeStartX);
      if (diffY > LIGHTBOX_SWIPE_VERTICAL_THRESHOLD && diffY > diffX) {
        isVerticalSwipe = true;
        overlayEl.style.backgroundColor = lightboxSwipeBackdropRgba(diffY);
        applyLightboxSwipeContentStyle(swipeEl, diffY);
      }
    };

    const handleSwipeEnd = (e: TouchEvent) => {
      if (!swipeStartY) return;
      const endY = e.changedTouches[0]!.clientY;
      const diffY = endY - swipeStartY;
      if (isVerticalSwipe && diffY > 100 && zoomRef.current.scale <= 1.01) {
        finishClose();
      } else {
        overlayEl.style.backgroundColor = "";
        clearLightboxSwipeContentStyle(swipeEl);
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
      clearLightboxSwipeContentStyle(swipeEl);
    };
  }, [open, finishClose, src, isPortrait]);

  const readGeom = useCallback((): Geom => {
    const viewport = viewportRef.current;
    const surface = zoomSurfaceRef.current;
    if (!viewport || !surface) {
      return {
        baseW: 1,
        baseH: 1,
        viewerW: 1,
        viewerH: 1,
        left: 0,
        top: 0,
      };
    }
    const vr = viewport.getBoundingClientRect();
    /* offset* = layout (scale-1) size; getBoundingClientRect would include transform */
    const baseW = Math.max(1, surface.offsetWidth);
    const baseH = Math.max(1, surface.offsetHeight);
    return {
      baseW,
      baseH,
      viewerW: Math.max(1, vr.width),
      viewerH: Math.max(1, vr.height),
      left: vr.left,
      top: vr.top,
    };
  }, []);

  const focalFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const g = readGeom();
      const surface = zoomSurfaceRef.current;
      const z = zoomRef.current;
      if (!surface) {
        return {
          fx: clientX - (g.left + g.viewerW / 2),
          fy: clientY - (g.top + g.viewerH / 2),
          ...g,
        };
      }
      /* Visual center includes translate; layout center = visual − translate */
      const sr = surface.getBoundingClientRect();
      const layoutCx = sr.left + sr.width / 2 - z.x;
      const layoutCy = sr.top + sr.height / 2 - z.y;
      return {
        fx: clientX - layoutCx,
        fy: clientY - layoutCy,
        ...g,
      };
    },
    [readGeom],
  );

  /** Portrait-only zoom gestures on the fullscreen viewport. */
  useLayoutEffect(() => {
    if (!open || !isPortrait) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const syncSurfaceTransition = (enabled: boolean) => {
      const surface = zoomSurfaceRef.current;
      if (!surface) return;
      surface.style.transition = enabled
        ? `transform ${OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : "none";
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-avatar-preview-discard-clicks]")) {
        /* Action chrome — never start pan/pinch from controls */
        return;
      }
      interactingRef.current = true;
      gestureMovedRef.current = false;
      suppressBackdropCloseRef.current = false;
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      if (pointersRef.current.size === 2) {
        panStartRef.current = null;
        const pts = [...pointersRef.current.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        pinchStartRef.current = {
          dist: Math.max(1, dist),
          scale: zoomRef.current.scale,
          midX,
          midY,
          origin: { ...zoomRef.current },
        };
        syncSurfaceTransition(false);
        return;
      }

      if (pointersRef.current.size === 1) {
        pinchStartRef.current = null;
        if (zoomRef.current.scale > 1.01) {
          panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            originX: zoomRef.current.x,
            originY: zoomRef.current.y,
          };
          syncSurfaceTransition(false);
        } else {
          panStartRef.current = null;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const down = pointerDownPosRef.current;
      if (
        down &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_MOVE_PX
      ) {
        gestureMovedRef.current = true;
      }

      if (pointersRef.current.size === 2 && pinchStartRef.current) {
        e.preventDefault();
        const pts = [...pointersRef.current.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const start = pinchStartRef.current;
        const nextScale = clampScale(start.scale * (dist / start.dist));
        const g = readGeom();
        const originFocal = focalFromClient(start.midX, start.midY);
        const next = zoomToward(
          start.origin,
          nextScale,
          originFocal.fx,
          originFocal.fy,
          g.baseW,
          g.baseH,
          g.viewerW,
          g.viewerH,
        );
        const driftX = midX - start.midX;
        const driftY = midY - start.midY;
        const drifted = clampPan(
          next.scale,
          next.x + driftX,
          next.y + driftY,
          g.baseW,
          g.baseH,
          g.viewerW,
          g.viewerH,
        );
        applyZoom({ scale: next.scale, ...drifted });
        suppressBackdropCloseRef.current = true;
        return;
      }

      if (
        pointersRef.current.size === 1 &&
        panStartRef.current &&
        zoomRef.current.scale > 1.01
      ) {
        e.preventDefault();
        const start = panStartRef.current;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > TAP_MOVE_PX) {
          suppressBackdropCloseRef.current = true;
        }
        const g = readGeom();
        const pan = clampPan(
          zoomRef.current.scale,
          start.originX + dx,
          start.originY + dy,
          g.baseW,
          g.baseH,
          g.viewerW,
          g.viewerH,
        );
        applyZoom({ scale: zoomRef.current.scale, ...pan });
      }
    };

    const endPointer = (e: PointerEvent) => {
      const wasPinch = pinchStartRef.current != null;
      pointersRef.current.delete(e.pointerId);
      try {
        if (viewport.hasPointerCapture(e.pointerId)) {
          viewport.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }

      if (pointersRef.current.size < 2) {
        pinchStartRef.current = null;
      }
      if (pointersRef.current.size === 0) {
        panStartRef.current = null;
        interactingRef.current = false;
        pointerDownPosRef.current = null;

        // Double-tap / double-click zoom (portrait)
        if (!wasPinch && !gestureMovedRef.current) {
          const now = Date.now();
          const last = lastTapRef.current;
          if (
            last &&
            now - last.t < DOUBLE_TAP_MS &&
            Math.hypot(e.clientX - last.x, e.clientY - last.y) < 36
          ) {
            lastTapRef.current = null;
            const { fx, fy, baseW, baseH, viewerW, viewerH } = focalFromClient(
              e.clientX,
              e.clientY,
            );
            syncSurfaceTransition(true);
            if (zoomRef.current.scale > 1.05) {
              applyZoom(IDENTITY);
            } else {
              applyZoom(
                zoomToward(
                  zoomRef.current,
                  DOUBLE_TAP_SCALE,
                  fx,
                  fy,
                  baseW,
                  baseH,
                  viewerW,
                  viewerH,
                ),
              );
            }
            suppressBackdropCloseRef.current = true;
          } else {
            lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
          }
        }

        if (zoomRef.current.scale <= 1.01) {
          applyZoom(IDENTITY);
        }
      } else if (pointersRef.current.size === 1) {
        const remaining = [...pointersRef.current.entries()][0];
        if (remaining && zoomRef.current.scale > 1.01) {
          const [, pt] = remaining;
          panStartRef.current = {
            x: pt.x,
            y: pt.y,
            originX: zoomRef.current.x,
            originY: zoomRef.current.y,
          };
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { fx, fy, baseW, baseH, viewerW, viewerH } = focalFromClient(
        e.clientX,
        e.clientY,
      );
      const delta = -e.deltaY;
      const factor = Math.exp(delta * 0.0018);
      syncSurfaceTransition(false);
      applyZoom(
        zoomToward(
          zoomRef.current,
          zoomRef.current.scale * factor,
          fx,
          fy,
          baseW,
          baseH,
          viewerW,
          viewerH,
        ),
      );
      suppressBackdropCloseRef.current = true;
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);
    viewport.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", endPointer);
      viewport.removeEventListener("pointercancel", endPointer);
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [open, isPortrait, applyZoom, focalFromClient, readGeom]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closingRef.current) return;
      if (suppressBackdropCloseRef.current) {
        suppressBackdropCloseRef.current = false;
        return;
      }
      if (zoomRef.current.scale > 1.01) return;
      const t = e.target as HTMLElement;
      if (
        t.closest("[data-avatar-preview-close]") ||
        t.closest("[data-avatar-preview-discard-clicks]") ||
        t.closest("[data-portrait-photo-surface]")
      ) {
        return;
      }
      finishClose();
    },
    [finishClose],
  );

  if (!open || typeof document === "undefined") return null;

  const chromeTone: ChromeTone = isPortrait ? "onDark" : "theme";

  const zoomSurfaceStyle: React.CSSProperties = {
    transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
    transformOrigin: "center center",
    willChange: "transform",
  };

  return createPortal(
    <LightboxChromeContext.Provider value={chromeTone}>
      <div
        ref={overlayRef}
        className={[
          "fixed inset-0 flex flex-col overflow-hidden",
          isPortrait
            ? "bg-[rgba(8,8,10,0.94)]"
            : "bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-[var(--glass-blur)]",
          "transition-opacity",
          entered ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          zIndex: AVATAR_PREVIEW_Z,
          transitionDuration: `${OPEN_MS}ms`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={alt ? `Profile photo: ${alt}` : "Profile photo"}
        onClick={handleBackdropClick}
      >
        {/* Atmosphere / blur wash */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden
        >
          <div
            className="absolute inset-[-18%] bg-cover bg-center"
            style={{
              backgroundImage: `url(${src})`,
              filter: "blur(36px)",
              opacity: isPortrait ? 0.22 : 0.42,
              transform: "scale(1.08)",
            }}
          />
          <div
            className={[
              "absolute inset-0",
              isPortrait
                ? "bg-[rgba(6,6,8,0.55)]"
                : "bg-[color-mix(in_oklab,var(--bg)_52%,transparent)]",
            ].join(" ")}
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
            className={[
              "pointer-events-auto absolute right-4 z-30 grid h-11 w-11 place-items-center rounded-full",
              "transition hover:opacity-95 active:opacity-85",
              isPortrait
                ? "border border-white/25 bg-white/12 text-white shadow-[0_2px_12px_rgba(0,0,0,0.35)] backdrop-blur-md"
                : "border border-[var(--bottom-tab-border)] bg-[var(--glass-bg)] text-[var(--text)] shadow-[var(--glass-active-shadow)] backdrop-blur-[var(--glass-blur)]",
            ].join(" ")}
            style={{
              top: "max(10px, calc(8px + env(safe-area-inset-top, 0px)))",
            }}
          >
            <PiX className="h-5 w-5" aria-hidden />
          </button>
        ) : null}

        {isPortrait ? (
          <>
            {/* Fullscreen zoom/pan viewport — ONLY clipping boundary for enlarged photo */}
            <div
              ref={(el) => {
                viewportRef.current = el;
                swipeContentRef.current = el;
              }}
              data-portrait-zoom-viewport
              className={[
                "absolute inset-0 z-10 flex touch-none select-none items-center justify-center",
                "transition-opacity",
                entered ? "opacity-100" : "opacity-0",
                zoom.scale > 1.01
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-zoom-in",
              ].join(" ")}
              style={{
                paddingTop:
                  "max(48px, calc(8px + env(safe-area-inset-top, 0px)))",
                paddingBottom:
                  actions != null
                    ? "max(6.5rem, calc(5.5rem + env(safe-area-inset-bottom, 0px)))"
                    : "max(24px, var(--safe-area-bottom-layout))",
                paddingLeft: "24px",
                paddingRight: "24px",
                transitionDuration: `${OPEN_MS}ms`,
              }}
            >
              {/* Scale-1 photo surface — NO overflow clip; whole surface scales */}
                <div
                  ref={zoomSurfaceRef}
                  data-portrait-photo-surface
                  className={[
                    "relative shrink-0 overflow-hidden",
                    "rounded-[18px]",
                    "border-[1.5px]",
                    "border-neutral-950/80 app-dark:border-white/80",
                    "shadow-[0_8px_28px_rgba(0,0,0,0.28)]",
                  ].join(" ")}
                  style={{
                    width:
                      "min(20rem, calc(100vw - 48px), calc((100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 11.5rem) * 4 / 5))",
                    aspectRatio: "4 / 5",
                    maxHeight:
                      "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 11.5rem)",
                    ...zoomSurfaceStyle,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={src}
                    alt={alt}
                    draggable={false}
                    className="pointer-events-none h-full w-full object-cover select-none"
                  />
                </div>
            </div>

            {actions != null ? (
              <div
                data-avatar-preview-discard-clicks
                className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex shrink-0 flex-wrap items-start justify-center gap-2 px-2 pt-1"
                style={{
                  paddingBottom:
                    "max(52px, calc(40px + env(safe-area-inset-bottom, 0px) + 28px))",
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {actions}
                <AvatarPreviewLightboxAction
                  label="Close"
                  icon={<PiX className="h-5 w-5" aria-hidden />}
                  onClick={() => finishClose()}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div
              ref={swipeContentRef}
              className={[
                "flex min-h-0 flex-1 flex-col items-center justify-center px-5",
                "transition-[opacity,transform]",
                entered ? "scale-100 opacity-100" : "scale-[0.97] opacity-0",
              ].join(" ")}
              style={{
                paddingTop:
                  "max(56px, calc(12px + env(safe-area-inset-top, 0px)))",
                paddingBottom:
                  actions != null
                    ? "8px"
                    : "max(24px, var(--safe-area-bottom-layout))",
                transitionDuration: `${OPEN_MS}ms`,
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
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
                    className={[
                      "h-full w-full rounded-full border-2 border-[var(--text)] object-cover shadow-[0_8px_32px_rgba(0,0,0,0.35)] select-none",
                      "ring-2 ring-[color-mix(in_oklab,var(--text)_18%,transparent)]",
                    ].join(" ")}
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
        )}
      </div>
    </LightboxChromeContext.Provider>,
    document.body,
  );
}
