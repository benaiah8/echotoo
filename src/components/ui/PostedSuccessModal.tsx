import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./FrostedCenterModal";
import { getConfirmDialogButtonClass } from "./ConfirmDialog";

/** Secondary action: reads clearly on frosted glass (light + dark). */
const postedModalSecondaryBtn =
  "flex-1 min-w-0 px-2 sm:px-3 py-2 rounded-lg text-xs font-semibold transition text-center border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] " +
  "shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.5)] " +
  "ring-1 ring-[var(--text)]/[0.06] dark:ring-[var(--text)]/[0.12] " +
  "hover:brightness-[1.06] active:scale-[0.99] disabled:opacity-50";

/** Dismiss: inverted surface, distinct from Share; flex-1 for single row with Share + Invite. */
const postedModalDoneBtn =
  "flex-1 min-w-0 px-2 sm:px-3 py-2 rounded-lg text-xs font-semibold transition text-center " +
  "bg-[var(--text)] text-[var(--surface)] border border-[var(--text)]/20 " +
  "shadow-[0_2px_10px_rgba(0,0,0,0.14)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.55)] " +
  "hover:opacity-90 active:scale-[0.99]";

type Props = {
  open: boolean;
  onDismiss: () => void;
  onShareClick: () => void | Promise<void>;
  onInviteClick: () => void;
};

/**
 * Post-publish success UI — same frosted shell as {@link ConfirmDialog},
 * with z-tier below BottomDrawer so {@link InviteDrawer} can stack above.
 */
export default function PostedSuccessModal({
  open,
  onDismiss,
  onShareClick,
  onInviteClick,
}: Props) {
  return (
    <FrostedCenterModal
      open={open}
      zTier="drawerUnder"
      onBackdropClick={() => onDismiss()}
      aria-labelledby="posted-success-title"
    >
      <div
        className={frostedModalPanelClassName}
        style={{
          ...frostedModalPanelStyle,
          maxWidth: "min(680px, 92vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            id="posted-success-title"
            className="text-sm font-semibold text-[var(--text)]"
          >
            Posted!
          </h3>
          <button
            type="button"
            onClick={() => onDismiss()}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text)]/70 transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--text)]/70">
          Nice! Your post is live.
        </p>
        <div className="mt-3 border-t border-[var(--border)]/40 pt-2.5 flex gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void onShareClick()}
            className={postedModalSecondaryBtn}
          >
            Share
          </button>
          <button
            type="button"
            onClick={onInviteClick}
            className={`${getConfirmDialogButtonClass(
              "primary"
            )} min-w-0 text-center px-2 sm:px-3 shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.45)]`}
          >
            Invite
          </button>
          <button
            type="button"
            onClick={() => onDismiss()}
            className={postedModalDoneBtn}
          >
            Done
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
