import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  mineEdgeCardRestTransform,
  mineEdgeCardTransformOrigin,
} from "../../lib/people/mineMotionProbeProgress";
import {
  MINE_EDGE_CARD_LAYOUT_W_PX,
  MINE_EDGE_NAV_MOVE_CANCEL_PX,
  mineEdgeNavMovedPastTap,
  mineEdgeVisiblePx,
} from "../../lib/people/mineEdgeNavGesture";
import {
  PEOPLE_MINE_EDGE_FIXED_CARD_W_PX,
  PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX,
  PEOPLE_MINE_EDGE_FIXED_RADIUS_PX,
  peopleMineEdgeCardHPx,
  peopleMineEdgeFixedCssVisiblePx,
} from "../../lib/people/peopleCandidateMediaPresentation";
import { peopleDebugRecord } from "../../lib/people/peopleDeckDebug";

/** Plans / legacy: full 104px card. Mine fixed-rails: visual card face. */
function edgeCardLayoutW(fixedRails: boolean): number {
  return fixedRails
    ? PEOPLE_MINE_EDGE_FIXED_CARD_W_PX
    : MINE_EDGE_CARD_LAYOUT_W_PX;
}
function edgeCardLayoutH(
  fixedRails: boolean,
  portraitOuterH: number
): string | number {
  if (!fixedRails) return "min(46vh, 246px)";
  return peopleMineEdgeCardHPx(portraitOuterH);
}
function edgeCardRadius(fixedRails: boolean): string {
  return fixedRails
    ? `${PEOPLE_MINE_EDGE_FIXED_RADIUS_PX}px`
    : "1.35rem";
}
/**
 * Hit rail may be narrower than the visual face; the button uses the larger
 * of the two so the face paints fully while hit stays ≥48px on-screen budget.
 */
function edgeCardHitW(fixedRails: boolean): number {
  if (!fixedRails) return MINE_EDGE_CARD_LAYOUT_W_PX;
  return Math.max(
    edgeCardLayoutW(true),
    PEOPLE_MINE_EDGE_FIXED_HIT_RAIL_W_PX
  );
}
/**
 * Horizontal inset: visible − cardWidth (negative = mostly off-screen).
 * `--mine-edge-visible` is set in px from ResizeObserver (clearance-aware)
 * or fixed visual width on the Mine fixed-rails path.
 */
function edgeInsetCss(cardW: number): string {
  return `calc(var(--mine-edge-visible) - ${cardW}px)`;
}
/** Shared with motion-probe proxy — resting front-portrait center Y. */
const CARD_CENTER_Y_CSS = "var(--mine-edge-center-y, 49.5%)";
const DOT_SIZE_PX = 8;
const DOT_CORNER_INSET_PX = 9;
/** Inner press scale — independent of outer carousel-owned transform. */
const PRESS_SCALE = "scale(0.96)";
const PRESS_TRANSITION =
  "transform 100ms cubic-bezier(0.22, 1, 0.36, 1)";

export type MineEdgeNavCardsHandle = {
  prev: HTMLButtonElement | null;
  next: HTMLButtonElement | null;
};

type Side = "prev" | "next";

