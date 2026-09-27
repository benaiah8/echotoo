/**
 * Durable sentinel URLs for Create-local DraftImages in mediaOrder / activities.
 * Not blob:, not Supabase paths — identity is DraftImage.localId (also mediaOrder.clientId).
 */

export const LOCAL_DRAFT_IMAGE_URL_PREFIX = "draft-image/";

export function buildLocalDraftImageUrl(localId: string): string {
  return `${LOCAL_DRAFT_IMAGE_URL_PREFIX}${localId.trim()}.webp`;
}

export function isLocalDraftImageUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  return /^draft-image\/[^/]+\.webp$/i.test(url.trim());
}

export function localIdFromLocalDraftImageUrl(
  url: string | null | undefined,
): string | null {
  if (typeof url !== "string") return null;
  const match = url.trim().match(/^draft-image\/([^/]+)\.webp$/i);
  return match?.[1] ?? null;
}
