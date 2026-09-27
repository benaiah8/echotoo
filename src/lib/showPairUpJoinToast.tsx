/**
 * Event Duo join-success toast: Add note + remove/undo.
 * Shared by Feed, Post Detail, and People controls.
 */

import type { ReactNode } from "react";
import { PiNotePencil, PiTrashSimple } from "react-icons/pi";
import { leavePairUp } from "../api/services/pairUp";
import { openPairUpNote } from "./pairUpActiveOverlayStore";
import { setOptimisticPairUpJoinState } from "./pairUpJoinStore";
import {
  dismissSocialActionToast,
  showSocialActionToast,
} from "./showSocialActionToast";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import toast from "react-hot-toast";

export function pairUpJoinToastId(postId: string): string {
  return `pair-up-join:${postId}`;
}

export function dismissPairUpJoinToast(postId: string): void {
  if (!postId) return;
  dismissSocialActionToast(pairUpJoinToastId(postId));
}

/** Subtle italic lead + normal rest + single peace emoji. */
function duoToastTitleNode(compact: boolean): ReactNode {
  return (
    <span className="inline-flex max-w-full items-baseline justify-center gap-1">
      <em className="shrink-0 font-semibold italic tracking-[-0.01em]">
        {peopleUiCopy.joinToastTitleLead}
      </em>
      {!compact ? (
        <span className="min-w-0 truncate font-medium opacity-90">
          {peopleUiCopy.joinToastTitleRest}
        </span>
      ) : null}
      <span className="shrink-0" aria-hidden>
        {peopleUiCopy.joinToastTitleEmoji}
      </span>
    </span>
  );
}

export function showPairUpJoinToast(
  postId: string,
  options?: { onLeft?: () => void }
): void {
  if (!postId) return;
  const id = pairUpJoinToastId(postId);

  showSocialActionToast({
    id,
    title: duoToastTitleNode(false),
    titleCompact: duoToastTitleNode(true),
    primaryAction: {
      label: peopleUiCopy.joinToastAddNote,
      icon: <PiNotePencil size={14} aria-hidden />,
      onClick: () => {
        openPairUpNote(postId);
      },
    },
    dismissAction: {
      ariaLabel: peopleUiCopy.joinToastUndoAria,
      icon: <PiTrashSimple size={15} aria-hidden />,
      onClick: () => {
        void (async () => {
          const revert = setOptimisticPairUpJoinState(postId, false);
          try {
            await leavePairUp(postId);
            options?.onLeft?.();
          } catch {
            revert?.();
            toast.error(peopleUiCopy.undoError);
          }
        })();
      },
    },
  });
}
