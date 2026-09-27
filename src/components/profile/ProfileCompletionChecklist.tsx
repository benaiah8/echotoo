import { useEffect } from "react";
import { PiCheck, PiX } from "react-icons/pi";
import BottomDrawer from "../ui/BottomDrawer";
import type { ProfileCompletion } from "../../lib/profileCompletion";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  completion: ProfileCompletion;
  onAddPhoto: () => void;
  onAddBio: () => void;
  onAddSocial: () => void;
  onEditProfile: () => void;
  /**
   * When false, Android Back / Escape are ignored (e.g. media chooser or crop
   * is stacked above this sheet).
   */
  dismissEnabled?: boolean;
};

function ChecklistRow({
  done,
  label,
  actionLabel,
  optional,
  onAction,
}: {
  done: boolean;
  label: string;
  actionLabel: string;
  optional?: boolean;
  onAction: () => void;
}) {
  if (done) {
    return (
      <div className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 py-1.5">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/20 text-[var(--brand)]"
          aria-hidden
        >
          <PiCheck size={12} />
        </span>
        <span className="text-[13px] font-medium text-[var(--text)]/70">
          {label}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAction}
      className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--text)]/[0.05] active:bg-[var(--text)]/[0.08] touch-manipulation"
    >
      <span
        className="h-5 w-5 shrink-0 rounded-full border border-[var(--border)]"
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[var(--text)]">
          {actionLabel}
        </span>
        {optional ? (
          <span className="mt-0.5 block text-[11px] text-[var(--text)]/50">
            Optional
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Own Profile completion checklist — Group Create inset frosted panel family.
 */
export default function ProfileCompletionChecklist({
  open,
  onClose,
  completion,
  onAddPhoto,
  onAddBio,
  onAddSocial,
  onEditProfile,
  dismissEnabled = true,
}: Props) {
  useEffect(() => {
    if (!open || !dismissEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissEnabled, onClose]);

  useEffect(() => {
    if (!open || !dismissEnabled) return;
    return subscribeAndroidHardwareBack(() => {
      onClose();
    });
  }, [open, dismissEnabled, onClose]);

  return (
    <BottomDrawer
      open={open}
      onClose={onClose}
      maxHeight="min(72vh, 520px)"
      shrinkSheetToContent
      bodyScrollable={false}
      transparentSheet
      showCloseButton={false}
      contentClassName="px-3 pt-1 sm:px-4"
    >
      <div
        className={`${glassPeoplePanelClass} mx-auto max-w-lg`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold tracking-tight text-[var(--text)]">
              Finish your profile
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-[var(--text)]/55">
              {completion.percent}% · a photo and bio help people recognize you
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)] text-[var(--text)]/70 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-400/40"
            aria-label="Close"
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-0.5 px-2 pb-2 pt-1 sm:px-3">
          <ChecklistRow
            done={completion.hasPhotos}
            label="Profile photo"
            actionLabel="Add a photo"
            onAction={onAddPhoto}
          />
          <ChecklistRow
            done={completion.hasBio}
            label="Bio"
            actionLabel="Add a bio"
            onAction={onAddBio}
          />
          <ChecklistRow
            done={completion.hasSocial}
            label="Social link"
            actionLabel="Add a social"
            optional
            onAction={onAddSocial}
          />
        </div>

        <div className="px-3 pb-3 pt-2 sm:px-4">
          <button
            type="button"
            onClick={onEditProfile}
            className="flex min-h-[44px] w-full items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_60%,transparent)] px-4 text-[13px] font-semibold text-[var(--text)]/90 transition-opacity hover:opacity-90 touch-manipulation"
          >
            Edit profile
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}
