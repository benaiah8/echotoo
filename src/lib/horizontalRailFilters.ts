// src/lib/horizontalRailFilters.ts
// Reusable filtering functions for horizontal rail
// [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Client-side filtering with cached mutual friends

import { type FeedItem } from "../api/queries/getPublicFeed";
import { sortFeedItems, type FeedItemWithDates } from "./feedSorting";

// [DEBUG] Toggle to enable/disable debug logs
const DEBUG_FILTERS = false;

export type FilterType = "friends" | "today" | "anonymous";

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
 * Get the earliest date from selected_dates array
 */
function getEarliestDate(item: FeedItemWithDates): Date | null {
  if (!item.selected_dates || item.selected_dates.length === 0) {
    return null;
  }

  const dates = item.selected_dates
    .map((dateStr) => new Date(dateStr))
    .filter((date) => !isNaN(date.getTime()))
    .sort((d1, d2) => d1.getTime() - d2.getTime());

  return dates.length > 0 ? dates[0] : null;
}

/**
 * Filter posts by date urgency (today)
 * For hangouts: filters by selected_dates (event dates)
 * For experiences: filters by created_at (they have no selected_dates)
 */
export function filterByDateUrgency(
  items: FeedItemWithDates[],
  filterType: "today"
): FeedItemWithDates[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  return items.filter((item) => {
    if (filterType === "today") {
      // For hangouts: check selected_dates (event dates)
      if (item.type === "hangout") {
        const earliestDate = getEarliestDate(item);
        if (earliestDate) {
          // Check if event date is today
          return isSameDay(earliestDate, today);
        }
        // Hangout with no dates - exclude (not relevant for "today" filter)
        return false;
      } else {
        // For experiences: check created_at (they don't have event dates)
        const createdDate = new Date(item.created_at);
        return createdDate >= today && createdDate < todayEnd;
      }
    }
    return false;
  });
}

/**
 * Filter posts by friends (mutual friends)
 * Uses cached Set for synchronous filtering (zero egress)
 */
export function filterByFriends(
  items: FeedItemWithDates[],
  mutualFriendIds: Set<string>
): FeedItemWithDates[] {
  if (mutualFriendIds.size === 0) {
    return [];
  }

  return items.filter((item) => mutualFriendIds.has(item.author_id));
}

/**
 * Filter posts by anonymous flag
 */
export function filterByAnonymous(
  items: FeedItemWithDates[]
): FeedItemWithDates[] {
  const filtered = items.filter((item) => item.is_anonymous === true);
  // [DEBUG] Log anonymous filter results
  if (DEBUG_FILTERS && filtered.length === 0 && items.length > 0) {
    console.log('[AnonymousFilter] No anonymous posts found. Total items:', items.length, 'Anonymous count:', items.filter(i => i.is_anonymous === true).length);
  }
  return filtered;
}

/**
 * Apply all active filters to items
 * Filters are OR logic (ANY match), not AND (ALL match)
 * Removes duplicates and sorts by created_at (most recent first)
 */
