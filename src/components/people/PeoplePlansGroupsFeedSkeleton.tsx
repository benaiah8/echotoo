/**
 * Open Plans / Group Up initial-load placeholder.
 * - plans: Discover-style 4:5 portrait + info card
 * - groups: one unified text-first card (creator inside; no portrait)
 */
import {
  PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
  PEOPLE_FEED_MEDIA_RADIUS,
  PEOPLE_PERSONAL_NOTE_ACCENT_CLASS,
  peopleFeedCssVars,
} from "../../lib/people/peopleFeedLayout";
import "./PeoplePlansGroupsFeedSkeleton.css";

export type PeoplePlansGroupsFeedSkeletonVariant = "initial" | "pagination";
export type PeoplePlansGroupsFeedSkeletonSurface = "plans" | "groups";

function rowCount(variant: PeoplePlansGroupsFeedSkeletonVariant): number {
  return variant === "pagination" ? 1 : 2;
}

function Pulse({
  className,
  shimmer = false,
}: {
  className: string;
  shimmer?: boolean;
}) {
  return (
    <div
      className={[
        shimmer
          ? "people-plans-groups-feed-shimmer"
          : "bg-[var(--text)]/10 animate-pulse motion-reduce:animate-none",
        className,
      ].join(" ")}
      aria-hidden
    />
  );
}

/** Discover-parity Open Plans skeleton row. */
function PlansSkeletonRow() {
  return (
    <article
      className="w-full border-t border-[var(--border)] first:border-t-0"
      style={{
        paddingTop: "var(--people-discover-person-pad-y, 20px)",
        paddingBottom: "var(--people-discover-person-pad-y, 20px)",
      }}
      data-people-plans-groups-feed-skeleton-row="true"
      data-people-plans-skeleton-layout="discover"
      aria-hidden
    >
      <div className="flex w-full justify-center">
        <div
          className="people-plans-groups-feed-shimmer relative w-full overflow-hidden"
          style={{
            width: "min(100%, var(--people-discover-photo-max-w, 26rem))",
            aspectRatio: "var(--people-discover-photo-aspect, 4 / 5)",
            borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
            boxShadow: PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
          }}
          data-people-plans-groups-feed-skeleton-portrait="true"
        />
      </div>

      <div
        className="mt-3 flex min-w-0 flex-col gap-2"
        data-people-plans-skeleton-info-stack="true"
      >
        <div
          className="flex min-w-0 items-start gap-1.5 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/40 py-2.5 pl-3 pr-2"
          data-people-plans-skeleton-info-card="true"
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5"
              data-people-plans-groups-feed-skeleton-meta="true"
            >
              <Pulse className="h-5 w-12 shrink-0 rounded-md" />
              <Pulse className="h-5 w-16 min-w-0 max-w-full rounded-md" />
            </div>
            <div
              className="mt-1.5 flex flex-col gap-1.5"
              data-people-plans-groups-feed-skeleton-caption="true"
            >
              <Pulse className="h-3 w-[94%] max-w-full rounded-md" />
              <Pulse className="h-3 w-[86%] max-w-full rounded-md" />
              <Pulse className="h-3 w-[58%] max-w-full rounded-md" />
            </div>
            <div
              className={`${PEOPLE_PERSONAL_NOTE_ACCENT_CLASS} flex flex-col gap-1.5`}
              data-people-plans-skeleton-note-accent="true"
              data-people-personal-note-accent="true"
              aria-hidden
            >
              <Pulse className="h-3 w-[78%] max-w-full rounded-md" />
              <Pulse className="h-3 w-[52%] max-w-full rounded-md" />
            </div>
          </div>
          <div
            className="pointer-events-none flex w-11 shrink-0 flex-col items-center gap-2 self-start pt-0.5"
            data-people-plans-groups-feed-skeleton-rail="true"
          >
            <Pulse shimmer className="h-11 w-11 shrink-0 rounded-full" />
          </div>
        </div>
      </div>
    </article>
  );
}

