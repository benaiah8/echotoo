import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import useAuthActionGate from "./useAuthActionGate";
import { joinPairUp } from "../api/services/pairUp";
import { openPairUpManage } from "../lib/pairUpActiveOverlayStore";
import {
  getPairUpJoinStatus,
  isPairUpJoinStateLoadFailed,
  isPairUpJoinStateResolving,
  requestPairUpJoinState,
  setOptimisticPairUpJoinState,
  subscribePairUpJoinState,
} from "../lib/pairUpJoinStore";
import {
  openOpenPlanCreate,
  openOpenPlanManage,
} from "../lib/openPlanActiveOverlayStore";
import {
  getOpenPlanOwnStatus,
  isOpenPlanOwnStateLoadFailed,
  isOpenPlanOwnStateResolving,
  isOpenPlanOwnViewerSignedIn,
  requestOpenPlanOwnState,
  subscribeOpenPlanOwnState,
} from "../lib/openPlanOwnStore";
import { resolvePhotoPromptOffer } from "../lib/peoplePhotoPromptPolicy";
import {
  isPairUpPhotoPromptOpen,
  openPairUpPhotoPrompt,
  subscribePairUpPhotoPrompt,
} from "../lib/pairUpPhotoPromptStore";
import { showPairUpJoinToast } from "../lib/showPairUpJoinToast";
import { canOfferOpenPlan, canOfferPairUp } from "../lib/pairUpEligibility";
import {
  buildDuoJoinDebugSnapshot,
  emitDuoJoinDebugLog,
  isDuoJoinDebugEnabled,
  sanitizeDuoJoinDebugError,
  type DuoJoinDebugOrigin,
} from "../lib/duoJoinDebug";
import { peopleUiCopy } from "../pages/people/peopleUiCopy";
import type { RootState } from "../app/store";
import type { FeedItem } from "../api/queries/getPublicFeed";

/**
 * Duo = Event Pair Up one-tap activate, or Place Open Plan sheet.
 * Label stays "Duo"; Place scheduling UX unchanged in Phase 1.
 */
