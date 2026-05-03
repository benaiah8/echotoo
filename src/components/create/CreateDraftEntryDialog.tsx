import React from "react";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../ui/FrostedCenterModal";
import { getConfirmDialogButtonClass } from "../ui/ConfirmDialog";

type Props = {
  open: boolean;
  /** Backdrop / dismiss without action */
  onDismiss: () => void;
  onContinueDraft: () => void;
  onStartNew: () => void;
  onDeleteDraft: () => void;
};

/**
 * Three-way choice when a local (non-edit) draft exists at Create entry.
 */
export default function CreateDraftEntryDialog({
  open,
  onDismiss,
  onContinueDraft,
  onStartNew,
  onDeleteDraft,
}: Props) {
  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={onDismiss}
      zTier="aboveDialog"
      aria-labelledby="draft-entry-title"
    >
      <div
        className={frostedModalPanelClassName}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="draft-entry-title"
          className="text-sm font-semibold mb-1 text-[var(--text)]"
        >
          Saved draft
        </div>
        <p className="text-xs text-[var(--text)]/70 mb-3">
          You have a local draft. Continue editing, start fresh, or delete it.
        </p>
        <div className="flex w-full gap-2 min-w-0 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            className={getConfirmDialogButtonClass("default", "equalThree")}
            onClick={onDeleteDraft}
          >
            Delete draft
          </button>
          <button
            type="button"
            className={getConfirmDialogButtonClass("default", "equalThree")}
            onClick={onStartNew}
          >
            Start new
          </button>
          <button
            type="button"
            className={getConfirmDialogButtonClass("primary", "equalThree")}
            onClick={onContinueDraft}
          >
            Continue draft
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
