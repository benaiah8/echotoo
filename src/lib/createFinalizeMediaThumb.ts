/** Fraction of dock inner width used by strip thumbnails (`w-[28%]`). */
export const FINALIZE_MEDIA_THUMB_WIDTH_FRACTION = 0.28;

/**
 * Finalize media strip thumbnail shell — inset rings stay inside bounds (no clip).
 */
export const FINALIZE_MEDIA_THUMB_SIZE =
  "relative aspect-square w-[28%] min-w-[28%] shrink-0 rounded-[10px]";

export const FINALIZE_MEDIA_THUMB_CLIP =
  "absolute inset-0 overflow-hidden rounded-[10px]";

export function finalizeMediaThumbShellClass(options: {
  isSelected: boolean;
  isCover?: boolean;
  isError?: boolean;
  isDragging?: boolean;
}): string {
  return [
    FINALIZE_MEDIA_THUMB_SIZE,
    "bg-[var(--surface)]/40",
    options.isCover
      ? "ring-2 ring-inset ring-[color-mix(in_oklab,var(--brand)_40%,var(--border))]"
      : "ring-1 ring-inset ring-[var(--border)]/30",
    options.isSelected
      ? "ring-2 ring-inset ring-[var(--create-chooser-cta-selected-surface)]"
      : "",
    options.isError
      ? "ring-2 ring-inset ring-[color-mix(in_oklab,#ef4444_55%,var(--border))]"
      : "",
    options.isDragging ? "z-10 opacity-90 shadow-lg" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
