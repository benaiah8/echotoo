/**
 * Legacy per-auth-user localStorage helpers for the old one-time Discover intro.
 *
 * Automatic intro popups were removed: Discover help is icon-only and does not
 * persist an “seen” ack. Kept so existing device keys remain harmless no-ops.
 */
export function p2pDiscoverIntroSeenStorageKey(authUserId: string): string {
  return `echotoo_p2p_discover_intro_seen_v1_${authUserId}`;
}

export function hasP2pDiscoverIntroSeen(authUserId: string): boolean {
  try {
    return localStorage.getItem(p2pDiscoverIntroSeenStorageKey(authUserId)) === "1";
  } catch {
    return false;
  }
}

/** @deprecated Intro Continue no longer gates Discover entry. */
export function setP2pDiscoverIntroSeen(authUserId: string): void {
  try {
    localStorage.setItem(p2pDiscoverIntroSeenStorageKey(authUserId), "1");
  } catch {
    /* private browsing / quota */
  }
}
