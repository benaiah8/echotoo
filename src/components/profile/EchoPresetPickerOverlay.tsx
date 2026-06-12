import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AvatarPresetInfo } from "../../lib/avatarPresets";
import {
  AVATAR_PRESET_PREFIX,
  isAvatarPresetValue,
} from "../../lib/avatarPresets";

const SLIDE_GAP_PX = 16;
/** ~55–65% of width, capped for small phones */
const SLIDE_WIDTH_RATIO = 0.6;
const SLIDE_MAX_PX = 268;

/** z-[140]: above FullScreenProfileCreation (z-50), below ConfirmDialog (200) / AvatarCrop (205) */
const OVERLAY_Z = "z-[140]";

type Props = {
  open: boolean;
  /** Discard temporary selection — same as Cancel / backdrop */
  onClose: () => void;
  presets: AvatarPresetInfo[];
  /** Starting preset when picker opens (from parent `avatarUrl`) */
  initialPresetValue: string;
  /** Called only on Done — sets parent `avatarUrl`; does not persist to DB */
  onSelectPreset: (fullPresetValue: string) => void;
};

function presetValueForId(id: string): string {
  return `${AVATAR_PRESET_PREFIX}${id}`;
}

function indexFromPresetValue(
  presets: AvatarPresetInfo[],
  value: string,
): number {
  if (!isAvatarPresetValue(value)) return 0;
  const id = value.slice(AVATAR_PRESET_PREFIX.length).trim();
  const i = presets.findIndex((p) => p.id === id);
  return i >= 0 ? i : 0;
}

function scrollLeftForCenteredIndex(
  index: number,
  clientW: number,
  slideW: number,
  sidePad: number,
  gap: number,
  count: number,
): number {
  const leftEdge = sidePad + index * (slideW + gap);
  const target = leftEdge + slideW / 2 - clientW / 2;
  const contentW = 2 * sidePad + count * slideW + Math.max(0, count - 1) * gap;
  const maxScroll = Math.max(0, contentW - clientW);
  return Math.max(0, Math.min(target, maxScroll));
}

function indexFromScrollLeft(
  scrollLeft: number,
  clientW: number,
  slideW: number,
  sidePad: number,
  gap: number,
  count: number,
): number {
  const centerInContent = scrollLeft + clientW / 2;
  const relative = centerInContent - sidePad - slideW / 2;
  const raw = Math.round(relative / (slideW + gap));
  return Math.max(0, Math.min(count - 1, raw));
}

/**
 * Full-screen nested Echo picker: horizontal carousel + thumbnails.
 * Temporary selection until Done; Cancel/backdrop discards.
 */
