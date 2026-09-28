import useEmblaCarousel from "embla-carousel-react";
import { acquirePullToRefreshBlock } from "../../lib/pullToRefreshBlock";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  peopleDebugAttachEmbla,
  peopleDebugBumpRender,
  peopleDebugClassifyItemsChange,
  peopleDebugEmblaOptionsSignature,
  peopleDebugGetRenderCount,
  peopleDebugItemsSignature,
  peopleDebugObserveHostResize,
  peopleDebugObserveSlideImages,
  peopleDebugObserveSlides,
  peopleDebugRecord,
} from "../../lib/people/peopleDeckDebug";
import {
  logMatchDeckHostSizeTransition,
  logMatchDeckReadyTransition,
  resolveMatchDeckHostSize,
} from "../../lib/people/matchDeckHostSize";
import {
  computePeopleDiscoverCardMetrics,
  isPeopleDiscoverMetricsReady,
  PEOPLE_DISCOVER_GAP_PX,
  PEOPLE_DUO_CENTER_SCALE,
  PEOPLE_DUO_NEIGHBOR_SCALE,
  prefersPeopleMotionReduce,
  type PeopleDiscoverCardMetrics,
  type PeopleDuoPresentationVariant,
} from "../../lib/people/peopleCandidateMediaPresentation";
import {
  beginMineMotionProbeFlight,
  claimMineMotionProbeFlightDestination,
  clearMineEdgeCardNavVisual,
  clearMineIncomingRealSlideVisual,
  computeMineMotionProbeGeometry,
  computeMineMotionProbeProgress,
  hideMineMotionProbeVisual,
  lockMineMotionProbeFlight,
  measureMineMotionProbeLanding,
  MINE_NAV_PORTRAIT_SELECTOR,
  prepareMineMotionProbeProgrammaticFlight,
  queryMineMotionProbeFrontFrame,
  unlockMineMotionProbeFlight,
  writeMineIncomingRealSlideVisual,
  writeMineMotionProbeVisual,
  type MineMotionProbeController,
  type MineMotionProbeGeometry,
  type MineMotionProbeLanding,
} from "../../lib/people/mineMotionProbeProgress";
import { matchDeckPhotoMountRadius } from "../../lib/people/mineCandidateImageWarm";
import { isPeopleMineRealIncomingEnabled } from "./matchDeckDevMocks";
import type { MineEdgeNavCardsHandle } from "../../components/people/MineEdgeNavCards";
import { peopleMineEmblaAllowsDragFromTarget } from "../../lib/people/mineIdentityGesture";

const GAP = 10;
const SIDE_PEEK = 32;
const MAX_CARD_W = 340;
const MIN_CARD_W = 176;
const WIDTH_VW = 0.72;
const TALL_ASPECT = 0.62;
const VERT_BREATH = 8;
const WIDE_ASPECT = 0.8;
const MAX_CARD_H = 520;
const MAX_CARD_H_VH = 0.52;
const SIDE_OPACITY = 0.72;
const CENTER_OPACITY = 1;

type EmblaCarouselApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;

/** Progress-driven opacity + scale for Duo neighbor peeks (Discover). */
function applyPhysicalSlidePresentation(
  emblaApi: EmblaCarouselApi,
  withScale: boolean,
  mode: "peek" | "fullWidth" = "peek"
): void {
  const nodes = emblaApi.slideNodes();
  if (nodes.length === 0) return;

  // Mine full-width: neighbors leave by geometry — never gate content via opacity.
  if (mode === "fullWidth") {
    for (const node of nodes) {
      node.style.opacity = "1";
      node.style.transform = "";
    }
    return;
  }

  const snaps = emblaApi.scrollSnapList();
  if (snaps.length === 0) return;

  const scroll = emblaApi.internalEngine().location.get();
  let halfStep = 1;
  if (snaps.length > 1) {
    const step = Math.abs(snaps[1]! - snaps[0]!);
    halfStep = step > 0 ? step / 2 : 1;
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const snap = snaps[i];
    const node = nodes[i];
    if (snap === undefined || !node) continue;
    const dist = Math.abs(scroll - snap);
    const ratio = Math.min(1, dist / halfStep);
    const opacity = CENTER_OPACITY - ratio * (CENTER_OPACITY - SIDE_OPACITY);
    node.style.opacity = String(Number(opacity.toFixed(3)));
    if (withScale) {
      const scale =
        PEOPLE_DUO_CENTER_SCALE -
        ratio * (PEOPLE_DUO_CENTER_SCALE - PEOPLE_DUO_NEIGHBOR_SCALE);
      node.style.transform = `scale(${Number(scale.toFixed(4))})`;
      node.style.transformOrigin = "center center";
    } else {
      node.style.transform = "";
    }
  }
}

export type MatchDeckSlotMeta = {
  isCurrent: boolean;
  withPhoto: boolean;
  /**
   * Duo peeks: side of active card (legacy; slides no longer rotate).
   */
  neighborSide: "left" | "right" | null;
};

type MatchDeckCarouselItem = {
  opportunity_id: string | null;
  /** Fallback key when opportunity_id is null (source-unavailable Groups). */
  conversation_id?: string | null;
};

