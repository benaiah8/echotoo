/**
 * Single Duo editor overlay: active tap + toast Add note open the same sheet.
 * Leave confirm / intermediate manage UI removed.
 */

import { dismissSocialActionToast } from "./showSocialActionToast";

type PairUpActiveOverlayState = {
  postId: string | null;
  editorOpen: boolean;
};

const EMPTY: PairUpActiveOverlayState = {
  postId: null,
  editorOpen: false,
};

let state: PairUpActiveOverlayState = { ...EMPTY };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

function setState(next: PairUpActiveOverlayState): void {
  state = next;
  emit();
}

/** Same id as showPairUpJoinToast — keep in sync. */
function dismissJoinToastFor(postId: string): void {
  dismissSocialActionToast(`pair-up-join:${postId}`);
}

export function getPairUpActiveOverlayState(): PairUpActiveOverlayState {
  return state;
}

export function subscribePairUpActiveOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPairUpActiveOverlayStackOpen(
  s: PairUpActiveOverlayState = state
): boolean {
  return Boolean(s.postId && s.editorOpen);
}

/** Open unified Duo note/manage editor (active Duo tap). */
export function openPairUpManage(postId: string): void {
  openPairUpEditor(postId);
}

/** Open unified Duo note/manage editor (toast Add note). */
export function openPairUpNote(postId: string): void {
  openPairUpEditor(postId);
}

function openPairUpEditor(postId: string): void {
  if (!postId) return;
  dismissJoinToastFor(postId);
  setState({ postId, editorOpen: true });
}

/** Close editor (Cancel / backdrop / swipe / leave success). */
export function closePairUpManage(): void {
  if (!state.editorOpen && !state.postId) return;
  setState({ ...EMPTY });
}

/** Alias — note layer no longer separate. */
export function closePairUpNote(): void {
  closePairUpManage();
}

/** Android Back — close the single editor. */
export function closePairUpOverlayTop(): void {
  if (state.editorOpen) closePairUpManage();
}

/** @deprecated Leave confirm removed — no-op kept for any stray imports. */
export function openPairUpLeaveConfirm(_postId?: string): void {
  void _postId;
}

/** @deprecated */
export function closePairUpLeaveConfirm(): void {
  /* intentional no-op */
}

/** Legacy layer name — editor is the only layer. */
export type PairUpOverlayLayer = "editor";
