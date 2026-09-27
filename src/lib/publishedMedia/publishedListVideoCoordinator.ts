/**
 * Session-only Feed/Profile published list video coordinator (PV3 / PV3.1 / PV3.7).
 * At most one ACTIVE stream + one WARM candidate. Not persisted; not in dataCache.
 */

import {
  pausePublishedProcessingListPolling,
  resumePublishedProcessingListPollingIfNeeded,
} from "./publishedProcessingListRevalidator";
import { logPublishedVideoState } from "./publishedVideoStateLog";

export type PublishedListVideoOwnerId = string;

type OwnerEntry = {
  ownerId: PublishedListVideoOwnerId;
  onRevoke: () => void;
};

let active: OwnerEntry | null = null;
let warm: OwnerEntry | null = null;
const listeners = new Set<() => void>();

/** Bumped on document/app foreground so surfaces re-evaluate IO eligibility. */
let visibilityEpoch = 0;
const visibilityEpochListeners = new Set<() => void>();

function emit(): void {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function emitVisibilityEpoch(): void {
  for (const fn of Array.from(visibilityEpochListeners)) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function revokeEntry(entry: OwnerEntry | null): void {
  if (!entry) return;
  logPublishedVideoState("owner-revoke", {
    reason: "revoked",
    ownerId: entry.ownerId,
  });
  try {
    entry.onRevoke();
  } catch {
    /* ignore */
  }
}

export function getPublishedListVideoOwnerId(): PublishedListVideoOwnerId | null {
  return active?.ownerId ?? null;
}

export function getPublishedListVideoWarmOwnerId(): PublishedListVideoOwnerId | null {
  return warm?.ownerId ?? null;
}

export function getPublishedListVisibilityEpoch(): number {
  return visibilityEpoch;
}

export function subscribePublishedListVideoOwner(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribePublishedListVisibilityEpoch(
  listener: () => void,
): () => void {
  visibilityEpochListeners.add(listener);
  return () => {
    visibilityEpochListeners.delete(listener);
  };
}

/**
 * Claim exclusive ACTIVE playback. Revokes any previous active synchronously.
 * If the same id was warm, clears warm without calling warm onRevoke (promotion).
 * Returns release() for this claim.
 */
export function requestPublishedListVideoOwnership(options: {
  ownerId: PublishedListVideoOwnerId;
  onRevoke: () => void;
}): { release: () => void; promotedFromWarm: boolean } {
  const { ownerId, onRevoke } = options;
  let promotedFromWarm = false;

  if (warm?.ownerId === ownerId) {
    // Promote: drop warm slot silently (player keeps HLS).
    warm = null;
    promotedFromWarm = true;
  }

  if (active?.ownerId === ownerId) {
    active.onRevoke = onRevoke;
    emit();
    logPublishedVideoState("owner-claim", {
      reason: "reaffirm",
      ownerId,
      promotedFromWarm,
    });
    return {
      release: () => {
        if (active?.ownerId === ownerId) {
          active = null;
          logPublishedVideoState("owner-release", {
            reason: "release",
            ownerId,
          });
          emit();
        }
      },
      promotedFromWarm,
    };
  }

  const prevActive = active;
  active = { ownerId, onRevoke };
  revokeEntry(prevActive);
  emit();
  logPublishedVideoState("owner-claim", {
    reason: promotedFromWarm ? "promote-warm" : "claim",
    ownerId,
    promotedFromWarm,
  });

  return {
    release: () => {
      if (active?.ownerId === ownerId) {
        active = null;
        logPublishedVideoState("owner-release", {
          reason: "release",
          ownerId,
        });
        emit();
      }
    },
    promotedFromWarm,
  };
}

/**
 * Claim exclusive WARM prebuffer. Revokes prior warm. No-op claim if already active.
 */
export function requestPublishedListVideoWarmOwnership(options: {
  ownerId: PublishedListVideoOwnerId;
  onRevoke: () => void;
}): { release: () => void } | null {
  const { ownerId, onRevoke } = options;

  // Active already owns playback — no separate warm.
  if (active?.ownerId === ownerId) {
    return null;
  }

  if (warm?.ownerId === ownerId) {
    warm.onRevoke = onRevoke;
    return {
      release: () => {
        if (warm?.ownerId === ownerId) {
          warm = null;
          emit();
        }
      },
    };
  }

  const prevWarm = warm;
  warm = { ownerId, onRevoke };
  revokeEntry(prevWarm);
  emit();

  return {
    release: () => {
      if (warm?.ownerId === ownerId) {
        warm = null;
        emit();
      }
    },
  };
}

export function releasePublishedListVideoOwnership(
  ownerId: PublishedListVideoOwnerId,
): void {
  if (active?.ownerId !== ownerId) return;
  const prev = active;
  active = null;
  logPublishedVideoState("owner-release", {
    reason: "release-id",
    ownerId,
  });
  revokeEntry(prev);
  emit();
}

export function releasePublishedListVideoWarmOwnership(
  ownerId: PublishedListVideoOwnerId,
): void {
  if (warm?.ownerId !== ownerId) return;
  const prev = warm;
  warm = null;
  revokeEntry(prev);
  emit();
}

/** Drop active + warm (Detail open, route change, document hidden). */
export function releaseAllPublishedListVideoOwnership(): void {
  const prevActive = active;
  const prevWarm = warm;
  active = null;
  warm = null;
  if (prevActive || prevWarm) {
    logPublishedVideoState("owner-release-all", {
      reason: "release-all",
      ownerId: prevActive?.ownerId,
      warmOwnerId: prevWarm?.ownerId,
    });
  }
  revokeEntry(prevActive);
  revokeEntry(prevWarm);
  if (prevActive || prevWarm) emit();
}

function onPublishedListBackground(): void {
  releaseAllPublishedListVideoOwnership();
  pausePublishedProcessingListPolling();
}

function onPublishedListForeground(): void {
  visibilityEpoch += 1;
  resumePublishedProcessingListPollingIfNeeded();
  emitVisibilityEpoch();
}

let documentVisibilityHooked = false;
let capacitorAppHooked = false;

/** Install once: document.hidden tears down active + warm; visible bumps epoch. */
export function ensurePublishedListVideoDocumentVisibilityCleanup(): void {
  if (typeof document !== "undefined" && !documentVisibilityHooked) {
    documentVisibilityHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        onPublishedListBackground();
      } else {
        onPublishedListForeground();
      }
    });
  }

  if (capacitorAppHooked) return;
  capacitorAppHooked = true;
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          onPublishedListBackground();
        } else {
          onPublishedListForeground();
        }
      });
    } catch {
      /* web / unavailable — document.visibility remains */
    }
  })();
}

export function publishedListVideoOwnerId(
  postId: string,
  mediaKey: string,
): PublishedListVideoOwnerId {
  return `${postId.trim()}:${mediaKey}`;
}

export function __resetPublishedListVideoCoordinatorForTests(): void {
  active = null;
  warm = null;
  listeners.clear();
  visibilityEpoch = 0;
  visibilityEpochListeners.clear();
  documentVisibilityHooked = false;
  capacitorAppHooked = false;
}

/** Test helper — simulate foreground epoch bump without DOM. */
export function __bumpPublishedListVisibilityEpochForTests(): void {
  visibilityEpoch += 1;
  emitVisibilityEpoch();
}
