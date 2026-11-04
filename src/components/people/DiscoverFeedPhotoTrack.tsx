/**
 * Discover-only finger-following photo track (prev | current | next).
 * Isolated from Duo MinePhotoStack / Embla — never mount on Duo slides.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { PiArrowsOut } from "react-icons/pi";
import MediaGalleryLightbox from "../MediaGalleryLightbox";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  notifyMediaGalleryLightboxClosed,
  notifyMediaGalleryLightboxOpened,
} from "../../lib/mediaGalleryLightboxBackGuard";
import { subscribeAndroidHardwareBack } from "../../lib/androidPostDetailModalBack";
import {
  DISCOVER_PHOTO_SWIPE_SETTLE_MS,
  discoverPhotoSwipeNeighborIndices,
  discoverPhotoSwipeTrackTranslatePx,
  resolveDiscoverPhotoSwipeAxis,
  resolveDiscoverPhotoSwipeSnap,
  type DiscoverPhotoSwipeAxis,
} from "../../lib/people/discoverPhotoSwipeGesture";
import { PEOPLE_FEED_MEDIA_RADIUS } from "../../lib/people/peopleFeedLayout";
import { peopleDebugRecord } from "../../lib/people/peopleDeckDebug";
import {
  isMountedPhotoPaintReady,
  PEOPLE_DUO_FRONT_ROTATE_DEG,
} from "../../lib/people/peopleCandidateMediaPresentation";

const GALLERY_HISTORY_MARKER = "discoverFeedPortraitGallery";

type DiscoverFeedPhotoTrackProps = {
  photos: string[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  identityOverlay?: ReactNode;
  className?: string;
  mediaRadius?: string;
  tapIdentityKey?: string;
};

export default function DiscoverFeedPhotoTrack({
  photos,
  activeIndex,
  onActiveIndexChange,
  identityOverlay,
  className = "",
  mediaRadius = PEOPLE_FEED_MEDIA_RADIUS,
  tapIdentityKey = "",
}: DiscoverFeedPhotoTrackProps) {
  const photoCount = photos.length;
  const photosKey = photos.join("|");
  const neighbors = discoverPhotoSwipeNeighborIndices(activeIndex, photoCount);
  const slotPhotos = [
    photos[neighbors.prev] ?? photos[0]!,
    photos[neighbors.current] ?? photos[0]!,
    photos[neighbors.next] ?? photos[0]!,
  ];

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(0);
  const dragPxRef = useRef(0);
  const axisRef = useRef<DiscoverPhotoSwipeAxis>("undecided");
  const originRef = useRef<{
    x: number;
    y: number;
    id: number;
    identityKey: string;
  } | null>(null);
  const settlingRef = useRef(false);
  const identityKeyRef = useRef(tapIdentityKey);
  identityKeyRef.current = tapIdentityKey;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const photoCountRef = useRef(photoCount);
  photoCountRef.current = photoCount;
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [frontPaintReady, setFrontPaintReady] = useState(false);
  const [failedPaths, setFailedPaths] = useState<Set<string>>(() => new Set());
  const frontImgRef = useRef<HTMLImageElement | null>(null);
  const fullscreenBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);
  const galleryHistoryPushedRef = useRef(false);
  const gallerySkipPopstateRef = useRef(false);
  const galleryOpenRef = useRef(false);
  const galleryClosingRef = useRef(false);
  const galleryClickThroughGuardUntilRef = useRef(0);
  galleryOpenRef.current = galleryOpen;

  const applyTrackTransform = useCallback(
    (dragPx: number, withTransition: boolean) => {
      const track = trackRef.current;
      const width = widthRef.current;
      if (!track || width <= 0) return;
      const x = discoverPhotoSwipeTrackTranslatePx({
        slotWidthPx: width,
        dragPx,
      });
      track.style.transition = withTransition
        ? `transform ${DISCOVER_PHOTO_SWIPE_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : "none";
      track.style.transform = `translate3d(${x}px, 0, 0)`;
    },
    []
  );

  const measureWidth = useCallback(() => {
    const w = viewportRef.current?.clientWidth ?? 0;
    if (w > 0) widthRef.current = w;
    applyTrackTransform(dragPxRef.current, false);
  }, [applyTrackTransform]);

  useLayoutEffect(() => {
    measureWidth();
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureWidth]);

  // Parent index change (or settle complete): hard-reset track to centered slot.
  useLayoutEffect(() => {
    dragPxRef.current = 0;
    axisRef.current = "undecided";
    settlingRef.current = false;
    applyTrackTransform(0, false);
    setFrontPaintReady(isMountedPhotoPaintReady(frontImgRef.current));
  }, [activeIndex, photosKey, applyTrackTransform]);

  const clearGesture = useCallback(() => {
    originRef.current = null;
    axisRef.current = "undecided";
  }, []);

  const settleTo = useCallback(
    (snap: "prev" | "next" | "stay") => {
      const width = widthRef.current;
      if (width <= 0) {
        dragPxRef.current = 0;
        applyTrackTransform(0, false);
        clearGesture();
        return;
      }
      const targetDrag =
        snap === "next" ? -width : snap === "prev" ? width : 0;
      settlingRef.current = true;
      dragPxRef.current = targetDrag;
      applyTrackTransform(targetDrag, true);

      window.setTimeout(() => {
        settlingRef.current = false;
        clearGesture();
        if (snap === "stay") {
          dragPxRef.current = 0;
          applyTrackTransform(0, false);
          return;
        }
        const count = photoCountRef.current;
        const current = activeIndexRef.current;
        const next =
          snap === "next"
            ? (current + 1) % count
            : (current - 1 + count) % count;
        // Commit index first; layout effect recenters with rebuilt neighbors
        // so the settled photo matches the slide that finished animating.
        dragPxRef.current = 0;
        if (next !== current) {
          onActiveIndexChangeRef.current(next);
        } else {
          applyTrackTransform(0, false);
        }
      }, DISCOVER_PHOTO_SWIPE_SETTLE_MS);
    },
    [applyTrackTransform, clearGesture]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (settlingRef.current || photoCountRef.current <= 1) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (Date.now() < galleryClickThroughGuardUntilRef.current) return;
      const t = e.target;
      if (
        t instanceof Element &&
        (t.closest("[data-people-mine-identity-hit]") ||
          t.closest("[data-people-mine-fullscreen-hit]"))
      ) {
        clearGesture();
        return;
      }
      axisRef.current = "undecided";
      dragPxRef.current = 0;
      applyTrackTransform(0, false);
      originRef.current = {
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        identityKey: identityKeyRef.current,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [applyTrackTransform, clearGesture]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin || origin.id !== e.pointerId || settlingRef.current) return;
      if (origin.identityKey !== identityKeyRef.current) {
        clearGesture();
        return;
      }
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (axisRef.current === "undecided") {
        axisRef.current = resolveDiscoverPhotoSwipeAxis(dx, dy);
      }
      if (axisRef.current !== "horizontal") return;
      // Finger-follow: write transform directly (no React render per move).
      dragPxRef.current = dx;
      applyTrackTransform(dx, false);
    },
    [applyTrackTransform, clearGesture]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin || origin.id !== e.pointerId) {
        clearGesture();
        return;
      }
      if (origin.identityKey !== identityKeyRef.current) {
        clearGesture();
        settleTo("stay");
        return;
      }
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      const axis =
        axisRef.current === "undecided"
          ? resolveDiscoverPhotoSwipeAxis(dx, dy)
          : axisRef.current;
      originRef.current = null;

      if (axis !== "horizontal") {
        dragPxRef.current = 0;
        applyTrackTransform(0, false);
        axisRef.current = "undecided";
        if (import.meta.env.DEV) {
          peopleDebugRecord("discover:photoSwipe", {
            outcome: "reject",
            reason: axis === "vertical" ? "vertical" : "no-axis",
            dx,
            dy,
          });
        }
        return;
      }

      const snap = resolveDiscoverPhotoSwipeSnap({
        dragPx: dx,
        dy,
        axis,
        slotWidthPx: widthRef.current,
      });
      if (import.meta.env.DEV) {
        peopleDebugRecord("discover:photoSwipe", {
          outcome: snap === "stay" ? "reject" : "commit",
          reason: snap === "stay" ? "short-or-diagonal" : snap,
          dx,
          dy,
        });
      }
      settleTo(snap);
    },
    [applyTrackTransform, clearGesture, settleTo]
  );

  const onPointerCancel = useCallback(() => {
    if (import.meta.env.DEV && originRef.current) {
      peopleDebugRecord("discover:photoSwipe", {
        outcome: "reject",
        reason: "cancelled",
      });
    }
    clearGesture();
    settleTo("stay");
  }, [clearGesture, settleTo]);

  const closeGallery = useCallback(() => {
    galleryClosingRef.current = true;
    galleryOpenRef.current = false;
    galleryClickThroughGuardUntilRef.current = Date.now() + 400;
    const swallow = (ev: Event) => {
      if (Date.now() >= galleryClickThroughGuardUntilRef.current) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    document.addEventListener("click", swallow, true);
    document.addEventListener("pointerup", swallow, true);
    window.setTimeout(() => {
      document.removeEventListener("click", swallow, true);
      document.removeEventListener("pointerup", swallow, true);
    }, 450);
    setGalleryOpen(false);
  }, []);

  const openGallery = useCallback(() => {
    if (photoCount <= 0) return;
    const img = frontImgRef.current;
    if (!isMountedPhotoPaintReady(img)) return;
    const active = document.activeElement;
    focusRestoreRef.current =
      active instanceof HTMLElement ? active : fullscreenBtnRef.current;
    galleryClosingRef.current = false;
    galleryOpenRef.current = true;
    setGalleryOpen(true);
  }, [photoCount]);

  useEffect(() => {
    if (!galleryOpen) return;
    notifyMediaGalleryLightboxOpened();
    if (typeof window !== "undefined" && !galleryHistoryPushedRef.current) {
      window.history.pushState(
        { [GALLERY_HISTORY_MARKER]: true },
        "",
        window.location.href
      );
      galleryHistoryPushedRef.current = true;
    }
    const onPopState = () => {
      if (gallerySkipPopstateRef.current) {
        gallerySkipPopstateRef.current = false;
        return;
      }
      closeGallery();
    };
    window.addEventListener("popstate", onPopState);
    const unsubAndroid = subscribeAndroidHardwareBack(() => {
      closeGallery();
    });
    return () => {
      window.removeEventListener("popstate", onPopState);
      unsubAndroid();
      notifyMediaGalleryLightboxClosed();
    };
  }, [closeGallery, galleryOpen]);

  useEffect(() => {
    if (galleryOpen) return;
    if (!galleryHistoryPushedRef.current) return;
    if (typeof window === "undefined") return;
    const st = window.history.state as Record<string, boolean> | null;
    if (!(st && st[GALLERY_HISTORY_MARKER] === true)) {
      galleryHistoryPushedRef.current = false;
      return;
    }
    gallerySkipPopstateRef.current = true;
    const t = window.setTimeout(() => {
      const cur = window.history.state as Record<string, boolean> | null;
      if (cur && cur[GALLERY_HISTORY_MARKER] === true) {
        window.history.back();
      }
      galleryHistoryPushedRef.current = false;
    }, 100);
    return () => window.clearTimeout(t);
  }, [galleryOpen]);

  const galleryWasOpenRef = useRef(false);
  useEffect(() => {
    if (galleryOpen) {
      galleryWasOpenRef.current = true;
      return;
    }
    if (!galleryWasOpenRef.current) return;
    galleryWasOpenRef.current = false;
    const el = focusRestoreRef.current ?? fullscreenBtnRef.current;
    focusRestoreRef.current = null;
    if (!el) return;
    window.requestAnimationFrame(() => {
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    });
  }, [galleryOpen]);

  const onGalleryIndexChange = useCallback(
    (index: number) => {
      if (galleryClosingRef.current || !galleryOpenRef.current) return;
      onActiveIndexChange(index);
    },
    [onActiveIndexChange]
  );

  const isolateFullscreenPointer = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const t = e.target;
      if (
        t instanceof Element &&
        (t.closest("[data-people-mine-identity-hit]") ||
          t.closest("[data-people-mine-fullscreen-hit]"))
      ) {
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (photoCount <= 1 || settlingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      settleTo(e.key === "ArrowLeft" ? "next" : "prev");
    },
    [photoCount, settleTo]
  );

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`.trim()}
      style={{ touchAction: "pan-y" }}
      data-people-discover-photo-swipe="true"
      data-people-discover-photo-track="true"
      role="group"
      tabIndex={0}
      aria-label="Photo gallery, swipe for more"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        data-people-discover-photo-viewport="true"
        aria-hidden
      >
        <div
          ref={trackRef}
          className="flex h-full will-change-transform"
          style={{ width: "300%" }}
          data-people-discover-photo-strip="true"
        >
          {slotPhotos.map((path, slot) => {
            const src = avatarDisplayUrl(path);
            const failed = failedPaths.has(path);
            const isFront = slot === 1;
            return (
              <div
                key={`${neighbors.current}-${slot}-${path}`}
                className="relative h-full shrink-0 overflow-hidden bg-[var(--surface-2)]"
                style={{ width: "33.3333%" }}
                data-people-discover-photo-slot={
                  slot === 0 ? "prev" : slot === 1 ? "current" : "next"
                }
                data-people-feed-single-frame={isFront ? "true" : undefined}
              >
                {src && !failed ? (
                  <img
                    ref={isFront ? frontImgRef : undefined}
                    src={src}
                    alt=""
                    className="pointer-events-none h-full w-full object-cover object-center"
                    draggable={false}
                    decoding="async"
                    loading={isFront ? "eager" : "lazy"}
                    fetchPriority={isFront ? "high" : "auto"}
                    onLoad={() => {
                      if (isFront) setFrontPaintReady(true);
                    }}
                    onError={() => {
                      setFailedPaths((prev) => {
                        if (prev.has(path)) return prev;
                        const next = new Set(prev);
                        next.add(path);
                        return next;
                      });
                      if (isFront) setFrontPaintReady(false);
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[var(--surface-2)]" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[10] h-full w-full overflow-hidden"
        style={{
          borderRadius: mediaRadius,
          transform: `translate(-50%, -50%) rotate(${PEOPLE_DUO_FRONT_ROTATE_DEG}deg)`,
        }}
        data-people-duo-photo-frame="true"
        data-people-mine-identity-plate="true"
      >
        {identityOverlay}
        <button
          ref={fullscreenBtnRef}
          type="button"
          data-people-mine-fullscreen-hit="true"
          data-people-mine-identity-hit="true"
          aria-label="View full screen"
          disabled={!frontPaintReady}
          className="pointer-events-auto absolute top-1 right-1 z-[12] flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-100"
          onPointerDown={isolateFullscreenPointer}
          onPointerUp={isolateFullscreenPointer}
          onPointerCancel={isolateFullscreenPointer}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openGallery();
          }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/28 text-white/85 opacity-70"
            aria-hidden
          >
            <PiArrowsOut className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>

      {photoCount > 1 ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-2.5 z-[12] flex justify-center"
          aria-hidden
          data-people-photo-indicators="true"
          data-people-photo-indicators-placement="bottom"
        >
          <div className="flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1 backdrop-blur-[2px] app-light:bg-black/28">
            {photos.map((photo, i) => (
              <span
                key={`${photo}-${i}`}
                className={[
                  "h-1.5 w-1.5 rounded-full ring-1 ring-black/25",
                  i === activeIndex ? "bg-white shadow-sm" : "bg-white/45",
                ].join(" ")}
                data-people-photo-indicator-active={
                  i === activeIndex ? "true" : "false"
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <MediaGalleryLightbox
        images={photos}
        open={galleryOpen}
        activeIndex={activeIndex}
        onActiveIndexChange={onGalleryIndexChange}
        onClose={closeGallery}
      />
    </div>
  );
}
