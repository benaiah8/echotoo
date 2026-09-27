/**
 * Home Tour v1 — localStorage completion only (no Supabase / profile schema).
 */

export const HOME_TOUR_STORAGE_PREFIX = "echotoo_home_tour_v1_";

export function homeTourStorageKey(userId: string): string {
  return `${HOME_TOUR_STORAGE_PREFIX}${userId}`;
}

export function hasCompletedHomeTour(userId: string | null | undefined): boolean {
  if (!userId || typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(homeTourStorageKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function markHomeTourCompleted(userId: string | null | undefined): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(homeTourStorageKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Clears completion so the tour can show again (dev reset / re-test). */
export function clearHomeTourCompletion(
  userId: string | null | undefined
): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(homeTourStorageKey(userId));
  } catch {
    /* ignore */
  }
}
