/**
 * Scroll the post-detail comments block into view. The composer is `position: fixed`, so
 * scrolling must target in-flow `[data-comments-section]`, not the input.
 */
export const POST_DETAIL_MODAL_SCROLL_ROOT = "[data-post-detail-modal-scroll]";

export function scrollCommentsSectionIntoView(opts: {
  isModal: boolean;
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}): void {
  const {
    isModal,
    behavior = "smooth",
    block = "start",
  } = opts;
  const selector = isModal
    ? `${POST_DETAIL_MODAL_SCROLL_ROOT} [data-comments-section]`
    : "[data-comments-section]";
  document.querySelector(selector)?.scrollIntoView({ behavior, block });
}
