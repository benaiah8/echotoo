/**
 * Shared future single-date panel: Calendar ↔ Wheel + optional Time.
 * Does not stamp default times — `selectedTime: null` stays null until chosen.
 *
 * Date-mode tools (Today / Clear / Calendar / Wheel) only when segment=date.
 * Time mode: Clear time floats top-right inside the time-wheel frame (no extra row).
 */

import { useMemo, useState } from "react";
import {
  PiCalendarBlank,
  PiClock,
  PiTrashSimple,
} from "react-icons/pi";
import type { Matcher } from "react-day-picker";
import CreateScheduleCalendarBody from "../create/CreateScheduleCalendarBody";
import CreateFinalizeTimeWheel from "../create/CreateFinalizeTimeWheel";
import type { CreateFlowStartTime } from "../../lib/createFlowStartTime";
import {
  clampFutureDate,
  getFutureDatePickerBounds,
  startOfLocalDay,
} from "../../lib/futureDateBounds";
import FutureDateWheel from "./FutureDateWheel";
import FutureDateSurfaceToggle, {
  type FutureDatePickerSurface,
} from "./FutureDateSurfaceToggle";

export type { FutureDatePickerSurface };
export type FutureDateTimeSegment = "date" | "time";

export type FutureDateTimePanelProps = {
  selectedDate: Date | null;
  onSelectedDateChange: (date: Date | null) => void;
  /** Explicit time only. null means “no time chosen” — never auto-filled here. */
  selectedTime: CreateFlowStartTime | null;
  onSelectedTimeChange: (time: CreateFlowStartTime | null) => void;
  active?: boolean;
  calendarResetToken?: number;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  /** Controlled date surface; omit for internal state (default calendar). */
  dateSurface?: FutureDatePickerSurface;
  onDateSurfaceChange?: (surface: FutureDatePickerSurface) => void;
  /** Controlled Date|Time segment; omit for internal state (default date). */
  segment?: FutureDateTimeSegment;
  onSegmentChange?: (segment: FutureDateTimeSegment) => void;
  /** Collapse scheduling panel without submitting. */
  onDone?: () => void;
};

/** Shared control height — text pills align to this. */
const CTRL_H = "h-8";

const topRowClass = [
  "flex w-full min-w-0 items-center gap-1.5",
  "max-[360px]:gap-1",
].join(" ");

const textToolBase = [
  "inline-flex min-w-0 flex-1 items-center justify-center gap-1",
  "box-border rounded-full border",
  CTRL_H,
  "px-2 text-[10px] font-medium leading-none tracking-tight",
  "max-[360px]:px-1.5 sm:text-[11px]",
  "transition-colors",
  "bg-transparent",
].join(" ");

const todayToolClass = [
  textToolBase,
  "border-[color-mix(in_oklab,var(--border)_55%,transparent)]",
  "text-[var(--text)]/62",
  "hover:bg-[color-mix(in_oklab,var(--surface)_18%,transparent)]",
  "active:bg-[color-mix(in_oklab,var(--surface)_28%,transparent)]",
].join(" ");

/** Clear: muted when empty; restrained yellow when a date is selected. */
const clearToolClass = (hasDate: boolean) =>
  hasDate
    ? [
        textToolBase,
        "border-[color-mix(in_oklab,var(--brand)_42%,transparent)]",
        "text-[color-mix(in_oklab,var(--brand)_88%,var(--text))]",
        "hover:bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]",
        "active:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)]",
      ].join(" ")
    : [
        textToolBase,
        "border-[color-mix(in_oklab,var(--border)_35%,transparent)]",
        "text-[var(--text)]/32",
        "opacity-45",
        "cursor-not-allowed",
      ].join(" ");

const bottomTrayClass = [
  "flex w-full min-w-0 items-center gap-1 rounded-full p-1",
  "max-[360px]:gap-0.5",
  "border border-[color-mix(in_oklab,var(--border)_40%,transparent)]",
  "bg-[color-mix(in_oklab,var(--surface)_10%,transparent)]",
].join(" ");

