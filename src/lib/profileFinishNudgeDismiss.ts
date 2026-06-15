/**
 * Per-auth-user localStorage flag: "Finish setting up your profile" soft nudge.
 * Key must stay in sync with historical behavior in ProfileFinishSoftNudge.
 */
export function profileFinishNudgeDismissedStorageKey(
  authUserId: string,
): string {
  return `echotoo_profile_finish_nudge_dismissed_${authUserId}`;
}

/** Persists dismiss for this device; safe to call multiple times. */
export function setProfileFinishNudgeDismissed(authUserId: string): void {
  try {
    localStorage.setItem(profileFinishNudgeDismissedStorageKey(authUserId), "1");
  } catch {
    /* private browsing / quota */
  }
}
