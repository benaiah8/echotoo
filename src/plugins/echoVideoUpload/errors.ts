/**
 * Internal native video upload error codes (PASS P1).
 * Not user-facing copy.
 */
export const ECHO_VIDEO_UPLOAD_ERROR = {
  invalid_options: "invalid_options",
  file_missing: "file_missing",
  file_empty: "file_empty",
  file_size_mismatch: "file_size_mismatch",
  path_not_allowed: "path_not_allowed",
  tus_create_failed: "tus_create_failed",
  tus_location_missing: "tus_location_missing",
  tus_head_failed: "tus_head_failed",
  tus_offset_invalid: "tus_offset_invalid",
  tus_offset_conflict: "tus_offset_conflict",
  network_failed: "network_failed",
  auth_failed: "auth_failed",
  server_failed: "server_failed",
  cancelled: "cancelled",
  job_conflict: "job_conflict",
  not_implemented: "not_implemented",
  native_video_upload_unavailable: "native_video_upload_unavailable",
} as const;

export type EchoVideoUploadErrorCode =
  (typeof ECHO_VIDEO_UPLOAD_ERROR)[keyof typeof ECHO_VIDEO_UPLOAD_ERROR];
