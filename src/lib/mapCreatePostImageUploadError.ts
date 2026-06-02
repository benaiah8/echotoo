import { mapMediaUploadError } from "./mapMediaUploadError";

/**
 * @deprecated Prefer {@link mapMediaUploadError} with context `"post"`.
 * Kept for compatibility with existing imports.
 */
export function mapCreatePostImageUploadError(err: unknown): string {
  return mapMediaUploadError(err, "post");
}
