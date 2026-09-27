/**
 * Pass 3E/3F — ephemeral list ↔ Detail playback handoff (session-local).
 * Not part of publishedMediaCache. Single slot; latest write wins.
 * Origin (feed | profile) prevents a Home card from consuming a Profile return
 * (and vice versa) when both represent the same postId.
 *
 * Intended snapshot contract is implemented here; reliable same-element /
 * physical Feed↔Detail continuity on device remains deferred product work.
 */

import { isPublishedVideoOnly, type PublishedMediaItem } from "./types";
import type { PublishedVideoPlaybackSnapshot } from "./publishedVideoPlaybackSnapshot";
import { isPublishedVideoPlaybackSnapshotForMedia } from "./publishedVideoPlaybackSnapshot";

export type PublishedVideoFeedDetailHandoffDirection = "to-detail" | "to-feed";

export type PublishedVideoListHandoffOrigin = "feed" | "profile";

export type PublishedVideoFeedDetailHandoffEntry = {
  postId: string;
  snapshot: PublishedVideoPlaybackSnapshot;
  direction: PublishedVideoFeedDetailHandoffDirection;
  origin: PublishedVideoListHandoffOrigin;
  /** Navigation session — Detail consume and return write share this id. */
  sessionId: number;
};

export type PublishedVideoFeedDetailHandoffMatch = {
  postId: string;
  mediaKey: string;
  direction: PublishedVideoFeedDetailHandoffDirection;
  origin?: PublishedVideoListHandoffOrigin;
  sessionId?: number;
};

let generationSeq = 0;
let entry: PublishedVideoFeedDetailHandoffEntry | null = null;

export function isPublishedVideoListHandoffOrigin(
  value: unknown,
): value is PublishedVideoListHandoffOrigin {
  return value === "feed" || value === "profile";
}

/**
 * Explicit caller origin wins. Pathname is only a fallback for unrelated Post
 * callers. Overlay `/experience/:id` must not be used once an origin is latched.
 */
export function resolvePublishedListHandoffOrigin(options: {
  explicit?: string | null;
  pathname?: string;
}): PublishedVideoListHandoffOrigin {
  if (isPublishedVideoListHandoffOrigin(options.explicit)) {
    return options.explicit;
  }
  const path = options.pathname ?? "";
  if (path.includes("/profile") || path.includes("/u/")) return "profile";
  return "feed";
}

/** Keep the first resolved origin for a mounted card (overlay pathname must not flip it). */
export function latchPublishedListHandoffOrigin(
  current: PublishedVideoListHandoffOrigin | null | undefined,
  nextExplicit: string | null | undefined,
  pathname: string,
): PublishedVideoListHandoffOrigin {
  if (isPublishedVideoListHandoffOrigin(nextExplicit)) return nextExplicit;
  if (isPublishedVideoListHandoffOrigin(current)) return current;
  return resolvePublishedListHandoffOrigin({ pathname });
}

export function nextPublishedVideoFeedDetailHandoffGeneration(): number {
  generationSeq += 1;
  return generationSeq;
}

export function setPublishedVideoFeedDetailHandoff(
  next: PublishedVideoFeedDetailHandoffEntry,
): void {
  const postId = next.postId?.trim();
  if (!postId) return;
  if (!next.snapshot?.mediaKey?.trim()) return;
  if (!isPublishedVideoListHandoffOrigin(next.origin)) return;
  if (
    typeof next.sessionId !== "number" ||
    !Number.isFinite(next.sessionId)
  ) {
    return;
  }
  entry = {
    postId,
    snapshot: next.snapshot,
    direction: next.direction,
    origin: next.origin,
    sessionId: next.sessionId,
  };
}

function matchesHandoff(
  options: PublishedVideoFeedDetailHandoffMatch,
): boolean {
  const postId = options.postId?.trim();
  const mediaKey = options.mediaKey?.trim();
  if (!postId || !mediaKey || !entry) return false;
  if (entry.postId !== postId) return false;
  if (entry.direction !== options.direction) return false;
  if (!isPublishedVideoPlaybackSnapshotForMedia(entry.snapshot, mediaKey)) {
    return false;
  }
  if (
    options.origin != null &&
    isPublishedVideoListHandoffOrigin(options.origin) &&
    entry.origin !== options.origin
  ) {
    return false;
  }
  if (
    options.sessionId != null &&
    Number.isFinite(options.sessionId) &&
    entry.sessionId !== options.sessionId
  ) {
    return false;
  }
  return true;
}

export function peekPublishedVideoFeedDetailHandoffEntry(
  options: PublishedVideoFeedDetailHandoffMatch,
): PublishedVideoFeedDetailHandoffEntry | null {
  if (!matchesHandoff(options) || !entry) return null;
  return entry;
}

export function peekPublishedVideoFeedDetailHandoff(
  options: PublishedVideoFeedDetailHandoffMatch,
): PublishedVideoPlaybackSnapshot | null {
  return peekPublishedVideoFeedDetailHandoffEntry(options)?.snapshot ?? null;
}

/** Read and clear when postId + mediaKey + direction (+ optional origin/session) match. */
export function consumePublishedVideoFeedDetailHandoff(
  options: PublishedVideoFeedDetailHandoffMatch,
): PublishedVideoPlaybackSnapshot | null {
  const snap = peekPublishedVideoFeedDetailHandoff(options);
  if (!snap || !entry) return null;
  entry = null;
  return snap;
}

export type InvalidatePublishedVideoFeedDetailHandoffOptions = {
  postId?: string;
  origin?: PublishedVideoListHandoffOrigin;
  direction?: PublishedVideoFeedDetailHandoffDirection;
  sessionId?: number;
};

