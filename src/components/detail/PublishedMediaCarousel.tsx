/**
 * Post Detail mixed media carousel (images + published video).
 * Swiper interaction aligned with Create mixed carousel; dots below frame.
 * Opens mixed PublishedMediaFullscreenViewer (image ↔ video ↔ image).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/swiper.css";

import {
  adjacentSlideTranslateRange,
  clampCarouselCommitIndex,
  clampTranslateToAdjacent,
  MIXED_HERO_SWIPE_THRESHOLD_PX,
} from "../../lib/createFinalizeMixedMedia";
import {
  PUBLISHED_MEDIA_SWIPE_NO_SELECTOR,
  isPublishedVideoOnly,
  isPublishedSingleImage,
  mergePublishedVideoDimensions,
  patchPublishedMediaRow,
  publishedMediaFrameStyle,
  publishedMediaViewerKey,
  usePublishedMultiMediaFrame,
  resolvePublishedCarouselInitialIndex,
  resolvePublishedCarouselIndexAfterItemsChange,
  shouldAcceptPublishedCarouselSlideChange,
  markPublishedCarouselInitialKeyApplied,
  consumePublishedVideoListToDetailHandoffIfEligible,
  writePublishedVideoListReturnHandoff,
  isPublishedVideoListHandoffOrigin,
  type PublishedMediaItem,
  type PublishedVideoPlaybackSnapshot,
  type PublishedVideoListHandoffOrigin,
} from "../../lib/publishedMedia";
import { usePostDetailDismiss } from "../../context/PostDetailDismissContext";
import PublishedMediaFullscreenViewer from "../PublishedMediaFullscreenViewer";
import ProgressiveImage from "../ui/ProgressiveImage";
import PublishedVideoPlayer from "./PublishedVideoPlayer";

type Props = {
  items: PublishedMediaItem[];
  maxHeight?: string;
  className?: string;
  /** When false, show a stable empty black shell (loading). */
  ready?: boolean;
  enableLightbox?: boolean;
  /** Stable media key to open on (`video:{id}` / `image:{url}`). */
  initialMediaKey?: string;
  /**
   * One-shot from Feed/Profile video expand: open immersive fullscreen once
   * after Detail media is ready. Consumed via ref — does not reopen on close.
   */
  openImmersiveFullscreen?: boolean;
  postId?: string;
  viewerUserId?: string | null;
  /** Pass 3F: originating list surface; required to consume/write list handoff. */
  listPlaybackOrigin?: PublishedVideoListHandoffOrigin;
  listPlaybackHandoffSessionId?: number;
};

function ImageSlide({
  url,
  isPriority,
  onTap,
  naturalHeight,
  onNaturalSize,
}: {
  url: string;
  isPriority: boolean;
  onTap: () => void;
  naturalHeight?: boolean;
  onNaturalSize?: (width: number, height: number) => void;
}) {
  return (
    <div
      className={
        naturalHeight
          ? "grid w-full place-items-center bg-black"
          : "grid h-full w-full place-items-center bg-black"
      }
      style={{ cursor: "zoom-in" }}
      role="button"
      tabIndex={0}
      aria-label="View full size"
      data-published-image-slide
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
    >
      <ProgressiveImage
        src={url}
        alt=""
        layout={naturalHeight ? "natural" : "fill"}
        fit={naturalHeight ? "contain" : "cover"}
        fillMinHeight={naturalHeight ? undefined : false}
        className={
          naturalHeight
            ? "pointer-events-none w-full max-w-full select-none"
            : "pointer-events-none h-full w-full max-h-full max-w-full select-none"
        }
        viewportWidth={800}
        rootMargin="400px"
        priority={isPriority}
        onNaturalSize={onNaturalSize}
      />
    </div>
  );
}

