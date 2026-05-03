/**
 * Centered frosted overlay + backdrop (shared shell for ConfirmDialog, post-success, etc.)
 * - Portal to document.body
 * - Backdrop: --drawer-backdrop + --glass-blur
 *
 * zTier:
 * - dialog: z-[200] (default confirmations; above bottom tab)
 * - aboveDialog: z-[210] (nested over another dialog)
 * - drawerUnder: z-[90] (below BottomDrawer z-[100] so e.g. InviteDrawer stacks above)
 * - blocking: z-[500] (full-screen dim above shell chrome e.g. bottom tab z-40)
 */

import React from "react";
import { createPortal } from "react-dom";

export type FrostedCenterModalZTier =
  | "dialog"
  | "aboveDialog"
  | "drawerUnder"
  | "blocking";

const Z_TIER_CLASS: Record<FrostedCenterModalZTier, string> = {
  dialog: "z-[200]",
  aboveDialog: "z-[210]",
  drawerUnder: "z-[90]",
  blocking: "z-[500]",
};

export type FrostedCenterModalProps = {
  open: boolean;
  /** Fired when the user clicks the dimmed backdrop (full-screen layer behind the panel). */
  onBackdropClick?: (e: React.MouseEvent) => void;
  zTier?: FrostedCenterModalZTier;
  children: React.ReactNode;
  role?: "dialog" | "alertdialog";
  "aria-modal"?: boolean | "true" | "false";
  "aria-labelledby"?: string;
  "aria-label"?: string;
  /** Extra classes on the flex centering wrapper (e.g. items-start + pt for tall panels) */
  containerClassName?: string;
  /**
   * Stronger dimmer, minimal blur — use for flows that must read as full-screen (e.g. report).
   * Default keeps existing glass blur + --drawer-backdrop.
   */
  backdropVariant?: "default" | "opaque";
};

export default function FrostedCenterModal({
  open,
  onBackdropClick,
  zTier = "dialog",
  children,
  role = "dialog",
  "aria-modal": ariaModal = true,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
  containerClassName = "",
  backdropVariant = "default",
}: FrostedCenterModalProps) {
  if (!open) return null;

  const zClass = Z_TIER_CLASS[zTier];
  const backdropStyle: React.CSSProperties =
    backdropVariant === "opaque"
      ? {
          backgroundColor:
            "var(--modal-opaque-backdrop, rgba(0, 0, 0, 0.82))",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
        }
      : {
          backgroundColor: "var(--drawer-backdrop, rgba(0, 0, 0, 0.5))",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
        };

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${zClass} ${containerClassName}`.trim()}
      role={role}
      aria-modal={ariaModal === true ? true : ariaModal}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      style={{ overscrollBehavior: "contain" }}
    >
      {/* z-0: backdrop must stay below the panel or some engines paint it over the centered card (solid black / dim only). */}
      <div
        className="absolute inset-0 z-0"
        style={backdropStyle}
        onClick={onBackdropClick}
        aria-hidden
      />
      <div className="relative z-10 flex w-full min-w-0 justify-center pointer-events-none">
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Panel shell matching ConfirmDialog’s glass card (use as direct child after backdrop sibling). */
export const frostedModalPanelClassName =
  "relative rounded-2xl border p-4 w-full pointer-events-auto";

export const frostedModalPanelStyle: React.CSSProperties = {
  maxWidth: "var(--floating-confirm-max-width, min(380px, 90vw))",
  backgroundColor: "var(--glass-bg)",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  borderColor: "var(--border)",
};
