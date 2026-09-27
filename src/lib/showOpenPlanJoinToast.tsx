/**
 * Place Duo create-success toast: casual copy + undo via cancelOpenPlan.
 */

import type { ReactNode } from "react";
import { PiTrashSimple } from "react-icons/pi";
import { cancelOpenPlan } from "../api/services/openPlans";
import { setOptimisticOpenPlanOwnState } from "./openPlanOwnStore";
import {
  dismissSocialActionToast,
  showSocialActionToast,
} from "./showSocialActionToast";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import toast from "react-hot-toast";

export function openPlanJoinToastId(postId: string): string {
  return `open-plan-join:${postId}`;
}

export function dismissOpenPlanJoinToast(postId: string): void {
  if (!postId) return;
  dismissSocialActionToast(openPlanJoinToastId(postId));
}

function openPlanToastTitleNode(compact: boolean): ReactNode {
  const rest = peopleUiCopy.openPlanCreateSuccessRest;
  return (
    <span className="inline-flex max-w-full items-baseline justify-center gap-1">
      <em className="shrink-0 font-semibold italic tracking-[-0.01em]">
        {peopleUiCopy.openPlanCreateSuccessLead}
      </em>
      {!compact && rest ? (
        <span className="min-w-0 truncate font-medium opacity-90">{rest}</span>
      ) : null}
      <span className="shrink-0" aria-hidden>
        {peopleUiCopy.openPlanCreateSuccessEmoji}
      </span>
    </span>
  );
}

export function showOpenPlanJoinToast(
  postId: string,
  opportunityId: string
): void {
  if (!postId || !opportunityId) return;
  const id = openPlanJoinToastId(postId);

  showSocialActionToast({
    id,
    title: openPlanToastTitleNode(false),
    titleCompact: openPlanToastTitleNode(true),
    dismissAction: {
      ariaLabel: peopleUiCopy.openPlanJoinToastUndoAria,
      icon: <PiTrashSimple size={15} aria-hidden />,
      onClick: () => {
        void (async () => {
          const revert = setOptimisticOpenPlanOwnState(postId, null);
          try {
            await cancelOpenPlan(opportunityId);
          } catch {
            revert?.();
            toast.error(peopleUiCopy.undoError);
          }
        })();
      },
    },
  });
}
