import type { PostMediaVideoStatus } from "./bunnyUpload/types";

export const POST_MEDIA_POLL_INITIAL_MS = 3000;
export const POST_MEDIA_POLL_MAX_MS = 10000;
export const POST_MEDIA_POLL_MAX_ATTEMPTS = 60;

export function shouldPollPostMediaVideoStatus(
  status: PostMediaVideoStatus | null | undefined,
): boolean {
  return status === "processing" || status === "pending" || status === "uploading";
}

export function isTerminalPostMediaVideoStatus(
  status: PostMediaVideoStatus,
): boolean {
  return status === "ready" || status === "failed";
}

/** Bounded backoff after an initial ~3s cadence. */
export function nextPostMediaPollDelayMs(attempt: number): number {
  if (attempt <= 5) return POST_MEDIA_POLL_INITIAL_MS;
  if (attempt <= 20) return 6000;
  return POST_MEDIA_POLL_MAX_MS;
}