function PublishedMediaPagination({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  if (count <= 1) return null;
  return (
    <div
      className="mt-1.5 mb-0.5 flex items-center justify-center gap-1.5"
      data-published-media-pagination
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => {
        const active = i === activeIndex;
        return (
          <span
            key={i}
            data-published-media-dot={i}
            data-active={active ? "true" : "false"}
            className={`h-2 rounded-full transition ${
              active
                ? "w-4 bg-[var(--text)]"
                : "w-2 bg-[var(--text)]/50"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function PublishedMediaCarousel({
  items,
  maxHeight = "50vh",
  className = "",
  ready = true,
  enableLightbox = true,
  initialMediaKey,
  openImmersiveFullscreen = false,
  postId,
  viewerUserId = null,
  listPlaybackOrigin,
  listPlaybackHandoffSessionId,
}: Props) {
  const swiperRef = useRef<SwiperType | null>(null);
  const swipeStartIndexRef = useRef(0);
  const gestureMovedRef = useRef(false);
  const closingFullscreenRef = useRef(false);
  /** Set only after Swiper has reached the intended initial slide. */
  const initialKeyAppliedRef = useRef<string | null>(null);
  /** One-shot Feed expand → immersive fullscreen (survives location.state staying true). */
  const immersiveFullscreenConsumedRef = useRef(false);
  const indexRef = useRef(
    resolvePublishedCarouselInitialIndex(items, initialMediaKey),
  );

  const [index, setIndex] = useState(() =>
    resolvePublishedCarouselInitialIndex(items, initialMediaKey),
  );
  const [mediaItems, setMediaItems] = useState(items);
  const mediaItemsRef = useRef(mediaItems);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenMediaKey, setFullscreenMediaKey] = useState(
    () => initialMediaKey ?? items[0]?.key ?? "",
  );
  /** Pass 3B: Detail → fullscreen entry snapshot (set before open). */
  const [fullscreenEntryHandoff, setFullscreenEntryHandoff] =
    useState<PublishedVideoPlaybackSnapshot | null>(null);
  /** Pass 3B: fullscreen → Detail return snapshot. */
  const [detailReturnHandoff, setDetailReturnHandoff] =
    useState<PublishedVideoPlaybackSnapshot | null>(null);
  /** Pass 3E/3G: Feed → Detail entry snapshot (consumed on first render). */
  const feedEntryConsumedRef = useRef(false);
  const [feedEntryHandoff, setFeedEntryHandoff] =
    useState<PublishedVideoPlaybackSnapshot | null>(() => {
      const result = consumePublishedVideoListToDetailHandoffIfEligible({
        postId,
        items,
        initialMediaKey,
        origin: listPlaybackOrigin,
        sessionId: listPlaybackHandoffSessionId ?? null,
      });
      if (result.attempted) {
        feedEntryConsumedRef.current = true;
      }
      return result.snapshot;
    });
  const playbackHandoffGenerationRef = useRef(0);
  const detailPlaybackCaptureRef = useRef<
    ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null
  >(null);
  const videoOnly = isPublishedVideoOnly(mediaItems);

  // Pass 2C: Detail multi uses the same stable-list lock as Feed (no late resize).
  const { multiAspectRatio, reportImageNaturalSize } =
    usePublishedMultiMediaFrame(mediaItems, { policy: "stable-list" });

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const postDetailDismiss = usePostDetailDismiss();
  const setPublishedMediaFullscreenOpen =
    postDetailDismiss?.setPublishedMediaFullscreenOpen;
  const armPublishedMediaFullscreenClickThroughGuard =
    postDetailDismiss?.armPublishedMediaFullscreenClickThroughGuard;
  const registerFeedReturnPlaybackCapture =
    postDetailDismiss?.registerFeedReturnPlaybackCapture;

  useEffect(() => {
    setPublishedMediaFullscreenOpen?.(fullscreenOpen);
    return () => {
      setPublishedMediaFullscreenOpen?.(false);
    };
  }, [fullscreenOpen, setPublishedMediaFullscreenOpen]);

  // Pass 3E/3F/3G: consume list → Detail on first eligible render (initializer
  // covers the common path; this retries if items were not video-only yet).
  useEffect(() => {
    if (feedEntryConsumedRef.current) return;
    const result = consumePublishedVideoListToDetailHandoffIfEligible({
      postId,
      items: mediaItems,
      initialMediaKey,
      origin: listPlaybackOrigin,
      sessionId: listPlaybackHandoffSessionId ?? null,
    });
    if (!result.attempted) return;
    feedEntryConsumedRef.current = true;
    if (result.snapshot) {
      setFeedEntryHandoff(result.snapshot);
    }
  }, [
    postId,
    mediaItems,
    initialMediaKey,
    listPlaybackOrigin,
    listPlaybackHandoffSessionId,
  ]);

  // Pass 3E/3F: register Detail → list capture on modal close (before unmount).
  useEffect(() => {
    if (!registerFeedReturnPlaybackCapture) return;
    if (!postId?.trim()) return;
    if (!isPublishedVideoOnly(mediaItems)) {
      registerFeedReturnPlaybackCapture(null);
      return;
    }
    const video = mediaItems[0];
    if (!video || video.kind !== "video") {
      registerFeedReturnPlaybackCapture(null);
      return;
    }
    if (
      !isPublishedVideoListHandoffOrigin(listPlaybackOrigin) ||
      listPlaybackHandoffSessionId == null ||
      !Number.isFinite(listPlaybackHandoffSessionId)
    ) {
      registerFeedReturnPlaybackCapture(null);
      return;
    }
    const origin = listPlaybackOrigin;
    const sessionId = listPlaybackHandoffSessionId;
    registerFeedReturnPlaybackCapture(() => {
      // Prefer live Detail player; if fullscreen still open, capture is empty —
      // Back/backdrop close FS first via tryConsumePublishedMediaFullscreenBack.
      const snap = detailPlaybackCaptureRef.current?.(sessionId) ?? null;
      if (snap && snap.mediaKey === video.key) {
        writePublishedVideoListReturnHandoff({
          postId,
          origin,
          sessionId,
          snapshot: snap,
        });
      }
    });
    return () => {
      registerFeedReturnPlaybackCapture(null);
    };
  }, [
    registerFeedReturnPlaybackCapture,
    postId,
    mediaItems,
    listPlaybackOrigin,
    listPlaybackHandoffSessionId,
  ]);

  /**
   * Membership / order updates: remap by stable key (or unfinished initialMediaKey).
   * Never mark initialMediaKey applied here — only after Swiper is on that slide.
   * Key remaps go through remapPublishedMediaActiveIndex.
   */
  useEffect(() => {
    const previousKey = mediaItemsRef.current[indexRef.current]?.key;
    const previousIndex = indexRef.current;
    const next = resolvePublishedCarouselIndexAfterItemsChange({
      initialMediaKey,
      appliedKey: initialKeyAppliedRef.current,
      previousKey,
      previousIndex,
      nextItems: items,
    });
    setMediaItems(items);
    mediaItemsRef.current = items;
    setIndex(next);
    indexRef.current = next;

    const swiper = swiperRef.current;
    if (!ready || !swiper) return;
    if (swiper.activeIndex !== next) {
      swiper.slideTo(next, 0);
    }
    initialKeyAppliedRef.current = markPublishedCarouselInitialKeyApplied({
      initialMediaKey,
      appliedKey: initialKeyAppliedRef.current,
      swiperActiveIndex: swiper.activeIndex,
      items,
    });
  }, [items, initialMediaKey, ready]);

  const slideCount = mediaItems.length;
  const swiperInitialSlide = resolvePublishedCarouselInitialIndex(
    mediaItems,
    initialMediaKey,
  );

  const syncSwiperToInitialKey = useCallback(
    (swiper: SwiperType) => {
      const list = mediaItemsRef.current;
      const target = resolvePublishedCarouselInitialIndex(list, initialMediaKey);
      if (swiper.activeIndex !== target) {
        swiper.slideTo(target, 0);
      }
      initialKeyAppliedRef.current = markPublishedCarouselInitialKeyApplied({
        initialMediaKey,
        appliedKey: initialKeyAppliedRef.current,
        swiperActiveIndex: swiper.activeIndex,
        items: list,
      });
      const active = swiper.activeIndex;
      setIndex(active);
      indexRef.current = active;
    },
    [initialMediaKey],
  );

  const onVideoUpdated = useCallback(
    (next: Extract<PublishedMediaItem, { kind: "video" }>) => {
      setMediaItems((prev) =>
        prev.map((item) => {
          if (item.kind !== "video" || item.mediaId !== next.mediaId) return item;
          const dims = mergePublishedVideoDimensions({
            existingWidth: item.width,
            existingHeight: item.height,
            incomingWidth: next.width,
            incomingHeight: next.height,
          });
          return { ...next, key: item.key, width: dims.width, height: dims.height };
        }),
      );
      if (postId) {
        patchPublishedMediaRow({
          postId,
          viewerKey: publishedMediaViewerKey(viewerUserId),
          row: {
            id: next.mediaId,
            post_id: postId,
            sort_order: 0,
            kind: "video",
            bunny_video_id: next.videoId,
            video_status: next.status,
            poster_url: next.posterUrl,
            duration_sec: next.durationSec,
            width: next.width,
            height: next.height,
          },
        });
      }
    },
    [postId, viewerUserId],
  );

  const openFullscreenAt = useCallback(
    (mediaKey: string) => {
      if (!enableLightbox || closingFullscreenRef.current) return;
      // Capture Detail playback BEFORE isActive flips false / tearDown.
      const generation = ++playbackHandoffGenerationRef.current;
      const snap = detailPlaybackCaptureRef.current?.(generation) ?? null;
      setFullscreenEntryHandoff(
        snap && snap.mediaKey === mediaKey ? snap : null,
      );
      setDetailReturnHandoff(null);
      setFullscreenMediaKey(mediaKey);
      setFullscreenOpen(true);
    },
    [enableLightbox],
  );

  // Reset one-shot before consume effect (declaration order) on post change.
  useEffect(() => {
    immersiveFullscreenConsumedRef.current = false;
  }, [postId]);

  // Feed/Profile video expand: one-shot open of existing PublishedMediaFullscreenViewer.
  useEffect(() => {
    if (!openImmersiveFullscreen) return;
    if (immersiveFullscreenConsumedRef.current) return;
    if (!enableLightbox || !ready) return;
    const targetKey = initialMediaKey?.trim() || mediaItems[0]?.key || "";
    if (!targetKey) return;
    if (!mediaItems.some((item) => item.key === targetKey)) return;
    immersiveFullscreenConsumedRef.current = true;
    openFullscreenAt(targetKey);
  }, [
    openImmersiveFullscreen,
    enableLightbox,
    ready,
    initialMediaKey,
    mediaItems,
    openFullscreenAt,
  ]);

  /** Image tap only — distinguish tap vs swipe via gestureMovedRef. */
  const openFullscreenForImageTap = useCallback(
    (mixedIndex: number) => {
      if (gestureMovedRef.current) return;
      if (swipeStartIndexRef.current !== mixedIndex) return;
      const item = mediaItems[mixedIndex];
      if (!item || item.kind !== "image") return;
      openFullscreenAt(item.key);
    },
    [mediaItems, openFullscreenAt],
  );

  const closeFullscreen = useCallback(
    (
      activeMediaKey: string,
      playbackSnapshot?: PublishedVideoPlaybackSnapshot | null,
    ) => {
      if (closingFullscreenRef.current) return;
      closingFullscreenRef.current = true;
      armPublishedMediaFullscreenClickThroughGuard?.();
      // Stamp a new generation so in-flight FS restores cannot apply after close.
      const generation = ++playbackHandoffGenerationRef.current;
      const returnSnap =
        playbackSnapshot && playbackSnapshot.mediaKey === activeMediaKey
          ? { ...playbackSnapshot, generation }
          : null;
      setDetailReturnHandoff(returnSnap);
      setFullscreenEntryHandoff(null);
      setFullscreenOpen(false);
      setPublishedMediaFullscreenOpen?.(false);
      const target = mediaItems.findIndex((i) => i.key === activeMediaKey);
      if (target >= 0) {
        setIndex(target);
        indexRef.current = target;
        const swiper = swiperRef.current;
        if (swiper && swiper.activeIndex !== target) {
          swiper.slideTo(target, 0);
        }
      }
      window.setTimeout(() => {
        closingFullscreenRef.current = false;
      }, 150);
    },
    [
      armPublishedMediaFullscreenClickThroughGuard,
      mediaItems,
      setPublishedMediaFullscreenOpen,
    ],
  );

  const registerDetailPlaybackCapture = useCallback(
    (
      capture: ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null,
    ) => {
      detailPlaybackCaptureRef.current = capture;
    },
    [],
  );

  const onDetailHandoffConsumed = useCallback((generation: number) => {
    setDetailReturnHandoff((prev) =>
      prev && prev.generation === generation ? null : prev,
    );
    setFeedEntryHandoff((prev) =>
      prev && prev.generation === generation ? null : prev,
    );
  }, []);

  const onFullscreenHandoffConsumed = useCallback((generation: number) => {
    setFullscreenEntryHandoff((prev) =>
      prev && prev.generation === generation ? null : prev,
    );
  }, []);

  const frame =
    "relative isolate overflow-hidden rounded-2xl border border-[var(--border)] bg-black";
  const singleImage = isPublishedSingleImage(mediaItems);
  const multiMedia = mediaItems.length > 1;
  const intrinsicHeightFrame = singleImage;
  const frameStyle = publishedMediaFrameStyle(mediaItems, maxHeight, {
    multiAspectRatio: multiMedia ? multiAspectRatio : null,
  });

  if (!ready) {
    return (
      <div
        className={className}
        data-published-media-carousel
        data-ready="false"
        data-published-video-only={videoOnly ? "true" : undefined}
        data-published-single-image={singleImage ? "true" : undefined}
        data-published-multi-media={multiMedia ? "true" : undefined}
      >
        <div
          className={frame}
          style={frameStyle}
          data-published-media-frame
          aria-busy
        >
          <div
            className={intrinsicHeightFrame ? "w-full bg-black" : "h-full w-full bg-black"}
            style={
              videoOnly && frameStyle.aspectRatio
                ? { aspectRatio: frameStyle.aspectRatio }
                : intrinsicHeightFrame
                  ? undefined
                  : multiMedia && frameStyle.aspectRatio
                    ? { aspectRatio: frameStyle.aspectRatio }
                    : { minHeight: maxHeight }
            }
          />
        </div>
      </div>
    );
  }

  if (slideCount === 0) return null;

  return (
    <div
      className={className}
      data-published-media-carousel
      data-ready="true"
      data-published-video-only={videoOnly ? "true" : undefined}
      data-published-single-image={singleImage ? "true" : undefined}
      data-published-multi-media={multiMedia ? "true" : undefined}
    >
      <div className={frame} style={frameStyle} data-published-media-frame>
        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
            syncSwiperToInitialKey(swiper);
          }}
          initialSlide={swiperInitialSlide}
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
          noSwipingSelector={PUBLISHED_MEDIA_SWIPE_NO_SELECTOR}
          touchStartPreventDefault={false}
          preventClicks={false}
          preventClicksPropagation={false}
          className={
            intrinsicHeightFrame
              ? "relative z-0 w-full [&_.swiper-wrapper]:h-auto [&_.swiper-slide]:box-border [&_.swiper-slide]:h-auto [&_.swiper-slide]:w-full"
              : "relative z-0 h-full w-full [&_.swiper-wrapper]:h-full [&_.swiper-slide]:box-border [&_.swiper-slide]:h-full [&_.swiper-slide]:w-full"
          }
          style={intrinsicHeightFrame ? { height: "auto" } : { height: "100%" }}
          onTouchStart={(swiper) => {
            swipeStartIndexRef.current = swiper.activeIndex;
            gestureMovedRef.current = false;
          }}
          onSliderMove={(swiper) => {
            const start = swipeStartIndexRef.current;
            const width = swiper.width || 1;
            const expected = -start * width;
            if (Math.abs(swiper.translate - expected) > MIXED_HERO_SWIPE_THRESHOLD_PX) {
              gestureMovedRef.current = true;
            }
            const next = clampTranslateToAdjacent(
              swiper.translate,
              start,
              slideCount,
              width,
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
            if (clamped !== swipeStartIndexRef.current) {
              gestureMovedRef.current = true;
            }
            if (clamped !== swiper.activeIndex) {
              swiper.slideTo(clamped);
            }
          }}
          onSlideChange={(swiper) => {
            const target = resolvePublishedCarouselInitialIndex(
              mediaItemsRef.current,
              initialMediaKey,
            );
            const decision = shouldAcceptPublishedCarouselSlideChange({
              initialMediaKey,
              appliedKey: initialKeyAppliedRef.current,
              swiperActiveIndex: swiper.activeIndex,
              targetIndex: target,
            });
            if (!decision.accept) return;
            if (decision.markApplied && initialMediaKey) {
              initialKeyAppliedRef.current = initialMediaKey;
            }
            setIndex(swiper.activeIndex);
            indexRef.current = swiper.activeIndex;
          }}
        >
          {mediaItems.map((item, i) => (
            <SwiperSlide
              key={item.key}
              className={intrinsicHeightFrame ? "!h-auto bg-black" : "!h-full bg-black"}
            >
              <div
                className={
                  intrinsicHeightFrame
                    ? "flex w-full items-center justify-center bg-black"
                    : "flex h-full w-full items-center justify-center bg-black"
                }
              >
                {item.kind === "image" ? (
                  <ImageSlide
                    url={item.url}
                    isPriority={i === 0 || i === index}
                    naturalHeight={singleImage}
                    onNaturalSize={
                      multiMedia
                        ? (w, h) => reportImageNaturalSize(item.key, w, h)
                        : undefined
                    }
                    onTap={() => openFullscreenForImageTap(i)}
                  />
                ) : (
                  <div className="h-full w-full max-h-full bg-black">
                    <PublishedVideoPlayer
                      item={item}
                      isActive={i === index && !fullscreenOpen}
                      mode="detail"
                      onVideoUpdated={onVideoUpdated}
                      registerPlaybackCapture={
                        i === index
                          ? registerDetailPlaybackCapture
                          : undefined
                      }
                      playbackHandoff={
                        !fullscreenOpen &&
                        detailReturnHandoff?.mediaKey === item.key
                          ? detailReturnHandoff
                          : !fullscreenOpen &&
                              feedEntryHandoff?.mediaKey === item.key
                            ? feedEntryHandoff
                            : null
                      }
                      onPlaybackHandoffConsumed={onDetailHandoffConsumed}
                      onRequestMixedFullscreen={() => {
                        // Explicit expand — never gated by image swipe-vs-tap.
                        openFullscreenAt(item.key);
                      }}
                    />
                  </div>
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
      <PublishedMediaPagination count={slideCount} activeIndex={index} />
      {enableLightbox ? (
        <PublishedMediaFullscreenViewer
          items={mediaItems}
          open={fullscreenOpen}
          initialMediaKey={fullscreenMediaKey || mediaItems[index]?.key || ""}
          onClose={closeFullscreen}
          onVideoUpdated={onVideoUpdated}
          entryPlaybackHandoff={fullscreenEntryHandoff}
          onEntryPlaybackHandoffConsumed={onFullscreenHandoffConsumed}
        />
      ) : null}
    </div>
  );
}

/** Exported for tests — adjacent clamp helpers stay available. */
export { adjacentSlideTranslateRange };
