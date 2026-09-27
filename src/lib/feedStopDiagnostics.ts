/**
 * DEV-only Feed pagination stop diagnostics.
 * Does not change hasMore behavior — evidence only.
 */

export type FeedResponseSource =
  | "network"
  | "memory-cache"
  | "fallback-cache"
  | "abort-fallback"
  | "error-fallback"
  | "unknown";

export type FeedCountSource =
  | "rpc"
  | "fallback-cache-length"
  | "unknown"
  | "none";

export type FeedStopReason =
  | "consumed-zero"
  | "offset-reached-count"
  | "short-page-no-count"
  | "rpc-error"
  | "abort"
  | "fallback-count"
  | "other";

export type FeedPageDiagnostic = {
  requestedOffset: number;
  requestedLimit: number;
  postsLength: number;
  count: number | null | undefined;
  countIsAuthoritative?: boolean;
  countSource?: FeedCountSource;
  consumedOffsetThisPage: number;
  nextOffset: number;
  inferredHasMore: boolean;
  responseSource: FeedResponseSource;
  rpcError?: string | null;
  elapsedMs?: number | null;
  personalizationInputCount?: number | null;
  personalizationOutputCount?: number | null;
};

const IS_DEV = import.meta.env.DEV;

let lastHasMore: boolean | null = null;

export function classifyFeedStopReason(
  d: FeedPageDiagnostic
): FeedStopReason {
  if (d.responseSource === "abort-fallback") return "abort";
  if (d.responseSource === "error-fallback" || d.rpcError) {
    if (d.countSource === "fallback-cache-length") return "fallback-count";
    return "rpc-error";
  }
  if (d.consumedOffsetThisPage === 0) return "consumed-zero";
  if (
    d.count != null &&
    d.countIsAuthoritative !== false &&
    d.nextOffset >= d.count
  ) {
    return "offset-reached-count";
  }
  if (
    d.countSource === "fallback-cache-length" &&
    !d.inferredHasMore
  ) {
    return "fallback-count";
  }
  if (
    d.consumedOffsetThisPage < d.requestedLimit &&
    (d.count == null || d.countIsAuthoritative === false)
  ) {
    return "short-page-no-count";
  }
  return "other";
}

export function logFeedPageDiagnostic(d: FeedPageDiagnostic): void {
  if (!IS_DEV) return;
  console.debug("[FeedPageDiagnostic]", {
    ...d,
    countSource: d.countSource ?? "unknown",
    countIsAuthoritative: d.countIsAuthoritative ?? d.count != null,
  });
}

/** Emit once when hasMore flips true → false. */
export function noteFeedHasMoreTransition(
  prevHasMore: boolean | null,
  nextHasMore: boolean,
  d: FeedPageDiagnostic
): void {
  if (!IS_DEV) return;
  logFeedPageDiagnostic(d);
  if (prevHasMore === true && nextHasMore === false) {
    const reason = classifyFeedStopReason(d);
    console.info("[FeedStopDiagnostic]", {
      reason,
      ...d,
      countSource: d.countSource ?? "unknown",
      countIsAuthoritative: d.countIsAuthoritative ?? d.count != null,
    });
  }
  lastHasMore = nextHasMore;
}

export function __resetFeedStopDiagnosticForTests(): void {
  lastHasMore = null;
}

export function __getLastFeedHasMoreForTests(): boolean | null {
  return lastHasMore;
}
