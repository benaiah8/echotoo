/**
 * Canonical window/document background scroll freeze.
 * Nested owners share one physical lock; final release restores exact state.
 *
 * Use `useOverlayBackgroundScrollLock` for overlays, `usePageBackgroundScrollLock`
 * for page shells with an internal scroller, or `acquireBackgroundScrollLock`.
 * Application components must not set html/body overflow or fixed-body styles.
 *
 * Two owner modes, one refcount:
 * - overlay: overflow + overscroll + scrollbar padding + native/iOS fixed-body
 * - page: overflow-only (Create Finalize). No fixed-body; keyboard/layout stay intact.
 *
 * Physical lock strength follows current owners. Overlay presence upgrades to
 * full overlay freeze; last overlay leaving while a page owner remains
 * downgrades to overflow-only without restoring the original document.
 * Original styles are snapshotted once, on the first owner.
 */

import { isIOS, isNativeApp } from "./storage/utils/capacitorDetection";

export type BackgroundScrollLockMode = "overlay" | "page";

type SavedStyles = {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyOverflow: string;
  bodyOverscroll: string;
  bodyPaddingRight: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
};

type Snapshot = {
  scrollX: number;
  scrollY: number;
  saved: SavedStyles;
  /** Scroll captured when fixed-body was applied (upgrade or first overlay). */
  fixedScrollX: number;
  fixedScrollY: number;
  fixedBodyApplied: boolean;
};

/** Skip redundant scrollTo when already within this many CSS pixels of saved. */
const SCROLL_RESTORE_EPSILON_PX = 1;

const owners = new Map<symbol, BackgroundScrollLockMode>();
let snapshot: Snapshot | null = null;

function overlayOwnerCount(): number {
  let n = 0;
  for (const mode of owners.values()) {
    if (mode === "overlay") n += 1;
  }
  return n;
}

function wantsFixedBody(): boolean {
  return overlayOwnerCount() > 0 && (isIOS() || isNativeApp());
}

function readSavedStyles(): SavedStyles {
  const html = document.documentElement.style;
  const body = document.body.style;
  return {
    htmlOverflow: html.overflow,
    htmlOverscroll: html.overscrollBehavior,
    bodyOverflow: body.overflow,
    bodyOverscroll: body.overscrollBehavior,
    bodyPaddingRight: body.paddingRight,
    bodyPosition: body.position,
    bodyTop: body.top,
    bodyLeft: body.left,
    bodyRight: body.right,
    bodyWidth: body.width,
  };
}

function captureSnapshotIfNeeded(): void {
  if (snapshot) return;
  snapshot = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    saved: readSavedStyles(),
    fixedScrollX: 0,
    fixedScrollY: 0,
    fixedBodyApplied: false,
  };
}

function applyOverflowLock(): void {
  const html = document.documentElement.style;
  const body = document.body.style;
  html.overflow = "hidden";
  body.overflow = "hidden";
}

function applyOverlayExtras(): void {
  const html = document.documentElement.style;
  const body = document.body.style;
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth;

  html.overscrollBehavior = "none";
  body.overscrollBehavior = "none";
  if (scrollbarWidth > 0) {
    body.paddingRight = `${scrollbarWidth}px`;
  }
}

function restoreOverlayExtrasFromSnapshot(): void {
  const current = snapshot;
  if (!current) return;
  const html = document.documentElement.style;
  const body = document.body.style;
  const { saved } = current;
  html.overscrollBehavior = saved.htmlOverscroll;
  body.overscrollBehavior = saved.bodyOverscroll;
  body.paddingRight = saved.bodyPaddingRight;
}

function applyFixedBody(): void {
  if (!snapshot || snapshot.fixedBodyApplied) return;
  const body = document.body.style;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  snapshot.fixedScrollX = scrollX;
  snapshot.fixedScrollY = scrollY;
  body.position = "fixed";
  body.top = `-${scrollY}px`;
  body.left = "0";
  body.right = "0";
  body.width = "100%";
  snapshot.fixedBodyApplied = true;
}

function restoreFixedBodyFromSnapshot(): void {
  const current = snapshot;
  if (!current?.fixedBodyApplied) return;
  const body = document.body.style;
  const { saved, fixedScrollX, fixedScrollY } = current;
  body.position = saved.bodyPosition;
  body.top = saved.bodyTop;
  body.left = saved.bodyLeft;
  body.right = saved.bodyRight;
  body.width = saved.bodyWidth;
  current.fixedBodyApplied = false;

  const curX = window.scrollX;
  const curY = window.scrollY;
  const needX = Math.abs(curX - fixedScrollX) > SCROLL_RESTORE_EPSILON_PX;
  const needY = Math.abs(curY - fixedScrollY) > SCROLL_RESTORE_EPSILON_PX;
  if (needX || needY) {
    window.scrollTo(fixedScrollX, fixedScrollY);
  }
}

