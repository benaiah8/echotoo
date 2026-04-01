/**
 * Request leaving the create flow with the same guard + {@link ConfirmDialog} as tab navigation
 * (see BottomTab `tryNavigateAwayFromCreate`).
 */
export const CREATE_FLOW_REQUEST_LEAVE_EVENT = "create-flow-request-leave";

export type CreateFlowRequestLeaveDetail = {
  go: () => void;
};

export function dispatchCreateFlowLeaveRequest(go: () => void) {
  window.dispatchEvent(
    new CustomEvent(CREATE_FLOW_REQUEST_LEAVE_EVENT, {
      detail: { go } satisfies CreateFlowRequestLeaveDetail,
    })
  );
}
