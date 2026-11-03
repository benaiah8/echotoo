/**
 * Discover feed placeholder. Matches the live person row + opportunity box:
 * centered 4:5 portrait, compact meta (type/date/See Post), caption, and
 * top-right Heart/Comment. Initial load applies the feed column gutter so
 * margins match PeopleFeedList; pagination relies on the list inner pad.
 */
import { PiChatCircleBold, PiHeartBold } from "react-icons/pi";
import {
  PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
  PEOPLE_FEED_MEDIA_RADIUS,
  peopleFeedCssVars,
} from "../../lib/people/peopleFeedLayout";
import "./PeopleDiscoverFeedSkeleton.css";

export type PeopleDiscoverFeedSkeletonVariant = "initial" | "pagination";

function rowCount(variant: PeopleDiscoverFeedSkeletonVariant): number {
  return variant === "pagination" ? 1 : 2;
}

const PULSE =
  "bg-[var(--text)]/10 animate-pulse motion-reduce:animate-none";

/** Idle Discover action chrome — matches live size-44 heart/comment idle. */
const ACTION_CIRCLE = [
  "inline-flex h-11 w-11 items-center justify-center rounded-full",
  "bg-[var(--text)]/10 text-[var(--text)]/90",
  "app-dark:bg-white/14 app-dark:text-white/90",
  "opacity-45",
].join(" ");

/** Compact See Post geometry — matches PeopleDiscoverOpportunityBox. */
const SEE_POST_PULSE =
  "h-5 w-[4.75rem] max-w-full shrink-0 rounded-md";

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
        shimmer ? "people-discover-feed-shimmer" : PULSE,
        className,
      ].join(" ")}
      aria-hidden
    />
  );
}

function SkeletonRow() {
  return (
    <article
      className="w-full border-t border-[var(--border)] first:border-t-0"
      style={{
        paddingTop: "var(--people-discover-person-pad-y, 20px)",
        paddingBottom: "var(--people-discover-person-pad-y, 20px)",
      }}
      data-people-discover-feed-skeleton-row="true"
      aria-hidden
    >
      <div
        className="flex w-full justify-center"
        data-people-discover-skeleton-portrait-wrap="true"
      >
        <div
          className="people-discover-feed-shimmer relative w-full overflow-hidden"
          style={{
            width: "min(100%, var(--people-discover-photo-max-w, 26rem))",
            aspectRatio: "var(--people-discover-photo-aspect, 4 / 5)",
            borderRadius: PEOPLE_FEED_MEDIA_RADIUS,
            boxShadow: PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
          }}
          data-people-discover-skeleton-portrait="true"
        />
      </div>

      <div
        className="mt-3 flex min-w-0 flex-col gap-2"
        data-people-discover-skeleton-opp-stack="true"
      >
        <div
          className="flex min-w-0 items-start gap-1.5 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/40 py-2.5 pl-3 pr-2"
          data-people-discover-skeleton-opp="true"
          data-people-discover-opp-pad="px-3"
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5"
              data-people-discover-skeleton-meta="true"
            >
              <Pulse className="h-5 w-14 shrink-0 rounded-md" />
              <Pulse className="h-5 w-16 min-w-0 max-w-full rounded-md" />
              <div data-people-discover-skeleton-see-post="true">
                <Pulse className={SEE_POST_PULSE} />
              </div>
            </div>
            {/*
              Default live cards use a 3-line caption and omit the note block.
              No note divider here — avoids height jump into caption-only content.
            */}
            <div
              className="mt-1.5 flex flex-col gap-1.5"
              data-people-discover-skeleton-caption="true"
              data-people-discover-skeleton-caption-lines="3"
            >
              <Pulse className="h-3 w-[94%] max-w-full rounded-md" />
              <Pulse className="h-3 w-[88%] max-w-full rounded-md" />
              <Pulse className="h-3 w-[62%] max-w-full rounded-md" />
            </div>
          </div>

          <div
            className="pointer-events-none flex w-11 shrink-0 flex-col items-center gap-2 self-start pt-0.5"
            data-people-discover-skeleton-actions="true"
            data-people-discover-opp-actions-align="top-right"
          >
            <button
              type="button"
              disabled
              tabIndex={-1}
              className={ACTION_CIRCLE}
              data-people-discover-skeleton-heart="true"
              aria-hidden
            >
              <PiHeartBold className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              disabled
              tabIndex={-1}
              className={ACTION_CIRCLE}
              data-people-discover-skeleton-comment="true"
              aria-hidden
            >
              <PiChatCircleBold className="h-6 w-6" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function PeopleDiscoverFeedSkeleton({
  variant = "initial",
}: {
  variant?: PeopleDiscoverFeedSkeletonVariant;
}) {
  const count = rowCount(variant);
  /**
   * Initial load mounts outside PeopleFeedList — apply the same column shell.
   * Pagination mounts inside the list inner (already guttered) — stay full width.
   */
  const columnShell =
    variant === "initial"
      ? {
          ...peopleFeedCssVars(),
          maxWidth: "var(--people-feed-max-w, 640px)",
          paddingLeft: "var(--people-feed-gutter, var(--gutter))",
          paddingRight: "var(--people-feed-gutter, var(--gutter))",
        }
      : undefined;

  return (
    <div
      className={
        variant === "initial" ? "mx-auto w-full min-w-0" : "w-full min-w-0"
      }
      style={columnShell}
      data-people-discover-feed-skeleton="true"
      data-people-discover-feed-skeleton-variant={variant}
      data-people-discover-feed-skeleton-count={String(count)}
      data-people-discover-feed-skeleton-column={
        variant === "initial" ? "feed" : "list-inner"
      }
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}
