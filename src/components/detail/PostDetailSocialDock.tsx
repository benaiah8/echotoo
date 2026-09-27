import { useEffect, useState } from "react";
import SocialActionCluster from "../social/SocialActionCluster";
import type { FeedItem } from "../../api/queries/getPublicFeed";
import type { GroupUpSourceScheduleContext } from "../../lib/groupUpActiveOverlayStore";
import {
  canOfferGroupUp,
  canOfferOpenPlan,
  canOfferPairUp,
} from "../../lib/pairUpEligibility";
import { MODAL_COMPOSER_PILL_BOTTOM_GAP_PX } from "../../hooks/usePostDetailCommentLayout";
import { usePostDetailDismiss } from "../../context/PostDetailDismissContext";
import { isAndroid } from "../../lib/storage/utils/capacitorDetection";
import { socialDockPlateClassName } from "../../lib/socialActionUi";
import {
  POST_DETAIL_GLASS_PILL_MAX_WIDTH_PX,
  POST_DETAIL_GLASS_PILL_WIDTH_CLASS,
} from "../../lib/postDetailGlassUi";

/**
 * Floating Duo/Group dock above the comment composer.
 * Modal: same width/gutter rail as FloatingCommentInput glass pill → right edges align.
 * Full-page: matches composer `px-4` content gutter.
 * Plate uses page `--bg` (no border / gray glass).
 */
export default function PostDetailSocialDock({
  postId,
  postType,
  post,
  isModal = false,
  modalComposerLayer = "viewport-fixed",
}: {
  postId: string;
  postType?: "experience" | "hangout" | null;
  post?: FeedItem | null;
  isModal?: boolean;
  modalComposerLayer?: "viewport-fixed" | "layer-absolute";
}) {
  const postDetailDismiss = usePostDetailDismiss();
  const modalKeyboardInsetPx = postDetailDismiss?.modalKeyboardInsetPx ?? 0;
  const [btHeight, setBtHeight] = useState(0);

  useEffect(() => {
    if (isModal) return;
    const el = document.getElementById("bottom-tab");
    const measure = () =>
      setBtHeight(el ? Math.round(el.getBoundingClientRect().height) : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isModal]);

  const duoOrGroup =
    canOfferPairUp({
      postId,
      postType,
      isRecurring: post?.is_recurring ?? null,
      selectedDates: post?.selected_dates ?? null,
      recurrenceDays: post?.recurrence_days ?? null,
      status: post?.status ?? null,
      visibility: post?.visibility ?? null,
      authorIsPrivate: post?.author?.is_private ?? null,
    }) ||
    canOfferOpenPlan({
      postId,
      postType,
      status: post?.status ?? null,
      visibility: post?.visibility ?? null,
      authorIsPrivate: post?.author?.is_private ?? null,
    }) ||
    canOfferGroupUp({
      postId,
      postType,
      isRecurring: post?.is_recurring ?? null,
      selectedDates: post?.selected_dates ?? null,
      recurrenceDays: post?.recurrence_days ?? null,
      status: post?.status ?? null,
      visibility: post?.visibility ?? null,
      authorIsPrivate: post?.author?.is_private ?? null,
    });

  if (!duoOrGroup) return null;

  const sourceCaption = post?.caption?.trim() || null;
  const sourceSchedule: GroupUpSourceScheduleContext | null =
    postType === "hangout" || postType === "experience"
      ? {
          postType,
          isRecurring: post?.is_recurring ?? null,
          selectedDates: post?.selected_dates ?? null,
          recurrenceDays: post?.recurrence_days ?? null,
        }
      : null;

  const liftForBottomChrome = isAndroid()
    ? 0
    : Math.max(0, Math.round(modalKeyboardInsetPx));
  const keyboardOpen = modalKeyboardInsetPx >= 48;
  const safeAreaBottom = keyboardOpen
    ? "0px"
    : "var(--safe-area-bottom-layout)";

  const composerStackPx = isModal
    ? 56 + MODAL_COMPOSER_PILL_BOTTOM_GAP_PX + 4
    : 64 + 4;

  const edgePositionClass =
    isModal && modalComposerLayer === "layer-absolute"
      ? "absolute left-0 right-0"
      : "fixed left-0 right-0";

  const bottomStyle = isModal
    ? `calc(${composerStackPx}px + ${safeAreaBottom} + ${liftForBottomChrome}px)`
    : `calc(${composerStackPx}px + ${btHeight}px)`;

  const cluster = (
    <SocialActionCluster
      postId={postId}
      postType={postType}
      post={post ?? undefined}
      sourceCaption={sourceCaption}
      sourceSchedule={sourceSchedule}
      variant="detailDock"
      className={socialDockPlateClassName()}
    />
  );

  if (isModal) {
    return (
      <div
        className={`pointer-events-none ${edgePositionClass} z-[29] flex flex-col items-center px-2`}
        style={{ bottom: bottomStyle }}
        data-post-detail-social-dock
      >
        <div
          className={`pointer-events-none flex min-w-0 justify-end ${POST_DETAIL_GLASS_PILL_WIDTH_CLASS}`}
          style={{ maxWidth: POST_DETAIL_GLASS_PILL_MAX_WIDTH_PX }}
        >
          <div className="pointer-events-auto">{cluster}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none ${edgePositionClass} z-[29] flex justify-end px-4`}
      style={{ bottom: bottomStyle }}
      data-post-detail-social-dock
    >
      <div className="pointer-events-auto">{cluster}</div>
    </div>
  );
}
