/**
 * Place Duo compose-state schedule labels (local calendar days).
 * Never invents noon — date-only uses “Any time”.
 */

import {
  formatCreateFlowStartTimeCompact,
  type CreateFlowStartTime,
} from "./createFlowStartTime";
import { startOfLocalDay } from "./futureDateBounds";

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Whole local calendar days between `from` and `to` (to − from). */
export function localCalendarDayDiff(from: Date, to: Date): number {
  const a = startOfLocalDay(from);
  const b = startOfLocalDay(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/**
 * Human-friendly relative label for a selected local calendar day.
 * Rules relative to `today` (defaults to now).
 */
export function formatPlaceDuoRelativeDayLabel(
  selectedDate: Date,
  today: Date = new Date()
): string {
  const diff = localCalendarDayDiff(today, selectedDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff >= 2 && diff <= 6) {
    return `This ${WEEKDAY_LONG[startOfLocalDay(selectedDate).getDay()]}`;
  }
  if (diff >= 7 && diff <= 13) {
    return `Next ${WEEKDAY_LONG[startOfLocalDay(selectedDate).getDay()]}`;
  }
  if (diff >= 14) return `In ${diff} days`;
  // Past relative to today (unexpected in Place Duo create).
  if (diff === -1) return "Yesterday";
  return startOfLocalDay(selectedDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatPlaceDuoExactDayLabel(selectedDate: Date): string {
  return startOfLocalDay(selectedDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export type PlaceDuoScheduleSummary = {
  primary: string;
  secondary: string;
  hasExplicitTime: boolean;
};

/** Compose summary: relative primary + exact date · time/Any time. */
export function formatPlaceDuoScheduleSummary(
  selectedDate: Date,
  selectedTime: CreateFlowStartTime | null,
  today: Date = new Date()
): PlaceDuoScheduleSummary {
  const primary = formatPlaceDuoRelativeDayLabel(selectedDate, today);
  const exact = formatPlaceDuoExactDayLabel(selectedDate);
  if (selectedTime) {
    return {
      primary,
      secondary: `${exact} · ${formatCreateFlowStartTimeCompact(selectedTime)}`,
      hasExplicitTime: true,
    };
  }
  return {
    primary,
    secondary: `${exact} · Any time`,
    hasExplicitTime: false,
  };
}
