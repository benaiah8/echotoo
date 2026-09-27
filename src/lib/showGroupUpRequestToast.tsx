/**
 * Group Up request-success / withdraw toasts — Duo SocialActionToast family.
 * Compact fit-content pills; Source Groups footer offset via CSS var on browse open.
 */

import {
  dismissSocialActionToast,
  showSocialActionToast,
  SOCIAL_ACTION_TOAST_DURATION_MS,
} from "./showSocialActionToast";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import { socialUiCopy } from "./social/socialUiCopy";

export function groupUpRequestToastId(opportunityId: string): string {
  return `group-up-request:${opportunityId}`;
}

export function groupUpWithdrawnToastId(opportunityId: string): string {
  return `group-up-withdrawn:${opportunityId}`;
}

/** Request sent + Undo (same withdrawal path as tapping Requested). */
export function showGroupUpRequestToast(
  opportunityId: string,
  onUndo: () => void
): void {
  if (!opportunityId) return;
  const id = groupUpRequestToastId(opportunityId);

  showSocialActionToast({
    id,
    title: peopleUiCopy.groupUpRequestSentToast,
    variant: "compact",
    primaryAction: {
      label: peopleUiCopy.joinToastUndo,
      onClick: onUndo,
    },
  });
}

/** Compact one-line confirmation after direct Requested → withdraw. */
export function showGroupUpWithdrawnToast(opportunityId: string): void {
  if (!opportunityId) return;
  const id = groupUpWithdrawnToastId(opportunityId);

  showSocialActionToast({
    id,
    title: socialUiCopy.sourceGroupsRequestRemoved,
    variant: "compact",
    durationMs: Math.min(2200, SOCIAL_ACTION_TOAST_DURATION_MS),
  });
}

export function dismissGroupUpRequestToast(opportunityId: string): void {
  if (!opportunityId) return;
  dismissSocialActionToast(groupUpRequestToastId(opportunityId));
  dismissSocialActionToast(groupUpWithdrawnToastId(opportunityId));
}