/** Text-first Group Up skeleton — one unified card (creator inside). */
function GroupsSkeletonRow() {
  return (
    <article
      className="mb-3 w-full last:mb-0"
      data-people-plans-groups-feed-skeleton-row="true"
      data-people-plans-skeleton-layout="text-first"
      data-people-groups-skeleton-layout="text-first"
      data-people-group-up-list-gap="12"
      aria-hidden
    >
      <div
        className="flex min-w-0 items-start gap-1.5 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/40 py-2.5 pl-3 pr-2"
        data-people-groups-skeleton-info-card="true"
        data-people-groups-skeleton-card="true"
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="flex min-w-0 items-center gap-2.5"
            data-people-groups-skeleton-creator="true"
          >
            <Pulse className="h-8 w-8 shrink-0 rounded-full" />
            <Pulse className="h-3.5 w-28 min-w-0 max-w-[50%] rounded-md" />
          </div>
          <Pulse
            className="mt-2.5 h-4 w-[72%] max-w-full rounded-md"
            shimmer
          />
          <div
            className="mt-2 flex flex-col gap-1.5"
            data-people-groups-skeleton-description="true"
          >
            <Pulse className="h-3 w-[94%] max-w-full rounded-md" />
            <Pulse className="h-3 w-[64%] max-w-full rounded-md" />
          </div>
          <div
            className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5"
            data-people-plans-groups-feed-skeleton-meta="true"
            data-people-groups-skeleton-meta="true"
          >
            <Pulse className="h-5 w-12 shrink-0 rounded-md" />
            <Pulse className="h-5 w-16 min-w-0 max-w-full rounded-md" />
            <Pulse className="h-5 w-14 shrink-0 rounded-md" />
          </div>
          <div
            className={`${PEOPLE_PERSONAL_NOTE_ACCENT_CLASS} flex flex-col gap-1.5`}
            data-people-plans-groups-feed-skeleton-caption="true"
            data-people-groups-skeleton-caption="true"
            data-people-groups-skeleton-source-caption-accent="true"
            aria-hidden
          >
            <Pulse className="h-3 w-[92%] max-w-full rounded-md" />
            <Pulse className="h-3 w-[84%] max-w-full rounded-md" />
            <Pulse className="h-3 w-[56%] max-w-full rounded-md" />
          </div>
        </div>
        <div
          className="pointer-events-none flex w-11 shrink-0 flex-col items-center gap-2 self-start pt-0.5"
          data-people-plans-groups-feed-skeleton-rail="true"
          data-people-groups-skeleton-rail="true"
        >
          <Pulse shimmer className="h-11 w-11 shrink-0 rounded-full" />
        </div>
      </div>
    </article>
  );
}

export default function PeoplePlansGroupsFeedSkeleton({
  variant = "initial",
  surface = "groups",
}: {
  variant?: PeoplePlansGroupsFeedSkeletonVariant;
  /** Open Plans uses Discover-style geometry; Groups keeps feed-row until redesigned. */
  surface?: PeoplePlansGroupsFeedSkeletonSurface;
}) {
  const count = rowCount(variant);
  const Row = surface === "plans" ? PlansSkeletonRow : GroupsSkeletonRow;
  return (
    <div
      className="mx-auto w-full min-w-0"
      style={{
        ...peopleFeedCssVars(),
        maxWidth: "var(--people-feed-max-w, 640px)",
        paddingLeft: "var(--people-feed-gutter, var(--gutter))",
        paddingRight: "var(--people-feed-gutter, var(--gutter))",
      }}
      data-people-plans-groups-feed-skeleton="true"
      data-people-plans-groups-feed-skeleton-variant={variant}
      data-people-plans-groups-feed-skeleton-surface={surface}
      data-people-plans-groups-feed-skeleton-count={String(count)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <Row key={index} />
      ))}
    </div>
  );
}