const bottomBtnClass = (active: boolean) =>
  [
    "inline-flex min-w-0 flex-1 items-center justify-center gap-1",
    "box-border rounded-full border",
    CTRL_H,
    "px-1.5 text-[10px] font-semibold leading-none tracking-tight",
    "max-[360px]:px-1 sm:px-2 sm:text-[11px]",
    "transition-colors",
    active
      ? [
          "border-[color-mix(in_oklab,var(--text)_18%,transparent)]",
          "bg-[color-mix(in_oklab,var(--surface)_28%,transparent)]",
          "text-[var(--text)]/88",
        ].join(" ")
      : [
          "border-transparent",
          "bg-transparent",
          "text-[var(--text)]/58",
          "hover:bg-[color-mix(in_oklab,var(--surface)_14%,transparent)]",
        ].join(" "),
  ].join(" ");

const doneBtnClass = [
  "inline-flex min-w-0 flex-1 items-center justify-center",
  "box-border rounded-full border",
  CTRL_H,
  "px-1.5 text-[10px] font-semibold leading-none tracking-tight",
  "max-[360px]:px-1 sm:px-2 sm:text-[11px]",
  "transition-colors",
  "border-[color-mix(in_oklab,var(--text)_16%,transparent)]",
  "bg-[color-mix(in_oklab,var(--surface)_22%,transparent)]",
  "text-[var(--text)]/82",
  "hover:bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]",
].join(" ");

