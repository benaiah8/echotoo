/**
 * Single app-level Pair Up photo encouragement prompt.
 * First intent wins until continue or close.
 */

import {
  PAIR_UP_PHOTO_PROMPT_DESCRIPTION,
  PAIR_UP_PHOTO_PROMPT_TITLE,
} from "./pairUpPhotoPromptCopy";
import { markPhotoPromptShown } from "./peoplePhotoPromptCadence";
import { setPeoplePhotoPromptBypass } from "./peoplePhotoPromptSession";
import { normalizeProfilePhotos, PROFILE_PHOTOS_MAX } from "./profilePhotos";

function isPeopleParticipationBypassIntent(intentKey: string | null): boolean {
  if (!intentKey) return false;
  return (
    intentKey.startsWith("connect:") ||
    intentKey.startsWith("group-up-request:") ||
    intentKey.startsWith("group-up-create:")
  );
}

export type PairUpPhotoPromptState = {
  open: boolean;
  profileId: string | null;
  userId: string | null;
  photos: string[];
  intentKey: string | null;
  title: string;
  description: string;
};

const EMPTY: PairUpPhotoPromptState = {
  open: false,
  profileId: null,
  userId: null,
  photos: [],
  intentKey: null,
  title: PAIR_UP_PHOTO_PROMPT_TITLE,
  description: PAIR_UP_PHOTO_PROMPT_DESCRIPTION,
};

let state: PairUpPhotoPromptState = { ...EMPTY };
const listeners = new Set<() => void>();

let continueCallback: (() => void) | null = null;
let dismissCallback: (() => void) | null = null;

/** Brief window after prompt consumes hardware back so underlying modals do not also close. */
let suppressUnderlyingBackUntil = 0;
const SUPPRESS_UNDERLYING_BACK_MS = 200;

export function markPairUpPhotoPromptBackHandled(): void {
  suppressUnderlyingBackUntil = Date.now() + SUPPRESS_UNDERLYING_BACK_MS;
}

/** True while prompt is open or just handled Android back (same event tick). */
export function shouldSuppressUnderlyingBackForPhotoPrompt(): boolean {
  return state.open || Date.now() < suppressUnderlyingBackUntil;
}

/** @deprecated Use `shouldSuppressUnderlyingBackForPhotoPrompt`. */
export function shouldSuppressUnderlyingBackForPairUpPhotoPrompt(): boolean {
  return shouldSuppressUnderlyingBackForPhotoPrompt();
}

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

function setState(next: PairUpPhotoPromptState): void {
  state = next;
  emit();
}

export function getPairUpPhotoPromptState(): PairUpPhotoPromptState {
  return state;
}

export function subscribePairUpPhotoPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPairUpPhotoPromptOpen(): boolean {
  return state.open;
}

export function getPairUpPhotoPromptIntentKey(): string | null {
  return state.intentKey;
}

/** PASS A helper — pending post join intent (`join:${postId}`). */
export function getPairUpPhotoPromptPendingPostId(): string | null {
  const key = state.intentKey;
  if (!key?.startsWith("join:")) return null;
  return key.slice("join:".length) || null;
}

/** Event/Post Pair Up post-join enrichment (join already succeeded). */
export function isPostJoinPhotoPromptIntent(intentKey: string | null): boolean {
  return Boolean(intentKey?.startsWith("join-done:"));
}

export type OpenPairUpPhotoPromptArgs = {
  intentKey: string;
  profileId: string;
  userId: string;
  photos: string[];
  onContinue: () => void;
  /** Fired when the prompt closes without Continue (X / dismiss). */
  onDismiss?: () => void;
  title?: string;
  description?: string;
};

/**
 * Open the singleton photo prompt. Returns false if already open (first intent wins).
 */
export function openPairUpPhotoPrompt(args: OpenPairUpPhotoPromptArgs): boolean {
  if (state.open) return false;
  if (!args.intentKey || !args.profileId || !args.userId) return false;

  continueCallback = args.onContinue;
  dismissCallback = args.onDismiss ?? null;
  const normalizedPhotos = normalizeProfilePhotos(args.photos);
  setState({
    open: true,
    profileId: args.profileId,
    userId: args.userId,
    photos: normalizedPhotos,
    intentKey: args.intentKey,
    title: args.title ?? PAIR_UP_PHOTO_PROMPT_TITLE,
    description: args.description ?? PAIR_UP_PHOTO_PROMPT_DESCRIPTION,
  });
  markPhotoPromptShown(args.userId, normalizedPhotos.length);
  return true;
}

export function updatePairUpPhotoPromptPhotos(photos: string[]): void {
  if (!state.open) return;
  setState({
    ...state,
    photos: normalizeProfilePhotos(photos),
  });
}

export function closePairUpPhotoPrompt(): void {
  if (!state.open) return;
  const dismiss = dismissCallback;
  continueCallback = null;
  dismissCallback = null;
  setState({ ...EMPTY });
  dismiss?.();
}

/** User chose Continue / Continue anyway — runs resume action then closes. */
export function continuePairUpPhotoPrompt(): void {
  const photoCount = state.photos.length;
  const intentKey = state.intentKey;
  const resume = continueCallback;
  continueCallback = null;
  dismissCallback = null;
  setState({ ...EMPTY });
  if (
    isPeopleParticipationBypassIntent(intentKey) &&
    photoCount < PROFILE_PHOTOS_MAX
  ) {
    setPeoplePhotoPromptBypass();
  }
  resume?.();
}
