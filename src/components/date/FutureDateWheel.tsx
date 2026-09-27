/**
 * Future-date wheel: Month | Day | Year within injectable bounds.
 * Does not alter Profile DOB defaults.
 */

import { useMemo } from "react";
import {
  boundsToYmd,
  clampDobParts,
  dateToDobParts,
  daysInMonth,
  dobPartsToDate,
  type DobParts,
} from "../../lib/futureDateBounds";
import VerticalSnapColumn from "./VerticalSnapColumn";

const ITEM_H = 38;
const VISIBLE = 3;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export default function FutureDateWheel({
  value,
  onChange,
  minDate,
  maxDate,
  active,
}: {
  value: Date;
  onChange: (next: Date) => void;
  minDate: Date;
  maxDate: Date;
  active: boolean;
}) {
  const ymdBounds = useMemo(
    () => boundsToYmd(minDate, maxDate),
    [minDate, maxDate]
  );
  const min = useMemo(
    () => dateToDobParts(minDate),
    [minDate]
  );
  const max = useMemo(
    () => dateToDobParts(maxDate),
    [maxDate]
  );
  const parts = useMemo(
    () =>
      clampDobParts(dateToDobParts(value), ymdBounds.minDate, ymdBounds.maxDate),
    [value, ymdBounds.maxDate, ymdBounds.minDate]
  );

  const months = useMemo(() => {
    // Month list depends on year; when years span, show all months that exist
    // for the selected year within bounds.
    let monthMin = 1;
    let monthMax = 12;
    if (parts.year === min.year) monthMin = min.month;
    if (parts.year === max.year) monthMax = max.month;
    const list: number[] = [];
    for (let m = monthMin; m <= monthMax; m++) list.push(m);
    return list;
  }, [parts.year, min.year, min.month, max.year, max.month]);

  const days = useMemo(() => {
    let dayMin = 1;
    let dayMax = daysInMonth(parts.year, parts.month);
    if (parts.year === min.year && parts.month === min.month) {
      dayMin = min.day;
    }
    if (parts.year === max.year && parts.month === max.month) {
      dayMax = Math.min(dayMax, max.day);
    }
    const list: number[] = [];
    for (let d = dayMin; d <= dayMax; d++) list.push(d);
    return list;
  }, [
    parts.year,
    parts.month,
    min.year,
    min.month,
    min.day,
    max.year,
    max.month,
    max.day,
  ]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = min.year; y <= max.year; y++) list.push(y);
    return list;
  }, [min.year, max.year]);

  const setParts = (next: Partial<DobParts>) => {
    const clamped = clampDobParts(
      { ...parts, ...next },
      ymdBounds.minDate,
      ymdBounds.maxDate
    );
    onChange(dobPartsToDate(clamped));
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: VISIBLE * ITEM_H,
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="relative flex h-full w-full items-stretch">
        <div
          className="pointer-events-none absolute inset-x-2 top-1/2 z-0 h-[32px] -translate-y-1/2 rounded-full bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]"
          aria-hidden
        />
        <VerticalSnapColumn
          values={months}
          value={parts.month}
          onChange={(month) => setParts({ month })}
          format={(m) => MONTH_LABELS[m - 1] ?? String(m)}
          ariaLabel="Month"
          active={active}
          flexClass="flex-[1.35]"
          itemHeight={ITEM_H}
          visibleCount={VISIBLE}
        />
        <VerticalSnapColumn
          values={days}
          value={parts.day}
          onChange={(day) => setParts({ day })}
          format={(d) => String(d)}
          ariaLabel="Day"
          active={active}
          flexClass="flex-[0.7]"
          itemHeight={ITEM_H}
          visibleCount={VISIBLE}
        />
        <VerticalSnapColumn
          values={years}
          value={parts.year}
          onChange={(year) => setParts({ year })}
          format={(y) => String(y)}
          ariaLabel="Year"
          active={active}
          flexClass="flex-[0.95]"
          itemHeight={ITEM_H}
          visibleCount={VISIBLE}
        />
      </div>
    </div>
  );
}
