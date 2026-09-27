/**
 * Finalize media tray remove-button gesture ownership (PASS LI1D.3).
 *
 * The full-bleed thumb select layer sits under the × control. On touch/web,
 * the first tap can hit-select (or leak a click to select) unless remove
 * exclusively claims pointer/touch and removes by stable clientId.
 *
 * Tray-wide remove transaction (mixed-media sibling click-through):
 * After one × remove, layout shift can slide a sibling × under the same
 * touch/click. Per-clientId once guards cannot stop that because IMAGE and
 * VIDEO have different clientIds. One tray-wide lock allows the intended
 * remove and blocks sibling removes until commit + paint stabilize.
 */

export const FINALIZE_MEDIA_NO_DND_ATTR = "data-finalize-media-no-dnd";

/**
 * Short post-paint suppress window (ms) after the transaction ends.
 * Needed because mobile WebViews can synthesize a late click that lands on
 * the sibling × after the tray reflows. Keep minimal so separate intentional
 * taps still work.
 */
export const FINALIZE_MEDIA_TRAY_REMOVE_POST_PAINT_SUPPRESS_MS = 80;

type Stoppable = { stopPropagation: () => void };
type Preventable = { preventDefault: () => void };
type PointerLike = Stoppable &
  Preventable & {
    pointerType: string;
    button: number;
  };
type MouseLike = Stoppable & { button: number };

type TrayRemoveTransaction = {
  /** clientId that owns the active remove, or null when idle/suppress-only. */
  ownerClientId: string | null;
  active: boolean;
  /** Epoch ms — sibling starts blocked until this time after release. */
  suppressUntil: number;
};

let trayRemoveTxn: TrayRemoveTransaction = {
  ownerClientId: null,
  active: false,
  suppressUntil: 0,
};

let trayRemoveReleaseScheduled = false;

function nowMs(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? Date.now()
    : Date.now();
}

/** True when the event target is (or is inside) the remove control. */
export function isFinalizeMediaRemoveTarget(
  target: EventTarget | null | undefined,
): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== "function") {
    return false;
  }
  return Boolean(
    (target as Element).closest(`[${FINALIZE_MEDIA_NO_DND_ATTR}]`),
  );
}

/**
 * Claim the gesture on the remove control so sibling select / DnD activators
 * do not also handle this pointer.
 *
 * - Always stopPropagation.
 * - preventDefault for touch/pen so synthetic mouse + post-unmount click-through
 *   cannot land on the select layer underneath.
 * - Mouse: do not preventDefault on pointerdown (keeps click / a11y); click
 *   handler still removes with an idempotent guard.
 */
export function claimFinalizeMediaRemovePointerDown(
  event: PointerLike,
): boolean {
  event.stopPropagation();
  // Ignore non-primary mouse buttons.
  if (event.pointerType === "mouse" && event.button !== 0) {
    return false;
  }
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    event.preventDefault();
  }
  return true;
}

export function claimFinalizeMediaRemoveTouchStart(event: Stoppable): void {
  event.stopPropagation();
}

export function claimFinalizeMediaRemoveMouseDown(event: MouseLike): void {
  if (event.button !== 0) return;
  event.stopPropagation();
}

/**
 * Idempotent remove fire for pointerdown + click (keyboard / mouse).
 * Returns true when the remove callback should run.
 */
export function beginFinalizeMediaRemoveOnce(
  guard: { current: boolean },
): boolean {
  if (guard.current) return false;
  guard.current = true;
  return true;
}

/**
 * Try to begin a tray-wide remove transaction for `clientId`.
 * Returns false when another item's remove is in flight or the short
 * post-paint suppress window is still active (sibling click-through).
 */
export function beginFinalizeMediaTrayRemoveTransaction(
  clientId: string,
): boolean {
  const id = clientId.trim();
  if (!id) return false;

  if (trayRemoveTxn.active) {
    // One remove already in flight — block all further begins (same or sibling).
    // Same-id retries are also covered by per-button once / removingClientIds.
    return false;
  }

  if (nowMs() < trayRemoveTxn.suppressUntil) {
    return false;
  }

  trayRemoveTxn = {
    ownerClientId: id,
    active: true,
    suppressUntil: 0,
  };
  return true;
}

/**
 * True while a tray remove transaction is active or the post-paint
 * suppress window is still open.
 */
export function isFinalizeMediaTrayRemoveLocked(
  forClientId?: string | null,
): boolean {
  if (trayRemoveTxn.active) {
    if (forClientId == null || forClientId === "") return true;
    return trayRemoveTxn.ownerClientId !== forClientId;
  }
  return nowMs() < trayRemoveTxn.suppressUntil;
}

export function getFinalizeMediaTrayRemoveOwnerClientId(): string | null {
  return trayRemoveTxn.active ? trayRemoveTxn.ownerClientId : null;
}

/**
 * Release the tray remove transaction after React commit + paint, then open
 * a short suppress window for synthesized mobile clicks on the sibling ×.
 */
export function endFinalizeMediaTrayRemoveTransaction(
  options?: { postPaintSuppressMs?: number },
): void {
  if (!trayRemoveTxn.active && !trayRemoveReleaseScheduled) {
    // Already idle — still refresh suppress if an active release is mid-flight.
    return;
  }

  if (trayRemoveReleaseScheduled) return;
  trayRemoveReleaseScheduled = true;

  const suppressMs =
    options?.postPaintSuppressMs ??
    FINALIZE_MEDIA_TRAY_REMOVE_POST_PAINT_SUPPRESS_MS;

  const finish = () => {
    trayRemoveReleaseScheduled = false;
    trayRemoveTxn = {
      ownerClientId: null,
      active: false,
      suppressUntil: nowMs() + suppressMs,
    };
  };

  // Double rAF ≈ after layout + paint of the tray collapse.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  } else {
    finish();
  }
}

/** Test-only reset — not used by product code. */
export function __resetFinalizeMediaTrayRemoveTransactionForTests(): void {
  trayRemoveTxn = {
    ownerClientId: null,
    active: false,
    suppressUntil: 0,
  };
  trayRemoveReleaseScheduled = false;
}
