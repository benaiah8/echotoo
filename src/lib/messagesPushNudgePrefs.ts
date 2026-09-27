/**
 * Local prefs for the Messages-tab native push permission nudge (M3A).
 * Separate from global NativePushPermissionPromptGate prefs (`pushPromptPrefs`).
 */

export const MESSAGES_PUSH_NUDGE_LATER_UNTIL_MS_KEY =
  "messages_push_nudge_later_until_ms_v1";

const LATER_COOLDOWN_MS = 48 * 60 * 60 * 1000;

export function getMessagesPushNudgeLaterUntilMs(): number | null {
  try {
    const v = localStorage.getItem(MESSAGES_PUSH_NUDGE_LATER_UNTIL_MS_KEY);
    if (v == null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function isMessagesPushNudgeLaterActive(): boolean {
  const until = getMessagesPushNudgeLaterUntilMs();
  if (until == null) return false;
  return Date.now() < until;
}

/** Hide the Messages nudge for ~48 hours. */
export function applyMessagesPushNudgeLater(): void {
  try {
    localStorage.setItem(
      MESSAGES_PUSH_NUDGE_LATER_UNTIL_MS_KEY,
      String(Date.now() + LATER_COOLDOWN_MS)
    );
  } catch {
    /* noop */
  }
}

export function clearMessagesPushNudgeLater(): void {
  try {
    localStorage.removeItem(MESSAGES_PUSH_NUDGE_LATER_UNTIL_MS_KEY);
  } catch {
    /* noop */
  }
}
