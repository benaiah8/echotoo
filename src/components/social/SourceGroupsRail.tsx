import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { SourceGroupRow } from "../../lib/social/sourceGroupTypes";
import { shouldTopAlignGroupStack } from "../../lib/sourceGroupsStackLayout";
import { isSourceGroupRequestBusy } from "../../lib/sourceGroupRequestActions";
import SourceGroupCard from "./SourceGroupCard";
import { SkeletonLine, SkeletonPill } from "../ui/Skeleton";

/**
 * Vertical frosted Group list for SourceGroupsOverlay (no Embla).
 * Short stacks are vertically centered as one unit; tall stacks top-align and scroll.
 */
export default function SourceGroupsRail({
  rows,
  occursLabelFor,
  occursTimeExplicitFor,
  busyId,
  onPrimary,
}: {
  rows: SourceGroupRow[];
  occursLabelFor: (row: SourceGroupRow) => string | null;
  occursTimeExplicitFor?: (row: SourceGroupRow) => boolean;
  busyId: string | null;
  onPrimary: (row: SourceGroupRow) => void;
}) {
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [topAligned, setTopAligned] = useState(false);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const viewport = stack.closest(
      "[data-source-groups-card-scroll]"
    ) as HTMLElement | null;
    if (!viewport || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const stackHeight = stack.getBoundingClientRect().height;
      const viewportHeight = viewport.clientHeight;
      const next = shouldTopAlignGroupStack(stackHeight, viewportHeight);
      setTopAligned((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stack);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div
      className={
        topAligned
          ? "flex flex-col"
          : "flex min-h-full flex-col justify-center"
      }
      data-source-groups-rail-align={topAligned ? "top" : "center"}
    >
      <div
        ref={stackRef}
        className="flex w-full flex-col gap-3 py-2"
        data-source-groups-rail="vertical"
      >
        {rows.map((row) => (
          <div
            key={row.opportunity_id}
            className="mx-auto w-[min(88%,22rem)] shrink-0"
          >
            <SourceGroupCard
              row={row}
              occursLabel={occursLabelFor(row)}
              occursTimeExplicit={
                occursTimeExplicitFor
                  ? occursTimeExplicitFor(row)
                  : row.occurs_time_explicit !== false
              }
              busy={
                busyId === row.opportunity_id ||
                isSourceGroupRequestBusy(row.opportunity_id)
              }
              onPrimary={() => onPrimary(row)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lightweight frosted card skeletons inside the card viewport only. */
export function SourceGroupsRailSkeleton() {
  return (
    <div
      className="flex min-h-full flex-col justify-center gap-3 py-2"
      aria-hidden
      data-source-groups-skeleton
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          className="mx-auto w-[min(88%,22rem)] rounded-2xl border border-[color-mix(in_oklab,var(--text)_10%,transparent)] bg-[color-mix(in_oklab,var(--surface-2)_34%,transparent)] p-3.5 app-dark:border-white/14"
        >
          <SkeletonLine className="h-4 w-[70%]" />
          <SkeletonLine className="mt-2 h-3 w-full" />
          <SkeletonLine className="mt-1.5 h-3 w-[85%]" />
          <div className="mt-3 flex items-center gap-2">
            <SkeletonPill className="h-8 w-[38%] shrink-0 rounded-full" />
            <SkeletonPill className="h-9 min-w-0 flex-1 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
