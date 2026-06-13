/**
 * Post-detail comment scroll helpers.
 *
 * Modal: scroll targets live inside `[data-post-detail-modal-scroll]`. When the composer is
 * portaled to `[data-post-detail-modal-composer-host]`, it sits outside that scroll subtree;
 * these helpers adjust in-flow scroll only (never the portaled composer layer).
 *
 * Uses modal scroll-root geometry + measured composer band / padding reserve — not window metrics.
 */

import { MODAL_COMPOSER_SCROLL_RESERVE_FALLBACK_PX } from "../hooks/usePostDetailCommentLayout";

export const POST_DETAIL_MODAL_SCROLL_ROOT = "[data-post-detail-modal-scroll]";

/** `data-comment-id` is set on each {@link Comment} root (see Comment.tsx). */
export const COMMENT_ROW_ATTR = "data-comment-id";

/** Gap between generic scroll target bottom and composer reserve band. */
const MODAL_SCROLL_TARGET_GAP_PX = 12;

/** Target gap between replied-to row bottom and composer band top (12–20px band). */
export const MODAL_REPLY_ROW_ABOVE_COMPOSER_GAP_PX = 16;

/** Staged reply positioning delays after Reply tap / keyboard settle (ms). */
export const STAGED_REPLY_SCROLL_DELAYS_MS = [0, 120, 300, 600] as const;

function getModalScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(
    POST_DETAIL_MODAL_SCROLL_ROOT
  ) as HTMLElement | null;
}

/** Read composer reserve from scroll-root padding-bottom; fallback matches layout hook base. */
export function getModalComposerReservePx(
  scrollRoot?: HTMLElement | null
): number {
  const root = scrollRoot ?? getModalScrollRoot();
  if (!root) return MODAL_COMPOSER_SCROLL_RESERVE_FALLBACK_PX;
  const pb = parseFloat(getComputedStyle(root).paddingBottom || "0");
  return Number.isFinite(pb) && pb > 0
    ? pb
    : MODAL_COMPOSER_SCROLL_RESERVE_FALLBACK_PX;
}

/** Measured composer pill/input top edge in viewport coords (tracks keyboard lift). */
function getModalComposerBandTopY(): number | null {
  if (typeof document === "undefined") return null;
  const input = document.querySelector(
    '[data-post-detail-modal-composer-host] input[type="text"]'
  ) as HTMLElement | null;
  if (!input) return null;
  const pill = input.closest(".pointer-events-auto") as HTMLElement | null;
  return (pill ?? input).getBoundingClientRect().top;
}

function clampScrollTop(scrollRoot: HTMLElement, nextTop: number): number {
  const maxScroll = Math.max(
    0,
    scrollRoot.scrollHeight - scrollRoot.clientHeight
  );
  return Math.max(0, Math.min(maxScroll, nextTop));
}

function scrollElementWithinModalRoot(
  scrollRoot: HTMLElement,
  target: HTMLElement,
  opts?: { behavior?: ScrollBehavior }
): void {
  const reserve = getModalComposerReservePx(scrollRoot);
  const rootRect = scrollRoot.getBoundingClientRect();
  const visibleBottom = rootRect.bottom - reserve;
  const targetRect = target.getBoundingClientRect();
  const gap = MODAL_SCROLL_TARGET_GAP_PX;

  let delta = 0;
  if (targetRect.bottom > visibleBottom - gap) {
    delta = targetRect.bottom - (visibleBottom - gap);
  } else if (targetRect.top < rootRect.top + gap) {
    delta = targetRect.top - (rootRect.top + gap);
  }

  if (Math.abs(delta) < 2) return;

  const nextTop = clampScrollTop(scrollRoot, scrollRoot.scrollTop + delta);
  if (Math.abs(nextTop - scrollRoot.scrollTop) < 2) return;

  scrollRoot.scrollTo({
    top: nextTop,
    behavior: opts?.behavior ?? "smooth",
  });
}

/**
 * Position a reply row so its bottom sits just above the composer band with a small gap.
 */
