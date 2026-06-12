/**
 * Client prefs for the native-only global push permission prompt (Version 1).
 * Separate from hangout save explainer prefs ({@link hangoutNotificationExplainerPrefs}).
 */

export const PUSH_PROMPT_NEVER_LS_KEY = "push_prompt_never_v1";
export const PUSH_PROMPT_LATER_UNTIL_MS_LS_KEY = "push_prompt_later_until_ms_v1";
export const PUSH_PROMPT_SESSION_DISMISS_SS_KEY = "push_prompt_session_dismiss_v1";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isNativePushPromptNeverAgain(): boolean {
  try {
    return localStorage.getItem(PUSH_PROMPT_NEVER_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function getNativePushPromptLaterUntilMs(): number | null {
  try {
    const v = localStorage.getItem(PUSH_PROMPT_LATER_UNTIL_MS_LS_KEY);
    if (v == null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function isNativePushPromptLaterCooldownActive(): boolean {
  const until = getNativePushPromptLaterUntilMs();
  if (until == null) return false;
  return Date.now() < until;
}

export function isNativePushPromptSessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(PUSH_PROMPT_SESSION_DISMISS_SS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether the global native push prompt may be shown (caller still checks OS granted, etc.).
 */
export function shouldShowNativePushPermissionPrompt(): boolean {
  if (isNativePushPromptNeverAgain()) return false;
  if (isNativePushPromptLaterCooldownActive()) return false;
  if (isNativePushPromptSessionDismissed()) return false;
  return true;
}

function setSessionDismiss(): void {
  try {
    sessionStorage.setItem(PUSH_PROMPT_SESSION_DISMISS_SS_KEY, "1");
  } catch {
    /* noop */
  }
}

/** After Allow attempt (any outcome) or when skipping further prompts this session. */
export function applyNativePushPromptSessionDismiss(): void {
  setSessionDismiss();
}

export function applyNativePushPromptLater(): void {
  try {
    localStorage.setItem(
      PUSH_PROMPT_LATER_UNTIL_MS_LS_KEY,
      String(Date.now() + COOLDOWN_MS),
    );
  } catch {
    /* noop */
  }
  setSessionDismiss();
}

export function applyNativePushPromptNever(): void {
  try {
    localStorage.setItem(PUSH_PROMPT_NEVER_LS_KEY, "1");
  } catch {
    /* noop */
  }
  setSessionDismiss();
}
