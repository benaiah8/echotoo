/**
 * Per-auth-user localStorage flag: one-time Discover reciprocity explanation.
 * Versioned so copy/behavior can change without re-showing old acks forever.
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

/** Persists Continue for this device; safe to call multiple times. */
export function setP2pDiscoverIntroSeen(authUserId: string): void {
  try {
    localStorage.setItem(p2pDiscoverIntroSeenStorageKey(authUserId), "1");
  } catch {
    /* private browsing / quota */
  }
}
