import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface BottomDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  maxHeight?: string;
  showCloseButton?: boolean;
}

/**
 * Reusable Bottom Drawer Component
 *
 * Features:
 * - Renders via portal to document.body (escapes all stacking contexts)
 * - Accounts for bottom tab height dynamically
 * - Frosted glass effect with gradient (solid at bottom, transparent at top)
 * - Locks body scroll when open
 * - Handles safe area insets
 * - Higher z-index (z-[100]) to ensure it's always on top
 */
export default function BottomDrawer({
  open,
  onClose,
  title,
  children,
  className = "",
  maxHeight = "80vh",
  showCloseButton = true,
}: BottomDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);

  // Mount/unmount and body scroll lock
  useEffect(() => {
    if (open) {
      setIsMounted(true);
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      // Delay unmount for smooth close animation
      const timer = setTimeout(() => setIsMounted(false), 300);
      return () => clearTimeout(timer);
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [open]);

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop - very low opacity, no blur */}
      <div
        className="absolute inset-0"
        style={{
          // Theme-aware via CSS variable; fallback darker with slight blur
          backgroundColor: "var(--drawer-backdrop, rgba(0, 0, 0, 0.28))",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }}
      />

      {/* Drawer Sheet - with small solid sections at top and bottom, transparent middle (80-90%) */}
      <div
        className={`absolute left-0 right-0 rounded-t-2xl overflow-hidden ${className}`}
        style={{
          bottom: 0, // Flush with bottom
          maxHeight: maxHeight,
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
          paddingBottom: "calc(1rem + var(--safe-area-bottom-layout))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content container with proper scrolling */}
        <div
          className="overflow-y-auto h-full"
          style={{ maxHeight: maxHeight }}
        >
          {/* Header - gradient from solid at top to transparent, no border */}
          {(title || showCloseButton) && (
            <div
              className="flex items-center justify-between p-3 sticky top-0 z-10"
              style={{
                // Gradient header: solid at top (dark/light), fading to transparent
                background: `linear-gradient(to bottom,
                  var(--bg) 0%,
                  var(--bg) 5%,
                  transparent 100%
                )`,
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                // Header now relies on container border; no extra borders here
                border: "none",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              }}
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
          )}

          {/* Children content */}
          <div className="p-3">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
