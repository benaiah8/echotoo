/**
 * Pure helpers for Create exit history guard engagement (PASS B1).
 * History stack must only change when engagement crosses false↔true, not on every edit.
 */

export function computeCreateFlowGuardEngaged(
  inCreate: boolean,
  shouldConfirmLeave: boolean,
): boolean {
  return inCreate && shouldConfirmLeave;
}

/** When true, the synthetic history marker must not be torn down and re-pushed. */
export function shouldKeepHistoryGuardStable(
  prevEngaged: boolean,
  nextEngaged: boolean,
): boolean {
  return prevEngaged === nextEngaged;
}

export type CreateFlowBackActionInput = {
  skipPopstate: boolean;
  /** Create finalize video fullscreen — exit before Leave Create. */
  videoFullscreenOpen?: boolean;
  metadataRemoveConfirmOpen: boolean;
  placeToEventConfirmOpen: boolean;
  eventToPlaceConfirmOpen: boolean;
  finalizeSheetOpen: boolean;
  leaveDialogOpen: boolean;
  mediaPickerOpen: boolean;
  shouldConfirmLeave: boolean;
  source: "popstate" | "android";
  historyStateHasMarker: boolean;
};

export type CreateFlowBackActionResult =
  | { kind: "noop-skip-popstate" }
  | { kind: "exit-video-fullscreen"; restoreMarker: boolean }
  | { kind: "dismiss-metadata-remove"; restoreMarker: boolean }
  | { kind: "dismiss-place-to-event"; restoreMarker: boolean }
  | { kind: "dismiss-event-to-place"; restoreMarker: boolean }
  | { kind: "dismiss-finalize-sheet"; restoreMarker: boolean }
  | { kind: "dismiss-leave-dialog"; restoreMarker: boolean }
  | { kind: "dismiss-media-picker"; restoreMarker: boolean }
  | { kind: "exit-without-confirm" }
  | { kind: "request-leave"; androidPopMarkerFirst: boolean };

/**
 * Resolves a back/popstate signal into an action plan (testable, no DOM).
 */
export function resolveCreateFlowBackAction(
  input: CreateFlowBackActionInput,
): CreateFlowBackActionResult {
  if (input.skipPopstate) {
    return { kind: "noop-skip-popstate" };
  }

  if (input.videoFullscreenOpen) {
    return {
      kind: "exit-video-fullscreen",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (input.metadataRemoveConfirmOpen) {
    return {
      kind: "dismiss-metadata-remove",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (input.placeToEventConfirmOpen) {
    return {
      kind: "dismiss-place-to-event",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (input.eventToPlaceConfirmOpen) {
    return {
      kind: "dismiss-event-to-place",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (input.finalizeSheetOpen) {
    return {
      kind: "dismiss-finalize-sheet",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (input.leaveDialogOpen) {
    return {
      kind: "dismiss-leave-dialog",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (input.mediaPickerOpen) {
    return {
      kind: "dismiss-media-picker",
      restoreMarker: input.shouldConfirmLeave,
    };
  }

  if (!input.shouldConfirmLeave) {
    return { kind: "exit-without-confirm" };
  }

  return {
    kind: "request-leave",
    androidPopMarkerFirst:
      input.source === "android" && input.historyStateHasMarker,
  };
}
