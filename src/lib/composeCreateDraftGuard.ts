/**
 * Shared create-sheet dirty detection + guarded dismiss resolution (pure).
 * Used by Place Duo and Group create. No RPC / store side effects.
 */

export type ComposeCreateBackInput = {
  createOpen: boolean;
  discardConfirmOpen: boolean;
  dirty: boolean;
  /** True when an editable has focus and should blur before any dismiss. */
  keyboardEditableFocused: boolean;
  busy: boolean;
};

export type ComposeCreateBackResult =
  | { kind: "noop-busy" }
  | { kind: "blur-keyboard" }
  | { kind: "dismiss-discard-confirm" }
  | { kind: "open-discard-confirm" }
  | { kind: "close-overlay" };

/**
 * Resolves native/app back while a CREATE sheet is open.
 * Manage / Leave / Cancel-discovery confirms stay outside this helper.
 */
export function resolveComposeCreateBackAction(
  input: ComposeCreateBackInput
): ComposeCreateBackResult {
  if (!input.createOpen) {
    return { kind: "close-overlay" };
  }
  if (input.busy) {
    return { kind: "noop-busy" };
  }
  if (input.keyboardEditableFocused) {
    return { kind: "blur-keyboard" };
  }
  if (input.discardConfirmOpen) {
    return { kind: "dismiss-discard-confirm" };
  }
  if (input.dirty) {
    return { kind: "open-discard-confirm" };
  }
  return { kind: "close-overlay" };
}

export type ComposeCreateDismissInput = {
  createOpen: boolean;
  discardConfirmOpen: boolean;
  dirty: boolean;
  busy: boolean;
};

export type ComposeCreateDismissResult =
  | { kind: "noop-busy" }
  | { kind: "noop-confirm-open" }
  | { kind: "open-discard-confirm" }
  | { kind: "close-overlay" };

/**
 * Backdrop / swipe / Cancel tray — same confirm path as dirty native Back.
 * Does not blur keyboard (BottomDrawer already blurs on backdrop).
 */
export function resolveComposeCreateDismissRequest(
  input: ComposeCreateDismissInput
): ComposeCreateDismissResult {
  if (!input.createOpen) {
    return { kind: "close-overlay" };
  }
  if (input.busy) {
    return { kind: "noop-busy" };
  }
  if (input.discardConfirmOpen) {
    return { kind: "noop-confirm-open" };
  }
  if (input.dirty) {
    return { kind: "open-discard-confirm" };
  }
  return { kind: "close-overlay" };
}

export function isGroupCreateDraftDirty(input: {
  titleDraft: string;
  descriptionDraft: string;
  selectedDate?: Date | null;
  selectedTime?: { hours: number; minutes: number } | null;
}): boolean {
  if (input.titleDraft.trim().length > 0) return true;
  if (input.descriptionDraft.trim().length > 0) return true;
  if (input.selectedDate != null) return true;
  if (input.selectedTime != null) return true;
  return false;
}
