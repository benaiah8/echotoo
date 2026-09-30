/**
 * Internal native preparation error codes (shared JS ↔ Android ↔ future iOS).
 * Not user-facing copy.
 */
export const ECHO_VIDEO_PREPARE_ERROR = {
  unsupported_codec: "unsupported_codec",
  encoder_unavailable: "encoder_unavailable",
  decode_failed: "decode_failed",
  encode_failed: "encode_failed",
  output_invalid: "output_invalid",
  cancelled: "cancelled",
  storage_failed: "storage_failed",
  job_conflict: "job_conflict",
  invalid_options: "invalid_options",
  not_implemented: "not_implemented",
  /** Source display size exceeds public 4K Create contract. */
  source_resolution_too_high: "source_resolution_too_high",
  /** JS watchdog: native prepare accepted but no progress/terminal in time. */
  prepare_timeout: "prepare_timeout",
} as const;

export type EchoVideoPrepareErrorCode =
  (typeof ECHO_VIDEO_PREPARE_ERROR)[keyof typeof ECHO_VIDEO_PREPARE_ERROR];
