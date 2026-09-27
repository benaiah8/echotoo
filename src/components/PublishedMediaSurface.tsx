/**
 * Shared published media presentation for Feed / Profile list cards (PV3).
 * Detail mode delegates to PublishedMediaCarousel (PV2B.2 unchanged).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/swiper.css";

import {
  clampCarouselCommitIndex,
  clampTranslateToAdjacent,
  MIXED_HERO_SWIPE_THRESHOLD_PX,
} from "../lib/createFinalizeMixedMedia";
import {
  PUBLISHED_LIST_VIDEO_DWELL_MS,
  PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO,
  PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO,
  PUBLISHED_LIST_VIDEO_WARM_RATIO,
  PUBLISHED_MEDIA_SWIPE_NO_SELECTOR,
  ensurePublishedListVideoDocumentVisibilityCleanup,
  evaluatePublishedListVideoVisibilityPolicy,
  patchPublishedMediaRow,
  publishedListVideoOwnerId,
  publishedMediaFrameStyle,
  publishedMediaViewerKey,
  isPublishedVideoOnly,
  isPublishedSingleImage,
  mergePublishedVideoDimensions,
  requestPublishedListVideoOwnership,
  requestPublishedListVideoWarmOwnership,
  shouldAllowPublishedListVideoSpeculativeWarm,
  requestPublishedProcessingListOwnership,
  usePublishedMultiMediaFrame,
  remapPublishedMediaActiveIndex,
  subscribePublishedListVisibilityEpoch,
  getPublishedListVisibilityEpoch,
  peekPublishedVideoFeedDetailHandoff,
  consumePublishedVideoFeedDetailHandoff,
  invalidatePublishedVideoFeedDetailHandoff,
  resolvePublishedVideoListReturnIntent,
  type PublishedMediaItem,
  type PublishedVideoPlaybackSnapshot,
} from "../lib/publishedMedia";
import { computeEffectiveIntersectionRatio } from "../lib/publishedMedia/listVideoVisibility";
import { PUBLISHED_LIST_IO_THRESHOLDS } from "../lib/publishedMedia/listVideoIoThresholds";
import { logPublishedVideoState } from "../lib/publishedMedia/publishedVideoStateLog";
import ProgressiveImage from "./ui/ProgressiveImage";
import PublishedMediaCarousel from "./detail/PublishedMediaCarousel";
import PublishedVideoPlayer from "./detail/PublishedVideoPlayer";

export type PublishedMediaSurfaceMode = "detail" | "feed" | "profile";

// Re-export for tests / callers that import from the surface module.
export { computeEffectiveIntersectionRatio };

type Props = {
  items: PublishedMediaItem[];
  mode: PublishedMediaSurfaceMode;
  postId: string;
  viewerUserId?: string | null;
  maxHeight?: string;
  className?: string;
  /** When false (hidden tab / inactive profile sub-tab), never autoplay. */
  hostVisible?: boolean;
  /**
   * Open Post Detail on the active media key (Feed/Profile).
   * Image tap opens Detail only; video expand may request one-shot immersive fullscreen.
   */
  onOpenDetail?: (
    initialMediaKeyOrOpts:
      | string
      | {
          initialMediaKey: string;
          openImmersiveFullscreen?: boolean;
        },
  ) => void;
  /**
   * Pass 3E/3F: parent (Post) captures list playback before ownership release.
   * Receives the active list player's capture fn (or null).
   */
  registerFeedPlaybackCapture?: (
    capture: ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null,
  ) => void;
};

