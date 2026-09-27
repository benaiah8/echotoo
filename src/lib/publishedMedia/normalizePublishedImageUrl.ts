/**
 * Normalize image URLs for published media dedupe / lookup.
 * Storage paths and public HTTPS forms of the same object must match.
 */

import { imgUrlPublic } from "../img";

/**
 * Canonical identity for published image media.
 * Prefer public URL when resolvable; else trimmed raw path.
 */
export function normalizePublishedImageUrl(url: string): string {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return "";
  const publicUrl = imgUrlPublic(raw);
  if (publicUrl) {
    // Strip query/hash so getBestImageUrl transform params don't create dupes.
    try {
      const u = new URL(publicUrl);
      u.search = "";
      u.hash = "";
      return u.toString();
    } catch {
      return publicUrl.split("?")[0]?.split("#")[0] || publicUrl;
    }
  }
  return raw.split("?")[0]?.split("#")[0] || raw;
}

/** Display URL: public when available, else original. */
export function resolvePublishedImageDisplayUrl(url: string): string {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return "";
  return imgUrlPublic(raw) || raw;
}
