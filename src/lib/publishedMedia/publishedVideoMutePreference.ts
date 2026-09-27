/**
 * Shared published-video sound preference (Feed / Profile / Detail / fullscreen).
 * Separate from Create finalize mute preference.
 *
 * Default prefers SOUND ON (muted=false).
 * Platform autoplay muted fallback must NOT rewrite this preference.
 * Session-scoped via sessionStorage when available.
 */

export type PublishedVideoSoundPreference = {
  muted: boolean;
  userHasChosen: boolean;
};

const STORAGE_KEY = "echotoo.publishedVideoSoundPreference.v1";

const DEFAULT_PREFERENCE: PublishedVideoSoundPreference = {
  muted: false,
  userHasChosen: false,
};

let memoryPreference: PublishedVideoSoundPreference = {
  ...DEFAULT_PREFERENCE,
};

function isValidPreference(
  value: unknown,
): value is PublishedVideoSoundPreference {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.muted === "boolean" && typeof row.userHasChosen === "boolean"
  );
}

function readStoredPreference(): PublishedVideoSoundPreference | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPreference(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredPreference(pref: PublishedVideoSoundPreference): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* ignore quota / private mode */
  }
}

function ensureLoaded(): PublishedVideoSoundPreference {
  const stored = readStoredPreference();
  if (stored) {
    memoryPreference = stored;
  }
  return memoryPreference;
}

/** Current shared preference (defaults to sound ON). */
export function getPublishedVideoSoundPreference(): PublishedVideoSoundPreference {
  return { ...ensureLoaded() };
}

/** Preferred muted flag for new playback attempts. */
export function getPublishedVideoPreferredMuted(): boolean {
  return ensureLoaded().muted;
}

/**
 * Explicit user mute/unmute — marks userHasChosen and persists for the session.
 */
export function setPublishedVideoSoundPreferenceMuted(muted: boolean): void {
  memoryPreference = { muted: Boolean(muted), userHasChosen: true };
  writeStoredPreference(memoryPreference);
}

/** @deprecated Prefer getPublishedVideoPreferredMuted / getPublishedVideoSoundPreference */
export function getPublishedVideoSessionUnmuted(): boolean {
  return !getPublishedVideoPreferredMuted();
}

/** @deprecated Prefer setPublishedVideoSoundPreferenceMuted */
export function setPublishedVideoSessionUnmuted(unmuted: boolean): void {
  setPublishedVideoSoundPreferenceMuted(!unmuted);
}

export function __resetPublishedVideoMutePreferenceForTests(): void {
  memoryPreference = { ...DEFAULT_PREFERENCE };
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
