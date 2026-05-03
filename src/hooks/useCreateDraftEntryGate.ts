import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  buildCreateFinalizeUrl,
  markCreateFlowResumedLocalDraft,
  markCreateFlowSessionActive,
} from "../lib/draftEntryGate";
import {
  discardAllDrafts,
  hasAnyDraftData,
  runCreateEntryDraftCleanup,
} from "../lib/drafts";

const EXPIRED_DRAFT_TOAST = "Draft expired; starting fresh.";

type PickerType = "hangout" | "experience";

type UseCreateDraftEntryGateOptions = {
  /**
   * Called before navigating away after Continue or Start new (e.g. close bottom-tab overlay).
   * Omit on full-page /create — there is no overlay to close.
   */
  closeChooserOverlay?: () => void;
  navDelayMs?: number;
};

/**
 * Create-only entry gate: TTL cleanup, optional draft chooser, then navigate to Create post (finalize).
 * Edit mode must never use this hook.
 */
export function useCreateDraftEntryGate(
  options: UseCreateDraftEntryGateOptions = {}
) {
  const { closeChooserOverlay, navDelayMs = 280 } = options;
  const navigate = useNavigate();
  const [gateOpen, setGateOpen] = useState(false);
  const [pendingType, setPendingType] = useState<PickerType | null>(null);

  const runCleanupAndToast = useCallback(() => {
    if (runCreateEntryDraftCleanup()) {
      toast(EXPIRED_DRAFT_TOAST, { duration: 2500 });
    }
  }, []);

  const navigateToCreatePost = useCallback(
    (type: PickerType, resumeDraft: boolean) => {
      markCreateFlowSessionActive();
      if (resumeDraft) {
        markCreateFlowResumedLocalDraft();
      }
      closeChooserOverlay?.();
      window.setTimeout(() => {
        navigate(buildCreateFinalizeUrl(type, { resumeDraft }));
      }, navDelayMs);
    },
    [closeChooserOverlay, navigate, navDelayMs]
  );

  /** User picked Hangout / Experience on the chooser. */
  const onPickerContinue = useCallback(
    (type: PickerType) => {
      runCleanupAndToast();
      if (!hasAnyDraftData()) {
        navigateToCreatePost(type, false);
        return;
      }
      setPendingType(type);
      setGateOpen(true);
    },
    [navigateToCreatePost, runCleanupAndToast]
  );

  const onContinueDraft = useCallback(() => {
    if (!pendingType) return;
    const t = pendingType;
    setGateOpen(false);
    setPendingType(null);
    navigateToCreatePost(t, true);
  }, [navigateToCreatePost, pendingType]);

  const onStartNew = useCallback(() => {
    if (!pendingType) return;
    const t = pendingType;
    discardAllDrafts();
    setGateOpen(false);
    setPendingType(null);
    navigateToCreatePost(t, false);
  }, [navigateToCreatePost, pendingType]);

  const onDeleteDraft = useCallback(() => {
    discardAllDrafts();
    setGateOpen(false);
    setPendingType(null);
  }, []);

  const onDismissGate = useCallback(() => {
    setGateOpen(false);
    setPendingType(null);
  }, []);

  return {
    onPickerContinue,
    draftEntryDialogProps: {
      open: gateOpen,
      onDismiss: onDismissGate,
      onContinueDraft,
      onStartNew,
      onDeleteDraft,
    },
  };
}
