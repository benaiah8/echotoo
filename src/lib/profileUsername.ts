/** Default DB placeholder usernames like `user_2720` (numeric suffix only). */
const PLACEHOLDER_USERNAME_RE = /^user_\d+$/i;

export function isPlaceholderUsername(username: string | null | undefined): boolean {
  if (username == null || username === "") return false;
  return PLACEHOLDER_USERNAME_RE.test(username.trim());
}
