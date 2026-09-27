import type { PostMediaVideoStatus } from "./bunnyUpload/types";
import { fetchPostMediaById } from "./postMediaRow";
import type { PostMediaRow } from "./postMediaRow";
import {
  nextPostMediaPollDelayMs,
  POST_MEDIA_POLL_MAX_ATTEMPTS,
} from "./postMediaStatusPolling";

export function isPostMediaPublishReady(
  status: PostMediaVideoStatus | null | undefined,
): boolean {
  return status === "processing" || status === "ready";
}

export function isPostMediaPublishBlocked(
  status: PostMediaVideoStatus | null | undefined,
): boolean {
  return (
    status === "pending" ||
    status === "uploading" ||
    status === "failed" ||
    status == null
  );
}

export type WaitForPostMediaPublishReadyOptions = {
  signal?: AbortSignal;
  onStatus?: (status: PostMediaVideoStatus) => void;
  maxAttempts?: number;
};

export const VIDEO_PROCESSING_FAILED_USER_MESSAGE =
  "Video processing failed.";

export const VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE =
  "Video status check timed out.";

export type WaitForPostMediaPublishReadyFailureCode =
  | "cancelled"
  | "processing_failed"
  | "timeout"
  | "unexpected";

export type WaitForPostMediaPublishReadyResult =
  | { ok: true; row: PostMediaRow }
  | {
      ok: false;
      error: string;
      code: WaitForPostMediaPublishReadyFailureCode;
    };

/**
 * Map a rejected processing poll into a typed Result — never invent success.
 */
export function mapWaitForPostMediaPublishReadyError(
  error: unknown,
): Extract<WaitForPostMediaPublishReadyResult, { ok: false }> {
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return {
      ok: false,
      error: "Upload cancelled.",
      code: "cancelled",
    };
  }

  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");

  if (message === VIDEO_PROCESSING_FAILED_USER_MESSAGE) {
    return {
      ok: false,
      error: VIDEO_PROCESSING_FAILED_USER_MESSAGE,
      code: "processing_failed",
    };
  }

  if (message === VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE) {
    return {
      ok: false,
      error: VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE,
      code: "timeout",
    };
  }

  return {
    ok: false,
    error: VIDEO_PROCESSING_FAILED_USER_MESSAGE,
    code: "unexpected",
  };
}

/**
 * Poll post_media until video_status is processing or ready (publish gate).
 * Does not wait for Bunny encoding to reach ready when already processing.
 * Prefer {@link waitForPostMediaPublishReadySettled} at publish boundaries.
 */
export async function waitForPostMediaPublishReady(
  mediaId: string,
  options: WaitForPostMediaPublishReadyOptions = {},
): Promise<PostMediaRow> {
  const maxAttempts = options.maxAttempts ?? POST_MEDIA_POLL_MAX_ATTEMPTS;
  let attempt = 0;

  while (attempt < maxAttempts) {
    if (options.signal?.aborted) {
      throw new DOMException("Publish video poll aborted", "AbortError");
    }

    attempt += 1;
    const row = await fetchPostMediaById(mediaId);
    if (row) {
      options.onStatus?.(row.video_status);
      if (isPostMediaPublishReady(row.video_status)) {
        return row;
      }
      if (row.video_status === "failed") {
        throw new Error(VIDEO_PROCESSING_FAILED_USER_MESSAGE);
      }
    }

    await new Promise<void>((resolve, reject) => {
      const delay = nextPostMediaPollDelayMs(attempt);
      const timer = setTimeout(resolve, delay);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Publish video poll aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }

  throw new Error(VIDEO_PROCESSING_TIMEOUT_USER_MESSAGE);
}

/**
 * Same gate as {@link waitForPostMediaPublishReady}, but never rejects —
 * failures return `{ ok: false }` for the publish Result contract.
 */
export async function waitForPostMediaPublishReadySettled(
  mediaId: string,
  options: WaitForPostMediaPublishReadyOptions = {},
): Promise<WaitForPostMediaPublishReadyResult> {
  try {
    const row = await waitForPostMediaPublishReady(mediaId, options);
    return { ok: true, row };
  } catch (error) {
    return mapWaitForPostMediaPublishReadyError(error);
  }
}
