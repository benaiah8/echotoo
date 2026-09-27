/**
 * Own Profile public-completion derivation (P4).
 * Pure / presentation-only — no network, no persistence.
 */

import { normalizeProfilePhotos } from "./profilePhotos";

/**
 * Matches FullScreenProfileCreation save fallback + placeholder:
 * `"I'm too lazy to write a bio 😅"`
 * Soft-incomplete detection uses this prefix (emoji optional).
 */
export const DEFAULT_PROFILE_BIO_PREFIX = "I'm too lazy to write a bio";

export const PROFILE_COMPLETION_CORE_TOTAL = 2 as const;

export type ProfileCompletionMissingCore = "photos" | "bio";

export type ProfileCompletionPercent = 0 | 50 | 100;

/** Minimal fields needed to derive public completion. */
export type ProfileCompletionInput = {
  profile_photos?: string[] | null;
  bio?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  telegram_url?: string | null;
};

export type ProfileCompletion = {
  hasPhotos: boolean;
  hasBio: boolean;
  /** Optional suggestion only — never required for `complete` / 100%. */
  hasSocial: boolean;
  coreDone: number;
  coreTotal: typeof PROFILE_COMPLETION_CORE_TOTAL;
  percent: ProfileCompletionPercent;
  complete: boolean;
  missingCore: ProfileCompletionMissingCore[];
};

/** True when bio is trimmed non-empty and not the legacy default placeholder. */
export function isMeaningfulProfileBio(
  bio: string | null | undefined,
): boolean {
  const trimmed = (bio ?? "").trim();
  if (!trimmed) return false;
  if (
    trimmed === DEFAULT_PROFILE_BIO_PREFIX ||
    trimmed.startsWith(DEFAULT_PROFILE_BIO_PREFIX)
  ) {
    return false;
  }
  return true;
}

/** At least one non-empty Instagram / TikTok / Telegram value. */
export function hasPublicSocialLink(input: {
  instagram_url?: string | null;
  tiktok_url?: string | null;
  telegram_url?: string | null;
}): boolean {
  return Boolean(
    (input.instagram_url ?? "").trim() ||
      (input.tiktok_url ?? "").trim() ||
      (input.telegram_url ?? "").trim(),
  );
}

/**
 * Derive Own Profile public completion from already-loaded profile fields.
 * Photos: `profile_photos` only (never avatar_url / Echo / Google HTTPS).
 */
export function deriveProfileCompletion(
  profile: ProfileCompletionInput | null | undefined,
): ProfileCompletion {
  const hasPhotos = normalizeProfilePhotos(profile?.profile_photos).length >= 1;
  const hasBio = isMeaningfulProfileBio(profile?.bio);
  const hasSocial = hasPublicSocialLink(profile ?? {});

  const missingCore: ProfileCompletionMissingCore[] = [];
  if (!hasPhotos) missingCore.push("photos");
  if (!hasBio) missingCore.push("bio");

  const coreDone = (hasPhotos ? 1 : 0) + (hasBio ? 1 : 0);
  const percent = (coreDone * 50) as ProfileCompletionPercent;

  return {
    hasPhotos,
    hasBio,
    hasSocial,
    coreDone,
    coreTotal: PROFILE_COMPLETION_CORE_TOTAL,
    percent,
    complete: coreDone === PROFILE_COMPLETION_CORE_TOTAL,
    missingCore,
  };
}
