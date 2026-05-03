/**
 * Soft-update prompt (skippable). UI shell only — wire version checks / store URLs separately.
 * Matches ConfirmDialog: same frosted panel + side-by-side button row.
 */

import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import { getConfirmDialogButtonClass } from "./ConfirmDialog";

export type SoftUpdateModalProps = {
  open: boolean;
  /** Called when the user taps Later or the backdrop (soft dismiss). */
  onClose: () => void;
  title: string;
  message: string;
  /** Primary label (default: Update). */
  updateLabel?: string;
  /** Secondary label (default: Later). */
  laterLabel?: string;
  /**
   * When missing or empty, the Update action stays disabled (no store link yet).
   * When set, Update is enabled; use `onUpdatePress` to handle navigation later.
   */
  updateUrl?: string | null;
  /** Fires when Update is tapped and `updateUrl` is set. Omit for preview / no-op. */
  onUpdatePress?: () => void;
};

export default function SoftUpdateModal({
  open,
  onClose,
  title,
  message,
  updateLabel = "Update",
  laterLabel = "Later",
  updateUrl,
  onUpdatePress,
}: SoftUpdateModalProps) {
  const canUpdate = Boolean(updateUrl?.trim());

  const handleUpdate = () => {
    if (!canUpdate) return;
    onUpdatePress?.();
  };

  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={onClose}
      zTier="dialog"
      role="alertdialog"
      aria-labelledby="soft-update-modal-title"
      aria-describedby="soft-update-modal-desc"
    >
      <div
        className={`${frostedModalPanelClassName} app-light:shadow-[0_12px_44px_rgba(0,0,0,0.08)] app-dark:shadow-[0_12px_44px_rgba(0,0,0,0.42)]`}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="soft-update-modal-title"
          className="text-sm font-semibold mb-1 text-[var(--text)] app-light:text-neutral-950 app-dark:text-white/[0.98]"
        >
          {title}
        </div>
        <p
          id="soft-update-modal-desc"
          className="text-xs mb-3 leading-relaxed text-[var(--text)]/70 app-light:text-neutral-800/90 app-dark:text-white/72"
        >
          {message}
        </p>

        <div className="flex gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] app-light:text-neutral-900 app-dark:text-white/95 app-light:hover:bg-white/90 app-dark:hover:bg-[var(--surface)]/80 transition disabled:opacity-50 whitespace-nowrap"
          >
            {laterLabel}
          </button>
          <button
            type="button"
            disabled={!canUpdate}
            onClick={handleUpdate}
            title={
              canUpdate
                ? undefined
                : "Connect a store URL to enable this action"
            }
            className={`${getConfirmDialogButtonClass("primary")} disabled:pointer-events-none`}
          >
            {updateLabel}
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
