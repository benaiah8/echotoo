/**
 * Lightweight Video requirements info (PASS B0.2 / Create Media UI).
 * Public contract only — no internal size math in the UI.
 */

import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../ui/FrostedCenterModal";
import { getConfirmDialogButtonClass } from "../ui/ConfirmDialog";
import {
  VIDEO_REQUIREMENTS_ITEMS,
  VIDEO_REQUIREMENTS_OPTIMIZATION_LINE,
  VIDEO_REQUIREMENTS_TITLE,
} from "../../lib/createDraftVideo/createVideoConstraints";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Accessible brand accent — yellow on dark, stronger amber on light. */
const emphasisClass =
  "font-semibold text-[var(--brand-readable)] app-dark:text-[var(--create-accent-icon-fg)]";

export default function CreateVideoRequirementsInfo({ open, onClose }: Props) {
  return (
    <FrostedCenterModal
      open={open}
      onBackdropClick={onClose}
      zTier="dialog"
      role="dialog"
      aria-labelledby="create-video-requirements-title"
      aria-describedby="create-video-requirements-desc"
    >
      <div
        className={`${frostedModalPanelClassName} app-light:shadow-[0_12px_44px_rgba(0,0,0,0.08)] app-dark:shadow-[0_12px_44px_rgba(0,0,0,0.42)]`}
        style={frostedModalPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="create-video-requirements-title"
          className="text-[17px] font-semibold tracking-tight text-[var(--text)]"
        >
          {VIDEO_REQUIREMENTS_TITLE}
        </h2>
        <div
          id="create-video-requirements-desc"
          className="mt-3 space-y-1.5 text-[14px] leading-snug text-[var(--text)]/78"
        >
          {VIDEO_REQUIREMENTS_ITEMS.map((item) => (
            <p key={`${item.before}${item.emphasis}${item.after}`}>
              {item.before}
              <span className={emphasisClass} data-video-requirement-emphasis>
                {item.emphasis}
              </span>
              {item.after}
            </p>
          ))}
          <p className="pt-2 text-[13px] text-[var(--text)]/55">
            {VIDEO_REQUIREMENTS_OPTIMIZATION_LINE}
          </p>
        </div>
        <div className="mt-5 flex w-full">
          <button
            type="button"
            className={getConfirmDialogButtonClass("default", "full")}
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
