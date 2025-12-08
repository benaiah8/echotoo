// src/lib/feedSorting.ts
import { type FeedItem } from "../api/queries/getPublicFeed";

export type FeedItemWithDates = FeedItem & {
  selected_dates?: string[] | null;
};

/**
 * Smart feed sorting algorithm:
 * 1. Today/tomorrow events first
 * 2. Weekend events next
 * 3. Then by date (soonest first)
 * 4. Fallback to created_at for non-hangouts
 */
export function sortFeedItems(items: FeedItemWithDates[]): FeedItemWithDates[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get weekend dates (Saturday and Sunday)
  const getWeekendDates = () => {
    const weekendDates: Date[] = [];
    const currentWeek = new Date(today);

    // Find this week's Saturday
    const daysUntilSaturday = (6 - currentWeek.getDay()) % 7;
    const saturday = new Date(currentWeek);
    saturday.setDate(saturday.getDate() + daysUntilSaturday);

    // Find this week's Sunday
    const sunday = new Date(saturday);
    sunday.setDate(sunday.getDate() + 1);

    weekendDates.push(saturday, sunday);

    // Also include next week's weekend if we're early in the week
    if (currentWeek.getDay() <= 3) {
      const nextSaturday = new Date(saturday);
      nextSaturday.setDate(nextSaturday.getDate() + 7);
      const nextSunday = new Date(nextSaturday);
      nextSunday.setDate(nextSunday.getDate() + 1);
      weekendDates.push(nextSaturday, nextSunday);
    }

    return weekendDates;
  };

  const weekendDates = getWeekendDates();

  return [...items].sort((a, b) => {
    // Get the earliest date for each item
    const getEarliestDate = (item: FeedItemWithDates): Date | null => {
      if (!item.selected_dates || item.selected_dates.length === 0) {
        return null;
      }

      const dates = item.selected_dates
        .map((dateStr) => new Date(dateStr))
        .filter((date) => !isNaN(date.getTime()))
        .sort((d1, d2) => d1.getTime() - d2.getTime());

      return dates.length > 0 ? dates[0] : null;
    };

    const dateA = getEarliestDate(a);
    const dateB = getEarliestDate(b);

    // If both have no dates, sort by created_at (newest first)
    if (!dateA && !dateB) {
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    // If only one has a date, prioritize the one with a date
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;

    // Both have dates - apply smart sorting
    if (dateA && dateB) {
      const isTodayA = isSameDay(dateA, today);
      const isTomorrowA = isSameDay(dateA, tomorrow);
      const isTodayB = isSameDay(dateB, today);
      const isTomorrowB = isSameDay(dateB, tomorrow);

      const isWeekendA = weekendDates.some((weekendDate) =>
        isSameDay(dateA, weekendDate)
      );
      const isWeekendB = weekendDates.some((weekendDate) =>
        isSameDay(dateB, weekendDate)
      );

      // Priority 1: Today events
      if (isTodayA && !isTodayB) return -1;
      if (!isTodayA && isTodayB) return 1;
      if (isTodayA && isTodayB) {
        // Both today - sort by time
        return dateA.getTime() - dateB.getTime();
      }

      // Priority 2: Tomorrow events
      if (isTomorrowA && !isTomorrowB) return -1;
      if (!isTomorrowA && isTomorrowB) return 1;
      if (isTomorrowA && isTomorrowB) {
        // Both tomorrow - sort by time
        return dateA.getTime() - dateB.getTime();
      }

      // Priority 3: Weekend events
      if (isWeekendA && !isWeekendB) return -1;
      if (!isWeekendA && isWeekendB) return 1;
      if (isWeekendA && isWeekendB) {
        // Both weekend - sort by date
        return dateA.getTime() - dateB.getTime();
      }

      // Priority 4: All other events - sort by date (soonest first)
      return dateA.getTime() - dateB.getTime();
    }

    return 0;
  });
}

/**
 * Helper function to check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get a human-readable label for the date priority
 */
export function getDatePriorityLabel(item: FeedItemWithDates): string | null {
  if (!item.selected_dates || item.selected_dates.length === 0) {
    return null;
  }

  const earliestDate = item.selected_dates
    .map((dateStr) => new Date(dateStr))
    .filter((date) => !isNaN(date.getTime()))
    .sort((d1, d2) => d1.getTime() - d2.getTime())[0];

  if (!earliestDate) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(earliestDate, today)) return "Today";
  if (isSameDay(earliestDate, tomorrow)) return "Tomorrow";

  // Check if it's this weekend
  const currentWeek = new Date(today);
  const daysUntilSaturday = (6 - currentWeek.getDay()) % 7;
  const saturday = new Date(currentWeek);
  saturday.setDate(saturday.getDate() + daysUntilSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(sunday.getDate() + 1);

  if (isSameDay(earliestDate, saturday) || isSameDay(earliestDate, sunday)) {
    return "This Weekend";
  }

  return null;
}