export function useDuoSocialAction(input: {
  postId: string;
  postType?: "experience" | "hangout" | null;
  post?: FeedItem | null;
  /** Feed / Post Detail surface for opt-in Duo join diagnostics. */
  origin?: DuoJoinDebugOrigin;
}) {
  const { postId, postType, post, origin = "unavailable" } = input;
  const pairEligible = canOfferPairUp({
    postId,
    postType,
    isRecurring: post?.is_recurring ?? null,
    selectedDates: post?.selected_dates ?? null,
    recurrenceDays: post?.recurrence_days ?? null,
    status: post?.status ?? null,
    visibility: post?.visibility ?? null,
    authorIsPrivate: post?.author?.is_private ?? null,
  });
  const openPlanEligible = canOfferOpenPlan({
    postId,
    postType,
    status: post?.status ?? null,
    visibility: post?.visibility ?? null,
    authorIsPrivate: post?.author?.is_private ?? null,
  });

  const mode: "pair" | "open_plan" | null = pairEligible
    ? "pair"
    : openPlanEligible
      ? "open_plan"
      : null;

  const pairStatus = useSyncExternalStore(subscribePairUpJoinState, () =>
    getPairUpJoinStatus(postId)
  );
  const pairResolving = useSyncExternalStore(subscribePairUpJoinState, () =>
    isPairUpJoinStateResolving(postId)
  );
  const pairLoadFailed = useSyncExternalStore(subscribePairUpJoinState, () =>
    isPairUpJoinStateLoadFailed(postId)
  );
  const photoPromptOpen = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    isPairUpPhotoPromptOpen
  );

  const openPlanStatus = useSyncExternalStore(subscribeOpenPlanOwnState, () =>
    getOpenPlanOwnStatus(postId)
  );
  const openPlanResolving = useSyncExternalStore(
    subscribeOpenPlanOwnState,
    () => isOpenPlanOwnStateResolving(postId)
  );
  const openPlanLoadFailed = useSyncExternalStore(
    subscribeOpenPlanOwnState,
    () => isOpenPlanOwnStateLoadFailed(postId)
  );

  const authUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null
  );
  const [busy, setBusy] = useState(false);
  const { ensureAuthed } = useAuthActionGate();

  useEffect(() => {
    if (mode !== "pair") return;
    requestPairUpJoinState(postId);
  }, [mode, postId]);

  useEffect(() => {
    if (mode !== "open_plan") return;
    requestOpenPlanOwnState(postId);
  }, [mode, postId]);

  useEffect(() => {
    setBusy(false);
  }, [postId]);

  const active =
    mode === "pair"
      ? pairStatus === "joined"
      : mode === "open_plan"
        ? openPlanStatus === "active"
        : false;

  /**
   * resolving = no known value yet (skeleton).
   * Known + SWR / busy / photo prompt must NOT flip to skeleton.
   */
  const resolving =
    mode === "pair"
      ? pairStatus === "pending" || pairResolving
      : mode === "open_plan"
        ? openPlanStatus === "loading" || openPlanResolving
        : false;

  const proceedJoin = useCallback(
    async (targetPostId: string): Promise<boolean> => {
      const debugOn = isDuoJoinDebugEnabled();
      let debugSnapshot: ReturnType<typeof buildDuoJoinDebugSnapshot> | null =
        null;
      if (debugOn) {
        try {
          debugSnapshot = buildDuoJoinDebugSnapshot({
            postId: targetPostId,
            origin,
            postType,
            post: post ?? null,
            postProvided: post !== undefined,
            pairStatus,
          });
        } catch {
          debugSnapshot = null;
        }
      }

      setBusy(true);
      const revert = setOptimisticPairUpJoinState(targetPostId, true);
      try {
        await joinPairUp(targetPostId);
        if (debugSnapshot) {
          emitDuoJoinDebugLog(debugSnapshot, { outcome: "success" });
        }
        showPairUpJoinToast(targetPostId);
        return true;
      } catch (err) {
        if (debugSnapshot) {
          emitDuoJoinDebugLog(debugSnapshot, sanitizeDuoJoinDebugError(err));
        }
        revert?.();
        toast.error(peopleUiCopy.joinError);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [origin, postType, post, pairStatus]
  );

  const maybeOpenPostJoinPhotoPrompt = useCallback(
    (userId: string, targetPostId: string) => {
      try {
        const profile = resolvePhotoPromptOffer(userId, "pair_up_join", false);
        if (!profile) return;
        openPairUpPhotoPrompt({
          intentKey: `join-done:${targetPostId}`,
          profileId: profile.profileId,
          userId: profile.userId,
          photos: profile.photos,
          onContinue: () => {},
        });
      } catch {
        /* optional enrichment */
      }
    },
    []
  );

  const onPress = useCallback(async () => {
    if (!mode) return;
    if (!ensureAuthed()) return;

    if (mode === "pair") {
      /**
       * Active Duo → manage by source_post_id first.
       * Snapshot/optimistic stubs are enough; do not wait for hydrated opportunity
       * or block behind photo-prompt / SWR / busy (those only gate join).
       */
      if (pairStatus === "joined") {
        openPairUpManage(postId);
        return;
      }
      if (busy || pairResolving || photoPromptOpen) return;
      if (pairLoadFailed || pairStatus === "pending") {
        requestPairUpJoinState(postId);
        return;
      }
      const userId = authUserId;
      if (!userId) return;
      const ok = await proceedJoin(postId);
      if (!ok) return;
      void maybeOpenPostJoinPhotoPrompt(userId, postId);
      return;
    }

    if (!isOpenPlanOwnViewerSignedIn()) return;
    if (openPlanResolving) return;
    if (openPlanLoadFailed || openPlanStatus === "loading") {
      requestOpenPlanOwnState(postId);
      return;
    }
    if (openPlanStatus === "active") {
      openOpenPlanManage(postId);
      return;
    }
    openOpenPlanCreate(postId);
  }, [
    mode,
    ensureAuthed,
    busy,
    pairResolving,
    photoPromptOpen,
    pairLoadFailed,
    pairStatus,
    postId,
    authUserId,
    proceedJoin,
    maybeOpenPostJoinPhotoPrompt,
    openPlanResolving,
    openPlanLoadFailed,
    openPlanStatus,
  ]);

  return {
    visible: mode != null,
    mode,
    active,
    resolving,
    onPress,
  };
}