function MineEdgeNavCard({
  side,
  disabled,
  onActivate,
  bindRef,
  fixedRailsGeometry = false,
  portraitOuterH = 0,
}: {
  side: Side;
  disabled: boolean;
  onActivate: () => void;
  bindRef?: (side: Side, node: HTMLButtonElement | null) => void;
  fixedRailsGeometry?: boolean;
  /** Mine portrait outer height — drives adaptive edge card height. */
  portraitOuterH?: number;
}) {
  const isPrev = side === "prev";
  const cardW = edgeCardHitW(fixedRailsGeometry);
  const cardH = edgeCardLayoutH(fixedRailsGeometry, portraitOuterH);
  const cardRadius = edgeCardRadius(fixedRailsGeometry);
  const edgeInset = edgeInsetCss(cardW);
  const armedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const maxMoveRef = useRef(0);
  const pressVisualRef = useRef<HTMLSpanElement | null>(null);

  const setPressedVisual = useCallback((pressed: boolean) => {
    const el = pressVisualRef.current;
    if (!el) return;
    el.style.transform = pressed ? PRESS_SCALE : "scale(1)";
  }, []);

  const clearArm = useCallback(() => {
    armedRef.current = false;
    pointerIdRef.current = null;
    startRef.current = null;
    maxMoveRef.current = 0;
    setPressedVisual(false);
  }, [setPressedVisual]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // One pointer owns the arm — ignore additional pointers.
      if (pointerIdRef.current != null) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      pointerIdRef.current = e.pointerId;
      armedRef.current = true;
      maxMoveRef.current = 0;
      setPressedVisual(true);
      peopleDebugRecord("mine:edgeNav", {
        side,
        phase: "pointerdown",
        pointerId: e.pointerId,
      });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* optional */
      }
    },
    [disabled, setPressedVisual, side],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!armedRef.current || !startRef.current) return;
      if (pointerIdRef.current !== e.pointerId) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxMoveRef.current) maxMoveRef.current = dist;
      if (
        mineEdgeNavMovedPastTap(
          startRef.current,
          e.clientX,
          e.clientY,
          MINE_EDGE_NAV_MOVE_CANCEL_PX
        )
      ) {
        peopleDebugRecord("mine:edgeNav", {
          side,
          phase: "arm-cancel-move",
          maxMove: maxMoveRef.current,
        });
        clearArm();
      }
    },
    [clearArm, side],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      const ok = armedRef.current && !disabled;
      const maxMove = maxMoveRef.current;
      clearArm();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
      peopleDebugRecord("mine:edgeNav", {
        side,
        phase: ok ? "activate" : "pointerup-rejected",
        maxMove,
      });
      if (!ok) return;
      onActivate();
    },
    [clearArm, disabled, onActivate, side],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (
        pointerIdRef.current != null &&
        pointerIdRef.current !== e.pointerId
      ) {
        return;
      }
      peopleDebugRecord("mine:edgeNav", {
        side,
        phase: "pointercancel",
        maxMove: maxMoveRef.current,
      });
      // NEVER navigate from pointercancel.
      clearArm();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
    },
    [clearArm, side],
  );

  const setNodeRef = useCallback(
    (node: HTMLButtonElement | null) => {
      bindRef?.(side, node);
      // Transform is owned by Carousel progress writes / settle clear.
      // Apply resting pose once on mount so React re-renders (disabled toggle)
      // never reset engagement transforms via the style prop.
      if (node) {
        node.style.transformOrigin = mineEdgeCardTransformOrigin(side);
        if (!node.style.transform) {
          node.style.transform = mineEdgeCardRestTransform(side);
        }
      } else {
        setPressedVisual(false);
      }
    },
    [bindRef, setPressedVisual, side],
  );

  return (
    <button
      type="button"
      ref={setNodeRef}
      disabled={disabled}
      aria-label={isPrev ? peopleUiCopy.deckPrev : peopleUiCopy.deckNext}
      aria-disabled={disabled}
      data-people-mine-edge-nav={side}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={(e) => {
        // Activation is pointer-armed only — block synthetic click after carousel drag.
        e.preventDefault();
      }}
      className={[
        "group pointer-events-auto absolute z-[22] touch-manipulation select-none overflow-visible",
        "disabled:pointer-events-none",
        "border-0 bg-transparent p-0 shadow-none",
      ].join(" ")}
      style={{
        width: cardW,
        height: cardH,
        top: CARD_CENTER_Y_CSS,
        transformOrigin: isPrev ? "left center" : "right center",
        ...(isPrev
          ? { left: edgeInset }
          : { right: edgeInset }),
      }}
    >
      {/*
        Inner visual owns press scale. Outer button transform stays carousel-owned
        (rest ±5° / drag engagement).
      */}
      <span
        ref={pressVisualRef}
        data-people-mine-edge-nav-press={side}
        className={[
          "pointer-events-none absolute inset-0 overflow-visible",
          "border border-black/[0.08] bg-[color-mix(in_oklab,#f2efe6_94%,var(--brand)_6%)] text-[#1c1b19]",
          "shadow-[0_2px_6px_rgba(0,0,0,0.16),0_8px_18px_rgba(0,0,0,0.26)]",
          "app-light:border-white/[0.10] app-light:bg-[color-mix(in_oklab,var(--text)_86%,#1a1b1f_14%)] app-light:text-[#f2efe6]",
          "app-light:shadow-[0_2px_6px_rgba(0,0,0,0.20),0_8px_18px_rgba(0,0,0,0.30)]",
          "group-disabled:border-black/12 group-disabled:bg-[color-mix(in_oklab,#c8c4bb_88%,#8a8680_12%)] group-disabled:text-[#1c1b19]/45",
          "group-disabled:shadow-[0_1px_3px_rgba(0,0,0,0.12)]",
          "app-light:group-disabled:border-white/14 app-light:group-disabled:bg-[color-mix(in_oklab,#3a3b40_90%,#1a1b1f_10%)] app-light:group-disabled:text-[#f2efe6]/40",
          "app-light:group-disabled:shadow-[0_1px_3px_rgba(0,0,0,0.22)]",
        ].join(" ")}
        style={{
          borderRadius: cardRadius,
          transform: "scale(1)",
          transformOrigin: "center center",
          transition: PRESS_TRANSITION,
          willChange: "transform",
        }}
      >
        {isPrev ? (
          <span
            className="pointer-events-none absolute top-[34%] right-[10px] -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-semibold tracking-[0.16em]"
            aria-hidden
          >
            PREVIOUS
          </span>
        ) : null}

        <span
          className={[
            "pointer-events-none absolute rounded-full",
            "bg-[#1c1b19] app-light:bg-[#f2efe6]",
            "group-disabled:bg-[#1c1b19]/40 app-light:group-disabled:bg-[#f2efe6]/35",
          ].join(" ")}
          style={{
            bottom: DOT_CORNER_INSET_PX,
            width: DOT_SIZE_PX,
            height: DOT_SIZE_PX,
            ...(isPrev
              ? { right: DOT_CORNER_INSET_PX }
              : { left: DOT_CORNER_INSET_PX }),
          }}
          aria-hidden
        />
      </span>
    </button>
  );
}

