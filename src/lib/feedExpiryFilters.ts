// src/lib/feedExpiryFilters.ts
// Feed correctness filters for expired and unscheduled hangouts
// [PHASE 1] Expired hangout filtering + unscheduled handling
// [Option A] Keep UNSCHEDULED in Home feed; drop only PAST scheduled non-recurring

import { FeedItemWithDates } from "./feedSorting";

/**
 * Check if hangout has ANY upcoming date (not just earliest)
 * Recurring hangouts (is_recurring=true) are always considered upcoming
 * Used by filterRailsItems (rails stay UPCOMING/RECURRING only)
 *
 * @param item - Feed item to check
 * @param now - Current date (defaults to new Date())
 * @returns true if hangout has any upcoming date or is recurring, false otherwise
 */
export function hasAnyUpcomingDate(
  item: FeedItemWithDates,
  now: Date = new Date()
): boolean {
  // Recurring hangouts are always upcoming
  if (item.type === "hangout" && item.is_recurring) {
    return true;
  }

  // If no dates, cannot be upcoming (unscheduled - handled by caller)
  if (!item.selected_dates || item.selected_dates.length === 0) {
    return false;
  }

  const nowTime = now.getTime();

  // Check if ANY date is in the future (not just earliest)
  return item.selected_dates.some((dateStr) => {
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date.getTime() >= nowTime;
  });
}

/**
 * Check if hangout is past scheduled (has dates, all past, not recurring)
 * Only these are dropped by filterExpiredHangouts (Option A)
 */
function isPastScheduledHangout(
  item: FeedItemWithDates,
  now: Date = new Date()
): boolean {
  if (item.type !== "hangout") return false;
  if (item.is_recurring) return false;
  if (!item.selected_dates || item.selected_dates.length === 0) return false;
  const nowTime = now.getTime();
  return !item.selected_dates.some((dateStr) => {
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date.getTime() >= nowTime;
  });
}

/**
 * Filter out only PAST scheduled non-recurring hangouts (Option A)
 * Keeps: experiences, recurring hangouts, unscheduled hangouts, upcoming hangouts
 * Drops: hangouts with selected_dates where ALL dates are past AND not recurring
 *
 * @param items - Feed items to filter
 * @returns Filtered items (past scheduled hangouts removed)
 */
export function filterExpiredHangouts(
  items: FeedItemWithDates[]
): FeedItemWithDates[] {
  const now = new Date();

  const filtered = items.filter((item) => {
    // Experiences never expire
    if (item.type === "experience") {
      return true;
    }

    // For hangouts: keep recurring, unscheduled, and upcoming; drop only past scheduled
    if (item.type === "hangout") {
      if (item.is_recurring) return true;
      if (!item.selected_dates || item.selected_dates.length === 0) return true; // unscheduled: keep
      return hasAnyUpcomingDate(item, now); // has dates: keep if any upcoming
    }

    // Unknown type - keep it (safety default)
    return true;
  });

  // Log only when something was removed, or when explicitly in debug mode
  const DEBUG_FILTER_EXPIRED = false;
  const filteredIds = new Set(filtered.map((i) => i.id));
  const pastScheduledRemoved = items.filter(
    (i) =>
      i.type === "hangout" &&
      !filteredIds.has(i.id) &&
      isPastScheduledHangout(i, now)
  ).length;
  const unscheduledKept = filtered.filter((i) =>
    isUnscheduledHangout(i)
  ).length;
  if (pastScheduledRemoved > 0 || DEBUG_FILTER_EXPIRED) {
    console.log("[FeedPipeline] filterExpiredHangouts", {
      pastScheduledRemoved,
      unscheduledKept,
    });
  }

  return filtered;
}

/**
 * Check if hangout is unscheduled (no dates AND not recurring)
 * Unscheduled hangouts will be capped in personalization phase
 *
 * @param item - Feed item to check
 * @returns true if hangout is unscheduled, false otherwise
 */
export function isUnscheduledHangout(item: FeedItemWithDates): boolean {
  return (
    item.type === "hangout" &&
    (!item.selected_dates || item.selected_dates.length === 0) &&
    !item.is_recurring
  );
}

/**
 * Filter rails items: exclude unscheduled hangouts (even via fallback)
 * Also excludes expired hangouts (should already be filtered, but double-check)
 * Rails should only show scheduled, non-expired hangouts
 *
 * @param items - Feed items to filter
 * @returns Filtered items suitable for horizontal rails
 */
export function filterRailsItems(
  items: FeedItemWithDates[]
): FeedItemWithDates[] {
  const now = new Date();

  return items.filter((item) => {
    // Experiences are always allowed in rails
    if (item.type === "experience") {
      return true;
    }

    // For hangouts, apply strict filtering
    if (item.type === "hangout") {
      // Exclude unscheduled hangouts (no dates AND not recurring)
      if (isUnscheduledHangout(item)) {
        return false;
      }

      // Exclude expired hangouts (all dates past AND not recurring)
      return hasAnyUpcomingDate(item, now);
    }

    // Unknown type - keep it (safety default)
    return true;
  });
}
