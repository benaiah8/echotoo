/**
 * Fixed-footprint Group source-media plate.
 * Outer size comes from People Mine CSS vars; Feed-style media fits inside via
 * PeopleGroupPublishedMediaSurface (Groups-owned — not PublishedMediaSurface).
 * Video → poster + play affordance (opens source Post Detail; no inline player).
 * Image tap-cycles when multi; Prev/Next navigate mixed media explicitly.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { PiCaretLeftBold, PiCaretRightBold } from "react-icons/pi";
import type { PublishedMediaItem } from "../../lib/publishedMedia";
import { peopleIdentityMovedPastTapThreshold } from "../../lib/people/mineIdentityGesture";
import {
  PEOPLE_MINE_CARD_RADIUS,
  PEOPLE_MINE_FRONT_SHADOW,
  PEOPLE_MINE_UNSEEN_FRONT_SHADOW,
  peopleMineUnseenEdgeRingStyle,
} from "../../lib/people/peopleCandidateMediaPresentation";
import {
  GROUP_MEDIA_NAV_BTN_HIT_PX,
  GROUP_MEDIA_NAV_BTN_VISUAL_PX,
  GROUP_MEDIA_NAV_INSET_PX,
  groupMediaNextIndex,
  groupMediaPrevIndex,
  groupMediaSurfaceTapAdvances,
} from "../../lib/people/groupPublishedMediaPresentation";
import { groupAtmospherePathFromMedia } from "../../lib/people/groupSourceMedia";
import type { PeopleMineAtmosphereReport } from "./PeopleCandidateMedia";
import PeopleGroupPublishedMediaSurface from "./PeopleGroupPublishedMediaSurface";

function isolateMediaNavEvent(
  e: ReactPointerEvent | ReactMouseEvent,
): void {
  e.preventDefault();
  e.stopPropagation();
}

export default function PeopleGroupSourceMedia({
  items,
  mediaPending = false,
  isUnseen = false,
  activeIndex,
  onActiveIndexChange,
  isCurrent,
  enableTapCycle,
  identityKey,
  onAtmosphereChange,
  hostNotch,
  groupTitle,
  onOpenSourcePost,
}: {
  items: readonly PublishedMediaItem[];
  /** True until published-media map has settled for this source post. */
  mediaPending?: boolean;
  /** Groups New unseen — brand-accent plate edge. */
  isUnseen?: boolean;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  isCurrent: boolean;
  enableTapCycle: boolean;
  /** Atmosphere identity — opportunity id; stable across media cycle. */
  identityKey: string;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
  hostNotch: React.ReactNode;
  groupTitle: string;
  /**
   * Opens source Post Detail at the current media key.
   * Used by: single-image tap, video poster/play affordance, and parent See post.
   */
  onOpenSourcePost?: () => void;
}) {
  const count = items.length;
  const safeIndex = count > 0 ? Math.max(0, Math.min(count - 1, activeIndex)) : 0;
  const showMediaNav = count > 1;

  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!onAtmosphereChange) return;
    if (mediaPending) {
      onAtmosphereChange({
        identityKey,
        path: null,
        ready: false,
      });
      return;
    }
    const path = groupAtmospherePathFromMedia(items);
    onAtmosphereChange({
      identityKey,
      path,
      ready: true,
    });
  }, [identityKey, items, mediaPending, onAtmosphereChange]);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    onActiveIndexChange(groupMediaPrevIndex(safeIndex, count));
  }, [count, onActiveIndexChange, safeIndex]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    onActiveIndexChange(groupMediaNextIndex(safeIndex, count));
  }, [count, onActiveIndexChange, safeIndex]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    pointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const start = pointerRef.current;
      pointerRef.current = null;
      if (!isCurrent || !start) return;
      const target = e.target;
      if (
        target &&
        typeof (target as { closest?: unknown }).closest === "function"
      ) {
        const el = target as Element;
        if (el.closest("[data-people-group-host-notch]")) return;
        if (el.closest("[data-people-group-media-nav]")) return;
        // Video poster button owns its own open-post action.
        if (el.closest("[data-people-group-video-open]")) return;
      }
      if (
        peopleIdentityMovedPastTapThreshold(start, e.clientX, e.clientY)
      ) {
        return;
      }
      // Multi-image: tap-cycle owns the media surface (no inner Swiper).
      // Video does not advance index (use Prev/Next or poster open).
      if (
        enableTapCycle &&
        groupMediaSurfaceTapAdvances(items, safeIndex)
      ) {
        onActiveIndexChange(groupMediaNextIndex(safeIndex, count));
        return;
      }
      // Single image: open source post. Video opens via poster affordance only.
      if (
        count <= 1 &&
        onOpenSourcePost &&
        items[safeIndex]?.kind !== "video"
      ) {
        onOpenSourcePost();
      }
    },
    [
      count,
      enableTapCycle,
      isCurrent,
      items,
      onActiveIndexChange,
      onOpenSourcePost,
      safeIndex,
    ],
  );

  const title = groupTitle.trim() || "Group";
  const inset = GROUP_MEDIA_NAV_INSET_PX;
  const activeItem = count > 0 ? items[safeIndex] ?? null : null;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        borderRadius: PEOPLE_MINE_CARD_RADIUS,
        boxShadow: isUnseen
          ? PEOPLE_MINE_UNSEEN_FRONT_SHADOW
          : PEOPLE_MINE_FRONT_SHADOW,
      }}
      data-people-group-source-media="true"
      data-people-group-media-unseen={isUnseen ? "true" : "false"}
      data-people-group-media-count={count}
      data-people-group-media-index={safeIndex}
      data-people-group-media-inner-swiper="false"
      data-people-group-media-active-kind={activeItem?.kind ?? "empty"}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerRef.current = null;
      }}
    >
      {isUnseen ? (
        <div
          aria-hidden
          data-people-mine-unseen-edge="true"
          data-people-group-media-unseen-edge="true"
          className="absolute inset-0 z-[3]"
          style={peopleMineUnseenEdgeRingStyle(PEOPLE_MINE_CARD_RADIUS)}
        />
      ) : null}
      <PeopleGroupPublishedMediaSurface
        items={items}
        activeIndex={safeIndex}
        priority={isCurrent}
        mediaPending={mediaPending}
        onOpenVideoPost={
          isCurrent && activeItem?.kind === "video"
            ? onOpenSourcePost
            : undefined
        }
      />

      <div
        className="pointer-events-none absolute inset-x-3 top-3 z-[2] flex justify-center"
        data-people-group-host-slot="true"
      >
        {hostNotch}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] pt-14"
        style={{
          paddingLeft: inset,
          paddingRight: inset,
          paddingBottom: inset,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.68) 40%, rgba(0,0,0,0.32) 70%, transparent 100%)",
        }}
        data-people-group-title-band="true"
        data-people-group-media-chrome="true"
      >
        {showMediaNav ? (
          <div
            className="mb-2 flex items-center justify-center gap-1"
            data-people-group-media-dots="true"
            aria-hidden
          >
            {items.map((_, i) => (
              <span
                key={i}
                className={[
                  "h-[3px] w-3 rounded-full",
                  i === safeIndex ? "bg-white/90" : "bg-white/35",
                ].join(" ")}
              />
            ))}
          </div>
        ) : null}

        <div
          className="flex items-center gap-2"
          data-people-group-media-chrome-row="true"
        >
          {showMediaNav ? (
            <button
              type="button"
              data-people-group-media-nav="prev"
              aria-label="Previous media"
              tabIndex={isCurrent ? 0 : -1}
              disabled={!isCurrent}
              className={[
                "pointer-events-auto relative z-[3] flex shrink-0 items-center justify-center touch-manipulation",
                "disabled:opacity-100",
                isCurrent ? "pointer-events-auto" : "pointer-events-none",
              ].join(" ")}
              style={{
                width: GROUP_MEDIA_NAV_BTN_HIT_PX,
                height: GROUP_MEDIA_NAV_BTN_HIT_PX,
              }}
              onPointerDown={isolateMediaNavEvent}
              onPointerUp={(e) => {
                isolateMediaNavEvent(e);
                if (!isCurrent || e.button !== 0) return;
                goPrev();
              }}
              onClick={isolateMediaNavEvent}
            >
              <span
                className="flex items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-sm backdrop-blur-md"
                style={{
                  width: GROUP_MEDIA_NAV_BTN_VISUAL_PX,
                  height: GROUP_MEDIA_NAV_BTN_VISUAL_PX,
                }}
                aria-hidden
              >
                <PiCaretLeftBold className="h-4 w-4" />
              </span>
            </button>
          ) : null}

          <h2
            className={[
              "min-w-0 flex-1 text-center line-clamp-2 font-[family-name:var(--font-people-display)] text-[14px] font-semibold leading-snug tracking-wide text-white",
              showMediaNav ? "px-1" : "",
            ].join(" ")}
            data-people-group-title="true"
            data-people-group-title-centered="true"
          >
            {title}
          </h2>

          {showMediaNav ? (
            <button
              type="button"
              data-people-group-media-nav="next"
              aria-label="Next media"
              tabIndex={isCurrent ? 0 : -1}
              disabled={!isCurrent}
              className={[
                "pointer-events-auto relative z-[3] flex shrink-0 items-center justify-center touch-manipulation",
                "disabled:opacity-100",
                isCurrent ? "pointer-events-auto" : "pointer-events-none",
              ].join(" ")}
              style={{
                width: GROUP_MEDIA_NAV_BTN_HIT_PX,
                height: GROUP_MEDIA_NAV_BTN_HIT_PX,
              }}
              onPointerDown={isolateMediaNavEvent}
              onPointerUp={(e) => {
                isolateMediaNavEvent(e);
                if (!isCurrent || e.button !== 0) return;
                goNext();
              }}
              onClick={isolateMediaNavEvent}
            >
              <span
                className="flex items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-sm backdrop-blur-md"
                style={{
                  width: GROUP_MEDIA_NAV_BTN_VISUAL_PX,
                  height: GROUP_MEDIA_NAV_BTN_VISUAL_PX,
                }}
                aria-hidden
              >
                <PiCaretRightBold className="h-4 w-4" />
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
