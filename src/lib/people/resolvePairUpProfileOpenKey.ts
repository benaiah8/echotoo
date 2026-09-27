import type { PairUpCandidate } from "./types";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DEV_MOCK_PREFIX = "dev-mock:";

/**
 * Canonical open key for OtherProfilePage / getProfileByIdOrUsername.
 * Prefer real username, then creator_id, then profile_id.
 * Never invent a username from display_name. Never open DEV mocks.
 */
export function resolvePairUpProfileOpenKey(
  candidate: Pick<
    PairUpCandidate,
    "username" | "creator_id" | "profile_id" | "opportunity_id"
  >
): string | null {
  const opportunityId = candidate.opportunity_id?.trim() ?? "";
  if (opportunityId.startsWith(DEV_MOCK_PREFIX)) return null;

  const username = candidate.username?.trim() ?? "";
  if (username && !username.startsWith(DEV_MOCK_PREFIX)) {
    return username.startsWith("@") ? username.slice(1) : username;
  }

  const creatorId = candidate.creator_id?.trim() ?? "";
  if (UUID_RE.test(creatorId)) return creatorId;

  const profileId = candidate.profile_id?.trim() ?? "";
  if (UUID_RE.test(profileId)) return profileId;

  return null;
}
