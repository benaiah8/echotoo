/**
 * Session-only Feed/Profile processing→ready list revalidator (PV3.4 / PV3.7).
 * At most ONE processing media may poll. Not persisted.
 */

import { fetchPublishedPostMediaRowById } from "./getPublishedPostMediaForDetail";
import {
  patchPublishedMediaRow,
  publishedMediaViewerKey,
} from "./publishedMediaCache";
import type { PublishedPostMediaRow } from "./types";

export const PUBLISHED_PROCESSING_LIST_POLL_MS = 5000;

export type ProcessingListRevalidatorOwnerId = string;

type OwnerEntry = {
  ownerId: ProcessingListRevalidatorOwnerId;
  mediaId: string;
  postId: string;
  viewerUserId: string | null | undefined;
  onRow: (row: PublishedPostMediaRow) => void;
  onRevoke: () => void;
};

let active: OwnerEntry | null = null;
let timerId: number | null = null;
let inFlight = false;
let pollingPaused = false;

function clearTimer(): void {
  if (timerId != null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

async function tick(): Promise<void> {
  const current = active;
  if (!current || inFlight || pollingPaused) return;
  if (typeof document !== "undefined" && document.hidden) return;
  inFlight = true;
  try {
    const row = await fetchPublishedPostMediaRowById(current.mediaId);
    if (active?.ownerId !== current.ownerId) return;

    // Media/post gone — stop polling immediately.
    if (!row) {
      releasePublishedProcessingListOwnership(current.ownerId);
      return;
    }

    patchPublishedMediaRow({
      postId: current.postId,
      viewerKey: publishedMediaViewerKey(current.viewerUserId),
      row,
    });
    current.onRow(row);

    if (row.video_status === "ready" || row.video_status === "failed") {
      releasePublishedProcessingListOwnership(current.ownerId);
    }
  } finally {
    inFlight = false;
  }
}

function ensureTimer(): void {
  if (pollingPaused || timerId != null || !active) return;
  timerId = window.setInterval(() => {
    void tick();
  }, PUBLISHED_PROCESSING_LIST_POLL_MS) as unknown as number;
  void tick();
}

/** Background: stop interval ticks (no useless network while hidden). */
export function pausePublishedProcessingListPolling(): void {
  pollingPaused = true;
  clearTimer();
}

/** Foreground: resume timer if an owner is still claimed. */
export function resumePublishedProcessingListPollingIfNeeded(): void {
  pollingPaused = false;
  if (active) ensureTimer();
}

export function getPublishedProcessingListOwnerId(): string | null {
  return active?.ownerId ?? null;
}

export function requestPublishedProcessingListOwnership(options: {
  ownerId: ProcessingListRevalidatorOwnerId;
  mediaId: string;
  postId: string;
  viewerUserId: string | null | undefined;
  onRow: (row: PublishedPostMediaRow) => void;
  onRevoke: () => void;
}): { release: () => void } {
  const { ownerId, mediaId, postId, viewerUserId, onRow, onRevoke } = options;

  if (active?.ownerId === ownerId) {
    active = {
      ownerId,
      mediaId,
      postId,
      viewerUserId,
      onRow,
      onRevoke,
    };
    ensureTimer();
    return {
      release: () => releasePublishedProcessingListOwnership(ownerId),
    };
  }

  if (active) {
    const prev = active;
    active = null;
    try {
      prev.onRevoke();
    } catch {
      /* ignore */
    }
  }

  active = {
    ownerId,
    mediaId,
    postId,
    viewerUserId,
    onRow,
    onRevoke,
  };
  ensureTimer();
  return {
    release: () => releasePublishedProcessingListOwnership(ownerId),
  };
}

export function releasePublishedProcessingListOwnership(
  ownerId: ProcessingListRevalidatorOwnerId,
): void {
  if (!active || active.ownerId !== ownerId) return;
  active = null;
  clearTimer();
}

/** Test helper */
export function __resetPublishedProcessingListRevalidatorForTests(): void {
  active = null;
  clearTimer();
  inFlight = false;
  pollingPaused = false;
}
