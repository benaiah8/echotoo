/**
 * Profile DOB three-column wheel (Year | Month | Day).
 * Compact ~3-row picker for inline Edit Profile pill — no own border shell.
 * Defaults and age bounds unchanged; uses shared VerticalSnapColumn.
 */
import { useMemo } from "react";
import {
  clampDobParts,
  daysInMonth,
  getDobPickerBounds,
  parseDateOnly,
  type DobParts,
} from "../../lib/profileDob";
import VerticalSnapColumn from "../date/VerticalSnapColumn";

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

export default function ProfileDobWheel({
  value,
  onChange,
  active,
}: {
  value: DobParts;
  onChange: (next: DobParts) => void;
  active: boolean;
}) {
  const { minDate, maxDate } = useMemo(() => getDobPickerBounds(), []);
  const min = parseDateOnly(minDate)!;
  const max = parseDateOnly(maxDate)!;

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = min.year; y <= max.year; y++) list.push(y);
    return list;
  }, [min.year, max.year]);

  const months = useMemo(() => {
    let monthMin = 1;
    let monthMax = 12;
    if (value.year === min.year) monthMin = min.month;
    if (value.year === max.year) monthMax = max.month;
    const list: number[] = [];
    for (let m = monthMin; m <= monthMax; m++) list.push(m);
    return list;
  }, [value.year, min.year, min.month, max.year, max.month]);

  const days = useMemo(() => {
    let dayMin = 1;
    let dayMax = daysInMonth(value.year, value.month);
    if (value.year === min.year && value.month === min.month) {
      dayMin = min.day;
    }
    if (value.year === max.year && value.month === max.month) {
      dayMax = Math.min(dayMax, max.day);
    }
    const list: number[] = [];
    for (let d = dayMin; d <= dayMax; d++) list.push(d);
    return list;
  }, [
    value.year,
    value.month,
    min.year,
    min.month,
    min.day,
    max.year,
    max.month,
    max.day,
  ]);

  const setParts = (next: Partial<DobParts>) => {
    onChange(clampDobParts({ ...value, ...next }, minDate, maxDate));
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
          values={years}
          value={value.year}
          onChange={(year) => setParts({ year })}
          format={(y) => String(y)}
          ariaLabel="Year"
          active={active}
          flexClass="flex-[0.95]"
          itemHeight={ITEM_H}
          visibleCount={VISIBLE}
        />
        <VerticalSnapColumn
          values={months}
          value={value.month}
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
          value={value.day}
          onChange={(day) => setParts({ day })}
          format={(d) => String(d)}
          ariaLabel="Day"
          active={active}
          flexClass="flex-[0.7]"
          itemHeight={ITEM_H}
          visibleCount={VISIBLE}
        />
      </div>
    </div>
  );
}
