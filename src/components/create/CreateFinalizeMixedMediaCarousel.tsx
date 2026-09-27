import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PiFilmStrip } from "react-icons/pi";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/swiper.css";
import type { DraftMediaOrderItem } from "../../lib/createDraftMediaOrder";
import {
  MIXED_HERO_SWIPE_NO_SELECTOR,
  MIXED_HERO_SWIPE_THRESHOLD_PX,
  clampCarouselCommitIndex,
  clampTranslateToAdjacent,
  mixedCarouselSlideIds,
  resolveHeroIndexForClientId,
  shouldAllowMixedHeroSwipe,
} from "../../lib/createFinalizeMixedMedia";
import { classifyHeroPointerGesture } from "../../lib/createFinalizeVideoGestures";
import { useCreateImagePreviewSrc } from "../../lib/createDraftImage/useCreateImagePreviewSrc";
import {
  hasActivePostVideo,
  isPublishPhaseVideoJob,
  type PostVideoUploadJob,
} from "../../lib/createPostVideoUpload";
import ImageLightbox from "../ImageLightbox";
import ProgressiveImage from "../ui/ProgressiveImage";
import CreateFinalizeVideoPlayer from "./CreateFinalizeVideoPlayer";

type Props = {
  mediaOrder: DraftMediaOrderItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  videoJob: PostVideoUploadJob | null;
  videoObjectUrl: string | null;
  dockExpanded: boolean;
  mediaDragActive: boolean;
};

function videoStatusLabel(status: string, progress: number): string | null {
  if (status === "local" || status === "local_error") return null;
  if (status === "publish_uploading") return `${progress}%`;
  if (status === "publish_processing") return "Processing";
  if (status === "preparing") return "Preparing";
  if (status === "uploading") return `${progress}%`;
  if (status === "processing") return "Processing";
  if (status === "ready") return null;
  return "Failed";
}

