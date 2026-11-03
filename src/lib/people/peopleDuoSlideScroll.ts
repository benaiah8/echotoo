/**
 * Duo-modern vertical scroller: reset only on activation / identity change.
 * Embla keeps slides mounted, so the browser otherwise preserves scrollTop.
 */

export function shouldResetPeopleDuoSlideScroll(input: {
  isCurrent: boolean;
  wasCurrent: boolean;
  identityKey: string;
  prevIdentityKey: string;
}): boolean {
  if (!input.isCurrent) return false;
  if (!input.wasCurrent) return true;
  return input.identityKey !== input.prevIdentityKey;
}
