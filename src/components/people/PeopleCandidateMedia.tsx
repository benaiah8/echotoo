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
  profileIdentityInitial,
  resolveProfileIdentityMedia,
  type ProfileIdentityMediaSource,
} from "../../lib/profileIdentityMedia";
import {
  PEOPLE_DUO_FRONT_RADIUS,
  PEOPLE_DUO_FRONT_ROTATE_DEG,
  PEOPLE_DUO_PHOTO_BORDER_FRONT_CSS,
  PEOPLE_DUO_PHOTO_BORDER_REAR_CSS,
  PEOPLE_DUO_REAR_OPACITY,
  PEOPLE_DUO_REAR_RADIUS,
  PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
  PEOPLE_MINE_CARD_RADIUS,
  PEOPLE_MINE_FRONT_SHADOW,
  PEOPLE_PHOTO_CROSSFADE_EASE,
  PEOPLE_PHOTO_CROSSFADE_MS,
  PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX,
  ensureMountedPhotoDecoded,
  isMountedPhotoPaintReady,
  peopleDuoPeekTransformOrigin,
  peopleDuoPhotoPeekTransform,
  peopleMineCardTransform,
  peopleMineCardZIndex,
  peopleMineStackAssignments,
  peoplePhotoStackPeeks,
  prefersPeopleMotionReduce,
  shouldAcceptMountedFrontDecode,
  type PeopleDuoPeekDirection,
  type PeopleDuoPresentationVariant,
  type PeopleMineStackRole,
} from "../../lib/people/peopleCandidateMediaPresentation";
import { peopleDebugRecord } from "../../lib/people/peopleDeckDebug";
import { mineStackImageLoadingAttrs } from "../../lib/people/mineCandidateImageWarm";

const MINE_GALLERY_HISTORY_MARKER = "minePortraitGallery";

/** Shell atmosphere: displayed front path + paint readiness (Mine only). */
export type PeopleMineAtmosphereReport = {
  /** Same key as Mine tap identity (`opportunity_id:personKey`). */
  identityKey: string;
  /** Storage / preset path for the displayed front image, or null. */
  path: string | null;
  /** True when that front image is paint-ready (or resolved non-photo identity). */
  ready: boolean;
};

export type PeopleCandidateMediaProps = {
  source: ProfileIdentityMediaSource;
  activeIndex: number;
  onActiveIndexChange?: (index: number) => void;
  withPhoto?: boolean;
  isCurrent?: boolean;
  className?: string;
  enableTapCycle?: boolean;
  /** Explicit Mine vs Discover presentation (preferred over peekDirection alone). */
  presentation?: PeopleDuoPresentationVariant;
  /**
   * @deprecated Prefer `presentation`. Still used by Discover legacy peeks.
   */
  peekDirection?: PeopleDuoPeekDirection;
  /**
   * Identity (name/bio + gradient). Mine: fixed over front rect, outside moving cards.
   * Discover: inside front frame (legacy).
   */
  identityOverlay?: ReactNode;
  /**
   * Stable per-opportunity gesture identity for Mine tap hardening
   * (`opportunity_id` + person key). Photo index cache stays person-keyed.
   */
  tapIdentityKey?: string;
  /**
   * Mine shell atmosphere — report displayed ready front only while `isCurrent`.
   * Parent ignores stale identity keys after candidate change.
   */
  onMineAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
};

const PRESET_SHELL =
  "flex h-[46%] max-h-[11rem] w-[46%] max-w-[11rem] items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]/50";

const FACE_IN_FROM = "translateX(6px) scale(0.99)";
const FACE_OUT_TO = "translateX(-5px) scale(0.99)";
const FACE_SETTLED = "translateX(0) scale(1)";

const FRONT_SHADOW = PEOPLE_MINE_FRONT_SHADOW;

/**
 * People Duo portrait media — Profile-style fan for Discover;
 * Mine uses photo-keyed card-slot advance. Never imports ProfilePhotoHero.
 */
