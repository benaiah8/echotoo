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
  confirmLabel?: string | React.ReactNode;
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
  secondaryVariant?: "primary" | "danger" | "dangerSoft" | "default";
  /**
   * Pill-shaped buttons (rounded-full, slightly smaller type). Default dialogs unchanged.
   */
  pillButtons?: boolean;
  /**
   * When secondary + confirm exist: top row = cancel + secondary (half/half),
   * bottom row = primary full width (invite outcome “some already invited”).
   */
  stackThreeActionsPrimaryBelow?: boolean;
  /**
   * Optional alert below the message body and above action buttons (e.g. policy copy).
   */
  inlineAlert?: React.ReactNode;
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
  layout: "equal" | "equalThree" | "intrinsic" | "full" = "equal",
  shape: "default" | "pill" = "default"
) => {
  const widthPad =
    layout === "equal"
      ? "flex-1 min-w-0 px-3"
      : layout === "equalThree"
      ? "flex-1 min-w-0 px-2.5"
      : layout === "full"
      ? "w-full min-w-0 px-3"
      : "shrink-0 px-4 min-w-0";
  const wrap =
    layout === "equalThree"
      ? "whitespace-normal leading-tight"
      : "whitespace-nowrap";
  const radius = shape === "pill" ? "rounded-full" : "rounded-lg";
  /** Pill invite outcomes: match InviteDrawer footer (`h-9`, `text-xs`, rounded-full). */
  const sizing =
    shape === "pill"
      ? "flex h-9 min-h-9 items-center justify-center"
      : "py-2";
  const textSize = "text-xs";
  const base = `${widthPad} ${sizing} ${radius} ${textSize} font-semibold transition disabled:opacity-50 ${wrap} text-center`;
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
  pillButtons = false,
  stackThreeActionsPrimaryBelow = false,
  inlineAlert,
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

  const shape = pillButtons ? "pill" : "default";
  const pillCancelBase =
    "flex h-9 min-h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]/80 disabled:opacity-50 text-center";
  const cancelBtnClass = pillButtons
    ? hasSecondary && stackThreeActionsPrimaryBelow
      ? `${pillCancelBase} flex-1 min-w-0 whitespace-nowrap`
      : hasSecondary
      ? `${pillCancelBase} flex-1 min-w-[5.5rem] px-2.5 whitespace-normal leading-tight`
      : `${pillCancelBase} flex-1 min-w-0 whitespace-nowrap`
    : hasSecondary
      ? "flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]/80 transition disabled:opacity-50 whitespace-normal leading-tight text-center"
      : "flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]/80 transition disabled:opacity-50 whitespace-nowrap";

  const actionsRowClass = [
    "min-w-0",
    hasSecondary && !(pillButtons && stackThreeActionsPrimaryBelow)
      ? `flex w-full flex-wrap gap-2 ${pillButtons ? "sm:flex-nowrap" : ""}`
      : !hasSecondary
      ? `flex gap-2 min-w-0 ${pillButtons ? "flex-wrap" : ""}`
      : "",
  ].join(" ");

  const secondaryBtnVariant =
    secondaryVariant === "dangerSoft"
      ? "dangerSoft"
      : secondaryVariant === "danger"
      ? "danger"
      : secondaryVariant === "default"
      ? "default"
      : "primary";

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
        {inlineAlert != null && inlineAlert !== false ? (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-3 rounded-xl border border-red-500/45 bg-[color-mix(in_oklab,var(--danger)_12%,var(--glass-bg))] px-3 py-2 text-center text-[11px] font-semibold leading-snug text-red-800 shadow-sm backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] app-dark:border-red-500/35 app-dark:text-red-200"
          >
            {typeof inlineAlert === "string" ? (
              <p className="m-0 leading-snug">{inlineAlert}</p>
            ) : (
              inlineAlert
            )}
          </div>
        ) : null}
        {pillButtons && stackThreeActionsPrimaryBelow && hasSecondary ? (
          <div className="flex w-full min-w-0 flex-col gap-2">
            <div className="flex min-w-0 gap-2">
              <button
                className={cancelBtnClass}
                onClick={onClose}
                disabled={isLoading}
              >
                {cancelLabel}
              </button>
              <button
                className={getConfirmDialogButtonClass(
                  secondaryBtnVariant,
                  "equal",
                  shape
                )}
                onClick={handleSecondary}
                disabled={isLoading}
              >
                {secondaryLabel}
              </button>
            </div>
            <button
              className={getConfirmDialogButtonClass(
                confirmVariant,
                "full",
                shape
              )}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : confirmLabel}
            </button>
          </div>
        ) : (
          <div className={actionsRowClass}>
            <button
              className={cancelBtnClass}
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelLabel}
            </button>
            {secondaryLabel && onSecondary ? (
              <>
                <button
                  className={getConfirmDialogButtonClass(
                    secondaryBtnVariant,
                    "equalThree",
                    shape
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
                    "equalThree",
                    shape
                  )}
                  onClick={handleConfirm}
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : confirmLabel}
                </button>
              </>
            ) : (
              <button
                className={getConfirmDialogButtonClass(
                  confirmVariant,
                  "equal",
                  shape
                )}
                onClick={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </FrostedCenterModal>
  );
}