function restoreLock(): void {
  const current = snapshot;
  if (!current) return;

  const html = document.documentElement.style;
  const body = document.body.style;
  const { scrollX, scrollY, saved } = current;

  html.overflow = saved.htmlOverflow;
  html.overscrollBehavior = saved.htmlOverscroll;
  body.overflow = saved.bodyOverflow;
  body.overscrollBehavior = saved.bodyOverscroll;
  body.paddingRight = saved.bodyPaddingRight;
  body.position = saved.bodyPosition;
  body.top = saved.bodyTop;
  body.left = saved.bodyLeft;
  body.right = saved.bodyRight;
  body.width = saved.bodyWidth;

  snapshot = null;

  const curX = window.scrollX;
  const curY = window.scrollY;
  const needX = Math.abs(curX - scrollX) > SCROLL_RESTORE_EPSILON_PX;
  const needY = Math.abs(curY - scrollY) > SCROLL_RESTORE_EPSILON_PX;
  if (needX || needY) {
    window.scrollTo(scrollX, scrollY);
  }
}

/**
 * Apply or ease the physical freeze to match current owners.
 * Original document styles stay in `snapshot` until the last owner releases.
 */
function syncPhysicalLock(): void {
  if (owners.size === 0) {
    restoreLock();
    return;
  }

  captureSnapshotIfNeeded();
  applyOverflowLock();

  if (overlayOwnerCount() > 0) {
    applyOverlayExtras();
    if (wantsFixedBody()) {
      applyFixedBody();
    }
    return;
  }

  restoreOverlayExtrasFromSnapshot();
  restoreFixedBodyFromSnapshot();
}

/**
 * Acquire a nested-safe background scroll lock.
 * Default `"overlay"` matches existing overlay callers; pass `"page"` (or use
 * `acquirePageScrollLock`) for overflow-only page shells.
 * Returns a release function that is idempotent (safe under StrictMode).
 */
export function acquireBackgroundScrollLock(
  mode: BackgroundScrollLockMode = "overlay"
): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const token = Symbol("backgroundScrollLock");
  owners.set(token, mode);
  syncPhysicalLock();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (!owners.has(token)) return;
    owners.delete(token);
    syncPhysicalLock();
  };
}

/**
 * Overflow-only nested lock for page shells (Create Finalize).
 * Same owner set as overlays; never applies native fixed-body by itself.
 */
export function acquirePageScrollLock(): () => void {
  return acquireBackgroundScrollLock("page");
}

/** Active lock owners (for tests / diagnostics). */
export function getBackgroundScrollLockOwnerCount(): number {
  return owners.size;
}

/** Whether a physical freeze is currently applied. */
export function isBackgroundScrollLockActive(): boolean {
  return snapshot != null;
}

/**
 * Logical document scroll Y while a lock may be active.
 * With native fixed-body, this is the frozen offset (`-body.top`), not `window.scrollY`.
 */
export function getLockedDocumentScrollY(): number {
  if (snapshot?.fixedBodyApplied) {
    return snapshot.fixedScrollY;
  }
  if (typeof window === "undefined") return 0;
  return window.scrollY;
}

function readMaxDocumentScrollY(): number {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return 0;
  }
  const doc = document.documentElement;
  const body = document.body;
  const height = Math.max(
    doc?.scrollHeight ?? 0,
    body?.scrollHeight ?? 0,
    doc?.offsetHeight ?? 0,
    body?.offsetHeight ?? 0
  );
  return Math.max(0, height - window.innerHeight);
}

/**
 * Programmatically move the document while keeping any active background lock.
 *
 * - Native fixed-body: updates `body.top` and the restore snapshot (no unlock).
 * - Overflow-only / unlocked: `window.scrollTo`, and updates the restore snapshot
 *   when a lock is active so final unlock keeps the new position.
 *
 * Returns the applied delta (clamped). Does not change lock ownership.
 */
export function scrollDocumentByWhileLocked(deltaY: number): number {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 0;
  }
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.5) {
    return 0;
  }

  const maxY = readMaxDocumentScrollY();
  const current = snapshot;

  if (current?.fixedBodyApplied) {
    const nextY = Math.min(maxY, Math.max(0, current.fixedScrollY + deltaY));
    const applied = nextY - current.fixedScrollY;
    if (Math.abs(applied) < 0.5) return 0;
    current.fixedScrollY = nextY;
    current.fixedScrollX = current.fixedScrollX;
    current.scrollY = nextY;
    current.scrollX = current.scrollX;
    document.body.style.top = `-${nextY}px`;
    return applied;
  }

  const before = window.scrollY;
  const nextY = Math.min(maxY, Math.max(0, before + deltaY));
  const applied = nextY - before;
  if (Math.abs(applied) < 0.5) return 0;
  window.scrollTo(window.scrollX, nextY);
  if (current) {
    current.scrollY = nextY;
    current.scrollX = window.scrollX;
  }
  return applied;
}

/**
 * Test-only: clear owners and restore styles if a freeze is active.
 * Do not call from product code.
 */
export function __resetBackgroundScrollLockForTests(): void {
  owners.clear();
  if (snapshot) {
    restoreLock();
  }
}
