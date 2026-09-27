/**
 * Place Duo create-sheet dirty detection + guarded dismiss.
 * Back/dismiss resolution lives in composeCreateDraftGuard (shared with Group).
 */

import {
  resolveComposeCreateBackAction,
  resolveComposeCreateDismissRequest,
  type ComposeCreateBackInput,
  type ComposeCreateBackResult,
  type ComposeCreateDismissInput,
  type ComposeCreateDismissResult,
} from "./composeCreateDraftGuard";

export type PlaceDuoCreateDraftInput = {
  noteDraft: string;
  selectedDate: Date | null;
  selectedTime: { hours: number; minutes: number } | null;
};

/** Meaningful compose changes — not focus / keyboard alone. */
export function isPlaceDuoCreateDraftDirty(
  input: PlaceDuoCreateDraftInput
): boolean {
  if (input.noteDraft.trim().length > 0) return true;
  if (input.selectedDate != null) return true;
  if (input.selectedTime != null) return true;
  return false;
}

export type PlaceDuoCreateBackInput = ComposeCreateBackInput;
export type PlaceDuoCreateBackResult = ComposeCreateBackResult;
export type PlaceDuoCreateDismissInput = ComposeCreateDismissInput;
export type PlaceDuoCreateDismissResult = ComposeCreateDismissResult;

export function resolvePlaceDuoCreateBackAction(
  input: PlaceDuoCreateBackInput
): PlaceDuoCreateBackResult {
  return resolveComposeCreateBackAction(input);
}

export function resolvePlaceDuoCreateDismissRequest(
  input: PlaceDuoCreateDismissInput
): PlaceDuoCreateDismissResult {
  return resolveComposeCreateDismissRequest(input);
}
