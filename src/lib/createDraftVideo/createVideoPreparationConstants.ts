/**
 * Preparation-related constants & user copy.
 * Encoding is not implemented yet — copy reserved for future prepare UI.
 */

import {
  MAX_CREATE_VIDEO_DURATION_SECONDS,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
} from "./createVideoConstraints";

export const SOURCE_MAX_BYTES = MAX_CREATE_VIDEO_SOURCE_BYTES;

/**
 * Preferred size hint for relatively short, already-efficient social clips.
 * Used for passthrough-small classification — NOT a universal prepared-output max.
 */
export const SHORT_VIDEO_PREFERRED_TARGET_BYTES = 20 * 1024 * 1024;

/**
 * Internal prepared-output ceiling for the public ≤90s Create contract.
 * Not shown to creators.
 */
export const INTERNAL_PREPARED_MAX_BYTES_FOR_PUBLIC_DURATION =
  60 * 1024 * 1024;

export { MAX_CREATE_VIDEO_DURATION_SECONDS };

export const PREPARING_VIDEO_USER_MESSAGE = "Preparing video…";

export const PREPARE_TOO_LARGE_USER_MESSAGE =
  "Couldn't prepare the video. Try a shorter or smaller video.";

export const PREPARE_FAILED_USER_MESSAGE =
  "Couldn't prepare the video. Try a shorter or smaller video.";

export const PREPARE_UNSUPPORTED_USER_MESSAGE =
  "Video format not supported. Use MP4 or MOV.";
