/**
 * Presentation-only copy for ProgressiveFeed error surfaces.
 * Does not affect loading, cache, or retry behavior.
 */
export function getProgressiveFeedErrorCopy(options: {
  hasItems: boolean;
  isOffline?: boolean;
}): { title: string; body: string } {
  if (!options.hasItems) {
    return {
      title: "We couldn't load posts right now",
      body: "Check your connection and try again.",
    };
  }
  if (options.isOffline) {
    return {
      title: "You're offline",
      body: "Showing saved posts. Check your connection when you're back online.",
    };
  }
  return {
    title: "Couldn't refresh posts",
    body: "You're seeing saved posts. Check your connection and try again.",
  };
}

/** Read-only online check for error copy; no listeners. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
