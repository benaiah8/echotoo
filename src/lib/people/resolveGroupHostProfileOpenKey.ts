import type { GroupUpCandidate } from "./types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Canonical open key for OtherProfilePage from a Group host.
 * Prefer organizer_username, then organizer_user_id UUID.
 * Never invent a username from display_name.
 */
export function resolveGroupHostProfileOpenKey(
  candidate: Pick<
    GroupUpCandidate,
    "organizer_username" | "organizer_user_id"
  >,
): string | null {
  const username = candidate.organizer_username?.trim() ?? "";
  if (username) {
    return username.startsWith("@") ? username.slice(1) : username;
  }

  const userId = candidate.organizer_user_id?.trim() ?? "";
  if (UUID_RE.test(userId)) return userId;

  return null;
}