export default function FutureDateTimePanel({
  selectedDate,
  onSelectedDateChange,
  selectedTime,
  onSelectedTimeChange,
  active = true,
  calendarResetToken = 0,
  className = "",
  minDate: minDateProp,
  maxDate: maxDateProp,
  dateSurface: dateSurfaceControlled,
  onDateSurfaceChange,
  segment: segmentControlled,
  onSegmentChange,
  onDone,
}: FutureDateTimePanelProps) {
  const bounds = useMemo(() => {
    if (minDateProp && maxDateProp) {
      return {
        minDate: startOfLocalDay(minDateProp),
        maxDate: startOfLocalDay(maxDateProp),
      };
    }
    return getFutureDatePickerBounds();
  }, [maxDateProp, minDateProp]);

  const [surfaceInternal, setSurfaceInternal] =
    useState<FutureDatePickerSurface>("calendar");
  const [segmentInternal, setSegmentInternal] =
    useState<FutureDateTimeSegment>("date");
  const [todayJumpToken, setTodayJumpToken] = useState(0);

  const dateSurface = dateSurfaceControlled ?? surfaceInternal;
  const segment = segmentControlled ?? segmentInternal;

  const setDateSurface = (next: FutureDatePickerSurface) => {
    if (dateSurfaceControlled == null) setSurfaceInternal(next);
    onDateSurfaceChange?.(next);
  };

  const setSegment = (next: FutureDateTimeSegment) => {
    if (segmentControlled == null) setSegmentInternal(next);
    onSegmentChange?.(next);
  };

  const disabledDays = useMemo<Matcher[]>(
    () => [
      { before: bounds.minDate },
      { after: bounds.maxDate },
    ],
    [bounds.maxDate, bounds.minDate]
  );

  const wheelValue = useMemo(() => {
    if (selectedDate) {
      return clampFutureDate(selectedDate, bounds.minDate, bounds.maxDate);
    }
    return bounds.minDate;
  }, [bounds.maxDate, bounds.minDate, selectedDate]);

  const handleCalendarDates = (dates: Date[]) => {
    const last = dates[dates.length - 1];
    if (!last) {
      onSelectedDateChange(null);
      return;
    }
    onSelectedDateChange(
      clampFutureDate(
        new Date(last.getFullYear(), last.getMonth(), last.getDate()),
        bounds.minDate,
        bounds.maxDate
      )
    );
  };

  const handleClearDate = () => {
    onSelectedDateChange(null);
    onSelectedTimeChange(null);
  };

  const handleToday = () => {
    const today = clampFutureDate(
      startOfLocalDay(new Date()),
      bounds.minDate,
      bounds.maxDate
    );
    onSelectedDateChange(today);
    setTodayJumpToken((n) => n + 1);
  };

  const hasDate = selectedDate != null;
  const calendarSelected = selectedDate
    ? [clampFutureDate(selectedDate, bounds.minDate, bounds.maxDate)]
    : [];

  return (
    <div
      className={["flex w-full min-w-0 flex-col gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      {segment === "date" ? (
        <div className={topRowClass} role="group" aria-label="Date tools">
          <button
            type="button"
            className={todayToolClass}
            aria-label="Select today"
            onClick={handleToday}
          >
            <PiCalendarBlank
              className="h-3 w-3 shrink-0 opacity-70"
              aria-hidden
            />
            <span className="truncate">Today</span>
          </button>
          <button
            type="button"
            className={clearToolClass(hasDate)}
            disabled={!hasDate}
            aria-label="Clear date"
            onClick={handleClearDate}
          >
            <PiTrashSimple
              className="h-3 w-3 shrink-0 opacity-80"
              aria-hidden
            />
            <span className="truncate">Clear</span>
          </button>
          <FutureDateSurfaceToggle
            value={dateSurface}
            onChange={setDateSurface}
          />
        </div>
      ) : null}

      {segment === "date" ? (
        dateSurface === "calendar" ? (
          <div
            className="min-w-0 overscroll-contain"
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <CreateScheduleCalendarBody
              selectedDates={calendarSelected}
              onSelectDates={handleCalendarDates}
              resetToken={`${calendarResetToken}:${todayJumpToken}`}
              pickMode="single"
              clearEnabled={selectedDate != null}
              onClear={handleClearDate}
              disabledDays={disabledDays}
              startMonth={bounds.minDate}
              endMonth={bounds.maxDate}
              showFooterControls={false}
              dayPickerClassName="rdp-theme--full-width"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-[color-mix(in_oklab,var(--border)_42%,transparent)] bg-transparent px-2 py-2">
            <FutureDateWheel
              value={wheelValue}
              onChange={(next) => {
                onSelectedDateChange(
                  clampFutureDate(next, bounds.minDate, bounds.maxDate)
                );
              }}
              minDate={bounds.minDate}
              maxDate={bounds.maxDate}
              active={active}
            />
          </div>
        )
      ) : (
        <div
          className="relative min-w-0"
          onTouchMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <CreateFinalizeTimeWheel
            value={selectedTime}
            onChange={(next) => onSelectedTimeChange(next)}
            onClear={
              selectedTime != null
                ? () => onSelectedTimeChange(null)
                : undefined
            }
            clearLabel="Clear time"
            clearPlacement="top-right"
            active={active}
          />
          {selectedTime == null ? (
            <p className="mt-1.5 text-[10px] leading-snug text-[var(--text)]/45">
              Optional. Scroll to choose a time, or stay date-only.
            </p>
          ) : null}
        </div>
      )}

      {onDone ? (
        <div
          className={bottomTrayClass}
          role="group"
          aria-label="Schedule mode"
        >
          <button
            type="button"
            className={bottomBtnClass(segment === "date")}
            aria-label="Edit date"
            aria-pressed={segment === "date"}
            onClick={() => setSegment("date")}
          >
            <PiCalendarBlank className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate max-[360px]:hidden">Date</span>
          </button>
          <button
            type="button"
            className={bottomBtnClass(segment === "time")}
            aria-label="Edit time"
            aria-pressed={segment === "time"}
            onClick={() => setSegment("time")}
          >
            <PiClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate max-[360px]:hidden">Time</span>
          </button>
          <button
            type="button"
            className={doneBtnClass}
            aria-label="Done"
            onClick={onDone}
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
