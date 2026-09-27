/**
 * Shared carousel image building for feed, profile, and post detail.
 * Ensures same URL transformation and ordering for cache continuity when opening detail from feed.
 *
 * LI1D.2: local DraftImage sentinels (`draft-image/*`) are IDENTITY — preserve them
 * in Create gallery lists. Do not treat imgUrlPublic(undefined) as "missing media".
 * Display surfaces must resolve sentinels via DraftImage preview before <img src>.
 */
import { isLocalDraftImageUrl } from "./createDraftImage/localDraftImageUrl";
import { imgUrlPublic } from "./img";
import { getBestImageUrl } from "./imageOptimization";

export type ActivityWithImages = {
  images?: string[] | null;
  order_idx?: number | null;
};

/**
 * Map identity URLs → display-oriented URLs for remote images.
 * Local draft-image sentinels are kept as-is (identity); callers must not feed
 * them to a raw remote-only <img> without preview resolution.
 */
function mapImageUrls(raw: string[], viewportWidth: number): string[] {
  const out: string[] = [];
  for (const url of raw) {
    if (!url?.trim()) continue;
    // LI1D.2: preserve Create local identity — never prune via imgUrlPublic.
    if (isLocalDraftImageUrl(url)) {
      out.push(url.trim());
      continue;
    }
    const publicUrl = imgUrlPublic(url);
    if (!publicUrl) continue;
    // Session/local previews already pass through imgUrlPublic (LI1D.1).
    const optimized = getBestImageUrl(publicUrl, viewportWidth);
    if (optimized) out.push(optimized);
  }
  return out;
}

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
    if (isLocalDraftImageUrl(url)) return 0; // Create local identity first
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
  return { images: mapImageUrls(ordered, viewportWidth) };
}

/**
 * Finalize composer preview only. When all post media lives on slot 0
 * (current V4 create path), preserve persisted `activities[0].images` order
 * so cover = images[0]. Mixed-activity legacy posts keep {@link buildCarouselImages}
 * so URLs are not redistributed across stops.
 */
export function buildFinalizeComposerGallery(
  activities: ActivityWithImages[],
  viewportWidth = 400
): { images: string[] } {
  const list = activities ?? [];
  const laterHaveImages = list
    .slice(1)
    .some((a) => (a.images?.filter(Boolean).length ?? 0) > 0);
  if (laterHaveImages) return buildCarouselImages(list, viewportWidth);
  const slot0 = (list[0]?.images ?? []).filter(Boolean) as string[];
  return { images: mapImageUrls(slot0, viewportWidth) };
}
