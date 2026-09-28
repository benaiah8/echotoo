/**
 * Groups-owned Feed-style published media canvas.
 *
 * Isolated from PublishedMediaSurface / MediaCarousel — those must not gain a
 * Groups mode. Reuses ProgressiveImage + PublishedMediaItem + visual URL helpers.
 *
 * Video is poster-only (no inline player mount). Tap opens source Post Detail.
 * Fits media INSIDE a fixed People card (object-contain / fill+contain).
 * No inner Swiper — parent PeopleGroupSourceMedia owns image tap-cycle / Prev/Next.
 */
import { PiPlayFill } from "react-icons/pi";
import type { PublishedMediaItem } from "../../lib/publishedMedia";
import ProgressiveImage from "../ui/ProgressiveImage";
import VideoPlaybackLoadingSpinner from "../ui/VideoPlaybackLoadingSpinner";
import {
  GROUP_PUBLISHED_IMAGE_FIT,
  GROUP_PUBLISHED_IMAGE_LAYOUT,
  GROUP_PUBLISHED_MEDIA_PLATE_BG,
  GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER,
  groupPublishedActiveVisual,
  resolveGroupPublishedMediaKind,
} from "../../lib/people/groupPublishedMediaPresentation";

export default function PeopleGroupPublishedMediaSurface({
  items,
  activeIndex,
  priority = false,
  mediaPending = false,
  onOpenVideoPost,
}: {
  items: readonly PublishedMediaItem[];
  activeIndex: number;
  /** Prefer eager decode for the current Groups card. */
  priority?: boolean;
  /**
   * Enrichment still in flight — show loading instead of authoritative no-media.
   * Only for blank plates; ProgressiveImage keeps its own blur placeholder when URL exists.
   */
  mediaPending?: boolean;
  /** Video poster / play affordance → source Post Detail (no inline play). */
  onOpenVideoPost?: () => void;
}) {
  const kind = resolveGroupPublishedMediaKind(items);
  const { item, url, isVideo } = groupPublishedActiveVisual(items, activeIndex);
  const videoItem = item?.kind === "video" ? item : null;
  const videoInteractive = Boolean(onOpenVideoPost && videoItem);
  const showPendingLoading = mediaPending && !url && !videoItem;

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${GROUP_PUBLISHED_MEDIA_PLATE_BG} ${
        isVideo ? "pointer-events-auto" : "pointer-events-none"
      }`}
      data-people-group-published-media="true"
      data-people-group-published-kind={kind}
      data-people-group-media-pending={mediaPending ? "true" : "false"}
      data-people-group-published-inner-swiper={
        GROUP_PUBLISHED_MEDIA_USES_INNER_SWIPER ? "true" : "false"
      }
      data-people-group-published-item-key={item?.key ?? ""}
      data-people-group-published-video={isVideo ? "true" : "false"}
      data-people-group-video-playback="poster-only"
      aria-hidden={!isVideo}
    >
      {videoItem ? (
        <div
          className="absolute inset-0 h-full w-full bg-black"
          data-people-group-published-frame="true"
          data-published-media-fit="contain"
          data-people-group-video-poster="true"
        >
          {url ? (
            <div className="absolute inset-0 grid h-full w-full place-items-center bg-black">
              <ProgressiveImage
                src={url}
                alt=""
                layout={GROUP_PUBLISHED_IMAGE_LAYOUT}
                fit={GROUP_PUBLISHED_IMAGE_FIT}
                fillMinHeight={false}
                className="pointer-events-none h-full w-full max-h-full max-w-full select-none"
                viewportWidth={800}
                rootMargin="120px"
                priority={priority}
              />
            </div>
          ) : null}
          {videoInteractive ? (
            <button
              type="button"
              data-people-group-video-open="true"
              aria-label="Open video in source post"
              className="absolute inset-0 z-[1] flex items-center justify-center bg-transparent touch-manipulation"
              onClick={(e) => {
                e.stopPropagation();
                onOpenVideoPost?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <span
                className="pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white shadow-sm backdrop-blur-md"
                data-people-group-video-play-affordance="true"
                aria-hidden
              >
                <PiPlayFill className="ml-0.5 h-6 w-6" />
              </span>
            </button>
          ) : (
            <div
              className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
              data-people-group-video-play-affordance="true"
              aria-hidden
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white shadow-sm backdrop-blur-md">
                <PiPlayFill className="ml-0.5 h-6 w-6" />
              </span>
            </div>
          )}
          <span
            className="sr-only"
            data-people-group-video-meta="true"
            data-video-id={videoItem.videoId ?? ""}
            data-video-status={videoItem.status}
            data-video-width={videoItem.width ?? ""}
            data-video-height={videoItem.height ?? ""}
            data-video-poster={videoItem.posterUrl ?? ""}
          />
        </div>
      ) : url ? (
        <div
          className="absolute inset-0 grid h-full w-full place-items-center bg-black"
          data-people-group-published-frame="true"
          data-published-media-fit="contain"
        >
          <ProgressiveImage
            src={url}
            alt=""
            layout={GROUP_PUBLISHED_IMAGE_LAYOUT}
            fit={GROUP_PUBLISHED_IMAGE_FIT}
            fillMinHeight={false}
            className="pointer-events-none h-full w-full max-h-full max-w-full select-none"
            viewportWidth={800}
            rootMargin="120px"
            priority={priority}
          />
        </div>
      ) : showPendingLoading ? (
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          data-people-group-media-loading="true"
        >
          <VideoPlaybackLoadingSpinner />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 bg-[var(--surface-2)]"
          data-people-group-no-media="true"
        />
      )}
    </div>
  );
}
