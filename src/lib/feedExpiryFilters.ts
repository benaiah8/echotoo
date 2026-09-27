// src/lib/feedExpiryFilters.ts
// Discovery feed eligibility for hangouts (calendar-day + recurrence semantics).

import { FeedItemWithDates } from "./feedSorting";
import {
  daysUntilNextRecurrence,
  normalizeRecurrenceCodes,
  resolveViewerTimeZone,
  upcomingSelectedDateKeys,
} from "./postScheduleLabel";

function hasAnyValidSelectedDate(
  selectedDates: string[] | null | undefined
): boolean {
  if (!selectedDates?.length) return false;
  return selectedDates.some((raw) => {
    const t = new Date(String(raw).trim());
    return !Number.isNaN(t.getTime());
  });
}

function hasValidRecurrenceDays(
  recurrenceDays: string[] | null | undefined
): boolean {
  return normalizeRecurrenceCodes(recurrenceDays).length > 0;
}

/**
 * True when a hangout should remain in main discovery surfaces (vertical feed).
 * Uses viewer-local calendar days — same-day timed events stay eligible through
 * the occurrence's local calendar day (not instant >= now).
 */
export function isHangoutDiscoveryEligible(
  item: FeedItemWithDates,
  now: Date = new Date(),
  timeZone?: string
): boolean {
  if (item.type !== "hangout") {
    return true;
  }

  const tz = resolveViewerTimeZone(timeZone);
  const selectedDates = item.selected_dates ?? [];
  const hasSchedule = hasAnyValidSelectedDate(selectedDates);
  const recurrenceDays = normalizeRecurrenceCodes(item.recurrence_days);
  const hasRecurrence = hasValidRecurrenceDays(recurrenceDays);

  // Option A: no schedule and no usable recurrence — keep (vertical feed only).
  if (!hasSchedule && !hasRecurrence) {
    return true;
  }

  if (hasSchedule) {
    const upcoming = upcomingSelectedDateKeys(selectedDates, now, tz);
    if (upcoming.length > 0) return true;
  }

  if (hasRecurrence) {
    if (daysUntilNextRecurrence(recurrenceDays, now, tz) >= 0) {
      return true;
    }
  }

  return false;
}

/**
 * Hangout with a meaningful upcoming schedule/recurrence for soft refresh nudges.
 * Excludes Places and unscheduled hangouts that discovery still keeps.
 */
export function isUpcomingEligibleHangout(
  item: FeedItemWithDates,
  now: Date = new Date(),
  timeZone?: string
): boolean {
  if (item.type !== "hangout") return false;

  const selectedDates = item.selected_dates ?? [];
  const hasSchedule = hasAnyValidSelectedDate(selectedDates);
  const hasRecurrence = hasValidRecurrenceDays(item.recurrence_days);
  if (!hasSchedule && !hasRecurrence) return false;

  return isHangoutDiscoveryEligible(item, now, timeZone);
}

/**
 * Calendar-day upcoming check for hangouts with selected_dates.
 * Used by Pair Up / Group Up eligibility (non-recurring path) with
 * HOME_EVENT_TIMEZONE (Africa/Addis_Ababa). Does not keep unscheduled rows.
 */
export function hasAnyUpcomingDate(
  item: FeedItemWithDates,
  now: Date = new Date(),
  timeZone?: string
): boolean {
  if (item.type !== "hangout") return false;
  if (!item.selected_dates?.length) return false;

  const tz = resolveViewerTimeZone(timeZone);
  return (
    upcomingSelectedDateKeys(item.selected_dates, now, tz).length > 0
  );
}

/**
 * Remove expired hangouts from discovery feed batches.
 * Places (`experience`) are always kept.
 */
export function filterExpiredHangouts(
  items: FeedItemWithDates[],
  now: Date = new Date(),
  timeZone?: string
): FeedItemWithDates[] {
  const filtered = items.filter((item) => {
    if (item.type === "experience") return true;
    if (item.type === "hangout") {
      return isHangoutDiscoveryEligible(item, now, timeZone);
    }
    return true;
  });

  const DEBUG_FILTER_EXPIRED = false;
  const removed = items.length - filtered.length;
  if (removed > 0 || DEBUG_FILTER_EXPIRED) {
    console.log("[FeedPipeline] filterExpiredHangouts", {
      removed,
      unscheduledKept: filtered.filter((i) => isUnscheduledHangout(i)).length,
    });
  }

  return filtered;
}

/**
 * Check if hangout is unscheduled (no dates AND not recurring flag).
 * Unscheduled hangouts will be capped in personalization phase.
 */
export function isUnscheduledHangout(item: FeedItemWithDates): boolean {
  return (
    item.type === "hangout" &&
    (!item.selected_dates || item.selected_dates.length === 0) &&
    !item.is_recurring
  );
}

/**
 * Horizontal rails: scheduled + discovery-eligible hangouts only.
 */
export function filterRailsItems(
  items: FeedItemWithDates[],
  now: Date = new Date(),
  timeZone?: string
): FeedItemWithDates[] {
  return items.filter((item) => {
    if (item.type === "experience") return true;

    if (item.type === "hangout") {
      if (isUnscheduledHangout(item)) return false;
      return isHangoutDiscoveryEligible(item, now, timeZone);
    }

    return true;
  });
}
