/**
 * M3D.1c — Persist last Activities visit for Messages amber visit-dot.
 * User-scoped localStorage only (no DB).
 */

const KEY_PREFIX = "messages_activities_last_visited_at_v1:";

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** Epoch ms of last Activities visit for this viewer, or null if never visited. */
export function getLastActivitiesVisitedAt(userId: string): number | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw == null || raw === "") return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist visit watermark (epoch ms). */
export function setLastActivitiesVisitedAt(
  userId: string,
  timestampMs: number
): void {
  if (!userId || !Number.isFinite(timestampMs)) return;
  try {
    localStorage.setItem(storageKey(userId), String(Math.floor(timestampMs)));
  } catch {
    /* noop */
  }
}

export function clearLastActivitiesVisitedAt(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* noop */
  }
}

/** Clear all visit watermarks (logout hygiene). */
export function clearAllLastActivitiesVisitedAt(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
