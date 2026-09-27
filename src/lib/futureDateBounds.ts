/**
 * Future single-date bounds for Place Duo / shared date panel.
 * Independent of DOB age rules.
 */

import {
  clampDobParts,
  daysInMonth,
  parseDateOnly,
  toDateOnly,
  type DobParts,
} from "./profileDob";

export const FUTURE_DATE_HORIZON_MONTHS = 12;

export function startOfLocalDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addMonthsClamped(d: Date, months: number): Date {
  const year = d.getFullYear();
  const month = d.getMonth() + months;
  const day = d.getDate();
  const end = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, end));
}

/** Inclusive local-day range: today → today + 12 months. */
export function getFutureDatePickerBounds(
  now: Date = new Date()
): { minDate: Date; maxDate: Date } {
  const minDate = startOfLocalDay(now);
  const maxDate = startOfLocalDay(
    addMonthsClamped(minDate, FUTURE_DATE_HORIZON_MONTHS)
  );
  return { minDate, maxDate };
}

export function dateToDobParts(d: Date): DobParts {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

export function dobPartsToDate(parts: DobParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day);
}

export function boundsToYmd(minDate: Date, maxDate: Date): {
  minDate: string;
  maxDate: string;
} {
  return {
    minDate: toDateOnly(
      minDate.getFullYear(),
      minDate.getMonth() + 1,
      minDate.getDate()
    ),
    maxDate: toDateOnly(
      maxDate.getFullYear(),
      maxDate.getMonth() + 1,
      maxDate.getDate()
    ),
  };
}

/** Clamp a Date into [minDate, maxDate] (local calendar days). */
export function clampFutureDate(
  value: Date,
  minDate: Date,
  maxDate: Date
): Date {
  const t = startOfLocalDay(value).getTime();
  const minT = startOfLocalDay(minDate).getTime();
  const maxT = startOfLocalDay(maxDate).getTime();
  if (t < minT) return startOfLocalDay(minDate);
  if (t > maxT) return startOfLocalDay(maxDate);
  return startOfLocalDay(value);
}

export function isLocalDayBefore(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() < startOfLocalDay(b).getTime();
}

export function isLocalDayAfter(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() > startOfLocalDay(b).getTime();
}

export function isDateWithinFutureBounds(
  value: Date,
  minDate: Date,
  maxDate: Date
): boolean {
  const t = startOfLocalDay(value).getTime();
  return (
    t >= startOfLocalDay(minDate).getTime() &&
    t <= startOfLocalDay(maxDate).getTime()
  );
}

export { daysInMonth, parseDateOnly, toDateOnly, clampDobParts };
export type { DobParts };