export function applyFilters(
  items: FeedItemWithDates[],
  filters: FilterType[],
  mutualFriendIds: Set<string> | null
): FeedItemWithDates[] {
  if (filters.length === 0) {
    return items;
  }

  const filteredPosts: FeedItemWithDates[] = [];

  // Apply each filter (OR logic - posts matching ANY filter)
  for (const filter of filters) {
    if (filter === "anonymous") {
      const anonymousItems = filterByAnonymous(items);
      filteredPosts.push(...anonymousItems);
      // [DEBUG] Log anonymous filter results
      if (DEBUG_FILTERS) {
        console.log('[AnonymousFilter] Applied filter:', {
          totalItems: items.length,
          anonymousInInput: items.filter(i => i.is_anonymous === true).length,
          filteredCount: anonymousItems.length,
          sampleIds: anonymousItems.slice(0, 3).map(i => i.id),
        });
      }
    } else if (filter === "today") {
      filteredPosts.push(...filterByDateUrgency(items, "today"));
    } else if (filter === "friends") {
      if (mutualFriendIds) {
        filteredPosts.push(...filterByFriends(items, mutualFriendIds));
      }
      // If no mutualFriends provided and filter is active, return empty (expected behavior)
    }
  }

  // Remove duplicates by ID
  const uniquePosts = Array.from(
    new Map(filteredPosts.map((post) => [post.id, post])).values()
  );

  // Sort by created_at (most recent first)
  return uniquePosts.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Mix hangouts and experiences when no filters are active
 * Alternates between hangouts and experiences
 * Limits to maxItems
 */
export function mixHangoutsAndExperiences(
  items: FeedItemWithDates[],
  maxItems: number = 8
): FeedItemWithDates[] {
  const hangoutPosts = items.filter((p) => p.type === "hangout");
  const experiencePosts = items.filter((p) => p.type === "experience");

  const mixedPosts: FeedItemWithDates[] = [];
  const maxLength = Math.max(hangoutPosts.length, experiencePosts.length);

  for (let i = 0; i < maxLength && mixedPosts.length < maxItems; i++) {
    if (hangoutPosts[i]) mixedPosts.push(hangoutPosts[i]);
    if (experiencePosts[i] && mixedPosts.length < maxItems) {
      mixedPosts.push(experiencePosts[i]);
    }
  }

  return mixedPosts;
}

/**
 * Result object returned by applyFiltersWithFallback
 */
export interface FilteredItemsResult {
  items: FeedItemWithDates[];
  filteredCount: number; // Number of items that match filters (0 if empty)
  hasUnfiltered: boolean; // Whether unfiltered items were added as fallback
}

/**
 * Apply filters and mix with unfiltered items as fallback
 * Returns filtered items first, then unfiltered items (excluding already shown filtered items)
 * This ensures we always show some content even when filters return few results
 * 
 * @param items - All items to filter
 * @param filters - Active filter types
 * @param mutualFriendIds - Set of mutual friend IDs (for "friends" filter)
 * @param minFilteredItems - Minimum filtered items before showing fallback (default: 3)
 * @param alwaysShowFallback - If true, always show unfiltered items even with 1+ filtered items (default: true)
 * @returns FilteredItemsResult with items, filteredCount, and hasUnfiltered flag
 */
export function applyFiltersWithFallback(
  items: FeedItemWithDates[],
  filters: FilterType[],
  mutualFriendIds: Set<string> | null,
  minFilteredItems: number = 3,
  alwaysShowFallback: boolean = true
): FilteredItemsResult {
  if (filters.length === 0) {
    // No filters: return all items as-is
    return { items, filteredCount: items.length, hasUnfiltered: false };
  }

  const filteredPosts = applyFilters(items, filters, mutualFriendIds);
  const filteredIds = new Set(filteredPosts.map(p => p.id));

  // If filtered is empty, return unfiltered items with filteredCount: 0
  // This allows the UI to show "No posts found" card + unfiltered items
  if (filteredPosts.length === 0) {
    return { 
      items: items.slice(0, 8), // Show some unfiltered items (max 8 for horizontal rail)
      filteredCount: 0, 
      hasUnfiltered: true 
    };
  }

  // If we have enough filtered items and not always showing fallback, return only filtered
  if (!alwaysShowFallback && filteredPosts.length >= minFilteredItems) {
    return { 
      items: filteredPosts, 
      filteredCount: filteredPosts.length, 
      hasUnfiltered: false 
    };
  }

  // Mix: filtered first, then unfiltered (always show fallback if alwaysShowFallback is true)
  const unfiltered = items.filter(item => !filteredIds.has(item.id));
  const neededUnfiltered = alwaysShowFallback 
    ? Math.max(3, 8 - filteredPosts.length) // Always show at least 3 unfiltered, or fill to 8 total
    : Math.max(0, minFilteredItems - filteredPosts.length);
  
  const result: FeedItemWithDates[] = [
    ...filteredPosts,
    ...unfiltered.slice(0, neededUnfiltered)
  ];

  return {
    items: result,
    filteredCount: filteredPosts.length,
    hasUnfiltered: neededUnfiltered > 0
  };
}

