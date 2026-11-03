/**
 * Home browse feed window-scroll persistence helpers.
 * Shared document scroll is reset when PersistentTab hides Home; these helpers
 * keep the last visible Home Y and restore it when Home becomes active again.
 */

export const HOME_BROWSE_SCROLL_STORAGE_PREFIX = "home_scroll:";

export function homeBrowseScrollStorageKey(feedCacheKey: string): string {
  return `${HOME_BROWSE_SCROLL_STORAGE_PREFIX}${feedCacheKey}`;
}

export function saveHomeBrowseScrollPosition(
  feedCacheKey: string,
  y: number
): void {
  try {
    localStorage.setItem(
      homeBrowseScrollStorageKey(feedCacheKey),
      JSON.stringify({ v: 1, y: Math.max(0, y) })
    );
  } catch {
    // ignore storage errors
  }
}

export function getHomeBrowseScrollPosition(feedCacheKey: string): number {
  try {
    const raw = localStorage.getItem(homeBrowseScrollStorageKey(feedCacheKey));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { y?: unknown };
    if (parsed && typeof parsed.y === "number" && Number.isFinite(parsed.y)) {
      return Math.max(0, parsed.y);
    }
  } catch {
    // ignore parse/storage errors
  }
  return 0;
}

/**
 * Whether Home should update its browse scroll tracking from shared window scroll.
 * Hidden Home must ignore other tabs' document scroll (often ~0 after layout collapse).
 */
export function shouldTrackHomeBrowseWindowScroll(args: {
  isHomeTabActive: boolean;
  homePostSearchActive: boolean;
}): boolean {
  return args.isHomeTabActive && !args.homePostSearchActive;
}

/**
 * Position to persist when leaving Home.
 * Prefer in-memory Y captured while Home was visible; do not trust collapsed
 * window.scrollY≈0 over a positive tracked value.
 */
export function resolveHomeBrowseScrollYForLeave(args: {
  latestY: number;
  windowY: number;
}): number {
  const latest = Math.max(0, Number.isFinite(args.latestY) ? args.latestY : 0);
  const win = Math.max(0, Number.isFinite(args.windowY) ? args.windowY : 0);
  if (latest > 0) return latest;
  if (win > 0) return win;
  return 0;
}

/** Prefer in-memory tracked Y, else stored Y for the current feed key. */
export function resolveHomeBrowseScrollYForRestore(args: {
  latestY: number;
  storedY: number;
}): number {
  const latest = Math.max(0, Number.isFinite(args.latestY) ? args.latestY : 0);
  const stored = Math.max(0, Number.isFinite(args.storedY) ? args.storedY : 0);
  if (latest > 0) return latest;
  return stored;
}

export function clampHomeBrowseScrollY(y: number, maxScrollY: number): number {
  if (!Number.isFinite(y) || y <= 0) return 0;
  if (!Number.isFinite(maxScrollY) || maxScrollY <= 0) return 0;
  return Math.min(y, maxScrollY);
}

export function getDocumentMaxScrollY(
  win: Pick<Window, "innerHeight"> = window,
  doc: Document = document
): number {
  const el = doc.documentElement;
  const body = doc.body;
  const scrollHeight = Math.max(
    el?.scrollHeight ?? 0,
    body?.scrollHeight ?? 0
  );
  const view = win.innerHeight ?? 0;
  return Math.max(0, scrollHeight - view);
}

/**
 * Apply a restore target to window scroll.
 * Returns the applied Y, or -1 when the document is not laid out yet (caller may retry once).
 */
export function applyHomeBrowseScrollRestore(
  targetY: number,
  scrollTo: (y: number) => void = (y) =>
    window.scrollTo({ top: y, behavior: "auto" }),
  maxScrollY: number = getDocumentMaxScrollY()
): number {
  if (!Number.isFinite(targetY) || targetY <= 0) {
    scrollTo(0);
    return 0;
  }
  if (maxScrollY <= 0) {
    return -1;
  }
  const y = clampHomeBrowseScrollY(targetY, maxScrollY);
  scrollTo(y);
  return y;
}