function carouselItemId(row: MatchDeckCarouselItem): string {
  const opp =
    typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
  if (opp) return opp;
  return typeof row.conversation_id === "string"
    ? row.conversation_id.trim()
    : "";
}

function clampIndex(next: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, next));
}

/**
 * Embla-backed Match Deck carousel. Physical drag/snap is owned by Embla;
 * parent owns logical index / currentOpportunityId.
 *
 * Discover: host is measured in useLayoutEffect before paint so the deck is
 * never shown with a 0-size fallback geometry that later snaps.
 */
export default function MatchDeckCarousel<T extends MatchDeckCarouselItem>({
  items,
  index,
  onIndexChange,
  onCardTap,
  locked = false,
  layout = "default",
  /** When false, Duo metrics skip in-flow source/note chrome (Open Plans). */
  duoInFlowChrome = true,
  /**
   * Mine: surplus vertical pads + upward-peek stack budget.
   * Discover: preserve width-first / items-start until parity pass.
   */
  duoPresentation = "discover" as PeopleDuoPresentationVariant,
  /**
   * DEV Mine motion probe / incoming proxy: shell-level surface written from
   * Embla `scroll` with no extra rAF. Production leaves this undefined.
   */
  mineMotionProbeRef = undefined as
    | RefObject<MineMotionProbeController | null>
    | undefined,
  /**
   * Overlay assigns a stable ref; Carousel writes prepare(destinationIndex, opts?)
   * that locks proxy media from Embla's current snap for that button target.
   * Button nav MUST call this before goToIndex.
   * opts.jump: Mine edge-button hops use Embla scrollTo(i, true) (instant).
   * Finger drag never uses this prepare path.
   */
  mineProxyProgrammaticPrepareRef = undefined as
    | RefObject<
        | ((destinationIndex: number, opts?: { jump?: boolean }) => void)
        | null
      >
    | undefined,
  /**
   * DEV real-incoming: Overlay-owned edge card button refs for subtle progress
   * response. Production leaves undefined.
   */
  mineEdgeNavCardsRef = undefined as
    | RefObject<MineEdgeNavCardsHandle | null>
    | undefined,
  renderItem,
}: {
  items: T[];
  index: number;
  onIndexChange: (next: number) => void;
  onCardTap?: () => void;
  locked?: boolean;
  /**
   * Duo Mine + Discover + Plans share portrait metrics (`duo` / legacy `discover`).
   * Plans uses duoPresentation="plans" for fixed-rail full-width geometry.
   */
  layout?: "default" | "duo" | "discover";
  duoInFlowChrome?: boolean;
  duoPresentation?: PeopleDuoPresentationVariant;
  mineMotionProbeRef?: RefObject<MineMotionProbeController | null>;
  mineProxyProgrammaticPrepareRef?: RefObject<
    ((destinationIndex: number, opts?: { jump?: boolean }) => void) | null
  >;
  mineEdgeNavCardsRef?: RefObject<MineEdgeNavCardsHandle | null>;
  renderItem: (candidate: T, meta: MatchDeckSlotMeta) => ReactNode;
}) {
  const isDuoLayout = layout === "duo" || layout === "discover";
  const isMinePresentation = isDuoLayout && duoPresentation === "mine";
  const isPlansPresentation = isDuoLayout && duoPresentation === "plans";
  /** Mine + Plans + Discover (canonical) share full-width fixed-rail geometry. */
  const isFullWidthPresentation = isMinePresentation || isPlansPresentation;
  const slidePresentationMode = isFullWidthPresentation ? "fullWidth" : "peek";
  /** DEV: real adjacent-slide translate+scale (suppresses proxy via flag helper). */
  const mineRealIncomingEnabled =
    isMinePresentation && isPeopleMineRealIncomingEnabled();
  const mineRealIncomingEnabledRef = useRef(mineRealIncomingEnabled);
  mineRealIncomingEnabledRef.current = mineRealIncomingEnabled;
  peopleDebugBumpRender("matchDeckCarousel", {
    index,
    itemCount: items.length,
    locked,
    layout: isDuoLayout ? "duo" : layout,
  });

  const hostRef = useRef<HTMLDivElement | null>(null);
  const emblaViewportRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Mirrors `size` for ResizeObserver sync without reading stale state. */
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const indexRef = useRef(index);
  indexRef.current = index;

  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  /** Embla's transient snap during drag — ref only, never drives React render. */
  const selectedSnapRef = useRef(index);

  const suppressSettleCommitRef = useRef(false);
  const startIndexRef = useRef(index);
  const lastDiscoverMetricsKeyRef = useRef("");
  /** Mine-only: early ownership commit must not run on Discover/Plans/Groups. */
  const isMinePresentationRef = useRef(isMinePresentation);
  isMinePresentationRef.current = isMinePresentation;
  const isFullWidthPresentationRef = useRef(isFullWidthPresentation);
  isFullWidthPresentationRef.current = isFullWidthPresentation;

  /** DEV probe: frozen departure snap; geometry cached from host width. */
  const mineProbeAnchorRef = useRef(index);
  const mineProbeRefBox = useRef(mineMotionProbeRef);
  mineProbeRefBox.current = mineMotionProbeRef;
  const mineProxyPrepareRefBox = useRef(mineProxyProgrammaticPrepareRef);
  mineProxyPrepareRefBox.current = mineProxyProgrammaticPrepareRef;
  /** Consumed by the index→scrollTo effect; set by prepare({ jump }). */
  const mineButtonScrollJumpRef = useRef(false);
  /** Blocks Home-style pull-to-refresh while Embla owns the pointer. */
  const releasePtrBlockRef = useRef<(() => void) | null>(null);
  const mineEdgeNavCardsRefBox = useRef(mineEdgeNavCardsRef);
  mineEdgeNavCardsRefBox.current = mineEdgeNavCardsRef;
  /** Cached portrait nav wrappers — refreshed on layout/reInit, not per scroll. */
  const minePortraitElsRef = useRef<(HTMLElement | null)[]>([]);
  const mineProbeGeomRef = useRef<MineMotionProbeGeometry>(
    computeMineMotionProbeGeometry(0)
  );

  const cacheMinePortraitEls = useCallback((slides: HTMLElement[]) => {
    minePortraitElsRef.current = slides.map(
      (slide) =>
        slide.querySelector<HTMLElement>(MINE_NAV_PORTRAIT_SELECTOR) ?? null
    );
  }, []);

  const clearMineRealIncomingVisuals = useCallback(
    (slides: HTMLElement[]) => {
      clearMineIncomingRealSlideVisual(slides);
      clearMineEdgeCardNavVisual(
        mineEdgeNavCardsRefBox.current?.current ?? null
      );
    },
    []
  );

  const writeMineRealIncomingFromProgress = useCallback(
    (
      emblaApi: EmblaCarouselApi,
      progress: { prev: number; next: number },
      forceSide: "prev" | "next" | null = null
    ) => {
      const geom = mineProbeGeomRef.current;
      const slideW = geom.shellW;
      if (!(slideW > 0)) return;
      const frameW = geom.frameW > 0 ? geom.frameW : 0;
      const frameH = geom.frameH > 0 ? geom.frameH : 0;
      const portraitCenterLocalX =
        geom.centerX > 0 ? geom.centerX : slideW / 2;
      writeMineIncomingRealSlideVisual({
        slides: emblaApi.slideNodes(),
        progress,
        departureIndex: mineProbeAnchorRef.current,
        slideW,
        portraitCenterLocalX,
        frameW,
        frameH,
        portraitEls: minePortraitElsRef.current,
        edgeCards: mineEdgeNavCardsRefBox.current?.current,
        animateEdgeCards:
          mineProbeRefBox.current?.current?.flightAnimateEdgeCards === true,
        forceSide,
      });
    },
    []
  );

  const emblaOptions = useMemo(
    () => ({
      align: "center" as const,
      loop: false,
      slidesToScroll: 1,
      dragFree: false,
      // Mine + Plans: one snap per gesture. Discover/Groups keep prior skipSnaps.
      skipSnaps: isFullWidthPresentation ? false : true,
      // Full-width edge PREVIOUS/NEXT scrollTo only — drag release uses force-based duration.
      // 15 is experimental (below Embla's recommended 20–60); full-width scoped only.
      ...(isFullWidthPresentation ? { duration: 15 } : {}),
      containScroll: false as const,
      // Fullscreen stays Embla-excluded. Name/bio identity hits may start
      // horizontal drag; their own move-threshold logic suppresses taps.
      watchDrag: (
        _api: EmblaCarouselApi,
        evt: globalThis.MouseEvent | globalThis.TouchEvent
      ): boolean => peopleMineEmblaAllowsDragFromTarget(locked, evt.target),
      startIndex: startIndexRef.current,
    }),
    [locked, isFullWidthPresentation]
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  const setEmblaViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      emblaViewportRef.current = node;
      emblaRef(node);
    },
    [emblaRef]
  );

  const discoverMetrics: PeopleDiscoverCardMetrics = useMemo(
    () =>
      computePeopleDiscoverCardMetrics({
        hostW: size.w,
        hostH: size.h,
        reserveInFlowChrome: isDuoLayout ? duoInFlowChrome : false,
        distributeVerticalSurplus: isFullWidthPresentation,
        upwardPeekPad: isMinePresentation,
        fullWidthSlide: isFullWidthPresentation,
        chromeProfile: isMinePresentation
          ? "mine"
          : isPlansPresentation
            ? "plans"
            : "discover",
      }),
    [
      size.w,
      size.h,
      isDuoLayout,
      duoInFlowChrome,
      isMinePresentation,
      isPlansPresentation,
      isFullWidthPresentation,
    ]
  );

  const metrics = useMemo(() => {
    if (size.w === 0 || size.h === 0) {
      return { cardW: 0, cardH: 0 };
    }
    if (layout === "duo" || layout === "discover") {
      return {
        cardW: discoverMetrics.slideW,
        cardH: discoverMetrics.slideH,
      };
    }
    const vwCap = size.w * WIDTH_VW;
    let cardW = Math.min(size.w - 2 * (SIDE_PEEK + GAP), MAX_CARD_W, vwCap);
    cardW = Math.max(cardW, Math.min(MIN_CARD_W, size.w));
    const vhCap =
      typeof window === "undefined"
        ? MAX_CARD_H
        : Math.min(MAX_CARD_H, window.innerHeight * MAX_CARD_H_VH);
    const cardH = Math.max(
      96,
      Math.min(size.h - 2 * VERT_BREATH, cardW / TALL_ASPECT, vhCap)
    );
    if (cardH < cardW / WIDE_ASPECT) cardW = cardH * WIDE_ASPECT;
    return { cardW, cardH };
  }, [size.w, size.h, layout, discoverMetrics.slideW, discoverMetrics.slideH]);

  const emblaStateRef = useRef<Record<string, unknown>>({});
  emblaStateRef.current = {
    parentIndex: index,
    itemCount: items.length,
    locked,
    layout: isDuoLayout ? "duo" : layout,
    cardW: metrics.cardW,
    cardH: metrics.cardH,
    hostW: size.w,
    hostH: size.h,
    options: peopleDebugEmblaOptionsSignature(emblaOptions),
  };

  const prevIndexRef = useRef(index);
  const prevLockedRef = useRef(locked);
  const prevItemIdsRef = useRef<string[]>([]);

  useEffect(() => {
    peopleDebugRecord("carousel:mount");
    return () => {
      peopleDebugRecord("carousel:unmount");
    };
  }, []);

  useEffect(() => {
    if (prevIndexRef.current !== index) {
      peopleDebugRecord("carousel:indexProp", {
        from: prevIndexRef.current,
        to: index,
      });
      prevIndexRef.current = index;
    }
  }, [index]);

  useEffect(() => {
    if (prevLockedRef.current !== locked) {
      peopleDebugRecord("carousel:locked", {
        from: prevLockedRef.current,
        to: locked,
      });
      prevLockedRef.current = locked;
    }
  }, [locked]);

  useEffect(() => {
    const ids = items.map((row) => carouselItemId(row));
    const prevIds = prevItemIdsRef.current;
    if (prevIds.length === 0 && ids.length > 0) {
      prevItemIdsRef.current = ids;
      return;
    }
    const { changeKind, orderChanged } = peopleDebugClassifyItemsChange(
      prevIds,
      ids
    );
    if (changeKind !== "unchanged") {
      const currentId = ids[clampIndex(index, ids.length)] ?? null;
      peopleDebugRecord("items:changed", {
        ...peopleDebugItemsSignature(ids),
        oldLen: prevIds.length,
        newLen: ids.length,
        changeKind,
        orderChanged,
        currentOpportunityHead: currentId?.slice(0, 8) ?? null,
        currentStillExists: (() => {
          const prevCurrentId = prevIds[clampIndex(index, prevIds.length)];
          return prevCurrentId ? ids.includes(prevCurrentId) : undefined;
        })(),
      });
    }
    prevItemIdsRef.current = ids;
  }, [items, index]);

  /**
   * Measure before paint. Avoids first paint with empty/wrong metrics that
   * later ResizeObserver-correct into a visible snap.
   * After a valid size exists, ignore transient ≤0 flashes (device presets)
   * so Embla is not unmounted solely due to a temporary zero observation.
   */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const sync = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const prev = sizeRef.current;
      const result = resolveMatchDeckHostSize(prev, w, h);
      if (import.meta.env.DEV) {
        logMatchDeckHostSizeTransition({ prev, result });
        if (result.ignoredTransientZero) {
          peopleDebugRecord("layout:hostResizeIgnoredZero", {
            label: "carouselHost",
            observedW: w,
            observedH: h,
            retainedW: result.next.w,
            retainedH: result.next.h,
          });
        } else if (result.changed) {
          peopleDebugRecord("layout:hostResizeApplied", {
            label: "carouselHost",
            fromW: prev.w,
            fromH: prev.h,
            toW: result.next.w,
            toH: result.next.h,
          });
        }
      }
      if (!result.changed) return;
      sizeRef.current = result.next;
      setSize(result.next);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    const stopDebug = peopleDebugObserveHostResize(host, "carouselHost");
    return () => {
      observer.disconnect();
      stopDebug();
    };
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    return peopleDebugAttachEmbla(emblaApi, () => emblaStateRef.current);
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    /**
     * Parent owns currentOpportunityId. Discover stays settle-only.
     * Mine commits as soon as a gesture releases onto a snap (pointerUp /
     * select while not dragging) so photo taps / Connect match the presented
     * candidate without waiting for the settle animation. goToIndex still
     * enforces controlsLocked / connectResolving / photoPromptOpen.
     */
    const tryCommitParentIndex = (reason: "select" | "pointerUp" | "settle") => {
      const selected = emblaApi.selectedScrollSnap();
      selectedSnapRef.current = selected;

      if (suppressSettleCommitRef.current) {
        if (reason === "settle") {
          suppressSettleCommitRef.current = false;
          // Button scrollTo settle: parent usually already owns `selected`.
          // If ownership drifted behind Embla, reconcile so edge enablement
          // (e.g. PREVIOUS after leaving index 0) updates promptly.
          if (selected !== indexRef.current) {
            peopleDebugRecord("carousel:commitIndex", {
              ...emblaStateRef.current,
              reason: "settle-reconcile",
              selectedSnap: selected,
              fromIndex: indexRef.current,
            });
            indexRef.current = selected;
            onIndexChangeRef.current(selected);
          }
        }
        return;
      }

      // Same-turn dedupe: select + pointerUp both fire on release; indexRef
      // only catches up after React commit. Optimistic bump prevents duplicate
      // goToIndex / feedback scrollTo. Next render overwrites from props
      // (including when locks no-op the patch).
      if (selected === indexRef.current) return;

      peopleDebugRecord("carousel:commitIndex", {
        ...emblaStateRef.current,
        reason,
        selectedSnap: selected,
        fromIndex: indexRef.current,
      });
      indexRef.current = selected;
      onIndexChangeRef.current(selected);
    };

    const onSelect = () => {
      const next = emblaApi.selectedScrollSnap();
      const prev = selectedSnapRef.current;
      selectedSnapRef.current = next;
      peopleDebugRecord("embla:select", {
        ...emblaStateRef.current,
        selectedSnap: next,
        prevSelectedSnap: prev,
        carouselRenderCount: peopleDebugGetRenderCount("matchDeckCarousel"),
      });

      if (!isMinePresentationRef.current) return;
      // Mid-drag select must not flip ownership; release paths commit below.
      if (emblaApi.internalEngine().dragHandler.pointerDown()) return;
      tryCommitParentIndex("select");
    };

    const onPointerDown = () => {
      const snap = emblaApi.selectedScrollSnap();
      if (isMinePresentationRef.current && mineProbeRefBox.current?.current) {
        mineProbeAnchorRef.current = snap;
        // New gesture: rebind departure neighbors + open destination (ignore
        // stale settles until pointerUp claims the landing snap).
        lockMineMotionProbeFlight(mineProbeRefBox.current.current, snap);
      }
      peopleDebugRecord("embla:pointerDown", {
        ...emblaStateRef.current,
        selectedSnap: snap,
        carouselRenderCount: peopleDebugGetRenderCount("matchDeckCarousel"),
      });
      releasePtrBlockRef.current?.();
      releasePtrBlockRef.current = acquirePullToRefreshBlock();
    };

    const onPointerUp = () => {
      releasePtrBlockRef.current?.();
      releasePtrBlockRef.current = null;
      if (!isMinePresentationRef.current) return;
      const selected = emblaApi.selectedScrollSnap();
      claimMineMotionProbeFlightDestination(
        mineProbeRefBox.current?.current,
        selected
      );
      // Covers mid-drag select that was deferred while pointer was down.
      tryCommitParentIndex("pointerUp");
    };

    const onSettle = () => {
      const selected = emblaApi.selectedScrollSnap();
      selectedSnapRef.current = selected;
      if (isMinePresentationRef.current) {
        const ctrl = mineProbeRefBox.current?.current;
        // Claim if still open (e.g. settle without a prior pointerUp claim).
        claimMineMotionProbeFlightDestination(ctrl, selected);
        // Only clears when settled snap matches this flight's destination.
        if (unlockMineMotionProbeFlight(ctrl, selected)) {
          mineProbeAnchorRef.current = selected;
          hideMineMotionProbeVisual(ctrl);
          clearMineRealIncomingVisuals(emblaApi.slideNodes());
        }
      }
      peopleDebugRecord("embla:settle", {
        ...emblaStateRef.current,
        selectedSnap: selected,
        suppressSettleCommit: suppressSettleCommitRef.current,
        carouselRenderCount: peopleDebugGetRenderCount("matchDeckCarousel"),
      });

      tryCommitParentIndex("settle");
    };

    selectedSnapRef.current = emblaApi.selectedScrollSnap();
    emblaApi.on("select", onSelect);
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);
    emblaApi.on("settle", onSettle);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
      emblaApi.off("settle", onSettle);
      releasePtrBlockRef.current?.();
      releasePtrBlockRef.current = null;
    };
  }, [emblaApi, clearMineRealIncomingVisuals]);

  // Publish sync prepare for Overlay button nav (must run before goToIndex).
  useEffect(() => {
    const prepareRef = mineProxyPrepareRefBox.current;
    if (!prepareRef || !emblaApi) return;

    const prepare = (
      destinationIndex: number,
      opts?: { jump?: boolean }
    ) => {
      if (!isFullWidthPresentationRef.current) return;
      const jump = opts?.jump === true;
      mineButtonScrollJumpRef.current = jump;
      // Plans: jump flag only (no Mine motion probe / real-incoming).
      if (!isMinePresentationRef.current) return;
      const snap = emblaApi.selectedScrollSnap();
      mineProbeAnchorRef.current = snap;
      prepareMineMotionProbeProgrammaticFlight(
        mineProbeRefBox.current?.current,
        snap,
        destinationIndex
      );
      // Jump hops skip parked portrait pose — land clean on the destination.
      if (jump) {
        clearMineRealIncomingVisuals(emblaApi.slideNodes());
        return;
      }
      // Parked start pose before Embla's first animated scroll frame.
      if (mineRealIncomingEnabledRef.current) {
        cacheMinePortraitEls(emblaApi.slideNodes());
        const side = destinationIndex > snap ? "next" : "prev";
        if (destinationIndex !== snap) {
          writeMineRealIncomingFromProgress(
            emblaApi,
            { prev: 0, next: 0 },
            side
          );
        }
      }
    };
    prepareRef.current = prepare;

    return () => {
      if (prepareRef.current === prepare) {
        prepareRef.current = null;
      }
    };
  }, [
    emblaApi,
    cacheMinePortraitEls,
    clearMineRealIncomingVisuals,
    writeMineRealIncomingFromProgress,
  ]);

  useEffect(() => {
    if (!emblaApi) return;
    const selected = emblaApi.selectedScrollSnap();
    if (selected === index) {
      // Button prepare may have locked a programmatic flight, but Embla is
      // already on the destination — no scroll/settle will follow. Release
      // only programmatic (non-drag) flights so Overlay latch can flush.
      if (isMinePresentationRef.current) {
        const ctrl = mineProbeRefBox.current?.current;
        if (
          ctrl?.flightLocked &&
          ctrl.flightAnimateEdgeCards === false &&
          ctrl.flightDestinationIndex === selected
        ) {
          if (unlockMineMotionProbeFlight(ctrl, selected)) {
            mineProbeAnchorRef.current = selected;
            hideMineMotionProbeVisual(ctrl);
            clearMineRealIncomingVisuals(emblaApi.slideNodes());
          }
        }
      }
      mineButtonScrollJumpRef.current = false;
      return;
    }
    const jump = mineButtonScrollJumpRef.current;
    mineButtonScrollJumpRef.current = false;
    peopleDebugRecord("carousel:scrollTo", {
      fromSnap: selected,
      toIndex: index,
      jump,
    });
    // Button path may have already begun this departure→destination flight;
    // begin with the same pair is idempotent (duplicate).
    if (isMinePresentationRef.current && mineProbeRefBox.current?.current) {
      mineProbeAnchorRef.current = selected;
      beginMineMotionProbeFlight(mineProbeRefBox.current.current, {
        departureIndex: selected,
        destinationIndex: index,
        animateEdgeCards: false,
      });
      if (
        !jump &&
        mineRealIncomingEnabledRef.current &&
        index !== selected
      ) {
        cacheMinePortraitEls(emblaApi.slideNodes());
        writeMineRealIncomingFromProgress(
          emblaApi,
          { prev: 0, next: 0 },
          index > selected ? "next" : "prev"
        );
      }
    }
    suppressSettleCommitRef.current = true;
    emblaApi.scrollTo(index, jump);
    // Jump uses duration 0. Settle may or may not run; complete programmatic
    // flights on a microtask so we never depend on settle alone, and so a
    // settle that already unlocked is a no-op (stale/duplicate safe).
    if (jump && isMinePresentationRef.current) {
      const dest = index;
      const api = emblaApi;
      queueMicrotask(() => {
        const ctrl = mineProbeRefBox.current?.current;
        if (!ctrl?.flightLocked) return;
        if (ctrl.flightAnimateEdgeCards !== false) return;
        if (ctrl.flightDestinationIndex !== dest) return;
        clearMineRealIncomingVisuals(api.slideNodes());
        hideMineMotionProbeVisual(ctrl);
        claimMineMotionProbeFlightDestination(ctrl, dest);
        if (unlockMineMotionProbeFlight(ctrl, dest)) {
          mineProbeAnchorRef.current = dest;
        }
      });
    }
  }, [
    emblaApi,
    index,
    cacheMinePortraitEls,
    clearMineRealIncomingVisuals,
    writeMineRealIncomingFromProgress,
  ]);

  /**
   * When Discover slide dimensions change, reInit Embla so snaps match the
   * painted slide pitch — otherwise drag can briefly expose oversized neighbors.
   */
  useLayoutEffect(() => {
    if (!emblaApi || !isDuoLayout) return;
    if (!isPeopleDiscoverMetricsReady(discoverMetrics)) return;
    const key = `${discoverMetrics.slideW}x${discoverMetrics.slideH}:${items.length}`;
    if (lastDiscoverMetricsKeyRef.current === key) return;
    lastDiscoverMetricsKeyRef.current = key;
    suppressSettleCommitRef.current = true;
    emblaApi.reInit();
    emblaApi.scrollTo(indexRef.current, true);
    applyPhysicalSlidePresentation(emblaApi, isDuoLayout, slidePresentationMode);
  }, [emblaApi, isDuoLayout, discoverMetrics, items.length, slidePresentationMode]);

  const opportunityIds = useMemo(
    () => items.map((row) => carouselItemId(row)),
    [items]
  );

  useEffect(() => {
    const viewport = emblaViewportRef.current;
    if (!viewport || metrics.cardW <= 0) return;
    const stopSlides = peopleDebugObserveSlides(viewport, opportunityIds);
    const stopImages = peopleDebugObserveSlideImages(viewport, opportunityIds);
    return () => {
      stopSlides();
      stopImages();
    };
  }, [metrics.cardW, metrics.cardH, opportunityIds]);

  useEffect(() => {
    if (!emblaApi) return;

    let rafId = 0;

    const syncMineMotionProbe = () => {
      if (!isMinePresentationRef.current) return;
      if (prefersPeopleMotionReduce()) {
        hideMineMotionProbeVisual(mineProbeRefBox.current?.current);
        clearMineRealIncomingVisuals(emblaApi.slideNodes());
        return;
      }
      const progress = computeMineMotionProbeProgress(
        emblaApi.scrollProgress(),
        emblaApi.scrollSnapList(),
        mineProbeAnchorRef.current
      );

      if (mineRealIncomingEnabledRef.current) {
        hideMineMotionProbeVisual(mineProbeRefBox.current?.current);
        writeMineRealIncomingFromProgress(emblaApi, progress, null);
        return;
      }

      const ctrl = mineProbeRefBox.current?.current;
      if (!ctrl?.root) return;
      writeMineMotionProbeVisual(ctrl, progress, mineProbeGeomRef.current);
    };

    const syncPresentation = () => {
      applyPhysicalSlidePresentation(
        emblaApi,
        isDuoLayout,
        slidePresentationMode
      );
    };

    const onScroll = () => {
      // Probe/proxy: write in Embla's scroll callback (already inside Embla rAF).
      // Do NOT schedule another requestAnimationFrame for the probe.
      syncMineMotionProbe();

      // Discover peek opacity/scale keeps existing coalesced rAF.
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        syncPresentation();
      });
    };

    const onSettleOpacity = () => {
      if (isMinePresentationRef.current) {
        const selected = emblaApi.selectedScrollSnap();
        const ctrl = mineProbeRefBox.current?.current;
        claimMineMotionProbeFlightDestination(ctrl, selected);
        if (unlockMineMotionProbeFlight(ctrl, selected)) {
          mineProbeAnchorRef.current = selected;
          hideMineMotionProbeVisual(ctrl);
          clearMineRealIncomingVisuals(emblaApi.slideNodes());
        }
      }
      syncPresentation();
    };

    const onReInitOpacity = () => {
      if (isMinePresentationRef.current) {
        const selected = emblaApi.selectedScrollSnap();
        const ctrl = mineProbeRefBox.current?.current;
        hideMineMotionProbeVisual(ctrl);
        unlockMineMotionProbeFlight(ctrl, selected, { force: true });
        mineProbeAnchorRef.current = selected;
        cacheMinePortraitEls(emblaApi.slideNodes());
        clearMineRealIncomingVisuals(emblaApi.slideNodes());
      }
      syncPresentation();
    };

    if (isMinePresentation) {
      mineProbeAnchorRef.current = emblaApi.selectedScrollSnap();
      cacheMinePortraitEls(emblaApi.slideNodes());
    }
    syncPresentation();
    emblaApi.on("scroll", onScroll);
    emblaApi.on("settle", onSettleOpacity);
    emblaApi.on("reInit", onReInitOpacity);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("settle", onSettleOpacity);
      emblaApi.off("reInit", onReInitOpacity);
      const ctrl = mineProbeRefBox.current?.current;
      hideMineMotionProbeVisual(ctrl);
      unlockMineMotionProbeFlight(ctrl, undefined, { force: true });
      clearMineRealIncomingVisuals(emblaApi.slideNodes());
    };
  }, [
    emblaApi,
    items.length,
    metrics.cardW,
    isDuoLayout,
    slidePresentationMode,
    isMinePresentation,
    cacheMinePortraitEls,
    clearMineRealIncomingVisuals,
    writeMineRealIncomingFromProgress,
  ]);

  // Cache probe start anchors + measured resting front-photo landing (not per scroll).
  useLayoutEffect(() => {
    const recache = () => {
      const host = hostRef.current;
      const w = size.w > 0 ? size.w : host?.clientWidth ?? 0;
      const ctrl = mineProbeRefBox.current?.current;
      let landing: MineMotionProbeLanding | null = null;
      if (isMinePresentation && host && emblaApi) {
        const slides = emblaApi.slideNodes();
        const preferred = emblaApi.selectedScrollSnap();
        const order: HTMLElement[] = [];
        const selected = slides[preferred];
        if (selected) order.push(selected);
        for (const slide of slides) {
          if (slide && slide !== selected) order.push(slide);
        }
        // Proxy root parent = Overlay shell; without proxy, host is the
        // coordinate system for slide-local portrait centers.
        const container =
          ctrl?.root?.parentElement ?? ctrl?.root ?? host;
        for (const slide of order) {
          const frame = queryMineMotionProbeFrontFrame(slide);
          if (!frame) continue;
          landing = measureMineMotionProbeLanding({
            container,
            host,
            slide,
            frame,
          });
          if (landing) break;
        }
      }
      mineProbeGeomRef.current = computeMineMotionProbeGeometry(w, landing);
      // Prefer measured frame; fall back to Mine metrics so real-incoming
      // peek math works without a mounted proxy root.
      const frameW =
        landing && landing.frameW > 0
          ? landing.frameW
          : discoverMetrics.frameW;
      const frameH =
        landing && landing.frameH > 0
          ? landing.frameH
          : discoverMetrics.frameH;
      if (frameW > 0 && frameH > 0) {
        mineProbeGeomRef.current = {
          ...mineProbeGeomRef.current,
          frameW,
          frameH,
        };
      }
      if (emblaApi) {
        cacheMinePortraitEls(emblaApi.slideNodes());
      }
      if (!ctrl || !isMinePresentation) return;
      if (frameW > 0 && frameH > 0) {
        ctrl.frameW = frameW;
        ctrl.frameH = frameH;
        if (ctrl.mode === "proxy" && ctrl.root) {
          ctrl.root.style.width = `${frameW}px`;
          ctrl.root.style.height = `${frameH}px`;
        }
      }
    };
    recache();
    if (!emblaApi || !isMinePresentation) return;
    emblaApi.on("reInit", recache);
    return () => {
      emblaApi.off("reInit", recache);
    };
  }, [
    emblaApi,
    items.length,
    size.w,
    size.h,
    isMinePresentation,
    discoverMetrics.frameW,
    discoverMetrics.frameH,
    discoverMetrics.padTop,
    discoverMetrics.portraitW,
    discoverMetrics.portraitH,
    cacheMinePortraitEls,
  ]);

  useEffect(() => {
    if (!emblaApi) return;
    applyPhysicalSlidePresentation(
      emblaApi,
      isDuoLayout,
      slidePresentationMode
    );
  }, [emblaApi, index, isDuoLayout, slidePresentationMode]);

  const handleSlideClick = useCallback(
    (e: MouseEvent<HTMLDivElement>, slideIndex: number) => {
      if (locked || !onCardTap) return;
      if (slideIndex !== index) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, [role='button']")) return;
      onCardTap();
    },
    [locked, onCardTap, index]
  );

  const slideGap = isFullWidthPresentation
    ? 0
    : isDuoLayout
      ? PEOPLE_DISCOVER_GAP_PX
      : GAP;
  const deckReady = isDuoLayout
    ? isPeopleDiscoverMetricsReady(discoverMetrics)
    : metrics.cardW > 0;

  const prevDeckReadyRef = useRef(deckReady);
  useEffect(() => {
    const prevReady = prevDeckReadyRef.current;
    prevDeckReadyRef.current = deckReady;
    if (import.meta.env.DEV) {
      logMatchDeckReadyTransition({
        prevReady,
        nextReady: deckReady,
        host: { w: size.w, h: size.h },
      });
      if (prevReady !== deckReady) {
        peopleDebugRecord(
          deckReady ? "carousel:deckReady" : "carousel:deckNotReady",
          {
            hostW: size.w,
            hostH: size.h,
            cardW: metrics.cardW,
            cardH: metrics.cardH,
          }
        );
      }
    }
  }, [deckReady, size.w, size.h, metrics.cardW, metrics.cardH]);

  const minePortraitStyle = isFullWidthPresentation
    ? ({
        ["--people-mine-portrait-w" as string]: `${discoverMetrics.portraitW}px`,
        ["--people-mine-portrait-h" as string]: `${discoverMetrics.portraitH}px`,
        ["--people-mine-frame-w" as string]: `${discoverMetrics.frameW}px`,
        ["--people-mine-frame-h" as string]: `${discoverMetrics.frameH}px`,
        // Surplus padTop is an in-slide spacer under absolute caption (not CSS padding).
        ["--people-mine-surplus-pad-top" as string]: `${discoverMetrics.padTop}px`,
        ["--people-mine-surplus-pad-bottom" as string]: `${discoverMetrics.padBottom}px`,
        ["--people-mine-unused-host" as string]: `${discoverMetrics.unusedHostH}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={hostRef}
      className="relative min-h-0 w-full flex-1 overflow-hidden"
      data-people-deck-carousel-host="true"
      style={
        isFullWidthPresentation
          ? ({
              ["--people-mine-portrait-w" as string]: `${discoverMetrics.portraitW}px`,
              ["--people-mine-portrait-h" as string]: `${discoverMetrics.portraitH}px`,
              ["--people-mine-frame-w" as string]: `${discoverMetrics.frameW}px`,
              ["--people-mine-frame-h" as string]: `${discoverMetrics.frameH}px`,
              ["--people-mine-surplus-pad-top" as string]: `${discoverMetrics.padTop}px`,
              ["--people-mine-surplus-pad-bottom" as string]: `${discoverMetrics.padBottom}px`,
              ["--people-mine-unused-host" as string]: `${discoverMetrics.unusedHostH}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {deckReady ? (
        <div
          ref={setEmblaViewportRef}
          className="relative h-full overflow-hidden"
          style={{
            touchAction: "pan-y pinch-zoom",
          }}
        >
          <div
            className={`flex h-full ${
              isDuoLayout && !isFullWidthPresentation
                ? "items-start"
                : "items-center"
            }`}
          >
            {items.map((candidate, i) => (
              <div
                key={carouselItemId(candidate) || `slide-${i}`}
                className="relative min-w-0 shrink-0 select-none overflow-visible"
                data-people-slide-idx={i}
                style={{
                  flex: `0 0 ${metrics.cardW}px`,
                  width: metrics.cardW,
                  height: metrics.cardH,
                  marginRight: i < items.length - 1 ? slideGap : 0,
                  boxSizing: "border-box",
                  // Full-width: no paddingTop — surplus pad lives in-slide.
                  paddingTop: 0,
                  paddingBottom: isFullWidthPresentation
                    ? discoverMetrics.padBottom
                    : 0,
                  ...minePortraitStyle,
                }}
                onClick={(e) => handleSlideClick(e, i)}
              >
                {renderItem(candidate, {
                  isCurrent: i === index,
                  withPhoto:
                    Math.abs(i - index) <=
                    matchDeckPhotoMountRadius(isMinePresentation),
                  neighborSide:
                    i === index ? null : i < index ? "left" : "right",
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
