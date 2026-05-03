import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Location } from "react-router-dom";
import owlSvg from "../assets/btmtabicon.svg";
import {
  BOTTOM_TAB_PEEK_EVENT,
  type BottomTabPeekDetail,
  getBottomTabOwlSlot,
} from "../lib/bottomTabPeek";
import { getTabFromPath } from "../router/PersistentTabContainer.new";
import { useOwlMessageModal } from "../context/OwlMessageModalContext";

/** Vertical clip band (scroll / tab hide). */
const CLIP_HEIGHT_PX = 56;
/** Owl render size (SVG asset was made taller — keep room to tuck). */
const OWL_DISPLAY_PX = 44;
/**
 * Clip bottom sits this many px into the pill so the art meets the bar (no float gap).
 */
const CLIP_OVERLAP_INTO_PILL_PX = 3;
/** Extra horizontal room in the clip (no full-width strip — avoids edge hairlines). */
const CLIP_PAD_X_PX = 12;

const PEEK_TRANSITION_MS = 520;
const TAB_TRANSITION_MS = 320;

type TabAnim = "idle" | "exit" | "enter";

/**
 * Peeking owl above the bottom tab pill (z below the pill). Clipped so scroll/tab
 * motion hides it behind the pill without showing through the frosted bar.
 */