export default function PeopleCandidateMedia({
  source,
  activeIndex,
  onActiveIndexChange,
  withPhoto = true,
  isCurrent = false,
  className = "",
  enableTapCycle = true,
  presentation = "discover",
  peekDirection = "down",
  identityOverlay,
  tapIdentityKey,
  onMineAtmosphereChange,
}: PeopleCandidateMediaProps) {
  const isMine = presentation === "mine";
  const resolved = resolveProfileIdentityMedia(source);
  const photos = resolved.photos.slice(0, 3);
  const photoCount = photos.length;
  const safeIndex =
    photoCount > 0
      ? ((activeIndex % photoCount) + photoCount) % photoCount
      : 0;

  const photosKey = photos.join("|");
  const identityKey = tapIdentityKey ?? photosKey;
  const usesMinePhotoStack =
    isMine && withPhoto && resolved.kind === "photos" && photoCount > 0;

  // Mine echo / legacy / empty — report when current (photo stack reports itself).
  useEffect(() => {
    if (!isMine || !onMineAtmosphereChange || usesMinePhotoStack) return;
    if (!isCurrent) return;
    let path: string | null = null;
    if (resolved.kind === "echo" && resolved.echoPreset) {
      path = resolved.echoPreset;
    } else if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
      path = resolved.primaryPhoto;
    }
    const ready = Boolean(path && avatarDisplayUrl(path));
    onMineAtmosphereChange({
      identityKey,
      path: ready ? path : null,
      ready,
    });
  }, [
    identityKey,
    isCurrent,
    isMine,
    onMineAtmosphereChange,
    resolved.echoPreset,
    resolved.kind,
    resolved.primaryPhoto,
    usesMinePhotoStack,
  ]);

  /** Discover: handlers only while current. Mine: track presses early; activate on up. */
  const trackPhotoPointers =
    photoCount > 1 && withPhoto && (isMine || (enableTapCycle && isCurrent));
  const canCyclePhotos =
    enableTapCycle && photoCount > 1 && withPhoto && isCurrent;

  const isCurrentRef = useRef(isCurrent);
  isCurrentRef.current = isCurrent;
  const canCycleRef = useRef(canCyclePhotos);
  canCycleRef.current = canCyclePhotos;
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;

  const tapOriginRef = useRef<{
    x: number;
    y: number;
    id: number;
    identityKey: string;
  } | null>(null);

  const clearTapOrigin = useCallback(() => {
    tapOriginRef.current = null;
  }, []);

  const cycle = useCallback(() => {
    if (!enableTapCycle || photoCount <= 1 || !onActiveIndexChange) return;
    onActiveIndexChange((safeIndex + 1) % photoCount);
  }, [enableTapCycle, onActiveIndexChange, photoCount, safeIndex]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!trackPhotoPointers) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const t = e.target;
      if (
        t instanceof Element &&
        (t.closest("[data-people-mine-identity-hit]") ||
          t.closest("[data-people-mine-fullscreen-hit]"))
      ) {
        clearTapOrigin();
        return;
      }
      tapOriginRef.current = {
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        identityKey: identityKeyRef.current,
      };
    },
    [clearTapOrigin, trackPhotoPointers]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const origin = tapOriginRef.current;
      tapOriginRef.current = null;
      if (!origin || origin.id !== e.pointerId) {
        if (import.meta.env.DEV && trackPhotoPointers) {
          peopleDebugRecord("mine:photoTap", {
            outcome: "reject",
            reason: !origin ? "no-origin" : "pointer-id-mismatch",
            isCurrent: isCurrentRef.current,
            identityKey: identityKeyRef.current,
          });
        }
        return;
      }
      // Never transfer a press that started on a different candidate.
      if (origin.identityKey !== identityKeyRef.current) {
        if (import.meta.env.DEV) {
          peopleDebugRecord("mine:photoTap", {
            outcome: "reject",
            reason: "identity-mismatch",
            isCurrent: isCurrentRef.current,
            identityKey: identityKeyRef.current,
            originIdentityKey: origin.identityKey,
          });
        }
        return;
      }
      const dx = Math.abs(e.clientX - origin.x);
      const dy = Math.abs(e.clientY - origin.y);
      if (
        dx > PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX ||
        dy > PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX
      ) {
        if (import.meta.env.DEV) {
          peopleDebugRecord("mine:photoTap", {
            outcome: "reject",
            reason: "moved",
            dx,
            dy,
            isCurrent: isCurrentRef.current,
            identityKey: identityKeyRef.current,
          });
        }
        return;
      }
      if (!canCycleRef.current) {
        if (import.meta.env.DEV) {
          peopleDebugRecord("mine:photoTap", {
            outcome: "reject",
            reason: "not-interactive",
            isCurrent: isCurrentRef.current,
            identityKey: identityKeyRef.current,
          });
        }
        return;
      }
      e.stopPropagation();
      if (import.meta.env.DEV) {
        peopleDebugRecord("mine:photoTap", {
          outcome: "cycle",
          isCurrent: isCurrentRef.current,
          identityKey: identityKeyRef.current,
        });
      }
      cycle();
    },
    [cycle, trackPhotoPointers]
  );

  const onPointerCancel = useCallback(() => {
    if (import.meta.env.DEV && tapOriginRef.current) {
      peopleDebugRecord("mine:photoTap", {
        outcome: "reject",
        reason: "cancelled",
        isCurrent: isCurrentRef.current,
        identityKey: identityKeyRef.current,
      });
    }
    clearTapOrigin();
  }, [clearTapOrigin]);

  const initial = profileIdentityInitial(source);

  const shellProps = {
    className: `relative h-full w-full overflow-visible ${className}`.trim(),
    onPointerDown: trackPhotoPointers ? onPointerDown : undefined,
    onPointerUp: trackPhotoPointers ? onPointerUp : undefined,
    onPointerCancel: trackPhotoPointers ? onPointerCancel : undefined,
    onKeyDown: canCyclePhotos
      ? (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            // Nested Mine bio / fullscreen controls own Space/Enter when focused.
            const t = e.target;
            if (
              t instanceof Element &&
              (t.closest("[data-people-mine-identity-hit]") ||
                t.closest("[data-people-mine-fullscreen-hit]"))
            ) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            cycle();
          }
        }
      : undefined,
    // Mine hosts an expandable bio <button>; avoid nested button semantics.
    role: canCyclePhotos
      ? isMine
        ? ("group" as const)
        : ("button" as const)
      : undefined,
    tabIndex: canCyclePhotos ? 0 : undefined,
    "aria-label": canCyclePhotos ? "Show next photo" : undefined,
  };

  if (usesMinePhotoStack) {
    return (
      <MinePhotoStack
        {...shellProps}
        photos={photos}
        safeIndex={safeIndex}
        isCurrent={isCurrent}
        identityOverlay={identityOverlay}
        initial={initial}
        atmosphereIdentityKey={identityKey}
        onMineAtmosphereChange={onMineAtmosphereChange}
        onActiveIndexChange={onActiveIndexChange}
        onRevertActiveIndex={onActiveIndexChange}
      />
    );
  }

  return (
    <DiscoverLegacyMedia
      {...shellProps}
      source={source}
      resolved={resolved}
      photos={photos}
      photoCount={photoCount}
      safeIndex={safeIndex}
      withPhoto={withPhoto}
      isCurrent={isCurrent}
      peekDirection={peekDirection}
      identityOverlay={identityOverlay}
      initial={initial}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Mine: photo-keyed cards + readiness-gated promote                          */
/* -------------------------------------------------------------------------- */

function MinePhotoStack({
  photos,
  safeIndex,
  isCurrent,
  identityOverlay,
  initial,
  atmosphereIdentityKey,
  onMineAtmosphereChange,
  onActiveIndexChange,
  onRevertActiveIndex,
  ...shellProps
}: {
  photos: string[];
  safeIndex: number;
  isCurrent: boolean;
  identityOverlay?: ReactNode;
  initial: string;
  atmosphereIdentityKey: string;
  onMineAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
  onActiveIndexChange?: (index: number) => void;
  onRevertActiveIndex?: (index: number) => void;
} & Record<string, unknown>) {
  const photoCount = photos.length;
  const reduceMotion = prefersPeopleMotionReduce();
  const photosKey = photos.join("|");

  /** Last successfully shown front index (may lag controlled safeIndex). */
  const [displayedIndex, setDisplayedIndex] = useState(safeIndex);
  const [phase, setPhase] = useState<"idle" | "pending" | "animating">("idle");
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);
  const [demotingIndex, setDemotingIndex] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  /** Front photo paint-ready for gallery open; never gates icon visibility. */
  const [frontPaintReady, setFrontPaintReady] = useState(false);

  const imgRefs = useRef<Map<number, HTMLImageElement>>(new Map());
  const genRef = useRef(0);
  /** Generation for current-front decode rechecks (separate from photo-cycle gen). */
  const frontDecodeGenRef = useRef(0);
  const isCurrentRef = useRef(isCurrent);
  isCurrentRef.current = isCurrent;
  const displayedRef = useRef(displayedIndex);
  displayedRef.current = displayedIndex;
  const settleTimerRef = useRef(0);
  const fullscreenBtnRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);
  const galleryHistoryPushedRef = useRef(false);
  const gallerySkipPopstateRef = useRef(false);
  const galleryOpenRef = useRef(false);
  const galleryClosingRef = useRef(false);
  /** Suppress portrait tap-cycle after gallery close (portal click-through). */
  const galleryClickThroughGuardUntilRef = useRef(0);
  galleryOpenRef.current = galleryOpen;

  const invalidate = useCallback(() => {
    genRef.current += 1;
    frontDecodeGenRef.current += 1;
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = 0;
    }
  }, []);

  // Person / photo-list change: reset to controlled index.
  useEffect(() => {
    invalidate();
    setDisplayedIndex(safeIndex);
    setPhase("idle");
    setPromotingIndex(null);
    setDemotingIndex(null);
    setGalleryOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on list identity
  }, [photosKey, invalidate]);

  useEffect(() => {
    return () => {
      invalidate();
    };
  }, [invalidate]);

  const closeGallery = useCallback(() => {
    // Ignore Swiper slideChange during teardown so close does not snap index to 0.
    galleryClosingRef.current = true;
    galleryOpenRef.current = false;
    // Same-gesture click-through can hit the portrait and cycle (e.g. 2→0).
    // Register swallow immediately — a useEffect would miss the residual click.
    galleryClickThroughGuardUntilRef.current = Date.now() + 400;
    const swallow = (e: Event) => {
      if (Date.now() >= galleryClickThroughGuardUntilRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("click", swallow, true);
    document.addEventListener("pointerup", swallow, true);
    window.setTimeout(() => {
      document.removeEventListener("click", swallow, true);
      document.removeEventListener("pointerup", swallow, true);
    }, 450);
    setGalleryOpen(false);
  }, []);

  // Swallow residual clicks is armed synchronously in closeGallery.

  const openGallery = useCallback(() => {
    if (!isCurrent || photoCount <= 0) return;
    const startIndex = displayedRef.current;
    const img = imgRefs.current.get(startIndex) ?? null;
    if (!isMountedPhotoPaintReady(img)) return;
    const active = document.activeElement;
    focusRestoreRef.current =
      active instanceof HTMLElement ? active : fullscreenBtnRef.current;
    galleryClosingRef.current = false;
    // Open on the painted front; reconcile controlled index if a promote was pending.
    if (onActiveIndexChange && safeIndex !== startIndex) {
      onActiveIndexChange(startIndex);
    }
    galleryOpenRef.current = true;
    setGalleryOpen(true);
  }, [isCurrent, onActiveIndexChange, photoCount, safeIndex]);

  // Android hardware Back closes gallery before People/deck.
  // Browser Back: synthetic history while open; pop deferred after close so
  // portrait index commits before any React Router remount.
  useEffect(() => {
    if (!galleryOpen) return;

    notifyMediaGalleryLightboxOpened();

    if (typeof window !== "undefined" && !galleryHistoryPushedRef.current) {
      window.history.pushState(
        { [MINE_GALLERY_HISTORY_MARKER]: true },
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
    if (!(st && st[MINE_GALLERY_HISTORY_MARKER] === true)) {
      galleryHistoryPushedRef.current = false;
      return;
    }
    gallerySkipPopstateRef.current = true;
    const t = window.setTimeout(() => {
      const cur = window.history.state as Record<string, boolean> | null;
      if (cur && cur[MINE_GALLERY_HISTORY_MARKER] === true) {
        window.history.back();
      }
      galleryHistoryPushedRef.current = false;
    }, 100);
    return () => window.clearTimeout(t);
  }, [galleryOpen]);

  // Restore focus only after an open→close transition (not on mount).
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

  const beginPromote = useCallback(
    (fromIndex: number, toIndex: number, gen: number) => {
      if (gen !== genRef.current) return;
      if (reduceMotion) {
        setDisplayedIndex(toIndex);
        setPhase("idle");
        setPromotingIndex(null);
        setDemotingIndex(null);
        return;
      }
      setPromotingIndex(toIndex);
      setDemotingIndex(fromIndex);
      setPhase("animating");
      setDisplayedIndex(toIndex);
      // Clear motion flags when the demoting card finishes its transform —
      // matches animated endpoint (avoids timer/chrome desync).
      settleTimerRef.current = window.setTimeout(() => {
        if (gen !== genRef.current) return;
        setPromotingIndex(null);
        setDemotingIndex(null);
        setPhase("idle");
        settleTimerRef.current = 0;
      }, PEOPLE_PHOTO_CROSSFADE_MS);
    },
    [reduceMotion]
  );

  const failPromote = useCallback(
    (gen: number, keepIndex: number) => {
      if (gen !== genRef.current) return;
      setPhase("idle");
      setPromotingIndex(null);
      setDemotingIndex(null);
      // Reconcile controlled index so later taps are not stuck ahead of display.
      if (onRevertActiveIndex && keepIndex !== safeIndex) {
        onRevertActiveIndex(keepIndex);
      }
    },
    [onRevertActiveIndex, safeIndex]
  );

  const tryPromoteTo = useCallback(
    async (requested: number) => {
      const from = displayedRef.current;
      if (requested === from) {
        setPhase("idle");
        setPromotingIndex(null);
        setDemotingIndex(null);
        return;
      }

      const gen = ++genRef.current;
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = 0;
      }

      setPhase("pending");
      const img = imgRefs.current.get(requested) ?? null;

      if (!isMountedPhotoPaintReady(img)) {
        // Wait for load/error on the mounted element — no new Image() warming.
        return;
      }

      const decoded = await ensureMountedPhotoDecoded(img);
      if (gen !== genRef.current) return;
      if (!decoded) {
        failPromote(gen, from);
        return;
      }
      beginPromote(from, requested, gen);
    },
    [beginPromote, failPromote]
  );

  // Controlled index → request promote (rapid taps retarget latest).
  // Do not depend on phase — waiting for mounted onLoad must not bump gen in a loop.
  useLayoutEffect(() => {
    void tryPromoteTo(safeIndex);
  }, [safeIndex, photosKey, tryPromoteTo]);

  const onImgLoad = useCallback(
    (photoIndex: number) => {
      if (photoIndex === displayedRef.current) {
        setFrontPaintReady(true);
      }
      if (photoIndex !== safeIndex) return;
      if (safeIndex === displayedRef.current) return;
      void tryPromoteTo(safeIndex);
    },
    [safeIndex, tryPromoteTo]
  );

  const onImgError = useCallback(
    (photoIndex: number) => {
      if (photoIndex === displayedRef.current) {
        setFrontPaintReady(false);
      }
      if (photoIndex !== safeIndex) return;
      if (safeIndex === displayedRef.current) return;
      failPromote(genRef.current, displayedRef.current);
    },
    [failPromote, safeIndex]
  );

  const roleByPhoto = new Map<number, PeopleMineStackRole>();
  for (const a of peopleMineStackAssignments(photoCount, displayedIndex)) {
    roleByPhoto.set(a.photoIndex, a.role);
  }

  const setImgRef = useCallback(
    (photoIndex: number, node: HTMLImageElement | null) => {
      if (node) imgRefs.current.set(photoIndex, node);
      else imgRefs.current.delete(photoIndex);
      if (photoIndex === displayedRef.current) {
        setFrontPaintReady(isMountedPhotoPaintReady(node));
      }
    },
    []
  );

  // Sync front readiness from the mounted <img> — including when a neighbor
  // becomes current (cached images may skip a second onLoad).
  // Do not treat warm-cache alone as ready; only the real element counts.
  useLayoutEffect(() => {
    const img = imgRefs.current.get(displayedIndex) ?? null;
    const ready = isMountedPhotoPaintReady(img);
    setFrontPaintReady(ready);

    if (!isCurrent || !ready || !img) return;

    const checkGen = ++frontDecodeGenRef.current;
    const photoIndex = displayedIndex;
    void ensureMountedPhotoDecoded(img).then((decoded) => {
      if (
        !shouldAcceptMountedFrontDecode({
          checkGeneration: checkGen,
          currentGeneration: frontDecodeGenRef.current,
          decodedPhotoIndex: photoIndex,
          displayedPhotoIndex: displayedRef.current,
          stillCurrent: isCurrentRef.current,
        })
      ) {
        return;
      }
      if (decoded) {
        setFrontPaintReady(true);
      }
    });

    return () => {
      frontDecodeGenRef.current += 1;
    };
  }, [displayedIndex, photosKey, isCurrent]);

  // Shell atmosphere: only current slide; ready follows displayed front (not speculative index).
  useEffect(() => {
    if (!onMineAtmosphereChange || !isCurrent) return;
    const path = photos[displayedIndex] ?? null;
    const ready = Boolean(path && frontPaintReady);
    onMineAtmosphereChange({
      identityKey: atmosphereIdentityKey,
      path: ready ? path : null,
      ready,
    });
  }, [
    atmosphereIdentityKey,
    displayedIndex,
    frontPaintReady,
    isCurrent,
    onMineAtmosphereChange,
    photos,
  ]);

  const fullscreenCanActivate = isCurrent && frontPaintReady;

  const onGalleryIndexChange = useCallback(
    (index: number) => {
      if (galleryClosingRef.current || !galleryOpenRef.current) return;
      onActiveIndexChange?.(index);
    },
    [onActiveIndexChange]
  );

  const isolateFullscreenPointer = useCallback(
    (e: ReactPointerEvent) => {
      e.stopPropagation();
    },
    []
  );

  const shellOnPointerDown = shellProps.onPointerDown as
    | ((e: ReactPointerEvent<HTMLDivElement>) => void)
    | undefined;
  const shellOnPointerUp = shellProps.onPointerUp as
    | ((e: ReactPointerEvent<HTMLDivElement>) => void)
    | undefined;
  const shellOnPointerCancel = shellProps.onPointerCancel as
    | ((e: ReactPointerEvent<HTMLDivElement>) => void)
    | undefined;
  const shellOnKeyDown = shellProps.onKeyDown as
    | ((e: React.KeyboardEvent<HTMLDivElement>) => void)
    | undefined;

  const guardedShellProps = {
    ...shellProps,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (Date.now() < galleryClickThroughGuardUntilRef.current) {
        e.stopPropagation();
        return;
      }
      shellOnPointerDown?.(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (Date.now() < galleryClickThroughGuardUntilRef.current) {
        e.stopPropagation();
        return;
      }
      shellOnPointerUp?.(e);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (Date.now() < galleryClickThroughGuardUntilRef.current) {
        e.stopPropagation();
        return;
      }
      shellOnPointerCancel?.(e);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (Date.now() < galleryClickThroughGuardUntilRef.current) {
        e.stopPropagation();
        return;
      }
      shellOnKeyDown?.(e);
    },
  };

  return (
    <div
      {...guardedShellProps}
      data-people-mine-stack="true"
      data-people-mine-phase={phase}
      data-people-mine-gallery={galleryOpen ? "open" : "closed"}
      aria-label={
        interactiveAriaLabel(
          shellProps["aria-label"],
          displayedIndex,
          photoCount
        )
      }
    >
      {photos.map((path, photoIndex) => {
        const role = roleByPhoto.get(photoIndex);
        if (!role) return null;
        const src = avatarDisplayUrl(path);
        const motion =
          photoIndex === promotingIndex
            ? "promoting"
            : photoIndex === demotingIndex
              ? "demoting"
              : "settled";
        // Chrome is identical for all roles; only transform + z change.
        // 3+ photos: destination settled z for the whole flight (no late A/C snap).
        // 2 photos: promoting/demoting elevation avoids under-pop.
        const z = peopleMineCardZIndex(role, motion, photoCount);
        const loadAttrs = mineStackImageLoadingAttrs({
          isCurrent,
          photoIndex,
          displayedIndex,
        });

        return (
          <div
            key={path}
            className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full overflow-hidden bg-[var(--surface-2)]"
            style={{
              borderRadius: PEOPLE_MINE_CARD_RADIUS,
              border: "none",
              zIndex: z,
              opacity: 1,
              transformOrigin: PEOPLE_MINE_CARD_TRANSFORM_ORIGIN,
              transform: peopleMineCardTransform(role),
              boxShadow: FRONT_SHADOW,
              transition: reduceMotion
                ? undefined
                : `transform ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`,
            }}
            data-people-mine-card={role}
            data-people-mine-photo-index={photoIndex}
            data-people-mine-motion={motion}
            aria-hidden
          >
            {src ? (
              <img
                ref={(node) => setImgRef(photoIndex, node)}
                src={src}
                alt=""
                className="pointer-events-none h-full w-full object-cover object-center"
                draggable={false}
                loading={loadAttrs.loading}
                decoding="async"
                fetchPriority={loadAttrs.fetchPriority}
                onLoad={() => onImgLoad(photoIndex)}
                onError={() => onImgError(photoIndex)}
              />
            ) : (
              <EmptyFallback initial={initial} />
            )}
          </div>
        );
      })}

      {/* Fixed identity over front rectangle — outside moving cards */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[10] h-full w-full overflow-hidden"
        style={{
          borderRadius: PEOPLE_MINE_CARD_RADIUS,
          transform: `translate(-50%, -50%) rotate(${PEOPLE_DUO_FRONT_ROTATE_DEG}deg)`,
        }}
        data-people-duo-photo-frame="true"
        data-people-mine-identity-plate="true"
      >
        {identityOverlay}
        {/* Always mount with photo portraits — visibility must not wait for isCurrent. */}
        <button
          ref={isCurrent ? fullscreenBtnRef : undefined}
          type="button"
          data-people-mine-fullscreen-hit={isCurrent ? "true" : undefined}
          data-people-mine-identity-hit={isCurrent ? "true" : undefined}
          aria-label="View full screen"
          aria-hidden={isCurrent ? undefined : true}
          tabIndex={isCurrent ? 0 : -1}
          disabled={!fullscreenCanActivate}
          className={[
            "absolute top-1 right-1 z-[12] flex h-11 w-11 items-center justify-center touch-manipulation",
            "disabled:opacity-100",
            isCurrent ? "pointer-events-auto" : "pointer-events-none",
          ].join(" ")}
          onPointerDown={isCurrent ? isolateFullscreenPointer : undefined}
          onPointerUp={isCurrent ? isolateFullscreenPointer : undefined}
          onPointerCancel={isCurrent ? isolateFullscreenPointer : undefined}
          onClick={
            isCurrent
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openGallery();
                }
              : undefined
          }
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-sm backdrop-blur-md"
            aria-hidden
          >
            <PiArrowsOut className="h-4 w-4" />
          </span>
        </button>
      </div>

      <MediaGalleryLightbox
        images={photos}
        open={galleryOpen}
        activeIndex={safeIndex}
        onActiveIndexChange={onGalleryIndexChange}
        onClose={closeGallery}
      />
    </div>
  );
}

function interactiveAriaLabel(
  base: unknown,
  displayedIndex: number,
  photoCount: number
): string | undefined {
  if (photoCount <= 1) {
    return typeof base === "string" ? base : undefined;
  }
  return `Show next photo, ${displayedIndex + 1} of ${photoCount}`;
}

/* -------------------------------------------------------------------------- */
/* Discover / non-Mine legacy face crossfade                                  */
/* -------------------------------------------------------------------------- */

function DiscoverLegacyMedia({
  resolved,
  photos,
  photoCount,
  safeIndex,
  withPhoto,
  isCurrent,
  peekDirection,
  identityOverlay,
  initial,
  ...shellProps
}: {
  source: ProfileIdentityMediaSource;
  resolved: ReturnType<typeof resolveProfileIdentityMedia>;
  photos: string[];
  photoCount: number;
  safeIndex: number;
  withPhoto: boolean;
  isCurrent: boolean;
  peekDirection: PeopleDuoPeekDirection;
  identityOverlay?: ReactNode;
  initial: string;
} & Record<string, unknown>) {
  const reduceMotion = prefersPeopleMotionReduce();
  const [displayIndex, setDisplayIndex] = useState(safeIndex);
  const [frontMotion, setFrontMotion] = useState<"idle" | "out" | "in">("idle");

  useEffect(() => {
    if (photoCount <= 1 || reduceMotion) {
      setDisplayIndex(safeIndex);
      setFrontMotion("idle");
      return;
    }
    if (safeIndex === displayIndex) return;
    setFrontMotion("out");
    let settleTimer = 0;
    const outTimer = window.setTimeout(() => {
      setDisplayIndex(safeIndex);
      setFrontMotion("in");
      settleTimer = window.setTimeout(
        () => setFrontMotion("idle"),
        PEOPLE_PHOTO_CROSSFADE_MS
      );
    }, PEOPLE_PHOTO_CROSSFADE_MS / 2);
    return () => {
      window.clearTimeout(outTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [safeIndex, photoCount, reduceMotion, displayIndex]);

  const peeks = peoplePhotoStackPeeks(photoCount, isCurrent && withPhoto);

  const frontRadiusStyle = {
    borderRadius: PEOPLE_DUO_FRONT_RADIUS,
    border: `1px solid ${PEOPLE_DUO_PHOTO_BORDER_FRONT_CSS}`,
  } as const;
  const rearRadiusStyle = {
    borderRadius: PEOPLE_DUO_REAR_RADIUS,
    border: `1px solid ${PEOPLE_DUO_PHOTO_BORDER_REAR_CSS}`,
  } as const;

  const faceTransition = reduceMotion
    ? undefined
    : `opacity ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}, transform ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`;

  let stack: ReactNode;

  if (!withPhoto) {
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[var(--surface-2)] shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
        style={frontRadiusStyle}
        aria-hidden
      />
    );
  } else if (resolved.kind === "photos" && photoCount > 0) {
    const frontPath = photos[displayIndex] ?? photos[safeIndex];
    const frontSrc = frontPath ? avatarDisplayUrl(frontPath) : undefined;

    const rearPaths: string[] = [];
    for (let i = 1; i < photoCount && rearPaths.length < peeks.length; i += 1) {
      const p = photos[(displayIndex + i) % photoCount];
      if (p) rearPaths.push(p);
    }

    const faceOpacity =
      reduceMotion || frontMotion === "idle"
        ? 1
        : frontMotion === "out"
          ? 0.55
          : 1;
    const faceTransform =
      reduceMotion || frontMotion === "idle"
        ? FACE_SETTLED
        : frontMotion === "out"
          ? FACE_OUT_TO
          : FACE_IN_FROM;

    stack = (
      <>
        {peeks.map((peek, i) => {
          const path = rearPaths[i];
          if (!path) return null;
          const src = avatarDisplayUrl(path);
          if (!src) return null;
          return (
            <div
              key={`peek-${path}-${peek.side}-${peek.depth}`}
              className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-full w-full overflow-hidden bg-[var(--surface-2)] shadow-[0_6px_18px_rgba(0,0,0,0.16)]"
              style={{
                ...rearRadiusStyle,
                zIndex: peek.zIndex,
                opacity: PEOPLE_DUO_REAR_OPACITY,
                transformOrigin: peopleDuoPeekTransformOrigin(peekDirection),
                transform: peopleDuoPhotoPeekTransform(
                  peek.side,
                  peek.depth,
                  peekDirection
                ),
                transition: reduceMotion
                  ? undefined
                  : `transform ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}, opacity ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`,
              }}
              aria-hidden
            >
              <img
                src={src}
                alt=""
                className="pointer-events-none h-full w-full object-cover object-center"
                draggable={false}
                loading="lazy"
                decoding="async"
              />
            </div>
          );
        })}
        <div
          className="absolute left-1/2 top-1/2 z-[2] h-full w-full overflow-hidden bg-[var(--surface-2)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
          style={{
            ...frontRadiusStyle,
            transform: `translate(-50%, -50%) rotate(${PEOPLE_DUO_FRONT_ROTATE_DEG}deg)`,
          }}
          data-people-duo-photo-frame="true"
        >
          <div
            className="absolute inset-0"
            style={{
              opacity: faceOpacity,
              transform: faceTransform,
              transition: faceTransition,
            }}
          >
            {frontSrc ? (
              <img
                src={frontSrc}
                alt=""
                className="pointer-events-none h-full w-full object-cover object-center"
                draggable={false}
                loading={isCurrent ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={isCurrent ? "high" : "auto"}
              />
            ) : (
              <EmptyFallback initial={initial} />
            )}
          </div>
          {identityOverlay}
        </div>
      </>
    );
  } else if (resolved.kind === "echo" && resolved.echoPreset) {
    const src = avatarDisplayUrl(resolved.echoPreset);
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] flex h-full w-full -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden bg-[var(--surface)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={frontRadiusStyle}
        data-people-duo-photo-frame="true"
      >
        {src ? (
          <div className={PRESET_SHELL}>
            <img
              src={src}
              alt=""
              className="pointer-events-none h-[86%] w-[86%] object-contain"
              draggable={false}
              loading={isCurrent ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ) : (
          <EmptyFallback initial={initial} />
        )}
        {identityOverlay}
      </div>
    );
  } else if (resolved.kind === "legacy-photo" && resolved.primaryPhoto) {
    const src = avatarDisplayUrl(resolved.primaryPhoto);
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[var(--surface-2)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={frontRadiusStyle}
        data-people-duo-photo-frame="true"
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="pointer-events-none h-full w-full object-cover object-center"
            draggable={false}
            loading={isCurrent ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={isCurrent ? "high" : "auto"}
          />
        ) : (
          <EmptyFallback initial={initial} />
        )}
        {identityOverlay}
      </div>
    );
  } else {
    stack = (
      <div
        className="absolute left-1/2 top-1/2 z-[2] h-full w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-[var(--surface)] shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={frontRadiusStyle}
        data-people-duo-photo-frame="true"
      >
        <EmptyFallback initial={initial} />
        {identityOverlay}
      </div>
    );
  }

  return (
    <div {...shellProps}>
      {stack}
      {isCurrent && withPhoto && photoCount > 1 ? (
        <div
          className="pointer-events-none absolute inset-x-3 top-2.5 z-[3] flex gap-1"
          aria-hidden
        >
          {photos.map((photo, i) => (
            <span
              key={`${photo}-${i}`}
              className={`h-[3px] flex-1 rounded-full ${
                i === safeIndex ? "bg-white/95" : "bg-white/35"
              }`}
              style={{
                transition: reduceMotion
                  ? undefined
                  : `opacity ${PEOPLE_PHOTO_CROSSFADE_MS}ms ${PEOPLE_PHOTO_CROSSFADE_EASE}`,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyFallback({ initial }: { initial: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)]">
      <div className="flex h-[38%] max-h-[9rem] w-[38%] max-w-[9rem] items-center justify-center rounded-full bg-[var(--brand)] font-semibold text-[var(--brand-ink)] ring-1 ring-[var(--border)]/40">
        <span className="text-[28px] leading-none">{initial}</span>
      </div>
    </div>
  );
}
