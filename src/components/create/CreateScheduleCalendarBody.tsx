import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import {
  PiArrowsOutLineHorizontal,
  PiCalendarBlank,
  PiTrashSimple,
} from "react-icons/pi";
import "react-day-picker/dist/style.css";

type InternalPickMode = "multi" | "range";

export type CalendarPickMode = "single" | "multi" | "range";

export type CreateScheduleCalendarBodyProps = {
  selectedDates: Date[];
  onSelectDates: (dates: Date[]) => void;
  /** Increment (or change) to reset month/mode when a parent overlay opens. */
  resetToken?: number | string | boolean;
  extraBelowControls?: ReactNode;
  onClear?: () => void;
  clearEnabled?: boolean;
  /** `single` = one date, replace on tap, no Multi/Range. Default `multi`. */
  pickMode?: CalendarPickMode;
  /**
   * Optional day disable matcher(s). Omit for Create (unchanged: all days selectable).
   * Place Duo passes past-day / horizon matchers.
   */
  disabledDays?: Matcher | Matcher[];
  /** Optional month navigation floor (react-day-picker v9). */
  startMonth?: Date;
  /** Optional month navigation ceiling (react-day-picker v9). */
  endMonth?: Date;
  /**
   * When false, hide Multi/Range/Today/Clear footer (parent owns those controls).
   * Default true — Create Finalize unchanged.
   */
  showFooterControls?: boolean;
  /**
   * Extra classNames merged onto DayPicker root (after `rdp-theme rdp-theme--modal`).
   * Place Duo passes `rdp-theme--full-width` for fluid 7-column grid.
   */
  dayPickerClassName?: string;
};

function normalize(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a?: Date | null, b?: Date | null) {
  return !!a && !!b && a.getTime() === b.getTime();
}

function sortDays(arr: Date[]) {
  return [...arr].map(normalize).sort((a, b) => a.getTime() - b.getTime());
}

function daysBetween(a: Date, b: Date) {
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
}

/**
 * Presentational calendar + Multi/Range/Today/Clear (or single-date + Today/Clear).
 * Used by CalendarModal (legacy) and the V4 finalize schedule sheet.
 */
export default function CreateScheduleCalendarBody({
  selectedDates,
  onSelectDates,
  resetToken,
  extraBelowControls,
  onClear,
  clearEnabled,
  pickMode = "multi",
  disabledDays,
  startMonth,
  endMonth,
  showFooterControls = true,
  dayPickerClassName = "",
}: CreateScheduleCalendarBodyProps) {
  const isSinglePick = pickMode === "single";
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [mode, setMode] = useState<InternalPickMode>("multi");
  const [rangePendingStart, setRangePendingStart] = useState<Date | null>(null);
  const [todayDate, setTodayDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const goToToday = useCallback(() => {
    const now = new Date();
    setTodayDate(normalize(now));
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  useEffect(() => {
    const now = new Date();
    setTodayDate(normalize(now));
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setRangePendingStart(null);
    if (!isSinglePick) {
      setMode("multi");
    }
  }, [resetToken, isSinglePick]);

  const handleModeChange = (next: InternalPickMode) => {
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

  const handleDayClick = (day: Date) => {
    if (isSinglePick) {
      const normalizedDay = normalize(day);
      const current = selectedDates[0];
      if (current && sameDay(current, normalizedDay)) {
        onSelectDates([normalizedDay]);
      }
      return;
    }
    if (mode === "range") {
      handleRangeDayClick(day);
    }
  };

  const handleSelectMultiple = (dates: Date[] | undefined) => {
    if (mode === "range") return;
    onSelectDates(sortDays(dates ?? []));
  };

  const handleSelectSingle = (day: Date | undefined) => {
    if (!day) {
      onSelectDates([]);
      return;
    }
    onSelectDates([normalize(day)]);
  };

  const clearAllDates = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      onSelectDates([]);
    }
    setRangePendingStart(null);
  }, [onClear, onSelectDates]);

  const selSet = useMemo(
    () => new Set(selectedDates.map((d) => normalize(d).getTime())),
    [selectedDates]
  );

  const isSelected = (d: Date) => selSet.has(normalize(d).getTime());
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
  const canClear = clearEnabled ?? hasDates;

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

  const controlsGridClass = isSinglePick
    ? "grid w-full min-w-0 grid-cols-2 gap-1 rounded-full border border-[color-mix(in_oklab,var(--border)_42%,transparent)] bg-[color-mix(in_oklab,var(--surface)_20%,transparent)] px-1.5 py-1.5 sm:gap-1.5 sm:px-2 sm:py-2 dark:border-[color-mix(in_oklab,var(--border)_48%,transparent)] dark:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)]"
    : "grid w-full min-w-0 grid-cols-4 gap-1 rounded-full border border-[color-mix(in_oklab,var(--border)_42%,transparent)] bg-[color-mix(in_oklab,var(--surface)_20%,transparent)] px-1.5 py-1.5 sm:gap-1.5 sm:px-2 sm:py-2 dark:border-[color-mix(in_oklab,var(--border)_48%,transparent)] dark:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)]";

  const singleSelected = selectedDates[0] ?? undefined;

  const dayPickerRootClass = [
    "rdp-theme rdp-theme--modal w-full",
    dayPickerClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex min-h-0 w-full flex-col gap-2.5">
      <div className="min-h-0 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">
        {isSinglePick ? (
          <DayPicker
            mode="single"
            selected={singleSelected}
            onSelect={handleSelectSingle}
            onDayClick={handleDayClick}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            today={todayDate}
            disabled={disabledDays}
            startMonth={startMonth}
            endMonth={endMonth}
            className={dayPickerRootClass}
            modifiers={modifiers}
            modifiersClassNames={{
              rangeStart: "range-start",
              rangeEnd: "range-end",
              rangeMiddle: "range-middle",
              singleOnly: "single-only",
            }}
          />
        ) : (
          <DayPicker
            mode="multiple"
            selected={selectedDates}
            onSelect={handleSelectMultiple}
            onDayClick={handleDayClick}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            today={todayDate}
            disabled={disabledDays}
            startMonth={startMonth}
            endMonth={endMonth}
            className={dayPickerRootClass}
            modifiers={modifiers}
            modifiersClassNames={{
              rangeStart: "range-start",
              rangeEnd: "range-end",
              rangeMiddle: "range-middle",
              singleOnly: "single-only",
            }}
          />
        )}
      </div>

      {!isSinglePick && mode === "range" && rangePendingStart ? (
        <p className="text-center text-[10px] leading-tight text-[var(--text)]/50">
          Tap a second day to complete the range
        </p>
      ) : null}

      {showFooterControls ? (
        <div
          className={controlsGridClass}
          role="group"
          aria-label="Date selection, today shortcut, and clear"
        >
          {!isSinglePick ? (
            <>
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
            </>
          ) : null}
          <button
            type="button"
            className={modePillClass(false)}
            aria-label="Go to today"
            onClick={(e) => {
              e.preventDefault();
              goToToday();
            }}
          >
            <span className="truncate">Today</span>
          </button>
          <button
            type="button"
            disabled={!canClear}
            className={clearPillClass(canClear)}
            aria-label="Clear schedule"
            onClick={(e) => {
              e.preventDefault();
              clearAllDates();
            }}
          >
            <PiTrashSimple className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">Clear</span>
          </button>
        </div>
      ) : null}

      {extraBelowControls ?? null}
    </div>
  );
}