export default function BottomTabPeekOwl({
  location,
  activeIconIndex,
  createChooserOpen,
}: {
  location: Location;
  activeIconIndex: number | null;
  createChooserOpen: boolean;
}) {
  const { openOwlMessage } = useOwlMessageModal();
  const [owlDip, setOwlDip] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const dipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(
    () => () => {
      if (dipTimerRef.current) {
        clearTimeout(dipTimerRef.current);
        dipTimerRef.current = null;
      }
    },
    [],
  );
  const pathname = location.pathname;
  const [peekHidden, setPeekHidden] = useState(false);
  const [anchorSlot, setAnchorSlot] = useState<0 | 2 | 3 | null>(null);
  const [tabAnim, setTabAnim] = useState<TabAnim>("idle");
  const [pillGeom, setPillGeom] = useState<{
    clipBottomPx: number;
    centers: Partial<Record<0 | 1 | 2 | 3, number>>;
  } | null>(null);

  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTargetSlotRef = useRef<0 | 2 | 3 | null>(null);
  const [enterSlide, setEnterSlide] = useState(0);

  const targetSlot = getBottomTabOwlSlot({
    pathname,
    activeIconIndex,
    createChooserOpen,
  });

  useEffect(() => {
    const onPeek = (e: Event) => {
      const ce = e as CustomEvent<BottomTabPeekDetail>;
      const d = ce.detail;
      if (!d) return;
      if (d.tab !== getTabFromPath(pathname)) return;
      setPeekHidden(d.hidden);
    };
    window.addEventListener(BOTTOM_TAB_PEEK_EVENT, onPeek as EventListener);
    return () =>
      window.removeEventListener(
        BOTTOM_TAB_PEEK_EVENT,
        onPeek as EventListener,
      );
  }, [pathname]);

  useEffect(() => {
    setPeekHidden(false);
  }, [pathname]);

  const clearTimers = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const prev = prevTargetSlotRef.current;
    if (prev === targetSlot) {
      return;
    }

    clearTimers();

    if (targetSlot === null && prev === null) {
      prevTargetSlotRef.current = null;
      setAnchorSlot(null);
      setTabAnim("idle");
      return;
    }

    if (targetSlot === null && prev !== null) {
      setTabAnim("exit");
      exitTimerRef.current = setTimeout(() => {
        setAnchorSlot(null);
        setTabAnim("idle");
        exitTimerRef.current = null;
      }, TAB_TRANSITION_MS);
      prevTargetSlotRef.current = null;
      return;
    }

    if (targetSlot !== null && prev === null) {
      setAnchorSlot(targetSlot);
      setTabAnim("enter");
      enterTimerRef.current = setTimeout(() => {
        setTabAnim("idle");
        enterTimerRef.current = null;
      }, TAB_TRANSITION_MS);
      prevTargetSlotRef.current = targetSlot;
      return;
    }

    if (targetSlot !== null && prev !== null && targetSlot !== prev) {
      setTabAnim("exit");
      exitTimerRef.current = setTimeout(() => {
        setAnchorSlot(targetSlot);
        setTabAnim("enter");
        prevTargetSlotRef.current = targetSlot;
        exitTimerRef.current = null;
        enterTimerRef.current = setTimeout(() => {
          setTabAnim("idle");
          enterTimerRef.current = null;
        }, TAB_TRANSITION_MS);
      }, TAB_TRANSITION_MS);
      return;
    }

    prevTargetSlotRef.current = targetSlot;
  }, [targetSlot, clearTimers]);

  useLayoutEffect(() => {
    if (tabAnim !== "enter") {
      setEnterSlide(0);
      return;
    }
    setEnterSlide(1);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEnterSlide(0));
    });
    return () => cancelAnimationFrame(id);
  }, [tabAnim, anchorSlot]);

  const measure = useCallback(() => {
    const pill = document.getElementById("bottom-tab");
    if (!pill) return;
    const rect = pill.getBoundingClientRect();
    const h = window.innerHeight;
    const clipBottomPx = Math.max(
      0,
      Math.round(h - rect.top) - CLIP_OVERLAP_INTO_PILL_PX,
    );
    const buttons = pill.querySelectorAll("button[aria-label^='tab-']");
    const centers: Partial<Record<0 | 1 | 2 | 3, number>> = {};
    buttons.forEach((btn, i) => {
      if (i > 3) return;
      const r = btn.getBoundingClientRect();
      centers[i as 0 | 1 | 2 | 3] = r.left + r.width / 2;
    });
    setPillGeom({ clipBottomPx, centers });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    const pill = document.getElementById("bottom-tab");
    if (pill) ro.observe(pill);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, pathname, anchorSlot, activeIconIndex]);

  if (anchorSlot === null && tabAnim !== "exit") {
    return null;
  }

  if (anchorSlot === null) {
    return null;
  }

  const centerX = pillGeom?.centers[anchorSlot];
  if (centerX === undefined || pillGeom === null) {
    return null;
  }

  const scrollTranslate = peekHidden ? "translateY(calc(100% + 8px))" : "none";
  const scrollTransition = `transform ${PEEK_TRANSITION_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`;

  let tabTranslate = "translateY(0)";
  if (tabAnim === "exit") {
    tabTranslate = "translateY(calc(100% + 8px))";
  } else if (tabAnim === "enter") {
    tabTranslate =
      enterSlide > 0 ? "translateY(calc(100% + 8px))" : "translateY(0)";
  }

  const tabTransitionBase = `transform ${TAB_TRANSITION_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`;
  const tabTransitionResolved =
    tabAnim === "enter" && enterSlide === 1
      ? undefined
      : tabAnim === "idle"
      ? undefined
      : tabTransitionBase;

  const clipW = OWL_DISPLAY_PX + CLIP_PAD_X_PX * 2;

  return (
    <div
      className="fixed pointer-events-none z-[39] overflow-hidden"
      style={{
        left: centerX - clipW / 2,
        width: clipW,
        bottom: pillGeom.clipBottomPx,
        height: CLIP_HEIGHT_PX,
      }}
    >
      <div
        className="absolute flex justify-center items-end"
        style={{
          left: CLIP_PAD_X_PX,
          bottom: 0,
          width: OWL_DISPLAY_PX,
          height: CLIP_HEIGHT_PX,
          transform: scrollTranslate,
          transition: scrollTransition,
        }}
      >
        <div
          className="relative flex flex-col justify-end items-center shrink-0"
          style={{
            width: OWL_DISPLAY_PX,
            height: OWL_DISPLAY_PX,
            transform: tabTranslate,
            transition: tabTransitionResolved,
          }}
        >
          <button
            type="button"
            className="pointer-events-auto flex h-full w-full cursor-pointer items-end justify-center rounded-lg border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            aria-label="Open companion message"
            onClick={(e) => {
              e.stopPropagation();
              if (reduceMotion) {
                openOwlMessage();
                return;
              }
              setOwlDip(true);
              if (dipTimerRef.current) clearTimeout(dipTimerRef.current);
              dipTimerRef.current = setTimeout(() => {
                dipTimerRef.current = null;
                openOwlMessage();
                setOwlDip(false);
              }, 200);
            }}
          >
            <div
              className="flex h-full w-full items-end justify-center will-change-transform"
              style={{
                transform: owlDip ? "translateY(12px)" : "translateY(0)",
                transition: owlDip
                  ? "transform 180ms cubic-bezier(0.33, 1, 0.68, 1)"
                  : "transform 260ms cubic-bezier(0.33, 1, 0.68, 1)",
              }}
            >
              <img
                src={owlSvg}
                alt=""
                width={OWL_DISPLAY_PX}
                height={OWL_DISPLAY_PX}
                className="pointer-events-none object-contain object-bottom select-none h-full w-full"
                draggable={false}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
