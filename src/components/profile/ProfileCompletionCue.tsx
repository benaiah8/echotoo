import type { ProfileCompletion } from "../../lib/profileCompletion";
import { PROFILE_OVERVIEW_COMPLETION_CUE_CLASS } from "../../lib/profileOverviewPresentation";

type Props = {
  completion: ProfileCompletion;
  onOpen: () => void;
};

/**
 * Compact Own Profile cue under identity / before bio.
 * Hidden when `completion.complete` (caller should also not mount).
 */
export default function ProfileCompletionCue({ completion, onOpen }: Props) {
  if (completion.complete) return null;

  return (
    <div className={PROFILE_OVERVIEW_COMPLETION_CUE_CLASS}>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)]/70 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)] px-3.5 py-1.5 text-left shadow-[0_1px_8px_-4px_rgba(0,0,0,0.25)] backdrop-blur-md transition-opacity hover:opacity-90 active:opacity-80 touch-manipulation dark:bg-[color-mix(in_oklab,var(--surface)_55%,transparent)]"
        style={{
          WebkitBackdropFilter: "blur(14px) saturate(1.1)",
          backdropFilter: "blur(14px) saturate(1.1)",
        }}
        aria-label={`Finish your profile, ${completion.percent} percent complete`}
      >
        <span className="text-[12px] font-semibold leading-none text-[var(--text)]/90">
          Finish your profile
        </span>
        <span
          className="text-[11px] font-semibold tabular-nums leading-none text-[var(--brand-readable)]"
          aria-hidden
        >
          {completion.percent}%
        </span>
      </button>
    </div>
  );
}
