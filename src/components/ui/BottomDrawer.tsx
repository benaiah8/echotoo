import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { blurActiveEditableFirst } from "../../lib/blurActiveEditableFirst";
import { useCreateKeyboardInset } from "../../hooks/useCreateKeyboardInset";
import { isAndroid } from "../../lib/storage/utils/capacitorDetection";

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
   * When true, does not set or clear `document.body` overflow/padding.
   * Use when a parent layer (e.g. another overlay) already locks body scroll,
   * so closing this drawer does not unlock the page underneath.
   */
  disableBodyScrollLock?: boolean;
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
  disableBodyScrollLock = false,
}: BottomDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const blurBackdropClickRef = useRef(false);
  const { keyboardInsetPx } = useCreateKeyboardInset();
  const rawKeyboardOffsetPx = Math.round(keyboardInsetPx);
  const drawerKeyboardOffsetPx = isAndroid() ? 0 : rawKeyboardOffsetPx;
  const resolvedMaxHeight =
    drawerKeyboardOffsetPx > 0
      ? `min(${maxHeight}, calc(100dvh - ${drawerKeyboardOffsetPx}px - env(safe-area-inset-top, 0px) - 0.75rem))`
      : maxHeight;

  // Mount/unmount and body scroll lock
  useEffect(() => {
    if (open) {
      setIsMounted(true);
      /** Native WebViews: re-measure env(safe-area) + iOS/Android fallbacks so fixed bottom sheets clear nav / home. */
      syncAppSafeAreaBottom();
      if (!disableBodyScrollLock) {
        const scrollbarWidth =
          window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      if (!disableBodyScrollLock) {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      }
      // Delay unmount for smooth close animation
      const timer = setTimeout(() => setIsMounted(false), 300);
      return () => clearTimeout(timer);
    }

    return () => {
      if (!disableBodyScrollLock) {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      }
    };
  }, [open, disableBodyScrollLock]);

  if (!isMounted) return null;

  const portalZ =
    portalClassName != null && portalClassName.trim().length > 0
      ? portalClassName
      : "z-[100]";

  return createPortal(
    <div className={`fixed inset-0 ${portalZ}`}>
      {/* Backdrop - very low opacity, no blur */}
      <div
        className="absolute inset-0"
        style={{
          // Theme-aware via CSS variable; fallback darker with slight blur
          backgroundColor: "var(--drawer-backdrop, rgba(0, 0, 0, 0.28))",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
        }}
        onPointerDown={(e) => {
          if (!blurActiveEditableFirst()) return;
          blurBackdropClickRef.current = true;
          e.stopPropagation();
          e.preventDefault();
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
        className={`absolute inset-x-0 rounded-t-2xl overflow-hidden ${className}`}
        style={{
          bottom: drawerKeyboardOffsetPx,
          maxHeight: resolvedMaxHeight,
          transition: "bottom 220ms ease-out, max-height 220ms ease-out",
          // With `footer` and full-height mode: fixed height so flex-1 middle works.
          // With `shrinkSheetToContent`, height comes from content (capped by maxHeight).
          ...(footer != null
            ? shrinkSheetToContent
              ? { minHeight: 0 as number }
              : { height: resolvedMaxHeight, minHeight: 0 as number }
            : {}),
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
          paddingBottom:
            "max(1.25rem, calc(0.75rem + var(--safe-area-bottom-layout)))",
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
                  ? `min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain max-h-[min(58vh,calc(100dvh-13rem))] ${contentClassName}`
                  : `min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden ${contentClassName}`
              }
            >
              {children}
            </div>
            <div className="w-full min-w-0 shrink-0">{footer}</div>
          </div>
        ) : (
          /* Original: one scrollable column (header can stick). */
          <div
            className="h-full max-h-full overflow-y-auto"
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
