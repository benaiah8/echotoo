/**
 * Conservative hls.js buffer caps for published Detail / fullscreen / list playback.
 * Segmented HLS only — no custom short-window downloader/cache.
 * Options supported by hls.js 1.7.x.
 */

export const PUBLISHED_HLS_BUFFER = {
  /** Forward buffer target (~10–15s). */
  maxBufferLength: 12,
  /** Hard forward buffer ceiling (~20–30s). */
  maxMaxBufferLength: 24,
  /** Retain recently played buffer (~10–20s). */
  backBufferLength: 15,
  lowLatencyMode: false,
} as const;

/** Tight caps for invisible list prewarm only (PV3.1). */
export const PUBLISHED_HLS_WARM_BUFFER = {
  maxBufferLength: 5,
  maxMaxBufferLength: 6,
  backBufferLength: 0,
  lowLatencyMode: false,
} as const;

/** Stop warm fragment fetch once buffered ahead reaches this (seconds). */
export const PUBLISHED_LIST_WARM_BUFFER_TARGET_SEC = 4;

export type PublishedHlsBufferConfig = typeof PUBLISHED_HLS_BUFFER;