function scrollReplyRowAboveComposerBand(
  scrollRoot: HTMLElement,
  row: HTMLElement,
  opts?: { behavior?: ScrollBehavior }
): void {
  const rootRect = scrollRoot.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const gap = MODAL_REPLY_ROW_ABOVE_COMPOSER_GAP_PX;

  const composerTop = getModalComposerBandTopY();
  const targetRowBottomY =
    composerTop != null
      ? composerTop - gap
      : rootRect.bottom - getModalComposerReservePx(scrollRoot) - gap;

  let delta = 0;
  if (rowRect.bottom > targetRowBottomY) {
    delta = rowRect.bottom - targetRowBottomY;
  } else if (rowRect.top < rootRect.top + gap) {
    delta = rowRect.top - (rootRect.top + gap);
  }

  if (Math.abs(delta) < 2) return;

  const nextTop = clampScrollTop(scrollRoot, scrollRoot.scrollTop + delta);
  if (Math.abs(nextTop - scrollRoot.scrollTop) < 2) return;

  scrollRoot.scrollTo({
    top: nextTop,
    behavior: opts?.behavior ?? "auto",
  });
}

export function scrollCommentsSectionIntoView(opts: {
  isModal: boolean;
  behavior?: ScrollBehavior;
  /** Default: "nearest" (modal + non-modal) to avoid block:start yanking the whole section. */
  block?: ScrollLogicalPosition;
}): void {
  const { isModal, behavior = "smooth", block = "nearest" } = opts;
  if (isModal) {
    scrollModalCommentsContentAboveComposer({ behavior });
    return;
  }
  const target = document.querySelector(
    "[data-comments-section]"
  ) as HTMLElement | null;
  target?.scrollIntoView({ behavior, block });
}

/**
 * Scroll comments content (list, skeleton, or empty state) above the portaled composer band.
 */
export function scrollModalCommentsContentAboveComposer(opts?: {
  behavior?: ScrollBehavior;
}): void {
  const scrollRoot = getModalScrollRoot();
  if (!scrollRoot) return;

  const content = scrollRoot.querySelector(
    "[data-comments-section]"
  ) as HTMLElement | null;
  if (!content) return;

  scrollElementWithinModalRoot(scrollRoot, content, opts);
}

function escapeCommentId(commentId: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(commentId)
    : commentId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Scroll the replied-to comment row just above the composer band (modal manual scrollTop math).
 */
export function scrollModalReplyTargetIntoView(
  commentId: string,
  opts?: { behavior?: ScrollBehavior }
): void {
  const scrollRoot = getModalScrollRoot();
  if (!scrollRoot) return;

  const selector = `[${COMMENT_ROW_ATTR}="${escapeCommentId(commentId)}"]`;
  const row = scrollRoot.querySelector(selector) as HTMLElement | null;

  if (row) {
    scrollReplyRowAboveComposerBand(scrollRoot, row, opts);
  } else {
    scrollModalCommentsContentAboveComposer(opts);
  }
}

/**
 * True when the reply row is clipped by the composer band or scroll-root top edge.
 */
export function modalReplyRowNeedsKeyboardScroll(commentId: string): boolean {
  const scrollRoot = getModalScrollRoot();
  if (!scrollRoot) return false;

  const row = scrollRoot.querySelector(
    `[${COMMENT_ROW_ATTR}="${escapeCommentId(commentId)}"]`
  ) as HTMLElement | null;
  if (!row) return false;

  const rootRect = scrollRoot.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const gap = MODAL_REPLY_ROW_ABOVE_COMPOSER_GAP_PX;

  const composerTop = getModalComposerBandTopY();
  const targetRowBottomY =
    composerTop != null
      ? composerTop - gap
      : rootRect.bottom - getModalComposerReservePx(scrollRoot) - gap;

  if (rowRect.bottom > targetRowBottomY + 2) return true;
  if (rowRect.top < rootRect.top + gap) return true;
  return false;
}

export type StagedReplyScrollHandle = { cancel: () => void };

/**
 * Run reply positioning at rAF + fixed delays while keyboard/layout settles.
 * Each call is idempotent — only scrolls when the row is out of position.
 */
export function scheduleStagedModalReplyTargetScroll(
  commentId: string,
  opts?: {
    isActive?: () => boolean;
    behavior?: ScrollBehavior;
  }
): StagedReplyScrollHandle {
  const behavior = opts?.behavior ?? "auto";
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];
  let rafId = 0;

  const run = () => {
    if (opts?.isActive && !opts.isActive()) return;
    if (!getModalScrollRoot()) return;
    scrollModalReplyTargetIntoView(commentId, { behavior });
  };

  rafId = requestAnimationFrame(run);

  for (const delay of STAGED_REPLY_SCROLL_DELAYS_MS) {
    if (delay === 0) continue;
    timeoutIds.push(setTimeout(run, delay));
  }

  return {
    cancel: () => {
      cancelAnimationFrame(rafId);
      timeoutIds.forEach(clearTimeout);
    },
  };
}
