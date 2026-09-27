/**
 * Vertical scroll-snap column used by DOB and future-date wheels.
 * Owns pan-y gestures (stopPropagation) so parent drawers do not drag.
 */

import { useCallback, useLayoutEffect, useRef } from "react";

export type VerticalSnapColumnProps<T extends string | number> = {
  values: readonly T[];
  value: T;
  onChange: (next: T) => void;
  format: (v: T) => string;
  ariaLabel: string;
  active: boolean;
  flexClass?: string;
  itemHeight?: number;
  visibleCount?: number;
};

export default function VerticalSnapColumn<T extends string | number>({
  values,
  value,
  onChange,
  format,
  ariaLabel,
  active,
  flexClass = "flex-1",
  itemHeight = 38,
  visibleCount = 3,
}: VerticalSnapColumnProps<T>) {
  const padY = ((visibleCount - 1) / 2) * itemHeight;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const armedRef = useRef(false);
  const skipScrollRef = useRef(false);

  const scrollToValue = useCallback(
    (next: T, instant: boolean) => {
      const el = scrollerRef.current;
      if (!el) return;
      const idx = values.indexOf(next);
      if (idx < 0) return;
      skipScrollRef.current = true;
      el.scrollTo({
        top: idx * itemHeight,
        behavior: instant ? "auto" : "smooth",
      });
      window.setTimeout(() => {
        skipScrollRef.current = false;
      }, instant ? 40 : 280);
    },
    [itemHeight, values]
  );

  useLayoutEffect(() => {
    if (!active) {
      armedRef.current = false;
      return;
    }
    armedRef.current = false;
    const id = window.setTimeout(() => {
      armedRef.current = true;
    }, 80);
    return () => window.clearTimeout(id);
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    const el = scrollerRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    const expected = idx * itemHeight;
    if (Math.abs(el.scrollTop - expected) < itemHeight / 2) return;
    scrollToValue(value, true);
  }, [active, itemHeight, scrollToValue, value, values]);

  const commitFromScroll = () => {
    const el = scrollerRef.current;
    if (!el || skipScrollRef.current || !armedRef.current) return;
    const idx = Math.min(
      values.length - 1,
      Math.max(0, Math.round(el.scrollTop / itemHeight))
    );
    const next = values[idx];
    if (next !== undefined && next !== value) onChange(next);
  };

  return (
    <div
      ref={scrollerRef}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={`${ariaLabel}-${String(value)}`}
      className={`min-h-0 min-w-0 ${flexClass} overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      style={{
        height: visibleCount * itemHeight,
        scrollSnapType: "y mandatory",
        paddingTop: padY,
        paddingBottom: padY,
        touchAction: "pan-y",
      }}
      onPointerDown={(e) => {
        armedRef.current = true;
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
      onWheel={(e) => {
        e.stopPropagation();
      }}
      onScroll={commitFromScroll}
    >
      {values.map((item) => {
        const selected = item === value;
        return (
          <button
            key={String(item)}
            id={`${ariaLabel}-${String(item)}`}
            type="button"
            role="option"
            aria-selected={selected}
            className={[
              "flex w-full shrink-0 items-center justify-center px-0.5 text-center tabular-nums transition-[font-size,color,font-weight] duration-150",
              selected
                ? "text-[15px] font-bold text-[var(--text)] sm:text-[16px]"
                : "text-[11px] font-medium text-[var(--text)]/40 sm:text-[12px]",
            ].join(" ")}
            style={{
              height: itemHeight,
              scrollSnapAlign: "center",
              scrollSnapStop: "normal",
            }}
            onClick={() => {
              armedRef.current = true;
              onChange(item);
              scrollToValue(item, false);
            }}
          >
            {format(item)}
          </button>
        );
      })}
    </div>
  );
}
