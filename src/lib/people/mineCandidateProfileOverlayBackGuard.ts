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

/** True while the Mine profile overlay is open or just handled hardware Back. */
export function shouldSuppressUnderlyingBackForMineCandidateProfile(): boolean {
  return openCount > 0 || Date.now() < suppressUnderlyingBackUntil;
}
