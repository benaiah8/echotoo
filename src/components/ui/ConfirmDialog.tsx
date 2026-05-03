/**
 * Centered Confirmation Dialog
 *
 * Reusable frosted-glass confirmation for delete, logout, save draft, etc.
 * - Renders via portal to document.body (escapes stacking contexts)
 * - Centered layout, phone-sized max width
 * - Backdrop blur + frosted glass box (uses --glass-bg, --glass-blur)
 * - z-[200] above bottom tab
 */

import React from "react";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?:
    | "danger"
    | "dangerBlack"
    | "dangerSoft"
    | "primary"
    | "warning"
    | "default";
  isLoading?: boolean;
  /** Use z-[210] when opened from within another drawer */
  higherZIndex?: boolean;
  /** Optional middle button (e.g. Save draft | Discard) - when set, renders 3 buttons */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** danger = solid red; dangerSoft = outline / muted (better text contrast on dark UIs) */
  secondaryVariant?: "primary" | "danger" | "dangerSoft";
}

/**
 * equal = shared width (2-button rows)
 * equalThree = full-width thirds (3-button rows); text can wrap so labels stay padded
 * intrinsic = content-sized (rare / legacy)
 */
export const getConfirmDialogButtonClass = (
  variant:
    | "danger"
    | "dangerBlack"
    | "primary"
    | "warning"
    | "default"
    | "dangerSoft",
  layout: "equal" | "equalThree" | "intrinsic" = "equal"
) => {
  const widthPad =
    layout === "equal"
      ? "flex-1 min-w-0 px-3"
      : layout === "equalThree"
      ? "flex-1 min-w-0 px-2.5"
      : "shrink-0 px-4 min-w-0";
  const wrap =
    layout === "equalThree"
      ? "whitespace-normal leading-tight"
      : "whitespace-nowrap";
  const base = `${widthPad} py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${wrap} text-center`;
  switch (variant) {
    case "danger":
      return `${base} bg-red-500 text-white hover:bg-red-600`;
    /** Red fill + black label (strong contrast on bright red). */
    case "dangerBlack":
      return `${base} bg-red-500 text-black hover:bg-red-600 hover:text-black`;
    case "dangerSoft":
      return `${base} border border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,var(--surface-2))]`;
    case "primary":
      return `${base} bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90`;
    case "warning":
      return `${base} bg-yellow-500 text-black hover:bg-yellow-600`;
    case "default":
      return `${base} border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)]/80`;
    default:
      return `${base} bg-red-500 text-white hover:bg-red-600`;
  }
};

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  isLoading = false,
  higherZIndex = false,
  secondaryLabel,
  onSecondary,
  secondaryVariant = "primary",
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    if (isLoading) return;
    await onConfirm();
  };

  const hasSecondary = Boolean(secondaryLabel && onSecondary);

  const handleSecondary = () => {
    if (isLoading) return;
    onSecondary?.();
  };

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={isLoading ? undefined : () => onClose()}
      zTier={higherZIndex ? "aboveDialog" : "dialog"}
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={frostedModalPanelClassName}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="confirm-dialog-title"
          className="text-sm font-semibold mb-1 text-[var(--text)]"
        >
          {title}
        </div>
        {typeof message === "string" ? (
          <p className="text-xs text-[var(--text)]/70 mb-3">{message}</p>
        ) : (
          <div className="text-xs text-[var(--text)]/70 mb-3 space-y-2 [&_p]:leading-relaxed">
            {message}
          </div>
        )}
        <div
          className={
            hasSecondary ? "flex w-full gap-2 min-w-0" : "flex gap-2 min-w-0"
          }
        >
          <button
            className={
              hasSecondary
                ? "flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]/80 transition disabled:opacity-50 whitespace-normal leading-tight text-center"
                : "flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]/80 transition disabled:opacity-50 whitespace-nowrap"
            }
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <>
              <button
                className={getConfirmDialogButtonClass(
                  secondaryVariant === "dangerSoft"
                    ? "dangerSoft"
                    : secondaryVariant === "danger"
                    ? "danger"
                    : "primary",
                  "equalThree"
                )}
                onClick={() => {
                  if (!isLoading) onSecondary();
                }}
                disabled={isLoading}
              >
                {secondaryLabel}
              </button>
              <button
                className={getConfirmDialogButtonClass(
                  confirmVariant,
                  "equalThree"
                )}
                onClick={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : confirmLabel}
              </button>
            </>
          ) : (
            <button
              className={getConfirmDialogButtonClass(confirmVariant)}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </FrostedCenterModal>
  );
}
