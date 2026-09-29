/**
 * Nested Back guard for Mine candidate profile overlay above People.
 * PeoplePage Android Back must close the profile before leaving the tab.
 */

let openCount = 0;
let suppressUnderlyingBackUntil = 0;
const SUPPRESS_UNDERLYING_BACK_MS = 200;

export const MINE_CANDIDATE_PROFILE_HISTORY_MARKER = "mineCandidateProfile";

export function notifyMineCandidateProfileOpened(): void {
  openCount += 1;
}

export function notifyMineCandidateProfileClosed(): void {
  openCount = Math.max(0, openCount - 1);
  suppressUnderlyingBackUntil = Date.now() + SUPPRESS_UNDERLYING_BACK_MS;
}

/**
 * Fail-safe: drop stale overlay ownership (People leave / unmount).
 * Clears the brief post-close suppress window as well — caller has left People.
 */
export function resetMineCandidateProfileBackGuard(): void {
  openCount = 0;
  suppressUnderlyingBackUntil = 0;
}

/**
 * Clamp openCount without clearing the post-close suppress window.
 * Use when the overlay is known closed but Android Back may still need the
 * short grace period so People does not also exit on the same press.
 */
export function releaseMineCandidateProfileBackOwnership(): void {
  openCount = 0;
}

/** True while the Mine profile overlay is open or just handled hardware Back. */
export function shouldSuppressUnderlyingBackForMineCandidateProfile(): boolean {
  return openCount > 0 || Date.now() < suppressUnderlyingBackUntil;
}

export function __getMineCandidateProfileOpenCountForTests(): number {
  return openCount;
}
