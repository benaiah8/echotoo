// src/components/CalendarModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import {
  PiArrowsOutLineHorizontal,
  PiCalendarBlank,
  PiTrashSimple,
} from "react-icons/pi";
import "react-day-picker/dist/style.css";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./ui/FrostedCenterModal";

type PickMode = "multi" | "range";

interface Props {
  show: boolean;
  selectedDates: Date[];
  onSelectDates: (dates: Date[]) => void;
  /** Kept for parent compatibility; recurrence is edited outside this modal. */
  isRecurring: boolean;
  recurrenceDays: string[];
  onToggleRecurrenceDay: (day: string) => void;
  onClose: () => void;
}

export default function CalendarModal({
  show,
  selectedDates,
  onSelectDates,
  isRecurring: _isRecurring,
  recurrenceDays: _recurrenceDays,
  onToggleRecurrenceDay: _onToggleRecurrenceDay,
  onClose,
}: Props) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<PickMode>("multi");
  /** Range mode only: waiting for end tap after start is chosen. */
  const [rangePendingStart, setRangePendingStart] = useState<Date | null>(null);

  const normalize = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a?: Date | null, b?: Date | null) =>
    !!a && !!b && a.getTime() === b.getTime();

  const sortDays = (arr: Date[]) =>
    [...arr].map(normalize).sort((a, b) => a.getTime() - b.getTime());

  const daysBetween = (a: Date, b: Date) => {
    const start = normalize(a);
    const end = normalize(b);
    const step = start.getTime() <= end.getTime() ? 1 : -1;
    const out: Date[] = [];
    const cur = new Date(start);
    while ((step === 1 && cur <= end) || (step === -1 && cur >= end)) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + step);
    }
    return out;
  };

  useEffect(() => {
    if (show) {
      const now = new Date();
      setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      setRangePendingStart(null);
      setMode("multi");
    }
  }, [show]);

  const handleModeChange = (next: PickMode) => {
    setRangePendingStart(null);
    setMode(next);
  };

  const handleRangeDayClick = (day: Date) => {
    const normalizedDay = normalize(day);
    if (!rangePendingStart) {
      setRangePendingStart(normalizedDay);
      onSelectDates([normalizedDay]);
      return;
    }
    if (sameDay(rangePendingStart, normalizedDay)) {
      onSelectDates([normalizedDay]);
      setRangePendingStart(null);
      return;
    }
    onSelectDates(sortDays(daysBetween(rangePendingStart, normalizedDay)));
    setRangePendingStart(null);
  };

  /** Range mode uses custom logic; multi uses library toggle + controlled `onSelect`. */
  const handleDayClick = (day: Date) => {
    if (mode === "range") {
      handleRangeDayClick(day);
    }
  };

  /** Library `select()` runs before `onDayClick`; in range mode we only apply range logic here. */
  const handleSelectMultiple = (dates: Date[] | undefined) => {
    if (mode === "range") return;
    onSelectDates(sortDays(dates ?? []));
  };

  const clearAllDates = useCallback(() => {
    onSelectDates([]);
    setRangePendingStart(null);
  }, [onSelectDates]);

  const dayKey = (d: Date) => normalize(d).getTime();
  const selSet = useMemo(
    () => new Set(selectedDates.map(dayKey)),
    [selectedDates]
  );

  const isSelected = (d: Date) => selSet.has(dayKey(d));
  const prevSelected = (d: Date) => {
    const p = new Date(d);
    p.setDate(p.getDate() - 1);
    return isSelected(p);
  };
  const nextSelected = (d: Date) => {
    const n = new Date(d);
    n.setDate(n.getDate() + 1);
    return isSelected(n);
  };

  const modifiers = {
    rangeStart: (d: Date) =>
      isSelected(d) && !prevSelected(d) && nextSelected(d),
    rangeEnd: (d: Date) => isSelected(d) && prevSelected(d) && !nextSelected(d),
    rangeMiddle: (d: Date) =>
      isSelected(d) && prevSelected(d) && nextSelected(d),
    singleOnly: (d: Date) =>
      isSelected(d) && !prevSelected(d) && !nextSelected(d),
  };

  const hasDates = selectedDates.length > 0;

  /** Compact row: must stay on one line on narrow modals; short visible labels + aria-label for full wording. */
  const modePillClass = (active: boolean) =>
    [
      "flex min-h-0 min-w-0 w-full max-w-full items-center justify-center gap-0.5 rounded-full px-1 py-1 text-[10px] font-semibold leading-none transition-colors sm:gap-1 sm:px-1.5 sm:text-[11px]",
      active
        ? "bg-[var(--brand)] text-[var(--brand-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
        : "border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] text-[var(--text)]/82 hover:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)] dark:border-[var(--border)]/38",
    ].join(" ");

  const clearPillClass = (enabled: boolean) =>
    [
      "flex min-h-0 min-w-0 w-full max-w-full items-center justify-center gap-0.5 rounded-full px-1 py-1 text-[10px] font-semibold leading-none transition-colors sm:gap-1 sm:px-1.5 sm:text-[11px]",
      enabled
        ? "border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface)_18%,transparent)] text-[var(--text)]/82 hover:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)] dark:border-[var(--border)]/38"
        : "cursor-not-allowed border border-[var(--border)]/35 bg-[color-mix(in_oklab,var(--surface)_10%,transparent)] text-[var(--text)]/35 opacity-60",
    ].join(" ");

  const panelStyle: React.CSSProperties = {
    ...frostedModalPanelStyle,
    maxWidth: "min(360px, calc(100vw - 3rem))",
  };

  return (
    <FrostedCenterModal
      open={show}
      onBackdropClick={onClose}
      zTier="dialog"
      aria-label="Choose dates"
      containerClassName="px-6 sm:px-8"
    >
      <div
        className="pointer-events-auto flex w-full flex-col gap-2.5"
        style={{ maxWidth: "min(360px, calc(100vw - 3rem))" }}
      >
        <div
          className={`${frostedModalPanelClassName} flex max-h-[min(76vh,580px)] flex-col gap-3 border-2 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.14)] sm:p-5 dark:border-[color-mix(in_oklab,var(--border)_52%,transparent)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_40px_rgba(0,0,0,0.35)]`}
          style={panelStyle}
        >
          <div className="min-h-0 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">
            <DayPicker
              mode="multiple"
              selected={selectedDates}
              onSelect={handleSelectMultiple}
              onDayClick={handleDayClick}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              className="rdp-theme rdp-theme--modal w-full"
              modifiers={modifiers}
              modifiersClassNames={{
                rangeStart: "range-start",
                rangeEnd: "range-end",
                rangeMiddle: "range-middle",
                singleOnly: "single-only",
              }}
            />
          </div>

          {mode === "range" && rangePendingStart ? (
            <p className="text-center text-[10px] leading-tight text-[var(--text)]/50">
              Tap a second day to complete the range
            </p>
          ) : null}

          <div
            className="grid w-full min-w-0 grid-cols-3 gap-1 rounded-full border border-[color-mix(in_oklab,var(--border)_42%,transparent)] bg-[color-mix(in_oklab,var(--surface)_20%,transparent)] px-1.5 py-1.5 sm:gap-1.5 sm:px-2 sm:py-2 dark:border-[color-mix(in_oklab,var(--border)_48%,transparent)] dark:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)]"
            role="group"
            aria-label="Date selection and clear"
          >
            <button
              type="button"
              className={modePillClass(mode === "multi")}
              aria-label="Multi dates"
              aria-pressed={mode === "multi"}
              onClick={() => handleModeChange("multi")}
            >
              <PiCalendarBlank
                className="h-3 w-3 shrink-0 opacity-80"
                aria-hidden
              />
              <span className="truncate">Multi</span>
            </button>
            <button
              type="button"
              className={modePillClass(mode === "range")}
              aria-label="Date range"
              aria-pressed={mode === "range"}
              onClick={() => handleModeChange("range")}
            >
              <PiArrowsOutLineHorizontal
                className="h-3 w-3 shrink-0 opacity-80"
                aria-hidden
              />
              <span className="truncate">Range</span>
            </button>
            <button
              type="button"
              disabled={!hasDates}
              className={clearPillClass(hasDates)}
              aria-label="Clear all dates"
              onClick={(e) => {
                e.preventDefault();
                clearAllDates();
              }}
            >
              <PiTrashSimple
                className="h-3 w-3 shrink-0 opacity-80"
                aria-hidden
              />
              <span className="truncate">Clear</span>
            </button>
          </div>
        </div>

        <div className="flex w-full justify-center px-1 pt-0.5">
          <button
            type="button"
            className="h-8 min-w-[7rem] rounded-full bg-[var(--brand)] px-6 text-[12px] font-semibold leading-none text-[var(--brand-ink)] shadow-[0_1px_0_rgba(0,0,0,0.06)] transition hover:opacity-95 active:scale-[0.99] dark:shadow-[0_1px_0_rgba(255,255,255,0.08)]"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
