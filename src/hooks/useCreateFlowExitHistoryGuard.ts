import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { subscribeAndroidHardwareBack } from "../lib/androidPostDetailModalBack";
import { CREATE_FLOW_POST_IMAGE_MERGED_EVENT } from "../lib/createFlowDraftStorage";
import {
  isCreateFinalizeVideoFullscreenOpen,
  tryExitCreateFinalizeVideoFullscreen,
} from "../lib/createFinalizeVideoFullscreen";
import { shouldConfirmCreateFlowLeave, cleanupEmptyFreshCreateDraftIfNeeded } from "../lib/createFlowLeaveGuard";
import {
  computeCreateFlowGuardEngaged,
  resolveCreateFlowBackAction,
} from "../lib/createFlowExitHistoryEngagement";
import {
  consumeCreateFlowIntentionalLeaveBypass,
  CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT,
  dispatchCreateFlowEventToPlaceConfirmDismiss,
  dispatchCreateFlowFinalizeSheetDismiss,
  dispatchCreateFlowLeaveDialogDismiss,
  dispatchCreateFlowLeaveRequest,
  dispatchCreateFlowMediaPickerDismiss,
  dispatchCreateFlowMetadataRemoveConfirmDismiss,
  dispatchCreateFlowPlaceToEventConfirmDismiss,
  isCreateFlowEventToPlaceConfirmOpen,
  isCreateFlowFinalizeSheetOpen,
  isCreateFlowLeaveDialogOpen,
  isCreateFlowMediaPickerOpen,
  isCreateFlowMetadataRemoveConfirmOpen,
  isCreateFlowPlaceToEventConfirmOpen,
  setCreateFlowIntentionalLeaveBypass,
} from "../lib/createFlowLeaveRequest";

export const CREATE_FLOW_EXIT_HISTORY_MARKER = "createFlowExitGuard";

type BackActionSource = "popstate" | "android";

function repushCreateFlowGuardMarker(): void {
  window.history.pushState(
    { [CREATE_FLOW_EXIT_HISTORY_MARKER]: true } as Record<string, boolean>,
    "",
    window.location.href,
  );
}

function popCreateFlowGuardMarker(skipPopstateRef: { current: boolean }): void {
  const st = window.history.state as Record<string, boolean> | null;
  if (st?.[CREATE_FLOW_EXIT_HISTORY_MARKER]) {
    skipPopstateRef.current = true;
    window.history.back();
  }
}

/**
 * Browser / iOS swipe-back + Android hardware back for `/create/*`.
 * Uses the same synthetic-history pattern as invite overlays and Home search.
 *
 * PASS B1: content edits sync engagement only — they do not rebuild history.
 */
