/**
 * Tall-video-aware IntersectionObserver ratio (PV3.4).
 * When the media element is taller than the viewport, filling the available
 * viewport height counts as fully visible.
 */

export function computeEffectiveIntersectionRatio(
  entry: Pick<
    IntersectionObserverEntry,
    "intersectionRect" | "boundingClientRect" | "rootBounds"
  >,
): number {
  const visibleH = entry.intersectionRect?.height ?? 0;
  const boundH = entry.boundingClientRect?.height ?? 0;
  const rootH =
    entry.rootBounds?.height ??
    (typeof window !== "undefined" ? window.innerHeight : 0);
  const maxVisible = Math.min(
    Math.max(0, boundH),
    Math.max(0, rootH) || Math.max(0, boundH),
  );
  if (maxVisible <= 0) return 0;
  return Math.max(0, Math.min(1, visibleH / maxVisible));
}