export default function EchoPresetPickerOverlay({
  open,
  onClose,
  presets,
  initialPresetValue,
  onSelectPreset,
}: Props) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const layoutRef = useRef({
    slideW: SLIDE_MAX_PX,
    sidePad: 24,
    gap: SLIDE_GAP_PX,
    clientW: 360,
  });
  const scrollRafRef = useRef<number | null>(null);

  const [layout, setLayout] = useState({
    slideW: SLIDE_MAX_PX,
    sidePad: 24,
    gap: SLIDE_GAP_PX,
    clientW: 360,
  });

  /** Temporary index — only committed via Done */
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const syncLayoutFromEl = useCallback((el: HTMLDivElement) => {
    const cw = el.clientWidth;
    if (cw <= 0) return;
    const slideW = Math.min(Math.round(cw * SLIDE_WIDTH_RATIO), SLIDE_MAX_PX);
    const gap = SLIDE_GAP_PX;
    const sidePad = Math.max(16, Math.round((cw - slideW) / 2));
    layoutRef.current = { slideW, sidePad, gap, clientW: cw };
    setLayout({ slideW, sidePad, gap, clientW: cw });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const el = carouselRef.current;
    if (!el) return;
    syncLayoutFromEl(el);
    const ro = new ResizeObserver(() => syncLayoutFromEl(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, syncLayoutFromEl]);

  const scrollCarouselToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const el = carouselRef.current;
      if (!el || presets.length === 0) return;
      const { slideW, sidePad, gap, clientW } = layoutRef.current;
      el.scrollTo({
        left: scrollLeftForCenteredIndex(
          index,
          clientW,
          slideW,
          sidePad,
          gap,
          presets.length,
        ),
        behavior,
      });
      setActiveIndex(index);
    },
    [presets.length],
  );

  useLayoutEffect(() => {
    if (!open || presets.length === 0) return;
    const start = indexFromPresetValue(presets, initialPresetValue);
    setActiveIndex(start);
    const id = requestAnimationFrame(() => {
      const el = carouselRef.current;
      if (!el) return;
      syncLayoutFromEl(el);
      const { slideW, sidePad, gap, clientW } = layoutRef.current;
      el.scrollTo({
        left: scrollLeftForCenteredIndex(
          start,
          clientW,
          slideW,
          sidePad,
          gap,
          presets.length,
        ),
        behavior: "auto",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open, presets, initialPresetValue, syncLayoutFromEl]);

  /** After resize, keep the same Echo centered */
  useLayoutEffect(() => {
    if (!open || presets.length === 0) return;
    const el = carouselRef.current;
    if (!el) return;
    const { slideW, sidePad, gap, clientW } = layoutRef.current;
    el.scrollTo({
      left: scrollLeftForCenteredIndex(
        activeIndexRef.current,
        clientW,
        slideW,
        sidePad,
        gap,
        presets.length,
      ),
      behavior: "auto",
    });
  }, [
    open,
    presets.length,
    layout.slideW,
    layout.sidePad,
    layout.gap,
    layout.clientW,
  ]);

  const onCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || presets.length === 0) return;
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const { slideW, sidePad, gap, clientW } = layoutRef.current;
      const next = indexFromScrollLeft(
        el.scrollLeft,
        clientW,
        slideW,
        sidePad,
        gap,
        presets.length,
      );
      setActiveIndex((prev) => (prev === next ? prev : next));
    });
  }, [presets.length]);

  useEffect(() => {
    if (!open) return;
    const el = carouselRef.current;
    if (!el) return;
    el.addEventListener("scroll", onCarouselScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onCarouselScroll);
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [open, onCarouselScroll]);

  /** Keep active thumbnail in view */
  useEffect(() => {
    if (!open) return;
    const t = thumbRefs.current[activeIndex];
    t?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [open, activeIndex]);

  /** Block page scroll behind overlay (Capacitor / mobile WebView) */
  useEffect(() => {
    if (!open) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.documentElement.style.overscrollBehavior = "";
      document.body.style.overflow = prevBody;
      document.body.style.overscrollBehavior = "";
    };
  }, [open]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDone = useCallback(() => {
    const p = presets[activeIndex];
    if (p) onSelectPreset(presetValueForId(p.id));
    onClose();
  }, [presets, activeIndex, onSelectPreset, onClose]);

  const handleThumbTap = useCallback(
    (i: number) => {
      scrollCarouselToIndex(i, "smooth");
    },
    [scrollCarouselToIndex],
  );

  const handleSlideTap = useCallback(
    (i: number) => {
      if (i !== activeIndex) scrollCarouselToIndex(i, "smooth");
    },
    [activeIndex, scrollCarouselToIndex],
  );

  if (!open || presets.length === 0) return null;

  const { slideW, sidePad, gap } = layout;

  const spacerStyle = (w: number): CSSProperties => ({
    width: w,
    flexShrink: 0,
    scrollSnapAlign: "none",
  });

  return (
    <div
      className={`fixed inset-0 ${OVERLAY_Z} flex flex-col bg-black/45 backdrop-blur-md overscroll-none`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="echo-picker-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default bg-transparent"
        aria-label="Dismiss without saving Echo choice"
        onClick={handleCancel}
        style={{ touchAction: "manipulation" }}
      />

      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col overscroll-y-contain"
        style={{ overscrollBehavior: "contain" }}
      >
        <header className="shrink-0 px-4 pb-3 pt-[max(12px,var(--safe-area-top-layout))]">
          <h2
            id="echo-picker-title"
            className="text-center text-lg font-semibold tracking-tight text-[var(--text)]"
          >
            Choose your Echo
          </h2>
        </header>

        {/* Main carousel — horizontal only */}
        <div
          ref={carouselRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]"
          style={{
            scrollSnapType: "x mandatory",
            touchAction: "pan-x",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain",
            overscrollBehaviorY: "none",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <div style={spacerStyle(sidePad)} aria-hidden />
          {presets.map((preset, i) => {
            const slideBox: CSSProperties = {
              width: slideW,
              flexShrink: 0,
              scrollSnapAlign: "center",
              marginRight: i < presets.length - 1 ? gap : 0,
            };
            return (
              <button
                key={preset.id}
                type="button"
                style={slideBox}
                className="flex flex-col items-center justify-center border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
                aria-label={`Echo ${preset.id}`}
                aria-current={i === activeIndex ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSlideTap(i);
                }}
              >
                <div
                  className={[
                    "flex items-center justify-center rounded-full border-[3px] bg-[var(--surface-2)]/95 shadow-lg transition-[transform,opacity,box-shadow] duration-200",
                    i === activeIndex
                      ? "scale-100 border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
                      : "scale-[0.82] border-[var(--border)] opacity-80",
                  ].join(" ")}
                  style={{
                    width: slideW,
                    height: slideW,
                  }}
                >
                  <img
                    src={preset.url}
                    alt=""
                    className="h-[88%] w-[88%] rounded-full object-cover"
                    draggable={false}
                  />
                </div>
              </button>
            );
          })}
          <div style={spacerStyle(sidePad)} aria-hidden />
        </div>

        <footer
          className="shrink-0 px-4 pt-2"
          style={{
            paddingBottom: "max(16px, var(--safe-area-bottom-layout))",
          }}
        >
          <div className="mx-auto mb-3 flex w-full max-w-[280px] justify-center gap-3">
            <button
              type="button"
              className="rounded-full border border-[var(--border)] bg-[var(--surface-2)]/90 px-7 py-2.5 text-sm font-semibold text-[var(--text)] shadow-sm active:opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-[var(--brand)] px-7 py-2.5 text-sm font-semibold text-[var(--brand-ink)] shadow-sm active:opacity-95"
              onClick={(e) => {
                e.stopPropagation();
                handleDone();
              }}
            >
              Done
            </button>
          </div>

          <div
            className="mx-auto flex max-w-full gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-1 [-webkit-overflow-scrolling:touch]"
            style={{
              touchAction: "pan-x",
              overscrollBehaviorX: "contain",
              overscrollBehaviorY: "none",
            }}
            aria-label="Echo thumbnails"
          >
            {presets.map((preset, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={`thumb-${preset.id}`}
                  type="button"
                  ref={(el) => {
                    thumbRefs.current[i] = el;
                  }}
                  className={[
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 bg-[var(--surface-2)] p-0 transition-shadow",
                    active
                      ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/45"
                      : "border-[var(--border)] opacity-90",
                  ].join(" ")}
                  aria-label={`Select Echo ${preset.id}`}
                  aria-current={active ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleThumbTap(i);
                  }}
                >
                  <img
                    src={preset.url}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        </footer>
      </div>
    </div>
  );
}
