import { useCallback, useEffect, useSyncExternalStore } from "react";
import useAuthActionGate from "./useAuthActionGate";
import {
  openGroupUpCreate,
  openGroupUpManage,
  type GroupUpSourceScheduleContext,
} from "../lib/groupUpActiveOverlayStore";
import {
  getGroupUpOwnStatus,
  isGroupUpOwnStateLoadFailed,
  isGroupUpOwnStateResolving,
  isGroupUpOwnViewerSignedIn,
  requestGroupUpOwnState,
  subscribeGroupUpOwnState,
} from "../lib/groupUpOwnStore";
import {
  getGroupUpDiscoverableCount,
  isGroupUpCountLoadFailed,
  isGroupUpCountViewerSignedIn,
  requestGroupUpCount,
  subscribeGroupUpCount,
} from "../lib/groupUpCountStore";
import { openSourceGroupsOverlay } from "../lib/sourceGroupsOverlayStore";
import { resolveGroupTapAction } from "../lib/social/resolveGroupTapAction";
import { canOfferGroupUp } from "../lib/pairUpEligibility";
import type { FeedItem } from "../api/queries/getPublicFeed";

export function useGroupSocialAction(input: {
  postId: string;
  postType?: "experience" | "hangout" | null;
  post?: FeedItem | null;
  sourceCaption?: string | null;
  sourceSchedule?: GroupUpSourceScheduleContext | null;
}) {
  const { postId, postType, post, sourceCaption, sourceSchedule } = input;

  const eligible = canOfferGroupUp({
    postId,
    postType,
    isRecurring: post?.is_recurring ?? null,
    selectedDates: post?.selected_dates ?? null,
    recurrenceDays: post?.recurrence_days ?? null,
    status: post?.status ?? null,
    visibility: post?.visibility ?? null,
    authorIsPrivate: post?.author?.is_private ?? null,
  });

  const ownStatus = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    getGroupUpOwnStatus(postId)
  );
  const ownResolving = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    isGroupUpOwnStateResolving(postId)
  );
  const ownLoadFailed = useSyncExternalStore(subscribeGroupUpOwnState, () =>
    isGroupUpOwnStateLoadFailed(postId)
  );

  const countSignedIn = useSyncExternalStore(
    subscribeGroupUpCount,
    isGroupUpCountViewerSignedIn
  );
  const count = useSyncExternalStore(subscribeGroupUpCount, () =>
    getGroupUpDiscoverableCount(postId)
  );
  const countLoadFailed = useSyncExternalStore(subscribeGroupUpCount, () =>
    isGroupUpCountLoadFailed(postId)
  );

  const { ensureAuthed } = useAuthActionGate();

  useEffect(() => {
    if (!eligible) return;
    requestGroupUpOwnState(postId);
  }, [eligible, postId]);

  useEffect(() => {
    if (!eligible) return;
    requestGroupUpCount(postId);
  }, [eligible, postId]);

  const ownsActive = ownStatus === "active";
  const discoverableCount = count ?? 0;
  /**
   * resolving = no known own/count yet (skeleton).
   * Known own + known count (incl. 0) stay visible during SWR.
   */
  const ownUnknown = ownStatus === "loading" || ownResolving;
  const countUnknown =
    count === null && !countLoadFailed && countSignedIn;
  const resolving = ownUnknown || countUnknown;

  const onPress = useCallback(() => {
    if (!eligible) return;
    if (!ensureAuthed()) return;
    if (!isGroupUpOwnViewerSignedIn()) return;
    if (ownResolving) return;

    if (ownLoadFailed || ownStatus === "loading") {
      requestGroupUpOwnState(postId);
      return;
    }

    if (count === null && !countLoadFailed) {
      requestGroupUpCount(postId);
      return;
    }
    if (countLoadFailed) {
      requestGroupUpCount(postId);
    }

    const action = resolveGroupTapAction({
      ownsActiveGroup: ownsActive,
      discoverableCount: count ?? 0,
    });

    if (action === "manage") {
      openGroupUpManage(postId, sourceCaption, sourceSchedule);
      return;
    }
    if (action === "overlay") {
      openSourceGroupsOverlay(postId, sourceCaption, sourceSchedule);
      return;
    }
    openGroupUpCreate(postId, sourceCaption, sourceSchedule);
  }, [
    eligible,
    ensureAuthed,
    ownResolving,
    ownLoadFailed,
    ownStatus,
    postId,
    count,
    countLoadFailed,
    ownsActive,
    sourceCaption,
    sourceSchedule,
  ]);

  return {
    visible: eligible,
    ownsActive,
    discoverableCount,
    /** Never show 0 in UI — pass null when count is 0. */
    displayCount: discoverableCount > 0 ? discoverableCount : null,
    resolving,
    onPress,
  };
}
