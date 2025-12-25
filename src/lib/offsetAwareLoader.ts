/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Offset-Aware Loader Wrapper
 *
 * Wraps a base loader function to track consumed offsets when filtering is applied.
 * This ensures offset tracking stays accurate even when filtering causes multiple
 * API calls to find a single matching item.
 *
 * Why: When filtering (e.g., viewMode), a loader may need to try multiple offsets
 * before finding a match. This wrapper tracks how many offsets were actually consumed
 * so the caller can update offsetRef correctly.
 *
 * @example
 * ```typescript
 * const baseLoader = (offset: number, limit: number) => getPublicFeed({ offset, limit });
 * const filterFn = (items: FeedItem[]) => items.filter(item => item.type === "hangout");
 *
 * const offsetAwareLoader = createOffsetAwareLoader(baseLoader, filterFn);
 *
 * // Use in ProgressiveFeed
 * const result = await offsetAwareLoader(0, 1);
 * // result = { items: [hangoutItem], consumedOffset: 4 }
 * // (tried offsets 0, 1, 2, 3 before finding match at 3)
 * ```
 */

export interface OffsetAwareLoadResult<T> {
  items: T[];
  consumedOffset: number; // How many offsets were actually consumed by the API
  count?: number; // Optional: Total count returned by API (for reliable hasMore detection)
}

export type LoadItemsFunction<T> = (
  offset: number,
  limit: number
) => Promise<T[]>;

export type FilterFunction<T> = (items: T[]) => T[];

/**
 * Creates an offset-aware loader that tracks consumed offsets when filtering is applied.
 *
 * @param baseLoader - The base loader function that calls the API
 * @param filterFn - Optional filter function to apply to loaded items
 * @returns A loader function that returns both items and consumed offset count
 */
export function createOffsetAwareLoader<T>(
  baseLoader: LoadItemsFunction<T>,
  filterFn?: FilterFunction<T>
): (
  offset: number,
  limit: number
) => Promise<OffsetAwareLoadResult<T>> {
  return async (
    offset: number,
    limit: number
  ): Promise<OffsetAwareLoadResult<T>> => {
    // If no filter function, just pass through (no offset tracking needed)
    if (!filterFn) {
      const items = await baseLoader(offset, limit);
      return {
        items,
        consumedOffset: items.length, // For non-filtered, consumed = returned
      };
    }

    // For limit === 1 with filtering, we need to track consumed offsets
    if (limit === 1) {
      let currentOffset = offset;
      const startOffset = offset;
      const maxAttempts = 50; // Prevent infinite loops
      let attempts = 0;

      while (attempts < maxAttempts) {
        // Load one item at a time from the API
        const batch = await baseLoader(currentOffset, 1);

        if (batch.length === 0) {
          // No more items from API
          const consumed = currentOffset - startOffset + 1;
          return {
            items: [],
            consumedOffset: consumed,
          };
        }

        // Apply filter
        const filtered = filterFn(batch);

        // If we found a matching item, return it with consumed offset count
        if (filtered.length > 0) {
          const consumed = currentOffset - startOffset + 1;
          return {
            items: filtered.slice(0, 1),
            consumedOffset: consumed,
          };
        }

        // No matching item found, try next offset
        currentOffset += 1;
        attempts++;
      }

      // Reached max attempts without finding a matching item
      const consumed = currentOffset - startOffset;
      return {
        items: [],
        consumedOffset: consumed,
      };
    }

    // For limit > 1, load in batches and apply filter
    // Track consumed offsets as we load
    let allLoadedItems: T[] = [];
    let currentOffset = offset;
    const maxAttempts = 3; // Prevent infinite loops
    let attempts = 0;
    const startOffset = offset;

    while (allLoadedItems.length < limit && attempts < maxAttempts) {
      const batchSize = Math.max(limit * 2, 12); // Load at least 12 items per batch
      const batch = await baseLoader(currentOffset, batchSize);

      if (batch.length === 0) {
        // No more items from API
        break;
      }

      allLoadedItems.push(...batch);
      currentOffset += batch.length;
      attempts++;

      // If API returned fewer items than requested, we've reached the end
      if (batch.length < batchSize) {
        break;
      }
    }

    // Apply filter to all loaded items
    const filtered = filterFn(allLoadedItems);

    // Calculate consumed offset (how many offsets we actually used)
    const consumedOffset = currentOffset - startOffset;

    // Return requested amount
    return {
      items: filtered.slice(0, limit),
      consumedOffset: consumedOffset || filtered.length, // Fallback to filtered length if 0
    };
  };
}

/**
 * Helper to check if a load result is in the new format (with consumedOffset)
 */
export function isOffsetAwareResult<T>(
  result: T[] | OffsetAwareLoadResult<T>
): result is OffsetAwareLoadResult<T> {
  return (
    typeof result === "object" &&
    result !== null &&
    "items" in result &&
    "consumedOffset" in result
  );
}

/**
 * Helper to extract items from either format (backward compatibility)
 */
export function extractItems<T>(
  result: T[] | OffsetAwareLoadResult<T>
): T[] {
  if (isOffsetAwareResult(result)) {
    return result.items;
  }
  return result;
}

/**
 * Helper to extract consumed offset (defaults to items.length if not provided)
 */
export function extractConsumedOffset<T>(
  result: T[] | OffsetAwareLoadResult<T>
): number {
  if (isOffsetAwareResult(result)) {
    return result.consumedOffset;
  }
  return result.length;
}

/**
 * Helper to extract count (returns undefined if not provided)
 */
export function extractCount<T>(
  result: T[] | OffsetAwareLoadResult<T>
): number | undefined {
  if (isOffsetAwareResult(result)) {
    return result.count;
  }
  return undefined;
}