export function useCreateFlowExitHistoryGuard(): void {
  const { pathname } = useLocation();
  const skipPopstateRef = useRef(false);
  const pushedRef = useRef(false);
  const inCreate = pathname.startsWith("/create");

  const [guardEngaged, setGuardEngaged] = useState(() =>
    computeCreateFlowGuardEngaged(
      inCreate,
      shouldConfirmCreateFlowLeave(),
    ),
  );

  const completeHistoryLeaveRef = useRef<() => void>(() => {});

  completeHistoryLeaveRef.current = () => {
    setCreateFlowIntentionalLeaveBypass(true);
    const st = window.history.state as Record<string, boolean> | null;
    if (st?.[CREATE_FLOW_EXIT_HISTORY_MARKER]) {
      skipPopstateRef.current = true;
      window.history.back();
      window.requestAnimationFrame(() => {
        skipPopstateRef.current = true;
        window.history.back();
      });
      return;
    }
    window.history.back();
  };

  /** Re-read local draft state on edits; does not touch browser history. */
  useEffect(() => {
    if (!inCreate) {
      setGuardEngaged(false);
      return;
    }

    const syncEngagement = () => {
      const nextEngaged = computeCreateFlowGuardEngaged(
        true,
        shouldConfirmCreateFlowLeave(),
      );
      setGuardEngaged((prev) => (prev === nextEngaged ? prev : nextEngaged));
    };

    syncEngagement();
    window.addEventListener(
      CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT,
      syncEngagement,
    );
    window.addEventListener(
      CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
      syncEngagement,
    );
    return () => {
      window.removeEventListener(
        CREATE_FLOW_DRAFT_CONTENT_CHANGED_EVENT,
        syncEngagement,
      );
      window.removeEventListener(
        CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
        syncEngagement,
      );
    };
  }, [inCreate]);

  const handleCreateFlowBackAction = useCallback((source: BackActionSource) => {
    const st = window.history.state as Record<string, boolean> | null;
    const plan = resolveCreateFlowBackAction({
      skipPopstate: skipPopstateRef.current,
      videoFullscreenOpen: isCreateFinalizeVideoFullscreenOpen(),
      metadataRemoveConfirmOpen: isCreateFlowMetadataRemoveConfirmOpen(),
      placeToEventConfirmOpen: isCreateFlowPlaceToEventConfirmOpen(),
      eventToPlaceConfirmOpen: isCreateFlowEventToPlaceConfirmOpen(),
      finalizeSheetOpen: isCreateFlowFinalizeSheetOpen(),
      leaveDialogOpen: isCreateFlowLeaveDialogOpen(),
      mediaPickerOpen: isCreateFlowMediaPickerOpen(),
      shouldConfirmLeave: shouldConfirmCreateFlowLeave(),
      source,
      historyStateHasMarker: Boolean(st?.[CREATE_FLOW_EXIT_HISTORY_MARKER]),
    });

    if (plan.kind === "noop-skip-popstate") {
      skipPopstateRef.current = false;
      return;
    }

    if (consumeCreateFlowIntentionalLeaveBypass()) {
      return;
    }

    const restoreMarker = (shouldRestore: boolean) => {
      if (shouldRestore) {
        repushCreateFlowGuardMarker();
        pushedRef.current = true;
      }
    };

    switch (plan.kind) {
      case "exit-video-fullscreen":
        void tryExitCreateFinalizeVideoFullscreen();
        restoreMarker(plan.restoreMarker);
        return;
      case "dismiss-metadata-remove":
        dispatchCreateFlowMetadataRemoveConfirmDismiss();
        restoreMarker(plan.restoreMarker);
        return;
      case "dismiss-place-to-event":
        dispatchCreateFlowPlaceToEventConfirmDismiss();
        restoreMarker(plan.restoreMarker);
        return;
      case "dismiss-event-to-place":
        dispatchCreateFlowEventToPlaceConfirmDismiss();
        restoreMarker(plan.restoreMarker);
        return;
      case "dismiss-finalize-sheet":
        dispatchCreateFlowFinalizeSheetDismiss();
        restoreMarker(plan.restoreMarker);
        return;
      case "dismiss-leave-dialog":
        dispatchCreateFlowLeaveDialogDismiss();
        restoreMarker(plan.restoreMarker);
        return;
      case "dismiss-media-picker":
        dispatchCreateFlowMediaPickerDismiss();
        restoreMarker(plan.restoreMarker);
        return;
      case "exit-without-confirm":
        cleanupEmptyFreshCreateDraftIfNeeded();
        pushedRef.current = false;
        window.history.back();
        return;
      case "request-leave":
        if (plan.androidPopMarkerFirst) {
          skipPopstateRef.current = true;
          window.history.back();
        }
        dispatchCreateFlowLeaveRequest(() => {
          completeHistoryLeaveRef.current();
        });
        repushCreateFlowGuardMarker();
        pushedRef.current = true;
        return;
      default:
        return;
    }
  }, []);

  const handlePopState = useCallback(() => {
    handleCreateFlowBackAction("popstate");
  }, [handleCreateFlowBackAction]);

  const handleAndroidBackRef = useRef(handleCreateFlowBackAction);
  handleAndroidBackRef.current = handleCreateFlowBackAction;

  useEffect(() => {
    if (!inCreate) return;
    return subscribeAndroidHardwareBack(() => {
      handleAndroidBackRef.current("android");
    });
  }, [inCreate]);

  const guardActive = inCreate && guardEngaged;

  useEffect(() => {
    if (!guardActive) {
      return () => {
        if (typeof window === "undefined" || !pushedRef.current) {
          pushedRef.current = false;
          return;
        }

        if (consumeCreateFlowIntentionalLeaveBypass()) {
          pushedRef.current = false;
          return;
        }

        popCreateFlowGuardMarker(skipPopstateRef);
        pushedRef.current = false;
      };
    }

    if (typeof window !== "undefined" && !pushedRef.current) {
      repushCreateFlowGuardMarker();
      pushedRef.current = true;
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [guardActive, handlePopState]);
}
