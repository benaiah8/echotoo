import { PiMapPin } from "react-icons/pi";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";

const MAX_STOPS = CREATE_FLOW_LIMITS.activities.maxStopsPerPost;

type Props = {
  hasMeaningfulActivities: boolean;
  /** Current number of stops in the draft (same length as `activities` array). */
  stopCount: number;
  onClick: () => void;
};

/**
 * Create-post finalize: activities entry matches {@link CreateFinalizeHeroImageCta}
 * (hero outline, accent icon disc, left label, stops counter on the right).
 */
export default function CreateFinalizeActivitiesCta({
  hasMeaningfulActivities,
  stopCount,
  onClick,
}: Props) {
  const label = hasMeaningfulActivities
    ? "Edit activity, location, or stop"
    : "Add activity, location, or stop";

  const count = Math.min(Math.max(0, stopCount), MAX_STOPS);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-full border-2 border-[var(--create-border-hero-outline)] bg-white/72 p-2 text-left backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_3px_12px_rgba(0,0,0,0.1)] transition-[border-color,box-shadow,transform,background-color] active:scale-[0.99] app-dark:bg-black/32 app-dark:backdrop-blur-2xl app-dark:backdrop-saturate-150 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_7px_22px_rgba(0,0,0,0.35)]"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-icon-disc-border)] bg-[var(--create-hero-cta-icon-disc-bg)] text-[var(--create-hero-cta-icon-fg)] shadow-[var(--create-hero-cta-icon-shadow)]"
        aria-hidden
      >
        <PiMapPin className="h-[1.2rem] w-[1.2rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight tracking-tight app-light:text-neutral-900 app-dark:text-white">
          {label}
        </span>
      </span>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-counter-border)] bg-[var(--create-hero-cta-counter-bg)] text-[10px] font-semibold tabular-nums text-[var(--create-hero-cta-counter-fg)] shadow-[var(--create-hero-cta-counter-shadow)]">
        {count}/{MAX_STOPS}
      </span>
    </button>
  );
}
