/**
 * Ref-counted guard so window-level pull-to-refresh (useHomePullToRefresh)
 * ignores touches while a fullscreen lightbox is open — avoids swipe-to-dismiss
 * also driving the page refresh gesture.
 */
let refCount = 0;

export function isPullToRefreshBlocked(): boolean {
  return refCount > 0;
}

export function acquirePullToRefreshBlock(): () => void {
  refCount += 1;
  return () => {
    refCount = Math.max(0, refCount - 1);
  };
}
