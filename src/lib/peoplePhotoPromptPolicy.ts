import { clampPhotoCount } from "./profilePhotoQuickSetupPresentation";
import {
  PHOTO_PROMPT_INTERVAL_BY_COUNT,
  markPhotoPromptShown,
  shouldShowContextualPhotoPrompt,
} from "./peoplePhotoPromptCadence";
import { PROFILE_PHOTOS_MAX } from "./profilePhotos";
import {
  getCachedViewerProfileForPhotoPrompt,
  type ResolvedViewerProfileForPhotoPrompt,
} from "./resolveViewerProfileForPhotoPrompt";

export type PeoplePhotoPromptIntent =
  | "pair_up_join"
  | "people_connect"
  | "group_up_request"
  | "group_up_create";

/** Central on/off for each production participation intent. */
export const PEOPLE_PHOTO_PROMPT_ENABLED: Record<
  PeoplePhotoPromptIntent,
  boolean
> = {
  pair_up_join: true,
  people_connect: true,
  group_up_request: true,
  group_up_create: true,
};

export type PeoplePhotoPromptDecisionInput = {
  userId: string;
  intent: PeoplePhotoPromptIntent;
  photoCount: number;
  peopleSessionBypassed: boolean;
};

export { PHOTO_PROMPT_INTERVAL_BY_COUNT, markPhotoPromptShown };

/** People tab participation intents that honor the in-session bypass. */
export function isPeopleParticipationPhotoPromptIntent(
  intent: PeoplePhotoPromptIntent,
): boolean {
  return intent !== "pair_up_join";
}

/**
 * Whether this production intent should offer the contextual photo prompt.
 * Does not fetch profile data — callers supply photoCount from cache.
 */
export function shouldOfferContextualPhotoPrompt(
  input: PeoplePhotoPromptDecisionInput,
): boolean {
  const { userId, intent, photoCount, peopleSessionBypassed } = input;
  if (!userId) return false;
  if (!PEOPLE_PHOTO_PROMPT_ENABLED[intent]) return false;
  if (clampPhotoCount(photoCount) >= PROFILE_PHOTOS_MAX) return false;
  if (
    peopleSessionBypassed &&
    isPeopleParticipationPhotoPromptIntent(intent)
  ) {
    return false;
  }
  return shouldShowContextualPhotoPrompt(userId, photoCount);
}

/**
 * Cache-first offer resolution for call sites.
 * Returns cached profile when prompt should show; null to proceed without prompt.
 * Never performs a Profile SELECT.
 */
export function resolvePhotoPromptOffer(
  userId: string,
  intent: PeoplePhotoPromptIntent,
  peopleSessionBypassed: boolean,
): ResolvedViewerProfileForPhotoPrompt | null {
  const profile = getCachedViewerProfileForPhotoPrompt(userId);
  if (!profile) return null;
  if (
    !shouldOfferContextualPhotoPrompt({
      userId,
      intent,
      photoCount: profile.photos.length,
      peopleSessionBypassed,
    })
  ) {
    return null;
  }
  return profile;
}