function ListPagination({
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
              active ? "w-4 bg-[var(--text)]" : "w-2 bg-[var(--text)]/50"
            }`}
          />
        );
      })}
    </div>
  );
}

function isPostDetailPath(pathname: string): boolean {
  return (
    pathname.includes("/experience/") || pathname.includes("/hangout/")
  );
}

export default function PublishedMediaSurface({
  items,
  mode,
  postId,
  viewerUserId = null,
  maxHeight = "40vh",
  className = "",
  hostVisible = true,
  onOpenDetail,
  registerFeedPlaybackCapture,
}: Props) {
  if (mode === "detail") {
    return (
      <PublishedMediaCarousel
        items={items}
        maxHeight={maxHeight}
        className={className}
        postId={postId}
        viewerUserId={viewerUserId}
      />
    );
  }

  return (
    <PublishedMediaListSurface
      items={items}
      mode={mode}
      postId={postId}
      viewerUserId={viewerUserId}
      maxHeight={maxHeight}
      className={className}
      hostVisible={hostVisible}
      onOpenDetail={onOpenDetail}
      registerFeedPlaybackCapture={registerFeedPlaybackCapture}
    />
  );
}

function PublishedMediaListSurface({
  items,
  mode,
  postId,
  viewerUserId,
  maxHeight,
  className,
  hostVisible,
  onOpenDetail,
  registerFeedPlaybackCapture,
}: {
  items: PublishedMediaItem[];
  mode: "feed" | "profile";
  postId: string;
  viewerUserId: string | null;
  maxHeight: string;
  className: string;
  hostVisible: boolean;
  onOpenDetail?: (
    initialMediaKeyOrOpts:
      | string
      | {
          initialMediaKey: string;
          openImmersiveFullscreen?: boolean;
        },
  ) => void;
  registerFeedPlaybackCapture?: (
    capture: ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null,
  ) => void;
}) {
  const location = useLocation();
  const detailRouteOpen = isPostDetailPath(location.pathname);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);
  const swipeStartIndexRef = useRef(0);
  const gestureMovedRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const warmReleaseRef = useRef<(() => void) | null>(null);
  /** Imperative pause from active list player (one revoke → one pause). */
  const listPlaybackPauseRef = useRef<
    ((reason: string) => number | undefined) | null
  >(null);
  /** Pass 3E: active list player snapshot capture (sync before Detail nav). */
  const listPlaybackCaptureRef = useRef<
    ((generation: number) => PublishedVideoPlaybackSnapshot | null) | null
  >(null);
  const effectiveRatioRef = useRef(0);
  const ownsPlaybackRef = useRef(false);
  const lastVisibilityLogKeyRef = useRef("");
  /** Pass 3E: pending Detail → Feed return snapshot for this card. */
  const [feedReturnHandoff, setFeedReturnHandoff] =
    useState<PublishedVideoPlaybackSnapshot | null>(null);

  const [mediaItems, setMediaItems] = useState(items);
  const [index, setIndex] = useState(0);
  /** ≥ ACTIVE ENTER (0.70) — autoplay claim band. */
  const [ratioOk, setRatioOk] = useState(false);
  /** ≥ ACTIVE EXIT (0.40) — hysteresis retain / user-pause hold. */
  const [activeExitOk, setActiveExitOk] = useState(false);
  /** ≥ WARM (0.15). */
  const [warmRatioOk, setWarmRatioOk] = useState(false);
  const [dwellOk, setDwellOk] = useState(false);
  const [ownsPlayback, setOwnsPlayback] = useState(false);
  const [ownsWarm, setOwnsWarm] = useState(false);
  const [visibilityEpoch, setVisibilityEpoch] = useState(() =>
    getPublishedListVisibilityEpoch(),
  );
  const [playbackFailedKey, setPlaybackFailedKey] = useState<string | null>(
    null,
  );
  /** User tapped play on this media key — claim active even before dwell. */
  const [manualForceKey, setManualForceKey] = useState<string | null>(null);
  /** User paused — block IO autoplay; keep active ownership while still visible (PV3.8.4). */
  const [userPausedKey, setUserPausedKey] = useState<string | null>(null);
  const indexRef = useRef(0);
  const mediaItemsRef = useRef(mediaItems);

  const { multiAspectRatio, reportImageNaturalSize } =
    usePublishedMultiMediaFrame(mediaItems, { policy: "stable-list" });

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => {
    ownsPlaybackRef.current = ownsPlayback;
  }, [ownsPlayback]);

  // Pass 3E/3F: expose active-slide capture to Post.goToDetails (before releaseAll).
  useEffect(() => {
    if (!registerFeedPlaybackCapture) return;
    registerFeedPlaybackCapture((generation) =>
      listPlaybackCaptureRef.current?.(generation) ?? null,
    );
    return () => {
      registerFeedPlaybackCapture(null);
    };
  }, [registerFeedPlaybackCapture]);

  // Pass 3E/3F: when Detail is closed, latch return snapshot for this video-only list card.
  useEffect(() => {
    if (mode !== "feed" && mode !== "profile") return;
    if (detailRouteOpen) return;
    if (!isPublishedVideoOnly(mediaItems)) return;
    const video = mediaItems[0];
    if (!video || video.kind !== "video") return;
    const snap = peekPublishedVideoFeedDetailHandoff({
      postId,
      mediaKey: video.key,
      direction: "to-feed",
      origin: mode,
    });
    if (!snap) return;
    const intent = resolvePublishedVideoListReturnIntent({
      wantsPlaying: snap.wantsPlaying,
    });
    if (intent.userPaused) {
      setUserPausedKey(video.key);
      if (intent.clearManualForce) setManualForceKey(null);
    } else {
      setUserPausedKey((prev) => (prev === video.key ? null : prev));
    }
    setFeedReturnHandoff(snap);
  }, [detailRouteOpen, mode, postId, mediaItems]);

  // Pass 3F: drop only this surface's return slot. Do not erase another origin's
  // to-detail/to-feed handoff (Home vs Profile can share postId).
  useEffect(() => {
    return () => {
      invalidatePublishedVideoFeedDetailHandoff({
        postId,
        origin: mode,
        direction: "to-feed",
      });
    };
  }, [postId, mode]);

  useEffect(() => {
    setMediaItems(items);
    setIndex((prev) =>
      remapPublishedMediaActiveIndex({
        previousKey: mediaItemsRef.current[prev]?.key,
        previousIndex: prev,
        nextKeys: items.map((i) => i.key),
      }),
    );
  }, [items]);

  useEffect(() => {
    ensurePublishedListVideoDocumentVisibilityCleanup();
    return subscribePublishedListVisibilityEpoch(() => {
      setVisibilityEpoch(getPublishedListVisibilityEpoch());
    });
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !hostVisible || detailRouteOpen) {
      effectiveRatioRef.current = 0;
      setRatioOk(false);
      setActiveExitOk(false);
      setWarmRatioOk(false);
      return;
    }
    const applyEntry = (entry: IntersectionObserverEntry) => {
      const ratio = entry.isIntersecting
        ? computeEffectiveIntersectionRatio(entry)
        : 0;
      effectiveRatioRef.current = ratio;
      // Booleans only — React bails out when unchanged (no per-scroll thrash).
      setRatioOk(ratio >= PUBLISHED_LIST_VIDEO_VISIBILITY_RATIO); // ACTIVE ENTER
      setActiveExitOk(ratio >= PUBLISHED_LIST_VIDEO_ACTIVE_EXIT_RATIO);
      setWarmRatioOk(ratio >= PUBLISHED_LIST_VIDEO_WARM_RATIO);
    };
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        applyEntry(entry);
      },
      { threshold: [...PUBLISHED_LIST_IO_THRESHOLDS] },
    );
    io.observe(el);
    // Foreground / epoch: force a measure from the last known element box.
    const rect = el.getBoundingClientRect();
    const rootH =
      typeof window !== "undefined" ? window.innerHeight : rect.height;
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(rootH, rect.bottom);
    const visibleH = Math.max(0, visibleBottom - visibleTop);
    applyEntry({
      isIntersecting: visibleH > 0,
      intersectionRatio: 0,
      intersectionRect: {
        height: visibleH,
        width: rect.width,
        top: visibleTop,
        bottom: visibleBottom,
        left: rect.left,
        right: rect.right,
        x: rect.left,
        y: visibleTop,
        toJSON: () => ({}),
      },
      boundingClientRect: rect,
      rootBounds: {
        height: rootH,
        width: typeof window !== "undefined" ? window.innerWidth : rect.width,
        top: 0,
        bottom: rootH,
        left: 0,
        right: typeof window !== "undefined" ? window.innerWidth : rect.width,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
      target: el,
      time: 0,
    } as IntersectionObserverEntry);
    return () => io.disconnect();
  }, [hostVisible, detailRouteOpen, postId, visibilityEpoch]);

  useEffect(() => {
    if (!ratioOk || !hostVisible || detailRouteOpen || document.hidden) {
      setDwellOk(false);
      return;
    }
    const t = window.setTimeout(() => {
      setDwellOk(true);
    }, PUBLISHED_LIST_VIDEO_DWELL_MS);
    return () => {
      window.clearTimeout(t);
      setDwellOk(false);
    };
  }, [ratioOk, hostVisible, detailRouteOpen, visibilityEpoch]);

  const activeItem = mediaItems[index] ?? null;
  const activeMediaKey = activeItem?.key ?? "";
  const activeVideoStatus =
    activeItem?.kind === "video" ? activeItem.status : null;
  const activeVideoId =
    activeItem?.kind === "video" ? activeItem.videoId : null;
  const readyActiveVideo =
    activeItem?.kind === "video" &&
    activeItem.status === "ready" &&
    Boolean(activeItem.videoId?.trim()) &&
    activeMediaKey !== playbackFailedKey;

  useEffect(() => {
    setPlaybackFailedKey(null);
    setManualForceKey(null);
    setUserPausedKey(null);
  }, [activeMediaKey]);

  const visibilityOk =
    hostVisible &&
    !detailRouteOpen &&
    typeof document !== "undefined" &&
    !document.hidden;

  const userPaused = userPausedKey === activeMediaKey;
  const manualForce = manualForceKey === activeMediaKey;

  // Canonical viewport policy (IO booleans only trigger re-render on boundaries).
  const policyFromFlags = evaluatePublishedListVideoVisibilityPolicy({
    effectiveRatio: effectiveRatioRef.current,
    dwellOk,
    visibilityOk,
    readyActiveVideo,
    userPaused,
    ownsPlayback,
    manualForce,
  });

  const {
    autoplayEligible: eligible,
    forceManualActive,
    holdActiveWhileUserPaused,
    holdActiveByHysteresis,
    shouldOwnActive,
    warmEligible,
    belowActiveExit,
    activeEnterEligible,
  } = policyFromFlags;

  useEffect(() => {
    const logKey = [
      activeMediaKey,
      effectiveRatioRef.current.toFixed(3),
      activeEnterEligible ? "1" : "0",
      belowActiveExit ? "1" : "0",
      warmEligible ? "1" : "0",
      userPaused ? "1" : "0",
      ownsPlayback ? "1" : "0",
      shouldOwnActive ? "1" : "0",
    ].join("|");
    if (logKey === lastVisibilityLogKeyRef.current) return;
    lastVisibilityLogKeyRef.current = logKey;
    logPublishedVideoState("visibility-evaluated", {
      mediaKey: activeMediaKey || undefined,
      effectiveRatio: effectiveRatioRef.current,
      activeEnterEligible,
      belowActiveExit,
      warmEligible,
      userPaused,
      ownsPlayback,
      shouldOwnActive,
      holdActiveByHysteresis,
      holdActiveWhileUserPaused,
    });
    if (ownsPlayback && shouldOwnActive && !eligible && holdActiveByHysteresis) {
      logPublishedVideoState("visibility-active-retain", {
        mediaKey: activeMediaKey || undefined,
        effectiveRatio: effectiveRatioRef.current,
        ownsPlayback: true,
      });
    }
    if (
      !ownsPlayback &&
      shouldOwnActive &&
      (eligible || forceManualActive)
    ) {
      logPublishedVideoState("visibility-active-reclaim", {
        mediaKey: activeMediaKey || undefined,
        effectiveRatio: effectiveRatioRef.current,
        eligible,
        forceManualActive,
      });
    }
  }, [
    activeEnterEligible,
    activeExitOk,
    activeMediaKey,
    belowActiveExit,
    eligible,
    forceManualActive,
    holdActiveByHysteresis,
    holdActiveWhileUserPaused,
    ownsPlayback,
    ratioOk,
    shouldOwnActive,
    userPaused,
    warmEligible,
    warmRatioOk,
  ]);

  useEffect(() => {
    if (!shouldOwnActive || !activeItem || activeItem.kind !== "video") {
      if (ownsPlaybackRef.current) {
        const reason = belowActiveExit
          ? "visibility-below-active-exit"
          : "active-release";
        // One revoke → one pause (before React isActive prop settles).
        const pausedAt = listPlaybackPauseRef.current?.(reason);
        if (reason === "visibility-below-active-exit") {
          logPublishedVideoState("visibility-auto-pause", {
            mediaKey: activeMediaKey || undefined,
            effectiveRatio: effectiveRatioRef.current,
            currentTime: pausedAt,
            reason,
          });
        }
      }
      if (belowActiveExit) {
        // Forget manual force/pause once past exit — prevents reclaim flap <40%.
        setManualForceKey(null);
        setUserPausedKey((prev) =>
          prev === activeMediaKey ? null : prev,
        );
      }
      releaseRef.current?.();
      releaseRef.current = null;
      setOwnsPlayback(false);
      return;
    }
    // Active claim clears warm slot for same id (promotion) via coordinator.
    warmReleaseRef.current = null;
    setOwnsWarm(false);

    const ownerId = publishedListVideoOwnerId(postId, activeItem.key);
    const { release } = requestPublishedListVideoOwnership({
      ownerId,
      onRevoke: () => {
        listPlaybackPauseRef.current?.("ownership-revoked");
        setOwnsPlayback(false);
        releaseRef.current = null;
        setManualForceKey(null);
        setUserPausedKey((prev) =>
          prev === activeMediaKey ? null : prev,
        );
      },
    });
    releaseRef.current = release;
    setOwnsPlayback(true);
    return () => {
      release();
      if (releaseRef.current === release) {
        releaseRef.current = null;
      }
      setOwnsPlayback(false);
    };
  }, [
    shouldOwnActive,
    belowActiveExit,
    postId,
    activeMediaKey,
    activeVideoStatus,
    activeVideoId,
  ]);

  useEffect(() => {
    if (
      !warmEligible ||
      !activeItem ||
      activeItem.kind !== "video" ||
      !shouldAllowPublishedListVideoSpeculativeWarm()
    ) {
      warmReleaseRef.current?.();
      warmReleaseRef.current = null;
      setOwnsWarm(false);
      return;
    }
    const ownerId = publishedListVideoOwnerId(postId, activeItem.key);
    const claim = requestPublishedListVideoWarmOwnership({
      ownerId,
      onRevoke: () => {
        setOwnsWarm(false);
        warmReleaseRef.current = null;
      },
    });
    if (!claim) {
      setOwnsWarm(false);
      return;
    }
    warmReleaseRef.current = claim.release;
    setOwnsWarm(true);
    return () => {
      claim.release();
      if (warmReleaseRef.current === claim.release) {
        warmReleaseRef.current = null;
      }
      setOwnsWarm(false);
    };
  }, [
    warmEligible,
    postId,
    activeMediaKey,
    activeVideoStatus,
    activeVideoId,
  ]);

  useEffect(() => {
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
      warmReleaseRef.current?.();
      warmReleaseRef.current = null;
    };
  }, []);

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
    },
    [postId, viewerUserId],
  );

  // PV3.4: at most one visible processing list video may poll status.
  useEffect(() => {
    const processingActive =
      activeItem?.kind === "video" &&
      (activeItem.status === "processing" ||
        activeItem.status === "pending" ||
        activeItem.status === "uploading") &&
      Boolean(activeItem.mediaId?.trim()) &&
      ratioOk &&
      hostVisible &&
      !detailRouteOpen &&
      typeof document !== "undefined" &&
      !document.hidden;

    if (!processingActive || !activeItem || activeItem.kind !== "video") {
      return;
    }

    const ownerId = publishedListVideoOwnerId(postId, activeItem.key);
    const { release } = requestPublishedProcessingListOwnership({
      ownerId,
      mediaId: activeItem.mediaId,
      postId,
      viewerUserId,
      onRow: (row) => {
        onVideoUpdated({
          kind: "video",
          key: activeItem.key,
          mediaId: row.id,
          videoId: row.bunny_video_id,
          status: row.video_status,
          posterUrl: row.poster_url,
          width: row.width,
          height: row.height,
          durationSec: row.duration_sec,
        });
      },
      onRevoke: () => {
        /* ownership lost — no local state required */
      },
    });
    return () => {
      release();
    };
  }, [
    activeItem,
    ratioOk,
    hostVisible,
    detailRouteOpen,
    postId,
    viewerUserId,
    onVideoUpdated,
  ]);

  const openDetailAt = useCallback(
    (
      mediaKey: string,
      opts?: { openImmersiveFullscreen?: boolean },
    ) => {
      if (opts?.openImmersiveFullscreen) {
        onOpenDetail?.({
          initialMediaKey: mediaKey,
          openImmersiveFullscreen: true,
        });
        return;
      }
      onOpenDetail?.(mediaKey);
    },
    [onOpenDetail],
  );

  const openDetailForImageTap = useCallback(
    (mixedIndex: number) => {
      if (gestureMovedRef.current) return;
      if (swipeStartIndexRef.current !== mixedIndex) return;
      const item = mediaItems[mixedIndex];
      if (!item || item.kind !== "image") return;
      openDetailAt(item.key);
    },
    [mediaItems, openDetailAt],
  );

  const slideCount = mediaItems.length;

  if (slideCount === 0) return null;

  const videoOnly = isPublishedVideoOnly(mediaItems);
  const singleImage = isPublishedSingleImage(mediaItems);
  const multiMedia = mediaItems.length > 1;
  /** Single image needs intrinsic height; single video uses aspect-ratio frame + fill. */
  const intrinsicHeightFrame = singleImage;
  const frameStyle = publishedMediaFrameStyle(mediaItems, maxHeight, {
    multiAspectRatio: multiMedia ? multiAspectRatio : null,
  });
  const frame =
    "relative isolate overflow-hidden rounded-2xl border border-[var(--border)] bg-black";

  return (
    <div
      ref={rootRef}
      className={className}
      data-published-media-surface
      data-published-media-mode={mode}
      data-published-video-only={videoOnly ? "true" : undefined}
      data-published-single-image={singleImage ? "true" : undefined}
      data-published-multi-media={multiMedia ? "true" : undefined}
      data-list-video-eligible={eligible ? "true" : "false"}
      data-list-video-owns={ownsPlayback ? "true" : "false"}
      data-list-video-warm={ownsWarm ? "true" : "false"}
    >
      <div
        className={frame}
        style={frameStyle}
        data-published-media-frame
      >
        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
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
            if (
              Math.abs(swiper.translate - expected) >
              MIXED_HERO_SWIPE_THRESHOLD_PX
            ) {
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
          onSlideChange={(swiper) => setIndex(swiper.activeIndex)}
        >
          {mediaItems.map((item, i) => (
            <SwiperSlide
              key={item.key}
              className={
                intrinsicHeightFrame ? "!h-auto bg-black" : "!h-full bg-black"
              }
            >
              <div
                className={
                  intrinsicHeightFrame
                    ? "flex w-full items-center justify-center bg-black"
                    : "flex h-full w-full items-center justify-center bg-black"
                }
              >
                {item.kind === "image" ? (
                  <div
                    className={
                      singleImage
                        ? "grid w-full place-items-center bg-black"
                        : "grid h-full w-full place-items-center bg-black"
                    }
                    role="button"
                    tabIndex={0}
                    aria-label="Open post"
                    data-published-image-slide
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetailForImageTap(i);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetailForImageTap(i);
                      }
                    }}
                  >
                    <ProgressiveImage
                      src={item.url}
                      alt=""
                      layout={singleImage ? "natural" : "fill"}
                      fit={singleImage ? "contain" : "cover"}
                      fillMinHeight={singleImage ? undefined : false}
                      className={
                        singleImage
                          ? "pointer-events-none w-full max-w-full select-none"
                          : "pointer-events-none h-full w-full max-h-full max-w-full select-none"
                      }
                      viewportWidth={800}
                      rootMargin="200px"
                      priority={i === 0 || i === index}
                      onNaturalSize={
                        multiMedia
                          ? (w, h) => reportImageNaturalSize(item.key, w, h)
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <div
                    className="h-full w-full max-h-full bg-black"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PublishedVideoPlayer
                      item={item}
                      isActive={ownsPlayback && i === index}
                      isWarm={ownsWarm && !ownsPlayback && i === index}
                      mode={mode}
                      onVideoUpdated={onVideoUpdated}
                      registerListPlaybackPause={
                        i === index
                          ? (pause) => {
                              listPlaybackPauseRef.current = pause;
                            }
                          : undefined
                      }
                      registerPlaybackCapture={
                        i === index
                          ? (capture) => {
                              listPlaybackCaptureRef.current = capture;
                            }
                          : undefined
                      }
                      playbackHandoff={
                        feedReturnHandoff?.mediaKey === item.key
                          ? feedReturnHandoff
                          : null
                      }
                      onPlaybackHandoffConsumed={(generation) => {
                        consumePublishedVideoFeedDetailHandoff({
                          postId,
                          mediaKey: item.key,
                          direction: "to-feed",
                          origin: mode,
                        });
                        setFeedReturnHandoff((prev) =>
                          prev && prev.generation === generation ? null : prev,
                        );
                      }}
                      onRequestActivePlayback={() => {
                        setUserPausedKey(null);
                        setManualForceKey(item.key);
                        setPlaybackFailedKey(null);
                        const ownerId = publishedListVideoOwnerId(
                          postId,
                          item.key,
                        );
                        warmReleaseRef.current?.();
                        warmReleaseRef.current = null;
                        setOwnsWarm(false);
                        const { release } = requestPublishedListVideoOwnership({
                          ownerId,
                          onRevoke: () => {
                            listPlaybackPauseRef.current?.(
                              "ownership-revoked",
                            );
                            setOwnsPlayback(false);
                            releaseRef.current = null;
                            setManualForceKey(null);
                            setUserPausedKey((prev) =>
                              prev === item.key ? null : prev,
                            );
                          },
                        });
                        releaseRef.current = release;
                        setOwnsPlayback(true);
                      }}
                      onManualPause={() => {
                        // PV3.8.4: mark user-paused only — keep active ownership.
                        setUserPausedKey(item.key);
                      }}
                      userPaused={userPausedKey === item.key}
                      onPlaybackFailed={() => {
                        setPlaybackFailedKey(item.key);
                        setManualForceKey(null);
                        setUserPausedKey((prev) =>
                          prev === item.key ? null : prev,
                        );
                        releaseRef.current?.();
                        releaseRef.current = null;
                        warmReleaseRef.current?.();
                        warmReleaseRef.current = null;
                        setOwnsPlayback(false);
                        setOwnsWarm(false);
                      }}
                      onRequestMixedFullscreen={() => {
                        openDetailAt(item.key, {
                          openImmersiveFullscreen: true,
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
      <ListPagination count={slideCount} activeIndex={index} />
    </div>
  );
}
