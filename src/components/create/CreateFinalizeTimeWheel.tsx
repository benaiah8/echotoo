/**
 * Vertical CSS scroll-snap time wheel (Hour | Minute | AM/PM).
 * No keyboard. Minutes 00–59. 12:00 AM is coerced by startTimeFrom12Hour.
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import {
  CREATE_FLOW_DEFAULT_START_TIME,
  startTimeFrom12Hour,
  startTimeTo12Hour,
  type CreateFlowStartTime,
} from "../../lib/createFlowStartTime";

const ITEM_H = 40;
const VISIBLE = 5;
const PAD_Y = ((VISIBLE - 1) / 2) * ITEM_H;

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"] as const;

type Period = (typeof PERIODS)[number];

function SnapColumn<T extends string | number>({
  values,
  value,
  onChange,
  format,
  ariaLabel,
  active,
}: {
  values: readonly T[];
  value: T;
  onChange: (next: T) => void;
  format: (v: T) => string;
  ariaLabel: string;
  active: boolean;
}) {
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
        top: idx * ITEM_H,
        behavior: instant ? "auto" : "smooth",
      });
      window.setTimeout(() => {
        skipScrollRef.current = false;
      }, instant ? 40 : 280);
    },
    [values]
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
    const expected = idx * ITEM_H;
    if (Math.abs(el.scrollTop - expected) < ITEM_H / 2) return;
    scrollToValue(value, true);
  }, [active, scrollToValue, value, values]);

  const commitFromScroll = () => {
    const el = scrollerRef.current;
    if (!el || skipScrollRef.current || !armedRef.current) return;
    const idx = Math.min(
      values.length - 1,
      Math.max(0, Math.round(el.scrollTop / ITEM_H))
    );
    const next = values[idx];
    if (next !== value) onChange(next);
  };

  return (
    <div
      ref={scrollerRef}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={`${ariaLabel}-${String(value)}`}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        height: VISIBLE * ITEM_H,
        scrollSnapType: "y mandatory",
        paddingTop: PAD_Y,
        paddingBottom: PAD_Y,
      }}
      onPointerDown={() => {
        armedRef.current = true;
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
              "flex w-full shrink-0 items-center justify-center text-[15px] font-semibold tabular-nums transition-colors",
              selected
                ? "text-[var(--text)]"
                : "text-[var(--text)]/38",
            ].join(" ")}
            style={{
              height: ITEM_H,
              scrollSnapAlign: "center",
              scrollSnapStop: "always",
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

const clearTopRightClass = [
  "absolute right-1.5 top-1.5 z-20",
  "inline-flex min-h-7 items-center justify-center gap-1",
  "rounded-full border px-2.5",
  "text-[10px] font-medium leading-none tracking-tight",
  "border-[color-mix(in_oklab,var(--border)_48%,transparent)]",
  "bg-[color-mix(in_oklab,var(--surface)_88%,var(--bg))]",
  "text-[var(--text)]/62",
  "shadow-[0_1px_3px_rgba(0,0,0,0.12)]",
  "backdrop-blur-sm",
  "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_82%,black)]",
  "app-dark:shadow-[0_1px_4px_rgba(0,0,0,0.35)]",
  "hover:text-[var(--text)]/85",
  "active:scale-[0.98]",
].join(" ");

const clearBottomRightClass = [
  "absolute bottom-2 right-2 z-10 inline-flex h-6 items-center rounded-full",
  "border border-[var(--border)]/45",
  "bg-[color-mix(in_oklab,var(--glass-bg)_82%,transparent)]",
  "px-2 text-[10px] font-semibold leading-none text-[var(--text)]/70",
  "shadow-sm backdrop-blur-[var(--glass-blur)]",
  "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
  "transition hover:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)]",
  "hover:text-[var(--text)]/90 active:scale-[0.98]",
].join(" ");

export default function CreateFinalizeTimeWheel({
  value,
  onChange,
  onClear,
  clearLabel = "Clear",
  clearPlacement = "bottom-right",
  active,
}: {
  value: CreateFlowStartTime | null;
  onChange: (next: CreateFlowStartTime) => void;
  onClear?: () => void;
  /** Label for clear control (Place Duo uses “Clear time”). */
  clearLabel?: string;
  /** Inside-frame placement; default keeps Create Finalize bottom-right. */
  clearPlacement?: "top-right" | "bottom-right";
  active: boolean;
}) {
  const clock = startTimeTo12Hour(value ?? CREATE_FLOW_DEFAULT_START_TIME);
  const showClear = value != null && onClear != null;

  const commit = (hour12: number, minutes: number, period: Period) => {
    onChange(startTimeFrom12Hour(hour12, minutes, period));
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-[var(--create-radius-panel)] border border-[var(--border)]/40 bg-[color-mix(in_oklab,var(--surface)_14%,transparent)] app-dark:border-white/14 app-dark:bg-[color-mix(in_oklab,var(--surface)_10%,transparent)]"
      style={{ height: VISIBLE * ITEM_H }}
    >
      <div className="relative flex h-full w-full items-stretch">
        <div
          className="pointer-events-none absolute inset-x-3 top-1/2 z-0 h-10 -translate-y-1/2 rounded-full border border-[color-mix(in_oklab,var(--brand)_42%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_18%,transparent)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-12 bg-gradient-to-b from-[color-mix(in_oklab,var(--surface)_55%,transparent)] to-transparent app-dark:from-[color-mix(in_oklab,var(--surface)_36%,transparent)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-12 bg-gradient-to-t from-[color-mix(in_oklab,var(--surface)_55%,transparent)] to-transparent app-dark:from-[color-mix(in_oklab,var(--surface)_36%,transparent)]"
          aria-hidden
        />
        <SnapColumn
          values={HOURS_12}
          value={clock.hour12 as (typeof HOURS_12)[number]}
          onChange={(hour12) => commit(hour12, clock.minutes, clock.period)}
          format={(h) => String(h)}
          ariaLabel="Hour"
          active={active}
        />
        <div
          className="relative z-[2] flex w-4 shrink-0 items-center justify-center text-[15px] font-semibold text-[var(--text)]/70"
          aria-hidden
        >
          :
        </div>
        <SnapColumn
          values={MINUTES}
          value={clock.minutes}
          onChange={(minutes) => commit(clock.hour12, minutes, clock.period)}
          format={(m) => String(m).padStart(2, "0")}
          ariaLabel="Minute"
          active={active}
        />
        <SnapColumn
          values={PERIODS}
          value={clock.period}
          onChange={(period) => commit(clock.hour12, clock.minutes, period)}
          format={(p) => p}
          ariaLabel="AM or PM"
          active={active}
        />
      </div>
      {showClear ? (
        <button
          type="button"
          className={
            clearPlacement === "top-right"
              ? clearTopRightClass
              : clearBottomRightClass
          }
          aria-label={clearLabel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear?.();
          }}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}
