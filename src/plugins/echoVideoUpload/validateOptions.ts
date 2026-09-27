/**
 * Pure option validation shared by web stub + JS tests (mirrors Android plugin).
 */
import type { EchoVideoUploadOptions } from "./definitions";
import { ECHO_VIDEO_UPLOAD_ERROR } from "./errors";

export function validateEchoVideoUploadOptions(
  options: Partial<EchoVideoUploadOptions> | null | undefined,
): string | null {
  if (!options) return "options are required";
  if (!options.jobId?.trim()) return "jobId is required";
  if (!options.filePath?.trim()) return "filePath is required";
  if (!options.tusEndpoint?.trim()) return "tusEndpoint is required";
  if (
    typeof options.fileSize !== "number" ||
    !Number.isFinite(options.fileSize) ||
    options.fileSize <= 0
  ) {
    return "fileSize must be a positive number";
  }
  const headers = options.headers;
  if (!headers || typeof headers !== "object") {
    return "headers are required";
  }
  if (!headers.AuthorizationSignature?.trim()) {
    return "AuthorizationSignature is required";
  }
  if (!headers.AuthorizationExpire?.trim()) {
    return "AuthorizationExpire is required";
  }
  if (!headers.VideoId?.trim()) {
    return "VideoId is required";
  }
  if (!headers.LibraryId?.trim()) {
    return "LibraryId is required";
  }
  const metadata = options.metadata;
  if (!metadata || typeof metadata !== "object") {
    return "metadata is required";
  }
  if (!metadata.filetype?.trim()) return "metadata.filetype is required";
  if (!metadata.title?.trim()) return "metadata.title is required";
  return null;
}

export function echoVideoUploadInvalidOptionsCode(): string {
  return ECHO_VIDEO_UPLOAD_ERROR.invalid_options;
}

/** Pure TUS Upload-Metadata encoder (key base64(value)). */
export function encodeTusUploadMetadata(
  metadata: { filetype: string; title: string },
): string {
  const encode = (value: string) => {
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(value)));
    }
    // Node / Vitest
    return Buffer.from(value, "utf8").toString("base64");
  };
  return `filetype ${encode(metadata.filetype)},title ${encode(metadata.title)}`;
}
