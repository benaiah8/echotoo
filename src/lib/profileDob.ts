/**
 * Date-only DOB helpers for Profile private metadata (YYYY-MM-DD).
 * No timestamps / age storage.
 */

export type DobParts = {
  year: number;
  month: number; // 1–12
  day: number;
};

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function toDateOnly(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function parseDateOnly(ymd: string): DobParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1) return null;
  return { year, month, day };
}

/** 13+ max / ~120y or 1900-01-01 min — input validation only. */
export function getDobPickerBounds(): { minDate: string; maxDate: string } {
  const now = new Date();
  const max = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
  const ageFloor = new Date(
    now.getFullYear() - 120,
    now.getMonth(),
    now.getDate(),
  );
  const absoluteFloor = new Date(1900, 0, 1);
  const min =
    ageFloor.getTime() > absoluteFloor.getTime() ? ageFloor : absoluteFloor;
  return {
    minDate: toDateOnly(min.getFullYear(), min.getMonth() + 1, min.getDate()),
    maxDate: toDateOnly(max.getFullYear(), max.getMonth() + 1, max.getDate()),
  };
}

export function clampDobParts(
  parts: DobParts,
  minDate: string,
  maxDate: string,
): DobParts {
  const min = parseDateOnly(minDate);
  const max = parseDateOnly(maxDate);
  if (!min || !max) return parts;

  let { year, month, day } = parts;
  year = Math.min(max.year, Math.max(min.year, year));

  let monthMin = 1;
  let monthMax = 12;
  if (year === min.year) monthMin = min.month;
  if (year === max.year) monthMax = max.month;
  month = Math.min(monthMax, Math.max(monthMin, month));

  let dayMin = 1;
  let dayMax = daysInMonth(year, month);
  if (year === min.year && month === min.month) dayMin = min.day;
  if (year === max.year && month === max.month) {
    dayMax = Math.min(dayMax, max.day);
  }
  day = Math.min(dayMax, Math.max(dayMin, day));

  return { year, month, day };
}

/** Sensible visual default when DOB is null — not committed until Done. */
export function defaultDobParts(minDate: string, maxDate: string): DobParts {
  const max = parseDateOnly(maxDate);
  if (!max) return { year: 2000, month: 1, day: 1 };
  const min = parseDateOnly(minDate);
  const midYear = min ? Math.round((min.year + max.year) / 2) : max.year - 18;
  return clampDobParts({ year: midYear, month: 6, day: 15 }, minDate, maxDate);
}

export function dobPartsToYmd(parts: DobParts): string {
  return toDateOnly(parts.year, parts.month, parts.day);
}

export function ymdToDobParts(
  ymd: string | null,
  minDate: string,
  maxDate: string,
): DobParts {
  if (ymd) {
    const parsed = parseDateOnly(ymd);
    if (parsed) return clampDobParts(parsed, minDate, maxDate);
  }
  return defaultDobParts(minDate, maxDate);
}
