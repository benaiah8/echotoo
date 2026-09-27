import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  buildCreateFinalizeUrl,
  DEFAULT_CREATE_ENTRY_POST_TYPE,
  markCreateFlowResumedLocalDraft,
  markCreateFlowSessionActive,
} from "../lib/draftEntryGate";
import {
  buildFreshCreateLeaveBaseline,
  establishFreshCreateLeaveBaseline,
} from "../lib/createFlowFreshLeaveBaseline";
import {
  cleanupEmptyFreshCreateDraftIfNeeded,
  shouldOfferCreateDraftEntryDialog,
} from "../lib/createFlowLeaveGuard";
import {
  discardAllDrafts,
  ensureDraftPublishPostId,
  isLocalCreateDraftOwnedBy,
  persistDraftCreatePostType,
  prepareFreshOwnedCreateDraft,
  readDraftCreatePostType,
  readDraftPublishPostId,
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
      let resolvedType = type;

      if (resumeDraft) {
        markCreateFlowResumedLocalDraft();
        ensureDraftPublishPostId({
          fresh: false,
          ownerUserId: ownerUserId ?? undefined,
        });
        resolvedType = readDraftCreatePostType() ?? type;
      } else if (ownerUserId) {
        const publishPostId = prepareFreshOwnedCreateDraft(ownerUserId, type);
        resolvedType = type;
        establishFreshCreateLeaveBaseline(
          buildFreshCreateLeaveBaseline({
            publishPostId,
            createPostType: type,
            visibility: "public",
            ratingEnabled: type === "experience",
            rsvpEnabled: false,
          }),
        );
      } else {
        discardAllDrafts();
        ensureDraftPublishPostId({ fresh: true });
        persistDraftCreatePostType(type);
        resolvedType = type;
        establishFreshCreateLeaveBaseline(
          buildFreshCreateLeaveBaseline({
            publishPostId: readDraftPublishPostId(),
            createPostType: type,
            visibility: "public",
            ratingEnabled: type === "experience",
            rsvpEnabled: false,
          }),
        );
      }

      closeChooserOverlay?.();
      window.setTimeout(() => {
        navigate(buildCreateFinalizeUrl(resolvedType, { resumeDraft }));
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
          // Owned scaffolding (publish id / type only) is not a real draft.
          if (!shouldOfferCreateDraftEntryDialog()) {
            cleanupEmptyFreshCreateDraftIfNeeded();
            navigateToCreatePost(type, false, userId);
            return;
          }
          setPendingType(type);
          setGateOpen(true);
          return;
        }
        navigateToCreatePost(type, false, userId);
      });
    },
    [navigateToCreatePost, resolveAuthUserId, runCleanupAndToast]
  );

  /**
   * Main Create (+) / `/create` entry: skip Event/Place chooser, enter as Place
   * (`experience`) while preserving owned-draft resume dialog + leave baseline.
   */
  const enterCreateAsDefaultPost = useCallback(() => {
    onPickerContinue(DEFAULT_CREATE_ENTRY_POST_TYPE);
  }, [onPickerContinue]);

  const onContinueDraft = useCallback(() => {
    if (!pendingType) return;
    const t = readDraftCreatePostType() ?? pendingType;
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

  const onDismissGate = useCallback(() => {
    setGateOpen(false);
    setPendingType(null);
  }, []);

  return {
    onPickerContinue,
    enterCreateAsDefaultPost,
    draftEntryDialogProps: {
      open: gateOpen,
      onDismiss: onDismissGate,
      onContinueDraft,
      onStartNew,
    },
  };
}
