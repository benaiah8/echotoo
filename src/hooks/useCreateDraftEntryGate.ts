import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  buildCreateFinalizeUrl,
  markCreateFlowResumedLocalDraft,
  markCreateFlowSessionActive,
} from "../lib/draftEntryGate";
import {
  discardAllDrafts,
  ensureDraftPublishPostId,
  isLocalCreateDraftOwnedBy,
  prepareFreshOwnedCreateDraft,
  runCreateEntryDraftCleanup,
} from "../lib/drafts";
import { supabase } from "../lib/supabaseClient";

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
  const authUserIdFromRedux = useSelector(
    (s: { auth?: { user?: { id?: string } } }) => s.auth?.user?.id
  );

  const resolveAuthUserId = useCallback(async (): Promise<string | null> => {
    if (authUserIdFromRedux) return authUserIdFromRedux;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }, [authUserIdFromRedux]);

  const runCleanupAndToast = useCallback(() => {
    if (runCreateEntryDraftCleanup()) {
      toast(EXPIRED_DRAFT_TOAST, { duration: 2500 });
    }
  }, []);

  const navigateToCreatePost = useCallback(
    (
      type: PickerType,
      resumeDraft: boolean,
      ownerUserId: string | null | undefined
    ) => {
      markCreateFlowSessionActive();
      if (resumeDraft) {
        markCreateFlowResumedLocalDraft();
        ensureDraftPublishPostId({ fresh: false });
      } else if (ownerUserId) {
        prepareFreshOwnedCreateDraft(ownerUserId);
      } else {
        ensureDraftPublishPostId({ fresh: true });
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
      void resolveAuthUserId().then((userId) => {
        if (userId && isLocalCreateDraftOwnedBy(userId)) {
          setPendingType(type);
          setGateOpen(true);
          return;
        }
        navigateToCreatePost(type, false, userId);
      });
    },
    [navigateToCreatePost, resolveAuthUserId, runCleanupAndToast]
  );

  const onContinueDraft = useCallback(() => {
    if (!pendingType) return;
    const t = pendingType;
    void resolveAuthUserId().then((userId) => {
      if (!userId || !isLocalCreateDraftOwnedBy(userId)) {
        setGateOpen(false);
        setPendingType(null);
        return;
      }
      setGateOpen(false);
      setPendingType(null);
      navigateToCreatePost(t, true, userId);
    });
  }, [navigateToCreatePost, pendingType, resolveAuthUserId]);

  const onStartNew = useCallback(() => {
    if (!pendingType) return;
    const t = pendingType;
    void resolveAuthUserId().then((userId) => {
      setGateOpen(false);
      setPendingType(null);
      navigateToCreatePost(t, false, userId);
    });
  }, [navigateToCreatePost, pendingType, resolveAuthUserId]);

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
