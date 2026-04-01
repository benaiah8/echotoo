/**
 * Shared carousel image building for feed, profile, and post detail.
 * Ensures same URL transformation and ordering for cache continuity when opening detail from feed.
 */
import { imgUrlPublic } from "./img";
import { getBestImageUrl } from "./imageOptimization";

export type ActivityWithImages = {
  images?: string[] | null;
  order_idx?: number | null;
};

export function buildCarouselImages(
  activities: ActivityWithImages[],
  viewportWidth = 400
): { images: string[] } {
  const sorted = [...activities].sort(
    (a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0)
  );
  let raw = sorted.flatMap((a) => (a.images ?? []).filter(Boolean) as string[]);
  const nonCloudinary = raw.filter(
    (u) => u && !u.includes("res.cloudinary.com")
  );
  const cloudinary = raw.filter((u) => u && u.includes("res.cloudinary.com"));
  if (nonCloudinary.length > 0) {
    raw = nonCloudinary;
  } else {
    raw = cloudinary;
  }

  const priority = (url: string): number => {
    if (!url?.trim()) return 3;
    if (!url.startsWith("http")) return 0; // Supabase path
    if (url.includes("res.cloudinary.com")) return 2; // Cloudinary
    return 1; // Other http
  };
  const seen = new Set<string>();
  const ordered = raw
    .sort((a, b) => priority(a) - priority(b))
    .filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  const images = ordered
    .map((url) => imgUrlPublic(url))
    .filter((u): u is string => !!u)
    .map((url) => getBestImageUrl(url, viewportWidth))
    .filter(Boolean);
  return { images };
}
