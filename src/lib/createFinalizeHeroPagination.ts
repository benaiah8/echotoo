export function shouldShowCreateHeroPagination(mediaCount: number): boolean {
  return mediaCount > 1;
}

export function createHeroPaginationDotCount(mediaCount: number): number {
  return shouldShowCreateHeroPagination(mediaCount) ? mediaCount : 0;
}

export function clampCreateHeroPaginationIndex(
  activeIndex: number,
  mediaCount: number,
): number {
  if (mediaCount <= 0) return 0;
  return Math.max(0, Math.min(mediaCount - 1, activeIndex));
}
