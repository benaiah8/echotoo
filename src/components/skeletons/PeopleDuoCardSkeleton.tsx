import {
  SkeletonCircle,
  SkeletonLine,
  SkeletonPill,
} from "../ui/Skeleton";
import {
  PEOPLE_CANDIDATE_MEDIA_ASPECT,
  PEOPLE_DUO_MODERN_FRAME_RADIUS,
  PEOPLE_DUO_MODERN_FRONT_WIDTH_RATIO,
  PEOPLE_DUO_STACK_PAD_X,
  PEOPLE_DUO_STACK_PAD_Y,
} from "../../lib/people/peopleCandidateMediaPresentation";
import { peopleDuoModernScrollTopInset } from "../../lib/people/peopleFeedLayout";

/**
 * Stateless Duo-modern loading placeholder.
 * Portrait uses `.people-duo-portrait-shimmer` (same plate as media wait).
 * Pre-measure fallbacks match live Duo front-frame ratio (85% × 3:4).
 * Info strip uses Skeleton primitives only — no extra wash layer.
 */
const FRAME_FALLBACK_PCT = `${PEOPLE_DUO_MODERN_FRONT_WIDTH_RATIO * 100}%`;
const FRAME_WIDTH = `min(100%, var(--people-mine-frame-w, ${FRAME_FALLBACK_PCT}))`;

const INFO_SURFACE_CLASS = [
  "mx-auto shrink-0 border bg-transparent px-2.5 py-2.5",
  "border-black/14 app-dark:border-white/[0.22]",
].join(" ");

export default function PeopleDuoCardSkeleton() {
  return (
    <div
      className="relative box-border flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-people-duo-card-skeleton="true"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div
        className="w-full shrink-0"
        style={{ height: peopleDuoModernScrollTopInset() }}
        aria-hidden
        data-people-duo-scroll-top-inset="true"
      />
      <div
        className="relative flex w-full min-h-0 flex-col overflow-hidden"
        data-people-duo-scene="true"
        data-people-duo-card-skeleton-scene="true"
      >
        <div
          className="w-full shrink-0"
          style={{ height: "var(--people-mine-surplus-pad-top, 0px)" }}
          aria-hidden
          data-people-mine-surplus-pad-top="true"
        />
        <div
          className="relative mx-auto min-h-0 w-full shrink-0 overflow-visible"
          style={{
            width: `var(--people-mine-portrait-w, ${FRAME_WIDTH})`,
            paddingTop: "var(--people-duo-stack-pad-y-top, 16px)",
            paddingBottom: PEOPLE_DUO_STACK_PAD_Y,
            paddingLeft: PEOPLE_DUO_STACK_PAD_X,
            paddingRight: PEOPLE_DUO_STACK_PAD_X,
            boxSizing: "border-box",
          }}
          data-people-duo-portrait="true"
          data-people-duo-card-skeleton-portrait="true"
        >
          <div
            className="relative mx-auto overflow-hidden"
            style={{
              width: FRAME_WIDTH,
              maxWidth: "100%",
              aspectRatio: `${PEOPLE_CANDIDATE_MEDIA_ASPECT}`,
              /* Measured height when host set vars; else aspect-ratio sizes the frame. */
              height: "var(--people-mine-frame-h, auto)",
              borderRadius: PEOPLE_DUO_MODERN_FRAME_RADIUS,
            }}
            data-people-duo-card-skeleton-frame="true"
          >
            <div
              className="people-duo-portrait-shimmer relative h-full w-full"
              data-people-duo-card-skeleton-shimmer="true"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-3 left-3 z-[1] flex items-center gap-2"
              data-people-duo-card-skeleton-identity="true"
            >
              <SkeletonCircle className="h-8 w-8 shrink-0" />
              <SkeletonLine className="h-3 w-20 max-w-[40%]" />
            </div>
          </div>
        </div>
        <div
          className="mx-auto w-full max-w-full shrink-0 pb-4 pt-3"
          style={{
            width: FRAME_WIDTH,
          }}
          data-people-duo-info-column="true"
          data-people-duo-card-skeleton-info="true"
        >
          <div
            className={INFO_SURFACE_CLASS}
            style={{
              width: "100%",
              borderRadius: PEOPLE_DUO_MODERN_FRAME_RADIUS,
            }}
            data-people-duo-opportunity-info="true"
          >
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5"
              data-people-duo-opportunity-meta="true"
              data-people-duo-card-skeleton-pills="true"
            >
              <SkeletonPill className="h-5 min-w-[3.25rem] w-14" />
              <SkeletonPill className="h-5 min-w-[4.5rem] w-20" />
            </div>
            <div
              className="mt-2 space-y-2"
              data-people-duo-card-skeleton-caption="true"
            >
              <SkeletonLine className="h-3.5 w-[92%]" />
              <SkeletonLine className="h-3.5 w-[78%]" />
              <SkeletonLine className="h-3.5 w-[54%]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
