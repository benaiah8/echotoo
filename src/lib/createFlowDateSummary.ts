import { CREATE_FLOW_WEEKDAYS } from "./createFlowScheduleConstants";

/** Group consecutive calendar days into ranges (same logic as CreateCategoryPage). */
export type CreateFlowDateSummaryGroup =
  | { type: "single"; start: Date }
  | { type: "range"; start: Date; end: Date };

const WEEKDAY_ORDER = CREATE_FLOW_WEEKDAYS.map((d) => d.code);

function normalizeCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function selectionYearBounds(dates: Date[]): { minY: number; maxY: number } {
  if (dates.length === 0) return { minY: 0, maxY: 0 };
  const ys = dates.map((d) => normalizeCalendarDate(d).getFullYear());
  return { minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Whether calendar years should appear in labels (multi-year selection or non–current-year dates). */
function yearVisibleForSelection(
  dates: Date[],
  now: Date
): { spansMultipleYears: boolean; refYear: number } {
  const { minY, maxY } = selectionYearBounds(dates);
  return {
    spansMultipleYears: minY !== maxY,
    refYear: now.getFullYear(),
  };
}

function formatSingleDayWithWeekday(d: Date, includeYear: boolean): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

function monthShortDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Compact label for one grouped range/single (Finalize chips + inline summary).
 * Year is omitted when every selected day is in the current year and the set does not span years.
 */
export function formatFinalizeDateGroupLabel(
  group: CreateFlowDateSummaryGroup,
  allSelectedDates: Date[],
  now: Date = new Date()
): string {
  if (allSelectedDates.length === 0) return "";
  const { spansMultipleYears, refYear } = yearVisibleForSelection(
    allSelectedDates,
    now
  );

  if (group.type === "single") {
    const d = normalizeCalendarDate(group.start);
    const includeYear = spansMultipleYears || d.getFullYear() !== refYear;
    return formatSingleDayWithWeekday(d, includeYear);
  }

  const start = normalizeCalendarDate(group.start);
  const end = normalizeCalendarDate(group.end);
  const includeYear =
    spansMultipleYears ||
    start.getFullYear() !== refYear ||
    end.getFullYear() !== refYear;

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    const month = start.toLocaleDateString(undefined, { month: "short" });
    const d1 = start.getDate();
    const d2 = end.getDate();
    if (!includeYear) {
      return `${month} ${d1}–${d2}`;
    }
    return `${month} ${d1}–${d2}, ${start.getFullYear()}`;
  }

  if (start.getFullYear() === end.getFullYear()) {
    const y = start.getFullYear();
    if (!includeYear) {
      return `${monthShortDay(start)} – ${monthShortDay(end)}`;
    }
    return `${monthShortDay(start)} – ${monthShortDay(end)}, ${y}`;
  }

  const left = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const right = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${left} – ${right}`;
}

/**
 * One human-readable line for all selected concrete dates (no recurrence).
 * Groups are separated by " · ".
 */
export function formatFinalizeSelectedDatesSummaryLine(
  groups: CreateFlowDateSummaryGroup[],
  allSelectedDates: Date[],
  now: Date = new Date()
): string | null {
  if (groups.length === 0 || allSelectedDates.length === 0) return null;
  return groups
    .map((g) => formatFinalizeDateGroupLabel(g, allSelectedDates, now))
    .join(" · ");
}

/**
 * Readable recurrence line for Finalize; separate from selected-date summary.
 */
export function formatFinalizeRecurrenceSummaryLine(
  isRecurring: boolean,
  recurrenceDayCodes: string[]
): string | null {
  if (!isRecurring) return null;
  if (!recurrenceDayCodes.length) {
    return "Repeats weekly — pick days";
  }
  const sorted = [...recurrenceDayCodes].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
  );
  const labels = sorted.map(
    (c) => CREATE_FLOW_WEEKDAYS.find((d) => d.code === c)?.label ?? c
  );
  return `Repeats every ${labels.join(", ")}`;
}

/** Next calendar day in local timezone (DST-safe). */
function addCalendarDaysLocal(d: Date, delta: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + delta);
  return x;
}

/** True if `next` is exactly one local calendar day after `previous`. */
function isNextCalendarDay(previous: Date, next: Date): boolean {
  const p = normalizeCalendarDate(previous);
  const n = normalizeCalendarDate(next);
  return addCalendarDaysLocal(p, 1).getTime() === n.getTime();
}

export function formatDateSummary(dates: Date[]): CreateFlowDateSummaryGroup[] {
  if (dates.length === 0) return [];

  const normalizedSorted = [...dates]
    .map(normalizeCalendarDate)
    .sort((a, b) => a.getTime() - b.getTime());

  const uniqueSorted: Date[] = [];
  for (const d of normalizedSorted) {
    if (
      uniqueSorted.length === 0 ||
      uniqueSorted[uniqueSorted.length - 1].getTime() !== d.getTime()
    ) {
      uniqueSorted.push(d);
    }
  }

  const groups: CreateFlowDateSummaryGroup[] = [];
  let i = 0;

  while (i < uniqueSorted.length) {
    const startDate = uniqueSorted[i];
    let endDate = startDate;
    let j = i;

    while (
      j + 1 < uniqueSorted.length &&
      isNextCalendarDay(uniqueSorted[j], uniqueSorted[j + 1])
    ) {
      endDate = uniqueSorted[j + 1];
      j++;
    }

    if (startDate.getTime() === endDate.getTime()) {
      groups.push({ type: "single", start: startDate });
    } else {
      groups.push({ type: "range", start: startDate, end: endDate });
    }

    i = j + 1;
  }

  return groups;
}
