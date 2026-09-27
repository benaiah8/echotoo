/**
 * Request leaving the create flow with the same guard + {@link ConfirmDialog} as tab navigation
 * (see BottomTab `tryNavigateAwayFromCreate`).
 */
export const CREATE_FLOW_REQUEST_LEAVE_EVENT = "create-flow-request-leave";

/**
 * Published-edit leave dialog → Finalize: run existing {@code requestPublish}
 * (same gates as header Republish). Does not navigate or discard.
 */
export const CREATE_FLOW_REQUEST_PUBLISH_EVENT = "create-flow-request-publish";

/** BottomTab listens — second browser Back while dialog open (Stay). */
export const CREATE_FLOW_LEAVE_DIALOG_DISMISS_EVENT =
  "create-flow-leave-dialog-dismiss";

export type CreateFlowRequestLeaveDetail = {
  go: () => void;
};

let leaveDialogOpen = false;
let finalizeSheetOpen = false;
let mediaPickerOpen = false;
let metadataRemoveConfirmOpen = false;
let placeToEventConfirmOpen = false;
let eventToPlaceConfirmOpen = false;
let intentionalLeaveBypass = false;

/** Finalize Date/Location/Tags/Settings sheet — Back closes sheet without leave guard. */
export const CREATE_FLOW_FINALIZE_SHEET_DISMISS_EVENT =
  "create-flow-finalize-sheet-dismiss";

/** Post media chooser / native gallery-camera — Back closes picker without leave guard. */
export const CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT =
  "create-flow-media-picker-dismiss";

/** Finalize Date/Location remove confirm — Back closes dialog without leave guard. */
export const CREATE_FLOW_METADATA_REMOVE_CONFIRM_DISMISS_EVENT =
  "create-flow-metadata-remove-confirm-dismiss";

/** Finalize Place→Event conversion confirm — second Back closes without leave guard. */
export const CREATE_FLOW_PLACE_TO_EVENT_CONFIRM_DISMISS_EVENT =
  "create-flow-place-to-event-confirm-dismiss";

/** Finalize Event→Place conversion confirm — Back closes without leave guard. */
export const CREATE_FLOW_EVENT_TO_PLACE_CONFIRM_DISMISS_EVENT =
  "create-flow-event-to-place-confirm-dismiss";

export function dispatchCreateFlowLeaveRequest(go: () => void) {
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_REQUEST_LEAVE_EVENT, {
      detail: { go } satisfies CreateFlowRequestLeaveDetail,
    })
  );
}

/** BottomTab published-edit leave → CreateFinalizePage.requestPublish. */
export function dispatchCreateFlowPublishRequest(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREATE_FLOW_REQUEST_PUBLISH_EVENT));
}

export function dispatchCreateFlowLeaveDialogDismiss() {
  window.dispatchEvent(new CustomEvent(CREATE_FLOW_LEAVE_DIALOG_DISMISS_EVENT));
}

export function setCreateFlowLeaveDialogOpen(open: boolean) {
  leaveDialogOpen = open;
}

export function isCreateFlowLeaveDialogOpen(): boolean {
  return leaveDialogOpen;
}

export function setCreateFlowFinalizeSheetOpen(open: boolean) {
  finalizeSheetOpen = open;
}

export function isCreateFlowFinalizeSheetOpen(): boolean {
  return finalizeSheetOpen;
}

export function dispatchCreateFlowFinalizeSheetDismiss() {
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_FINALIZE_SHEET_DISMISS_EVENT)
  );
}

export function setCreateFlowMediaPickerOpen(open: boolean) {
  mediaPickerOpen = open;
}

export function isCreateFlowMediaPickerOpen(): boolean {
  return mediaPickerOpen;
}

export function dispatchCreateFlowMediaPickerDismiss() {
  window.dispatchEvent(new CustomEvent(CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT));
}

export function setCreateFlowMetadataRemoveConfirmOpen(open: boolean) {
  metadataRemoveConfirmOpen = open;
}

export function isCreateFlowMetadataRemoveConfirmOpen(): boolean {
  return metadataRemoveConfirmOpen;
}

export function dispatchCreateFlowMetadataRemoveConfirmDismiss() {
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_METADATA_REMOVE_CONFIRM_DISMISS_EVENT)
  );
}

export function setCreateFlowPlaceToEventConfirmOpen(open: boolean) {
  placeToEventConfirmOpen = open;
}

export function isCreateFlowPlaceToEventConfirmOpen(): boolean {
  return placeToEventConfirmOpen;
}

export function dispatchCreateFlowPlaceToEventConfirmDismiss() {
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_PLACE_TO_EVENT_CONFIRM_DISMISS_EVENT)
  );
}

export function setCreateFlowEventToPlaceConfirmOpen(open: boolean) {
  eventToPlaceConfirmOpen = open;
}

export function isCreateFlowEventToPlaceConfirmOpen(): boolean {
  return eventToPlaceConfirmOpen;
}

export function dispatchCreateFlowEventToPlaceConfirmDismiss() {
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_EVENT_TO_PLACE_CONFIRM_DISMISS_EVENT)
  );
}

/** Skip the next synthetic-history popstate while completing an intentional leave. */
export function setCreateFlowIntentionalLeaveBypass(value: boolean) {
  intentionalLeaveBypass = value;
}

export function consumeCreateFlowIntentionalLeaveBypass(): boolean {
  const value = intentionalLeaveBypass;
  intentionalLeaveBypass = false;
  return value;
}

/**
 * Bump when draft content changes so the exit guard can engage/disengage.
 * Does not rebuild browser history (see useCreateFlowExitHistoryGuard).
 */
export const CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT =
  "create-flow-draft-content-changed";

export function dispatchCreateFlowDraftContentChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT)
  );
}
