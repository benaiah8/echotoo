/** Default DB placeholder usernames like `user_2720` (numeric suffix only). */
const PLACEHOLDER_USERNAME_RE = /^user_\d+$/i;

export function isPlaceholderUsername(username: string | null | undefined): boolean {
  if (username == null || username === "") return false;
  return PLACEHOLDER_USERNAME_RE.test(username.trim());
}

/** True when provider sync should assign a username (empty, null, or `user_*` placeholder). */
export function isUsernameMissingOrPlaceholder(
  username: string | null | undefined,
): boolean {
  if (username == null) return true;
  if (String(username).trim() === "") return true;
  return isPlaceholderUsername(username);
}