function MixedImageSlide({
  url,
  clientId,
  isPriority,
  enableLightbox,
}: {
  url: string;
  clientId: string;
  isPriority: boolean;
  enableLightbox: boolean;
}) {
  const [open, setOpen] = useState(false);
  const gestureRef = useRef<{ startX: number; startY: number; slide: boolean } | null>(
    null,
  );
  const resolved = useCreateImagePreviewSrc(url, clientId);

  if (!resolved) {
    return (
      <div className="grid h-full w-full place-items-center bg-black">
        <span className="block h-full w-full bg-[var(--surface-2)]" />
      </div>
    );
  }

  return (
    <>
      <div
        className="grid h-full w-full place-items-center bg-black"
        style={{ cursor: enableLightbox ? "zoom-in" : "default" }}
        aria-label={enableLightbox ? "View full size" : undefined}
        onPointerDown={(e) => {
          gestureRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            slide: false,
          };
        }}
        onPointerMove={(e) => {
          const g = gestureRef.current;
          if (!g) return;
          if (
            classifyHeroPointerGesture(e.clientX - g.startX, e.clientY - g.startY) ===
            "slide"
          ) {
            g.slide = true;
          }
        }}
        onPointerUp={() => {
          const g = gestureRef.current;
          gestureRef.current = null;
          if (!enableLightbox || g?.slide) return;
          setOpen(true);
        }}
        onPointerCancel={() => {
          gestureRef.current = null;
        }}
      >
        <ProgressiveImage
          src={resolved}
          alt=""
          className="h-full w-full max-h-full max-w-full select-none object-contain"
          viewportWidth={800}
          rootMargin="400px"
          priority={isPriority}
        />
      </div>
      {enableLightbox ? (
        <ImageLightbox src={resolved} open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function MixedVideoSlide({
  job,
  objectUrl,
  isActiveHero,
  dockExpanded,
}: {
  job: PostVideoUploadJob;
  objectUrl: string | null;
  isActiveHero: boolean;
  dockExpanded: boolean;
}) {
  const remotePosterOnly =
    !objectUrl &&
    !job.localPosterUrl &&
    job.status === "ready" &&
    typeof job.posterUrl === "string" &&
    Boolean(job.posterUrl);
  const posterSrc =
    job.localPosterUrl ?? (remotePosterOnly ? job.posterUrl! : null);
  const statusLabel = videoStatusLabel(job.status, job.progress);
  const publishUploading =
    job.status === "publish_uploading" ? job.progress : null;
  const showLegacyUploadBar =
    (job.status === "uploading" || job.status === "preparing") &&
    !isPublishPhaseVideoJob(job);

  if (objectUrl) {
    return (
      <div className="relative h-full w-full" data-finalize-hero-video>
        <CreateFinalizeVideoPlayer
          src={objectUrl}
          poster={posterSrc}
          isActiveHero={isActiveHero}
          dockExpanded={dockExpanded}
          uploadProgress={publishUploading}
        />
        {showLegacyUploadBar ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-1 bg-white/20"
            aria-hidden
          >
            <div
              className="h-full bg-[var(--create-chooser-cta-selected-surface)] transition-[width] duration-150"
              style={{
                width: `${Math.max(0, Math.min(100, job.progress))}%`,
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (posterSrc) {
    return (
      <div className="h-full w-full" data-finalize-hero-video>
        <img
          src={posterSrc}
          alt=""
          className="block h-full w-full object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full" data-finalize-hero-video>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-4 text-center">
        <PiFilmStrip className="h-10 w-10 text-white/55" aria-hidden />
        {statusLabel ? (
          <span className="text-sm font-medium text-white/75">{statusLabel}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function CreateFinalizeMixedMediaCarousel({
  mediaOrder,
  activeIndex,
  onActiveIndexChange,
  videoJob,
  videoObjectUrl,
  dockExpanded,
  mediaDragActive,
}: Props) {
  const swiperRef = useRef<SwiperType | null>(null);
  const swipeStartIndexRef = useRef(0);
  const selectedClientIdRef = useRef<string | null>(
    mediaOrder[activeIndex]?.clientId ?? null,
  );
  const orderKey = mixedCarouselSlideIds(mediaOrder).join("|");
  const prevOrderKeyRef = useRef(orderKey);
  const snapWithoutAnimationRef = useRef(false);
  const slideCount = mediaOrder.length;
  const allowSwipe = shouldAllowMixedHeroSwipe({
    dockExpanded,
    mediaDragActive,
    slideCount,
  });
  const hasVideo = hasActivePostVideo(videoJob);

  useLayoutEffect(() => {
    const orderChanged = prevOrderKeyRef.current !== orderKey;
    prevOrderKeyRef.current = orderKey;
    if (orderChanged) {
      snapWithoutAnimationRef.current = true;
      const next = resolveHeroIndexForClientId(
        mediaOrder,
        selectedClientIdRef.current,
        activeIndex,
      );
      if (next !== activeIndex) {
        onActiveIndexChange(next);
        return;
      }
    }
    const item = mediaOrder[activeIndex];
    if (item) selectedClientIdRef.current = item.clientId;
  }, [activeIndex, mediaOrder, onActiveIndexChange, orderKey]);

  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper || slideCount <= 0) return;
    const target = Math.max(0, Math.min(slideCount - 1, activeIndex));
    if (swiper.activeIndex === target) {
      snapWithoutAnimationRef.current = false;
      return;
    }
    const speed =
      snapWithoutAnimationRef.current || mediaDragActive ? 0 : 380;
    snapWithoutAnimationRef.current = false;
    swiper.slideTo(target, speed);
  }, [activeIndex, slideCount, mediaDragActive, orderKey]);

  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    swiper.allowTouchMove = allowSwipe;
  }, [allowSwipe]);

  if (slideCount <= 0) return null;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-finalize-mixed-carousel
    >
      <Swiper
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
          swiper.allowTouchMove = allowSwipe;
          const target = Math.max(0, Math.min(slideCount - 1, activeIndex));
          if (swiper.activeIndex !== target) swiper.slideTo(target, 0);
        }}
        slidesPerView={1}
        slidesPerGroup={1}
        spaceBetween={0}
        speed={380}
        threshold={MIXED_HERO_SWIPE_THRESHOLD_PX}
        followFinger
        resistance
        watchOverflow
        nested
        loop={false}
        rewind={false}
        noSwiping
        noSwipingSelector={MIXED_HERO_SWIPE_NO_SELECTOR}
        allowTouchMove={allowSwipe}
        touchStartPreventDefault={false}
        preventClicks={false}
        preventClicksPropagation={false}
        className="relative z-0 h-full w-full [&_.swiper-wrapper]:h-full [&_.swiper-slide]:box-border [&_.swiper-slide]:h-full [&_.swiper-slide]:w-full"
        onTouchStart={(swiper) => {
          swipeStartIndexRef.current = swiper.activeIndex;
        }}
        onSliderMove={(swiper) => {
          const next = clampTranslateToAdjacent(
            swiper.translate,
            swipeStartIndexRef.current,
            slideCount,
            swiper.width || 1,
          );
          if (next !== swiper.translate) {
            swiper.setTranslate(next);
          }
        }}
        onTouchEnd={(swiper) => {
          const clamped = clampCarouselCommitIndex(
            swipeStartIndexRef.current,
            swiper.activeIndex,
            slideCount,
          );
          if (clamped !== swiper.activeIndex) {
            swiper.slideTo(clamped);
          }
        }}
        onSlideChange={(swiper) => {
          if (swiper.activeIndex !== activeIndex) {
            onActiveIndexChange(swiper.activeIndex);
          }
        }}
      >
        {mediaOrder.map((item, index) => {
          const isActive = index === activeIndex;
          const isPriority =
            index === activeIndex ||
            index === activeIndex - 1 ||
            index === activeIndex + 1;
          return (
            <SwiperSlide
              key={item.clientId}
              data-finalize-mixed-slide={item.kind}
              data-finalize-mixed-slide-id={item.clientId}
            >
              {item.kind === "video" && videoJob && hasVideo ? (
                <MixedVideoSlide
                  job={videoJob}
                  objectUrl={videoObjectUrl}
                  isActiveHero={isActive}
                  dockExpanded={dockExpanded}
                />
              ) : item.kind === "image" ? (
                <MixedImageSlide
                  url={item.url}
                  clientId={item.clientId}
                  isPriority={isPriority}
                  enableLightbox
                />
              ) : (
                <div className="h-full w-full bg-black" />
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}
