/**
 * Local preferences for the notification explainer (auto-open frequency, session dismiss).
 * OS permission is requested separately from the explainer’s Allow action on native only.
 */

const LS_NEVER = "hangout_notif_explainer_never_v1";
const LS_LATER_UNTIL_MS = "hangout_notif_explainer_later_until_ms_v1";
/** Suppress auto-open after save for the rest of this tab session (Allow / Later / Never / backdrop). */
const SS_SESSION_DISMISS = "hangout_notif_explainer_sess_dismiss_v1";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const HANGOUT_EXPLAINER_PREFS_CHANGED_EVENT =
  "hangout-explainer-prefs-changed";

function notifyHangoutExplainerPrefsChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(HANGOUT_EXPLAINER_PREFS_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export function isHangoutExplainerNeverAskAgain(): boolean {
  try {
    return localStorage.getItem(LS_NEVER) === "1";
  } catch {
    return false;
  }
}

export function getHangoutExplainerLaterUntilMs(): number | null {
  try {
    const v = localStorage.getItem(LS_LATER_UNTIL_MS);
    if (v == null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** True while the 24h "Later" cooldown is still active. */
export function isHangoutExplainerLaterCooldownActive(): boolean {
  const until = getHangoutExplainerLaterUntilMs();
  if (until == null) return false;
  return Date.now() < until;
}

/**
 * Whether the explainer may auto-open after saving a hangout (not profile menu).
 * Respects: permanent never, active Later cooldown, session dismiss.
 */
export function shouldShowHangoutExplainerAuto(): boolean {
  if (isHangoutExplainerNeverAskAgain()) return false;
  if (isHangoutExplainerLaterCooldownActive()) return false;
  try {
    if (sessionStorage.getItem(SS_SESSION_DISMISS) === "1") return false;
  } catch {
    /* noop */
  }
  return true;
}

export function applyHangoutExplainerAllowNotifications(): void {
  try {
    sessionStorage.setItem(SS_SESSION_DISMISS, "1");
  } catch {
    /* noop */
  }
  notifyHangoutExplainerPrefsChanged();
}

export function applyHangoutExplainerLater(): void {
  try {
    localStorage.setItem(LS_LATER_UNTIL_MS, String(Date.now() + COOLDOWN_MS));
    sessionStorage.setItem(SS_SESSION_DISMISS, "1");
  } catch {
    /* noop */
  }
  notifyHangoutExplainerPrefsChanged();
}

export function applyHangoutExplainerNeverAskAgain(): void {
  try {
    localStorage.setItem(LS_NEVER, "1");
    sessionStorage.setItem(SS_SESSION_DISMISS, "1");
  } catch {
    /* noop */
  }
  notifyHangoutExplainerPrefsChanged();
}
