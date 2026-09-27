/**
 * Mine deck: bounded front-photo warm + loading attribute helpers.
 * Uses the same display URLs as <img src> (avatarDisplayUrl pipeline).
 *
 * Warm window (~10 fronts) is larger than the ±2 photo-stack mount radius.
 * Concurrency is capped for mobile; in-flight/done results are reused.
 */

import { preloadImage } from "../imageOptimization";

/** Mounted photo stacks: ± this many slides from React index (Mine only). */
export const MINE_PHOTO_MOUNT_RADIUS = 2;
/** Discover / other MatchDeck layouts retain the historical radius. */
export const MATCH_DECK_DEFAULT_PHOTO_RADIUS = 1;

/**
 * Rolling warm window (front URL only) relative to authoritative index.
 * 1 current + ahead + behind ≈ 10 candidates when both sides are available.
 */
export const MINE_IMAGE_WARM_AHEAD = 7;
export const MINE_IMAGE_WARM_BEHIND = 2;

/** Max simultaneous new Image() preloads for deck warming (mobile-friendly). */
export const MINE_IMAGE_WARM_CONCURRENCY = 3;

export type MineWarmDirection = "forward" | "backward";

const WARM_DONE_MAX = 64;

const inFlight = new Map<string, Promise<void>>();
const done = new Set<string>();
const doneOrder: string[] = [];

/** Not-yet-started deck warms, priority order (first = highest). */
const pendingQueue: string[] = [];
const pendingSet = new Set<string>();

function rememberDone(src: string): void {
  if (done.has(src)) return;
  done.add(src);
  doneOrder.push(src);
  while (doneOrder.length > WARM_DONE_MAX) {
    const oldest = doneOrder.shift();
    if (oldest) done.delete(oldest);
  }
}

function removeFromPendingQueue(src: string): void {
  if (!pendingSet.has(src)) return;
  pendingSet.delete(src);
  const i = pendingQueue.indexOf(src);
  if (i >= 0) pendingQueue.splice(i, 1);
}

function startWarm(src: string): Promise<void> {
  if (done.has(src)) return Promise.resolve();
  const existing = inFlight.get(src);
  if (existing) return existing;

  const work = preloadImage(src)
    .then(() => {
      rememberDone(src);
    })
    .finally(() => {
      inFlight.delete(src);
      pumpMineWarmQueue();
    });

  inFlight.set(src, work);
  return work;
}

function pumpMineWarmQueue(): void {
  while (
    inFlight.size < MINE_IMAGE_WARM_CONCURRENCY &&
    pendingQueue.length > 0
  ) {
    const src = pendingQueue.shift()!;
    pendingSet.delete(src);
    if (!src || done.has(src) || inFlight.has(src)) continue;
    void startWarm(src).catch(() => {
      /* Deck warm failures stay retryable (not in done). */
    });
  }
}

/** True when a display URL completed a successful warm (immediate reuse). */
export function isMineFrontImageWarmDone(
  src: string | null | undefined,
): boolean {
  if (!src) return false;
  return done.has(src);
}

/**
 * Deduped Image() warm for a single display URL — starts immediately
 * (atmosphere / high-priority path). Promotes out of the deck queue if queued.
 * Resolves on success; rejects on preload failure (not added to done).
 */
export function warmMineFrontImage(
  src: string | null | undefined,
): Promise<void> {
  if (!src) return Promise.resolve();
  removeFromPendingQueue(src);
  return startWarm(src);
}

/**
 * Schedule a priority-ordered list of front URLs for deck warming.
 * Reuses in-flight and done entries; does not restart active requests.
 * Rebuilds the not-yet-started queue from this list (drops stale pending).
 * Concurrency capped by MINE_IMAGE_WARM_CONCURRENCY.
 */
export function warmMineFrontImages(
  srcs: readonly (string | null | undefined)[],
): void {
  const nextPending: string[] = [];
  const seen = new Set<string>();
  for (const src of srcs) {
    if (!src || seen.has(src)) continue;
    seen.add(src);
    if (done.has(src) || inFlight.has(src)) continue;
    nextPending.push(src);
  }

  pendingQueue.length = 0;
  pendingSet.clear();
  for (const src of nextPending) {
    pendingSet.add(src);
    pendingQueue.push(src);
  }
  pumpMineWarmQueue();
}

/** Test helper: pending queue length (not yet started). */
export function getMineFrontImageWarmPendingCount(): number {
  return pendingQueue.length;
}

/** Test helper: ordered pending URLs (not yet started). */
export function getMineFrontImageWarmPendingUrls(): readonly string[] {
  return pendingQueue.slice();
}

/** Test helper: in-flight warm count. */
export function getMineFrontImageWarmInFlightCount(): number {
  return inFlight.size;
}

/** Test / leave-People cleanup. */
export function clearMineFrontImageWarmState(): void {
  inFlight.clear();
  done.clear();
  doneOrder.length = 0;
  pendingQueue.length = 0;
  pendingSet.clear();
}

export function matchDeckPhotoMountRadius(isMinePresentation: boolean): number {
  return isMinePresentation
    ? MINE_PHOTO_MOUNT_RADIUS
    : MATCH_DECK_DEFAULT_PHOTO_RADIUS;
}

/**
 * Relative offsets to warm around an authoritative Mine index (~10 slots).
 * Travel direction gets the long side; opposite side keeps a small reserve.
 * Current (0) is listed first by callers; included here for cold-open lists.
 */
export function mineImageWarmOffsets(
  direction: MineWarmDirection = "forward",
): readonly number[] {
  const travel = Array.from(
    { length: MINE_IMAGE_WARM_AHEAD },
    (_, i) => i + 1,
  );
  const reserve = Array.from(
    { length: MINE_IMAGE_WARM_BEHIND },
    (_, i) => i + 1,
  );
  if (direction === "backward") {
    return [0, ...travel.map((n) => -n), ...reserve];
  }
  return [0, ...travel, ...reserve.map((n) => -n)];
}

export type MineStackImageLoadingAttrs = {
  loading: "eager" | "lazy";
  fetchPriority: "high" | "auto" | "low";
};

/**
 * Mine mounted stack: front always eager (incl. off-screen neighbors).
 * Current front gets high fetch priority; neighbor fronts and rears stay auto/lazy.
 */
export function mineStackImageLoadingAttrs(args: {
  isCurrent: boolean;
  photoIndex: number;
  displayedIndex: number;
}): MineStackImageLoadingAttrs {
  const isFront = args.photoIndex === args.displayedIndex;
  if (!isFront) {
    return { loading: "lazy", fetchPriority: "auto" };
  }
  if (args.isCurrent) {
    return { loading: "eager", fetchPriority: "high" };
  }
  return { loading: "eager", fetchPriority: "auto" };
}

/** Discover / non-Mine stack front: legacy current-only eager. */
export function duoStackFrontLoadingAttrs(
  isCurrent: boolean,
): MineStackImageLoadingAttrs {
  return isCurrent
    ? { loading: "eager", fetchPriority: "high" }
    : { loading: "lazy", fetchPriority: "auto" };
}
