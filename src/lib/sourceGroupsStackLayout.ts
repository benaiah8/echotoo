/** Source Groups card-stack vertical layout: center while short, top-align when tall. */

export const SOURCE_GROUPS_STACK_TOP_ALIGN_RATIO = 0.9;

/**
 * Top-align (normal scroll) when the stack occupies ≥ ~90% of the card viewport.
 * Heights are rendered geometry — not card counts.
 */
export function shouldTopAlignGroupStack(
  stackHeight: number,
  viewportHeight: number
): boolean {
  if (
    !Number.isFinite(stackHeight) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return false;
  }
  if (stackHeight <= 0) return false;
  return stackHeight >= viewportHeight * SOURCE_GROUPS_STACK_TOP_ALIGN_RATIO;
}
