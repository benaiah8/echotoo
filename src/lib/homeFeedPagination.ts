/**
 * Home Feed Phase 2B.1.1 — pagination / exhaustion contract.
 *
 * consumedOffset = RAW backend rows for this request (before client expiry /
 * display slicing). Snapshot length is never true_total.
 */

export type InferHasMoreAfterPageArgs = {
  /** RAW backend rows consumed this request — not displayed length. */
  consumedOffsetThisPage: number;
  requestedLimit: number;
  nextOffset: number;
  count?: number | null;
  countIsAuthoritative?: boolean;
};

/** Advance p_offset by raw rows consumed, not by displayed cards. */
export function nextFeedOffset(
  currentOffset: number,
  consumedOffset: number
): number {
  return currentOffset + consumedOffset;
}

/**
 * How far this request should advance backend offset.
 * Over-fetch (normalized first-page limit) only consumes `requestedLimit`.
 */
export function rpcConsumedOffset(
  rawPostsLength: number,
  requestedLimit: number
): number {
  if (rawPostsLength <= 0) return 0;
  if (requestedLimit <= 0) return rawPostsLength;
  return Math.min(rawPostsLength, requestedLimit);
}

function hasAuthoritativeTotal(
  count: number | null | undefined,
  countIsAuthoritative?: boolean
): count is number {
  return (
    countIsAuthoritative === true &&
    typeof count === "number" &&
    Number.isFinite(count)
  );
}

/**
 * Whether another backend page should be requested.
 *
 * Authoritative `count` is the eligible set size. Displayed-empty pages must
 * not stop pagination while nextOffset < count and backend rows were consumed.
 * Non-authoritative cache length must not stop merely because nextOffset === snapshot length.
 */
export function inferHasMoreAfterPage(
  args: InferHasMoreAfterPageArgs
): boolean {
  const {
    consumedOffsetThisPage,
    requestedLimit,
    nextOffset,
    count,
    countIsAuthoritative,
  } = args;

  if (hasAuthoritativeTotal(count, countIsAuthoritative)) {
    if (nextOffset >= count) return false;
    // Genuine empty RPC page: backend sequence ended even if count lagged.
    if (consumedOffsetThisPage === 0) return false;
    return true;
  }

  // Snapshot / cache length is not true_total. A full requested page means continue.
  if (consumedOffsetThisPage >= requestedLimit) return true;
  return false;
}

/** Slice a cached snapshot to the requested page; never treat list length as total. */
export function cachedFeedPageSlice<T>(
  cachedItems: T[],
  requestedLimit: number
): { pageItems: T[]; consumedOffset: number } {
  const limit =
    requestedLimit > 0 ? requestedLimit : cachedItems.length;
  const pageItems = cachedItems.slice(0, limit);
  return {
    pageItems,
    consumedOffset: pageItems.length,
  };
}

export type SimulatedFeedPage = {
  offset: number;
  rawIds: string[];
  displayIds: string[];
};

/**
 * One-pass client pagination using the 2B.1.1 offset/hasMore contract.
 * Dedupes by id on append (one post = one card).
 */
export function simulateAuthoritativeFeedPass(args: {
  pages: SimulatedFeedPage[];
  pageSize: number;
  trueTotal: number;
}): {
  requestedOffsets: number[];
  shownIds: string[];
  duplicateShownIds: string[];
  exhausted: boolean;
  finalOffset: number;
} {
  const { pages, pageSize, trueTotal } = args;
  const byOffset = new Map(pages.map((p) => [p.offset, p]));
  const shownIds: string[] = [];
  const seen = new Set<string>();
  const duplicateShownIds: string[] = [];
  const requestedOffsets: number[] = [];
  let offset = 0;
  let exhausted = false;

  for (let i = 0; i < 64; i++) {
    requestedOffsets.push(offset);
    const page = byOffset.get(offset);
    const rawLen = page?.rawIds.length ?? 0;
    const consumed = rpcConsumedOffset(rawLen, pageSize);
    const nextOffset = nextFeedOffset(offset, consumed);
    const hasMore = inferHasMoreAfterPage({
      consumedOffsetThisPage: consumed,
      requestedLimit: pageSize,
      nextOffset,
      count: trueTotal,
      countIsAuthoritative: true,
    });

    for (const id of page?.displayIds ?? []) {
      if (seen.has(id)) {
        duplicateShownIds.push(id);
        continue;
      }
      seen.add(id);
      shownIds.push(id);
    }

    offset = nextOffset;
    if (!hasMore) {
      exhausted = true;
      break;
    }
    if (!page || consumed === 0) {
      exhausted = true;
      break;
    }
  }

  return {
    requestedOffsets,
    shownIds,
    duplicateShownIds,
    exhausted,
    finalOffset: offset,
  };
}
