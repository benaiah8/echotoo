import { useEffect, useMemo, useRef, useState } from "react";
import { PiImages } from "react-icons/pi";
import { ActivityType } from "../../types/post";
import CreateActivityImagesSection from "../../sections/create/CreateActivityImagesSection";
import { CREATE_FLOW_LIMITS } from "../../lib/createFlowLimits";

type Props = {
  activities: ActivityType[];
  setActivities: React.Dispatch<React.SetStateAction<ActivityType[]>>;
  totalImagesPost: number;
};

const MAX = CREATE_FLOW_LIMITS.activities.maxTotalImagesPerPost;

export default function CreateFinalizeHeroImageDock({
  activities,
  setActivities,
  totalImagesPost,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const atCap = totalImagesPost >= MAX;

  const targetActivityIndex = useMemo(() => {
    for (let i = activities.length - 1; i >= 0; i--) {
      if ((activities[i]?.images?.length ?? 0) > 0) return i;
    }
    return Math.max(0, activities.length - 1);
  }, [activities]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!expanded) return;
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setExpanded(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [expanded]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute bottom-2 left-1/2 z-[26] w-[calc(100%-1rem)] -translate-x-1/2"
    >
      <div className="flex flex-col gap-2">
        {expanded ? (
          <div className="min-w-0 rounded-[14px]">
            <CreateActivityImagesSection
              embedded
              activities={activities}
              activityIndex={targetActivityIndex}
              setActivities={setActivities}
              surfaceVariant="hero-overlay"
              hideHelperCopy
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={[
            /* p-2: equal 8px insets on all sides for icon + counter circles */
            "group flex w-full items-center gap-2.5 rounded-full border-2 p-2 text-left transition-[opacity,border-color,box-shadow,transform,background-color] active:scale-[0.99]",
            "bg-white/72 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_3px_12px_rgba(0,0,0,0.1)]",
            expanded
              ? "border-white/90 app-dark:border-white/88"
              : "border-[var(--create-border-hero-outline)]",
            /* Translucent dark tint so backdrop-blur reads as frosted (not opaque --surface mix) */
            "app-dark:bg-black/32 app-dark:backdrop-blur-2xl app-dark:backdrop-saturate-150 app-dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_7px_22px_rgba(0,0,0,0.35)]",
            expanded ? "opacity-100" : "opacity-58 hover:opacity-78",
          ].join(" ")}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide image manager" : "Show image manager"}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-icon-disc-border)] bg-[var(--create-hero-cta-icon-disc-bg)] text-[var(--create-hero-cta-icon-fg)] shadow-[var(--create-hero-cta-icon-shadow)]"
            aria-hidden
          >
            <PiImages className="h-[1.05rem] w-[1.05rem]" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-tight tracking-tight app-light:text-neutral-900 app-dark:text-white">
              {atCap ? "All photos added" : "Add more photos"}
            </span>
          </span>

          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--create-hero-cta-counter-border)] bg-[var(--create-hero-cta-counter-bg)] text-[10px] font-semibold tabular-nums text-[var(--create-hero-cta-counter-fg)] shadow-[var(--create-hero-cta-counter-shadow)]">
            {totalImagesPost}/{MAX}
          </span>
        </button>
      </div>
    </div>
  );
}