/**
 * Stationary Mine shell PREVIOUS / NEXT edge cards.
 * Not Embla slides — decorative nav that calls parent goToIndex ±1.
 */
export default function MineEdgeNavCards({
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  cardsRef,
  fixedRailsGeometry = false,
}: {
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Real-portrait nav: Carousel writes progress engagement transforms here. */
  cardsRef?: RefObject<MineEdgeNavCardsHandle | null>;
  /** Mine fixed side rails — fixed visual strip; Plans keeps legacy. */
  fixedRailsGeometry?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [portraitOuterH, setPortraitOuterH] = useState(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const readActualFrameW = (): number => {
      const host = document.querySelector(
        "[data-people-deck-carousel-host]"
      );
      if (!host) return 0;
      const raw = getComputedStyle(host)
        .getPropertyValue("--people-mine-frame-w")
        .trim();
      const px = parseFloat(raw);
      return Number.isFinite(px) && px > 0 ? px : 0;
    };

    const readPortraitOuterH = (): number => {
      const host = document.querySelector(
        "[data-people-deck-carousel-host]"
      );
      if (!host) return 0;
      const raw = getComputedStyle(host)
        .getPropertyValue("--people-mine-portrait-h")
        .trim();
      const px = parseFloat(raw);
      return Number.isFinite(px) && px > 0 ? px : 0;
    };

    const pickFrontPortrait = (): Element | null => {
      const cards = document.querySelectorAll(
        '[data-people-mine-card="front"]'
      );
      let best: Element | null = null;
      let bestArea = 0;
      for (const el of cards) {
        const r = el.getBoundingClientRect();
        const w = Math.max(
          0,
          Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)
        );
        const h = Math.max(
          0,
          Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)
        );
        const area = w * h;
        if (area > bestArea) {
          bestArea = area;
          best = el;
        }
      }
      if (best) return best;
      // Plans / duo portrait shell when stack cards are not yet mounted.
      return (
        document.querySelector("[data-people-plans-portrait]") ??
        document.querySelector("[data-people-duo-portrait]")
      );
    };

    const sync = () => {
      const w = root.clientWidth;
      const hostEl = document.querySelector(
        "[data-people-deck-carousel-host]"
      ) as HTMLElement | null;
      const hostH =
        hostEl && hostEl.clientHeight > 0
          ? hostEl.clientHeight
          : root.clientHeight > 0
            ? root.clientHeight
            : 0;
      const frameW = readActualFrameW();
      const portraitH = readPortraitOuterH();
      if (portraitH > 0) setPortraitOuterH(portraitH);
      const edgeH = fixedRailsGeometry
        ? peopleMineEdgeCardHPx(portraitH)
        : 0;
      const sampleCard =
        root.querySelector<HTMLElement>("[data-people-mine-edge-nav]");
      const measuredH = sampleCard?.offsetHeight ?? 0;
      const cardH = edgeH > 0 ? edgeH : measuredH;
      const visible = fixedRailsGeometry
        ? peopleMineEdgeFixedCssVisiblePx(
            cardH > 0 ? cardH : peopleMineEdgeCardHPx(portraitH)
          )
        : mineEdgeVisiblePx(
            w,
            frameW > 0 ? frameW : undefined,
            cardH > 0 ? cardH : undefined,
            hostH
          );
      root.style.setProperty("--mine-edge-visible", `${visible}px`);

      // Align edge-card centers to the resting front portrait (resize-only).
      const front = pickFrontPortrait();
      const rootRect = root.getBoundingClientRect();
      if (front && rootRect.height > 0) {
        const fr = front.getBoundingClientRect();
        const centerY = fr.top + fr.height / 2 - rootRect.top;
        if (centerY > 0 && centerY < rootRect.height) {
          const px = `${Math.round(centerY * 10) / 10}px`;
          root.style.setProperty("--mine-edge-center-y", px);
          root.parentElement?.style.setProperty("--mine-edge-center-y", px);
        }
      }

      peopleDebugRecord("mine:edgeNav", {
        phase: "visible-sync",
        hostW: w,
        hostH: hostH || null,
        frameW: frameW || null,
        visiblePx: visible,
        cardH: cardH || null,
        portraitOuterH: portraitH || null,
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(root);
    const host = document.querySelector("[data-people-deck-carousel-host]");
    if (host) ro.observe(host);
    // Portrait padTop shifts change child geometry without resizing the host —
    // observe the resolved portrait so edge centers track Plans/Mine surplus.
    const portraits = document.querySelectorAll(
      "[data-people-plans-portrait], [data-people-duo-portrait], [data-people-mine-stack]"
    );
    portraits.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [fixedRailsGeometry]);

  const bindRef = useCallback(
    (side: Side, node: HTMLButtonElement | null) => {
      const handle = cardsRef?.current;
      if (!handle) return;
      handle[side] = node;
    },
    [cardsRef],
  );

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 z-[22] overflow-hidden"
      data-people-mine-edge-nav-root="true"
      style={
        {
          // Fallback before first measure (clearance-safe mid band).
          ["--mine-edge-visible" as string]: `${peopleMineEdgeFixedCssVisiblePx()}px`,
        } as CSSProperties
      }
    >
      <MineEdgeNavCard
        side="prev"
        disabled={!canGoPrev}
        onActivate={onPrev}
        bindRef={bindRef}
        fixedRailsGeometry={fixedRailsGeometry}
        portraitOuterH={portraitOuterH}
      />
      <MineEdgeNavCard
        side="next"
        disabled={!canGoNext}
        onActivate={onNext}
        bindRef={bindRef}
        fixedRailsGeometry={fixedRailsGeometry}
        portraitOuterH={portraitOuterH}
      />
    </div>
  );
}
