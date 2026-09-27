import { clampPhotoCount } from "./profilePhotoQuickSetupPresentation";
import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

/** Qualifying participation attempts between contextual photo prompts. */
export const PHOTO_PROMPT_INTERVAL_BY_COUNT: Record<0 | 1 | 2, number> = {
  0: 3,
  1: 5,
  2: 20,
};

/**
 * LOCAL DEV ONLY — set to `1` or `2` to visually QA the 2-photo prompt cadence.
 * Must remain `null` before commit (production interval stays 20).
 */
const DEV_TWO_PHOTO_PROMPT_INTERVAL_OVERRIDE: number | null = null;

function resolvePhotoPromptInterval(count: 0 | 1 | 2): number {
  const base = PHOTO_PROMPT_INTERVAL_BY_COUNT[count];
  if (
    import.meta.env.DEV &&
    count === 2 &&
    DEV_TWO_PHOTO_PROMPT_INTERVAL_OVERRIDE != null
  ) {
    return DEV_TWO_PHOTO_PROMPT_INTERVAL_OVERRIDE;
  }
  return base;
}

type CadenceStateV1 = {
  v: 1;
  photoCountTier: number;
  attemptsSincePrompt: number;
  tier2Initialized: boolean;
  promptShownAtTier: boolean;
};

function cadenceStorageKey(userId: string): string {
  return `echotoo_people_photo_prompt_cadence_v1_${userId}`;
}

function defaultCadenceState(): CadenceStateV1 {
  return {
    v: 1,
    photoCountTier: -1,
    attemptsSincePrompt: 0,
    tier2Initialized: false,
    promptShownAtTier: false,
  };
}

function loadCadenceState(userId: string): CadenceStateV1 {
  if (!userId) return defaultCadenceState();
  try {
    const raw = localStorage.getItem(cadenceStorageKey(userId));
    if (!raw) return defaultCadenceState();
    const parsed = JSON.parse(raw) as Partial<CadenceStateV1>;
    if (parsed.v !== 1) return defaultCadenceState();
    return {
      v: 1,
      photoCountTier:
        typeof parsed.photoCountTier === "number" ? parsed.photoCountTier : -1,
      attemptsSincePrompt:
        typeof parsed.attemptsSincePrompt === "number" &&
        parsed.attemptsSincePrompt >= 0
          ? parsed.attemptsSincePrompt
          : 0,
      tier2Initialized: Boolean(parsed.tier2Initialized),
      promptShownAtTier: Boolean(parsed.promptShownAtTier),
    };
  } catch {
    return defaultCadenceState();
  }
}

function saveCadenceState(userId: string, state: CadenceStateV1): void {
  if (!userId) return;
  try {
    localStorage.setItem(cadenceStorageKey(userId), JSON.stringify(state));
  } catch {
    /* ignore quota / privacy mode */
  }
}

/** @internal Tests only */
export function clearPhotoPromptCadenceForTests(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(cadenceStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Record a qualifying participation attempt and decide whether to show the prompt.
 * Never blocks participation — returns false to proceed directly.
 */
export function shouldShowContextualPhotoPrompt(
  userId: string,
  photoCount: number,
): boolean {
  const count = clampPhotoCount(photoCount);
  if (count >= PROFILE_PHOTOS_MAX) return false;
  if (!userId) return false;

  const interval = resolvePhotoPromptInterval(count as 0 | 1 | 2);

  let state = loadCadenceState(userId);

  if (state.photoCountTier !== count) {
    const prevTier = state.photoCountTier;
    state = {
      v: 1,
      photoCountTier: count,
      attemptsSincePrompt: 0,
      tier2Initialized:
        count === 2 && prevTier === 2 ? state.tier2Initialized : false,
      promptShownAtTier: false,
    };
  }

  if (count === 2 && !state.tier2Initialized) {
    state.tier2Initialized = true;
    state.attemptsSincePrompt = 1;
    saveCadenceState(userId, state);
    return false;
  }

  state.attemptsSincePrompt += 1;

  let shouldShow = false;
  if (
    !state.promptShownAtTier &&
    state.attemptsSincePrompt === 1 &&
    (count === 0 || count === 1)
  ) {
    shouldShow = true;
  } else if (count === 2 && state.attemptsSincePrompt >= interval) {
    shouldShow = true;
  } else if (state.promptShownAtTier && state.attemptsSincePrompt >= interval) {
    shouldShow = true;
  }

  saveCadenceState(userId, state);
  return shouldShow;
}

/** Restart cooldown after the prompt is actually displayed. */
export function markPhotoPromptShown(userId: string, photoCount: number): void {
  if (!userId) return;
  const count = clampPhotoCount(photoCount);
  const state = loadCadenceState(userId);
  state.photoCountTier = count;
  state.attemptsSincePrompt = 0;
  state.promptShownAtTier = true;
  if (count === 2) state.tier2Initialized = true;
  saveCadenceState(userId, state);
}
