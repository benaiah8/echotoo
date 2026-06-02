export type MediaUploadErrorContext = "post" | "avatar" | "comment";

/**
 * User-facing copy for image upload failures (picker → storage).
 * Raw technical messages stay in console.error/warn at call sites.
 */
export function mapMediaUploadError(
  err: unknown,
  context: MediaUploadErrorContext = "post"
): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err ?? "");
  const lower = msg.toLowerCase();

  if (
    lower.includes("not authenticated") ||
    lower.includes("user not authenticated") ||
    lower.includes("session") && lower.includes("expired")
  ) {
    return "Please sign in again before uploading photos.";
  }

  if (
    lower.includes("load failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("err_network") ||
    lower.includes("offline")
  ) {
    return "Connection problem. Please check your internet and try again.";
  }

  if (
    lower.includes("not a supported image") ||
    lower.includes("could not encode") ||
    lower.includes("could not process") ||
    lower.includes("image load failed") ||
    lower.includes("heic") ||
    lower.includes("heif") ||
    lower.includes("decode") ||
    lower.includes("encode image") ||
    lower.includes("try another photo") ||
    lower.includes("toblob failed")
  ) {
    return "This image could not be processed. Please try another image.";
  }

  if (
    lower.includes("supabase storage") ||
    lower.includes("cloudinary upload failed") ||
    lower.includes("no secure_url from cloudinary")
  ) {
    return "We couldn't upload this photo. Please try again.";
  }

  if (context === "post" && lower.includes("could not attach")) {
    return "The photo uploaded, but we couldn't attach it to your post. Please try again.";
  }

  return "We couldn't upload this photo. Please try again.";
}
