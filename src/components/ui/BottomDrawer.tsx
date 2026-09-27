import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";
import { isAndroid } from "../../lib/storage/utils/capacitorDetection";

/**
 * After `open` becomes false the portal stays mounted this long so callers can
 * finish exit motion before the hook resets transforms.
 */
export const BOTTOM_DRAWER_CLOSE_UNMOUNT_MS = 300;

/** Aligns with `useCreateKeyboardInset` — treat as “keyboard open” for layout. */
const KEYBOARD_MAX_HEIGHT_THRESHOLD_PX = 48;

interface BottomDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  maxHeight?: string;
  showCloseButton?: boolean;
  /** When set, replaces the default title + Close row (sticky top). */
  header?: React.ReactNode;
  /** Classes for the children wrapper; default `p-3`. */
  contentClassName?: string;
  /**
   * Renders **below** the main body, outside the scrollable region, so it stays
   * pinned to the bottom of the sheet (e.g. message + primary actions in Invite).
   * When omitted, behavior matches the original single `overflow-y-auto` body.
   */
  footer?: React.ReactNode;
  /**
   * When `footer` is set: sheet height follows content up to `maxHeight` (short
   * content = short sheet, footer sits under the main body with no big empty band).
   * Main area scrolls inside a max-height cap when content is tall.
   * When false, sheet stays `height: maxHeight` and the main region expands (legacy).
   * @default false
   */
  shrinkSheetToContent?: boolean;
  /**
   * Classes for the fixed full-screen portal wrapper (defaults to z-[100]).
   * Use e.g. `z-[120]` when stacking above another fullscreen overlay (z-[110]).
   */
  portalClassName?: string;
  /**
   * Optional style on the fixed portal root (backdrop + sheet). Used for
   * overlay-level swipe motion. Defaults unchanged when omitted.
   */
  overlayStyle?: React.CSSProperties;
  /**
   * Optional capture-phase pointer handler on the portal root. Defaults unchanged
   * when omitted. When set, backdrop pointerdown does not preventDefault so a
   * coordinated overlay swipe can continue.
   */
  onOverlayPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>;
  /**
   * When true, does not set or clear `document.body` overflow/padding.
   * Use when a parent layer (e.g. another overlay) already locks body scroll,
   * so closing this drawer does not unlock the page underneath.
   */
  disableBodyScrollLock?: boolean;
  /**
   * Presentation-only: hide the default edge-to-edge sheet chrome so children
   * can render an inset frosted panel (keyboard inset / lift unchanged).
   */
  transparentSheet?: boolean;
  /**
   * Backdrop dim. `strong` keeps `--drawer-backdrop` / blur tokens but mixes in
   * extra opacity so chrome underneath (e.g. composer toolbar) reads as covered.
   */
  backdropVariant?: "default" | "strong";
  /**
   * Opt-in: lift the sheet with `useCreateKeyboardInset` on Android too.
   * Default Android keeps `bottom: 0` and only shrinks `maxHeight` (correct when
   * the WebView already resized for IME). Duo / Group editors should set this
   * true — Android often overlays the keyboard without resizing (Capacitor
   * `resize` is iOS-only; `resizeOnFullScreen` is unset), so shrink-alone leaves
   * the action tray under the IME. The inset hook returns ~0 when layout already
   * shrank, so this does not restore the old Android double-lift.
   * iOS already lifts; this flag does not change iOS behavior.
   * @default false
   */
  liftWithKeyboard?: boolean;
  /**
   * When false (with `shrinkSheetToContent`), the main body uses overflow-hidden
   * so compact editors do not scroll the whole sheet; children own overflow.
   * @default true
   */
  bodyScrollable?: boolean;
}

/**
 * Reusable Bottom Drawer Component
 *
 * Features:
 * - Renders via portal to document.body (escapes all stacking contexts)
 * - Accounts for bottom tab height dynamically
 * - Frosted glass effect with gradient (solid at bottom, transparent at top)
 * - Locks body scroll when open (unless disableBodyScrollLock)
 * - Handles safe area insets
 * - Higher z-index (z-[100]) to ensure it's always on top
 */
const defaultHeaderStyle: React.CSSProperties = {
  background: `linear-gradient(to bottom,
    var(--bg) 0%,
    var(--bg) 5%,
    transparent 100%
  )`,
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  border: "none",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
};

