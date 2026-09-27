/**
 * Profile rail Connect / leave toasts — same Duo SocialActionToast shell.
 * Connect success: undo + Add note.
 * Disconnect: undo circle only (no Add note).
 */

import type { ReactNode } from "react";
import { PiArrowCounterClockwise, PiNotePencil, PiTrashSimple } from "react-icons/pi";
import toast from "react-hot-toast";
import {
  expressPairUpInterest,
  joinPairUp,
  leavePairUp,
} from "../api/services/pairUp";
import { openPairUpNote } from "./pairUpActiveOverlayStore";
import { setOptimisticPairUpJoinState } from "./pairUpJoinStore";
import {
  dismissSocialActionToast,
  showSocialActionToast,
} from "./showSocialActionToast";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import { dismissPairUpJoinToast } from "./showPairUpJoinToast";

export function profileConnectToastId(opportunityId: string): string {
  return `profile-connect:${opportunityId}`;
}

export function profileDisconnectedToastId(opportunityId: string): string {
  return `profile-disconnected:${opportunityId}`;
}

export function dismissProfileConnectToast(opportunityId: string): void {
  if (!opportunityId) return;
  dismissSocialActionToast(profileConnectToastId(opportunityId));
  dismissSocialActionToast(profileDisconnectedToastId(opportunityId));
}

function italicTitle(text: string): ReactNode {
  return (
    <span className="inline-flex max-w-full items-baseline justify-center gap-1">
      <em className="shrink-0 font-semibold italic tracking-[-0.01em]">
        {text}
      </em>
    </span>
  );
}

export function showProfileConnectToast(args: {
  opportunityId: string;
  sourcePostId: string;
  onLeft?: () => void;
}): void {
  const { opportunityId, sourcePostId, onLeft } = args;
  if (!opportunityId || !sourcePostId) return;
  const id = profileConnectToastId(opportunityId);
  dismissPairUpJoinToast(sourcePostId);
  dismissSocialActionToast(profileDisconnectedToastId(opportunityId));

  showSocialActionToast({
    id,
    title: italicTitle(peopleUiCopy.profileConnectToast),
    titleCompact: italicTitle(peopleUiCopy.profileConnectToast),
    primaryAction: {
      label: peopleUiCopy.joinToastAddNote,
      icon: <PiNotePencil size={14} aria-hidden />,
      onClick: () => {
        openPairUpNote(sourcePostId);
      },
    },
    dismissAction: {
      ariaLabel: peopleUiCopy.profileConnectToastUndoAria,
      icon: <PiTrashSimple size={15} aria-hidden />,
      onClick: () => {
        void (async () => {
          const revert = setOptimisticPairUpJoinState(sourcePostId, false);
          try {
            await leavePairUp(sourcePostId);
            onLeft?.();
          } catch {
            revert?.();
            toast.error(peopleUiCopy.undoError);
          }
        })();
      },
    },
  });
}

/**
 * After leaving Duo from Profile rail — clears Duo + Connect.
 * Undo restores prior Duo membership and Connect interest when it was active.
 * No Add Note (leave is a removal, not a note action).
 */
export function showProfileDisconnectedToast(args: {
  opportunityId: string;
  sourcePostId: string;
  /** Snapshot: Connect was active before leave. */
  restoreConnect: boolean;
  onRestored?: (state: {
    viewer_duo_joined: true;
    viewer_profile_connected: boolean;
  }) => void;
}): void {
  const { opportunityId, sourcePostId, restoreConnect, onRestored } = args;
  if (!opportunityId || !sourcePostId) return;
  const id = profileDisconnectedToastId(opportunityId);
  dismissPairUpJoinToast(sourcePostId);
  dismissSocialActionToast(profileConnectToastId(opportunityId));

  showSocialActionToast({
    id,
    title: italicTitle(peopleUiCopy.profileDisconnectedToast),
    titleCompact: italicTitle(peopleUiCopy.profileDisconnectedToast),
    dismissAction: {
      ariaLabel: peopleUiCopy.profileDisconnectedToastUndoAria,
      icon: <PiArrowCounterClockwise size={15} aria-hidden />,
      onClick: () => {
        void (async () => {
          const revert = setOptimisticPairUpJoinState(sourcePostId, true);
          try {
            await joinPairUp(sourcePostId);
            if (restoreConnect) {
              await expressPairUpInterest(opportunityId);
            }
            onRestored?.({
              viewer_duo_joined: true,
              viewer_profile_connected: restoreConnect,
            });
          } catch {
            revert?.();
            toast.error(peopleUiCopy.joinError);
          }
        })();
      },
    },
  });
}
