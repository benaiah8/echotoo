/**
 * Hard / required update prompt (blocking). UI shell only — wire version checks separately.
 * Same frosted panel + typography as SoftUpdateModal; single primary action, no "Later".
 */

import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import { getConfirmDialogButtonClass } from "./ConfirmDialog";

export type HardUpdateModalProps = {
  open: boolean;
  title: string;
  message: string;
  updateLabel?: string;
  /**
   * When missing or empty, Update stays disabled (no store link yet).
   * When set, Update is enabled; use `onUpdatePress` for navigation later.
   */
  updateUrl?: string | null;
  onUpdatePress?: () => void;
  /**
   * Production hard updates: omit or false — backdrop does nothing (no casual dismiss).
   * Internal preview only: set true and pass `onClose` so reviewers can tap outside to exit.
   */
  allowBackdropDismissForPreview?: boolean;
  /** Used when `allowBackdropDismissForPreview` is true (backdrop tap). */
  onClose?: () => void;
};

export default function HardUpdateModal({
  open,
  title,
  message,
  updateLabel = "Update",
  updateUrl,
  onUpdatePress,
  allowBackdropDismissForPreview = false,
  onClose,
}: HardUpdateModalProps) {
  const canUpdate = Boolean(updateUrl?.trim());

  const handleUpdate = () => {
    if (!canUpdate) return;
    onUpdatePress?.();
  };

  const backdropDismiss =
    allowBackdropDismissForPreview && onClose ? onClose : undefined;

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={backdropDismiss}
      zTier="blocking"
      backdropVariant="opaque"
      role="alertdialog"
      aria-labelledby="hard-update-modal-title"
      aria-describedby="hard-update-modal-desc"
    >
      <div
        className={`${frostedModalPanelClassName} app-light:shadow-[0_12px_44px_rgba(0,0,0,0.08)] app-dark:shadow-[0_12px_44px_rgba(0,0,0,0.42)]`}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="hard-update-modal-title"
          className="text-sm font-semibold mb-1 text-[var(--text)] app-light:text-neutral-950 app-dark:text-white/[0.98]"
        >
          {title}
        </div>
        <p
          id="hard-update-modal-desc"
          className="text-xs mb-3 leading-relaxed text-[var(--text)]/70 app-light:text-neutral-800/90 app-dark:text-white/72"
        >
          {message}
        </p>

        {allowBackdropDismissForPreview ? (
          <p className="text-[10px] mb-3 leading-snug app-light:text-neutral-600 app-dark:text-white/50">
            Preview only — tap outside to close.
          </p>
        ) : (
          <p className="text-[10px] mb-3 leading-snug app-light:text-neutral-600 app-dark:text-white/50">
            Update required to continue.
          </p>
        )}

        <button
          type="button"
          disabled={!canUpdate}
          onClick={handleUpdate}
          title={
            canUpdate
              ? undefined
              : "Connect a store URL to enable this action"
          }
          className={`w-full ${getConfirmDialogButtonClass("primary")} disabled:pointer-events-none`}
        >
          {updateLabel}
        </button>
      </div>
    </FrostedCenterModal>
  );
}