export default function BottomDrawer({
  open,
  onClose,
  title,
  children,
  className = "",
  maxHeight = "80vh",
  showCloseButton = true,
  header,
  contentClassName = "p-3",
  footer,
  shrinkSheetToContent = false,
  portalClassName,
  overlayStyle,
  onOverlayPointerDownCapture,
  disableBodyScrollLock = false,
  transparentSheet = false,
  backdropVariant = "default",
  liftWithKeyboard = false,
  bodyScrollable = true,
}: BottomDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const blurBackdropClickRef = useRef(false);
  const { keyboardInsetPx } = useCreateKeyboardInset();
  const rawKeyboardOffsetPx = Math.round(keyboardInsetPx);
  /**
   * Lift sheet from viewport bottom on keyboard (iOS always; Android when
   * `liftWithKeyboard`). Default Android stays at 0 so we do not stack with
   * WebView resize — hook inset is ~0 when layout already shrank.
   */
  const drawerBottomOffsetPx =
    isAndroid() && !liftWithKeyboard ? 0 : rawKeyboardOffsetPx;
  const keyboardShrinksSheet =
    rawKeyboardOffsetPx > KEYBOARD_MAX_HEIGHT_THRESHOLD_PX;
  /** Visible band above keyboard / resized viewport — keep whole sheet reachable. */
  const resolvedMaxHeight = keyboardShrinksSheet
    ? `min(${maxHeight}, calc(100dvh - ${rawKeyboardOffsetPx}px - env(safe-area-inset-top, 0px) - 0.75rem))`
    : maxHeight;

  /** Avoid stacking home-indicator padding on top of an open keyboard inset. */
  const sheetPaddingBottom = keyboardShrinksSheet
    ? "0.75rem"
    : transparentSheet
      ? "max(0.75rem, calc(0.5rem + var(--safe-area-bottom-layout)))"
      : "max(1.25rem, calc(0.75rem + var(--safe-area-bottom-layout)))";

  const shrinkContentBodyMaxHeight =
    footer != null && shrinkSheetToContent
      ? keyboardShrinksSheet
        ? `min(58vh, calc(100dvh - 13rem - ${rawKeyboardOffsetPx}px))`
        : "min(58vh, calc(100dvh - 13rem))"
      : undefined;

  const shrinkBodyOverflowClass = bodyScrollable
    ? "overflow-y-auto overflow-x-hidden overscroll-contain"
    : "overflow-hidden overscroll-none";

  /**
   * Docked sheets: animate bottom only (max-height snaps) to avoid jump→snap
   * from dual CSS transitions fighting mid-keyboard-animation insets.
   */
  const sheetTransition = liftWithKeyboard
    ? "bottom 180ms ease-out"
    : "bottom 220ms ease-out, max-height 220ms ease-out";

  // Mount/unmount (animation) — scroll lock is owned by the canonical manager.
  useEffect(() => {
    if (open) {
      setIsMounted(true);
      /** Native WebViews: re-measure env(safe-area) + iOS/Android fallbacks so fixed bottom sheets clear nav / home. */
      syncAppSafeAreaBottom();
      return;
    }
    const timer = setTimeout(
      () => setIsMounted(false),
      BOTTOM_DRAWER_CLOSE_UNMOUNT_MS,
    );
    return () => clearTimeout(timer);
  }, [open]);

  useOverlayBackgroundScrollLock(open && !disableBodyScrollLock);

  if (!isMounted) return null;

  const portalZ =
    portalClassName != null && portalClassName.trim().length > 0
      ? portalClassName
      : "z-[100]";

  return createPortal(
    <div
      className={`fixed inset-0 overscroll-none ${portalZ}`}
      style={overlayStyle}
      onPointerDownCapture={onOverlayPointerDownCapture}
    >
      {/* Backdrop - very low opacity, no blur */}
      <div
        className="absolute inset-0 overscroll-none"
        style={
          backdropVariant === "strong"
            ? {
                backgroundColor:
                  "color-mix(in srgb, var(--drawer-backdrop, rgba(0, 0, 0, 0.5)) 42%, rgba(0, 0, 0, 0.62))",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }
            : {
                backgroundColor: "var(--drawer-backdrop, rgba(0, 0, 0, 0.28))",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
              }
        }
        onPointerDown={(e) => {
          if (!blurActiveEditableFirst()) return;
          blurBackdropClickRef.current = true;
          e.stopPropagation();
          // preventDefault cancels the pointer before overlay swipe can lock.
          if (!onOverlayPointerDownCapture) {
            e.preventDefault();
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (blurBackdropClickRef.current) {
            blurBackdropClickRef.current = false;
            return;
          }
          onClose();
        }}
      />

      {/* Drawer Sheet - with small solid sections at top and bottom, transparent middle (80-90%) */}
      <div
        className={`absolute inset-x-0 overflow-hidden ${transparentSheet ? "" : "rounded-t-2xl"} ${className}`}
        style={{
          bottom: drawerBottomOffsetPx,
          maxHeight: resolvedMaxHeight,
          transition: sheetTransition,
          // With `footer` and full-height mode: fixed height so flex-1 middle works.
          // With `shrinkSheetToContent`, height comes from content (capped by maxHeight).
          ...(footer != null
            ? shrinkSheetToContent
              ? { minHeight: 0 as number }
              : { height: resolvedMaxHeight, minHeight: 0 as number }
            : {}),
          ...(transparentSheet
            ? {
                border: "none",
                background: "transparent",
                backdropFilter: "none",
                WebkitBackdropFilter: "none",
                paddingBottom: sheetPaddingBottom,
              }
            : {
                // Apply top/left/right border on the container so the curve isn't clipped
                borderTop:
                  "1px solid var(--glass-active-border-strong, rgba(255, 255, 255, 0.35))",
                borderLeft: "1px solid var(--glass-active-border)",
                borderRight: "1px solid var(--glass-active-border)",
                // Gradient: small solid sections at top and bottom, transparent in middle (80-90%)
                background: `linear-gradient(to bottom,
            var(--bg) 0%,
            var(--bg) 3%,
            transparent 8%,
            transparent 92%,
            var(--bg) 97%,
            var(--bg) 100%
          )`,
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                paddingBottom: sheetPaddingBottom,
              }),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {footer != null ? (
          /* Pinned header + main + pinned footer. `shrinkSheetToContent`: short main = short sheet. */
          <div
            className={
              shrinkSheetToContent
                ? "flex min-h-0 w-full max-w-full flex-col overflow-hidden"
                : "flex h-full min-h-0 max-h-full flex-col overflow-hidden"
            }
            style={{ maxHeight: resolvedMaxHeight }}
          >
            {header != null ? (
              <div className="z-10 shrink-0 p-3 pb-2" style={defaultHeaderStyle}>
                {header}
              </div>
            ) : (title || showCloseButton) ? (
              <div
                className="z-10 flex shrink-0 items-center justify-between p-3"
                style={defaultHeaderStyle}
              >
                {title && (
                  <div className="text-lg font-semibold text-[var(--text)]">
                    {title}
                  </div>
                )}
                {showCloseButton && (
                  <button
                    className="text-sm text-[var(--text)]/70 hover:text-[var(--text)] transition ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onClose();
                    }}
                  >
                    Close
                  </button>
                )}
              </div>
            ) : null}
            <div
              className={
                shrinkSheetToContent
                  ? `min-h-0 min-w-0 w-full ${shrinkBodyOverflowClass} ${contentClassName}`
                  : `min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden ${contentClassName}`
              }
              style={
                shrinkContentBodyMaxHeight != null
                  ? { maxHeight: shrinkContentBodyMaxHeight }
                  : undefined
              }
            >
              {children}
            </div>
            <div className="w-full min-w-0 shrink-0">{footer}</div>
          </div>
        ) : (
          /* Original: one scrollable column (header can stick). */
          <div
            className={
              bodyScrollable
                ? "h-full max-h-full overflow-y-auto overscroll-contain"
                : "h-full max-h-full overflow-hidden overscroll-none"
            }
            style={{ maxHeight: resolvedMaxHeight }}
          >
            {header != null ? (
              <div
                className="sticky top-0 z-10 p-3 pb-2"
                style={defaultHeaderStyle}
              >
                {header}
              </div>
            ) : (title || showCloseButton) ? (
              <div
                className="sticky top-0 z-10 flex items-center justify-between p-3"
                style={defaultHeaderStyle}
              >
                {title && (
                  <div className="text-lg font-semibold text-[var(--text)]">
                    {title}
                  </div>
                )}
                {showCloseButton && (
                  <button
                    className="ml-auto text-sm text-[var(--text)]/70 transition hover:text-[var(--text)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onClose();
                    }}
                  >
                    Close
                  </button>
                )}
              </div>
            ) : null}

            <div className={contentClassName}>{children}</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