/**
 * Narrow invalidate. An unrelated card must pass its own origin/postId so it
 * cannot clear another surface's active slot.
 */
export function invalidatePublishedVideoFeedDetailHandoff(
  postIdOrOptions?: string | InvalidatePublishedVideoFeedDetailHandoffOptions,
): void {
  if (!entry) return;
  if (postIdOrOptions == null) {
    entry = null;
    return;
  }
  const opts: InvalidatePublishedVideoFeedDetailHandoffOptions =
    typeof postIdOrOptions === "string"
      ? { postId: postIdOrOptions }
      : postIdOrOptions;
  if (
    opts.postId != null &&
    opts.postId !== "" &&
    entry.postId !== opts.postId.trim()
  ) {
    return;
  }
  if (
    opts.origin != null &&
    isPublishedVideoListHandoffOrigin(opts.origin) &&
    entry.origin !== opts.origin
  ) {
    return;
  }
  if (opts.direction != null && entry.direction !== opts.direction) {
    return;
  }
  if (
    opts.sessionId != null &&
    Number.isFinite(opts.sessionId) &&
    entry.sessionId !== opts.sessionId
  ) {
    return;
  }
  entry = null;
}

export function shouldCapturePublishedVideoListDetailHandoff(options: {
  origin: unknown;
  items: readonly PublishedMediaItem[] | null | undefined;
  poorerPartialLegacy?: boolean;
}): boolean {
  if (!isPublishedVideoListHandoffOrigin(options.origin)) return false;
  if (options.poorerPartialLegacy) return false;
  if (!options.items) return false;
  return isPublishedVideoOnly(options.items);
}

/**
 * Sync capture for video-only Feed/Profile → Detail.
 * Returns a session only when a live snapshot was actually written.
 * Capture miss → null (caller must not advertise a handoff session).
 */
export function capturePublishedVideoListToDetailHandoff(options: {
  postId: string;
  origin: PublishedVideoListHandoffOrigin;
  items: readonly PublishedMediaItem[];
  initialMediaKey?: string;
  capture: (generation: number) => PublishedVideoPlaybackSnapshot | null;
}): { sessionId: number; wrote: true } | null {
  if (
    !shouldCapturePublishedVideoListDetailHandoff({
      origin: options.origin,
      items: options.items,
    })
  ) {
    return null;
  }
  const videoItem = options.items[0];
  if (!videoItem || videoItem.kind !== "video") return null;
  const targetKey = options.initialMediaKey?.trim() || videoItem.key;
  if (targetKey !== videoItem.key) return null;
  const sessionId = nextPublishedVideoFeedDetailHandoffGeneration();
  const snap = options.capture(sessionId);
  if (!snap || snap.mediaKey !== videoItem.key) {
    return null;
  }
  setPublishedVideoFeedDetailHandoff({
    postId: options.postId,
    snapshot: snap,
    direction: "to-detail",
    origin: options.origin,
    sessionId,
  });
  return { sessionId, wrote: true };
}

export function writePublishedVideoListReturnHandoff(options: {
  postId: string;
  origin: PublishedVideoListHandoffOrigin;
  sessionId: number;
  snapshot: PublishedVideoPlaybackSnapshot | null;
}): boolean {
  const postId = options.postId?.trim();
  if (!postId) return false;
  if (!isPublishedVideoListHandoffOrigin(options.origin)) return false;
  if (!Number.isFinite(options.sessionId)) return false;
  const snap = options.snapshot;
  if (!snap?.mediaKey?.trim()) return false;
  setPublishedVideoFeedDetailHandoff({
    postId,
    snapshot: snap,
    direction: "to-feed",
    origin: options.origin,
    sessionId: options.sessionId,
  });
  return true;
}

/** Map a return snapshot onto list pause keys without forcing ownership. */
export function resolvePublishedVideoListReturnIntent(options: {
  wantsPlaying: boolean;
}): { userPaused: boolean; clearManualForce: boolean } {
  if (!options.wantsPlaying) {
    return { userPaused: true, clearManualForce: true };
  }
  return { userPaused: false, clearManualForce: false };
}

/**
 * Pass 3G: consume list→Detail on the same turn Detail first renders,
 * so the player latches before default autoplay (useEffect is too late).
 * `attempted` is false when media is not yet eligible (retry later).
 */
export function consumePublishedVideoListToDetailHandoffIfEligible(options: {
  postId?: string | null;
  items: readonly PublishedMediaItem[];
  initialMediaKey?: string;
  origin?: unknown;
  sessionId?: number | null;
}): {
  snapshot: PublishedVideoPlaybackSnapshot | null;
  attempted: boolean;
} {
  const postId = options.postId?.trim();
  if (!postId) return { snapshot: null, attempted: false };
  if (!isPublishedVideoOnly(options.items)) {
    return { snapshot: null, attempted: false };
  }
  const video = options.items[0];
  if (!video || video.kind !== "video") {
    return { snapshot: null, attempted: false };
  }
  const targetKey = options.initialMediaKey?.trim() || video.key;
  if (targetKey !== video.key) {
    return { snapshot: null, attempted: true };
  }
  if (
    !isPublishedVideoListHandoffOrigin(options.origin) ||
    options.sessionId == null ||
    !Number.isFinite(options.sessionId)
  ) {
    return { snapshot: null, attempted: true };
  }
  const snapshot = consumePublishedVideoFeedDetailHandoff({
    postId,
    mediaKey: video.key,
    direction: "to-detail",
    origin: options.origin,
    sessionId: options.sessionId,
  });
  return { snapshot, attempted: true };
}

export function __resetPublishedVideoFeedDetailHandoffForTests(): void {
  entry = null;
  generationSeq = 0;
}
