import { supabase } from "../lib/supabaseClient";

/** Gate: allow Cloudinary URLs only when VITE_ALLOW_CLOUDINARY === "true" (default: disallow to prevent 401 spam) */
const ALLOW_CLOUDINARY = import.meta.env.VITE_ALLOW_CLOUDINARY === "true";

/**
 * Return a public, directly loadable URL for a storage object path.
 * - Works whether `path` is already a full URL or just a key.
 * - No image transformation params (so it works without the add-on).
 * - When VITE_ALLOW_CLOUDINARY is not "true", Cloudinary URLs return undefined (no 401 requests).
 */
export function imgUrlPublic(
  path?: string | null,
  bucket = "media"
): string | undefined {
  if (!path) return undefined;

  // [CLOUDINARY GATE] Block Cloudinary URLs unless explicitly allowed
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.hostname.includes("res.cloudinary.com") && !ALLOW_CLOUDINARY) {
        return undefined;
      }
    } catch {
      // Invalid URL, fall through
    }
    return path;
  }

  // Check if it's a valid base64 data URL (these are actually valid!)
  if (path.startsWith("data:image/")) {
    return path; // Return the data URL as-is
  }

  // Check for malformed base64 fragments (these are invalid)
  if (
    path.includes("AAABJRU5ErkJggg==") ||
    path.includes("CAUEQVRRAVRCOP//Z")
  ) {
    console.warn(
      "imgUrlPublic: Detected malformed base64 fragment:",
      path.substring(0, 50) + "..."
    );
    return undefined; // Return undefined for malformed base64 fragments
  }

  // Check if path looks like a valid file path
  if (!path.includes("/") && !path.includes(".")) {
    console.warn("imgUrlPublic: Invalid file path format:", path);
    return undefined;
  }

  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (error) {
    console.error(
      "imgUrlPublic: Error generating public URL:",
      error,
      "for path:",
      path
    );
    return undefined;
  }
}
