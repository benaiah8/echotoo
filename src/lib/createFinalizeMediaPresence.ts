/**
 * Create finalize media presence / count helpers (PASS LI1D.2).
 * Separates draft identity (including draft-image/* sentinels) from display URLs.
 */

import type { DraftMediaOrderItem } from "./createDraftMediaOrder";
import {
  imageOrderItem,
  videoOrderItem,
} from "./createDraftMediaOrder";
import {
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
} from "./createDraftImage/localDraftImageUrl";

export type ActivityImagesSource = {
  images?: string[] | null;
};

/**
 * Stable identity key for Create image counting (no double-count across
 * activities + mediaOrder).
 */
export function createImageIdentityKey(url: string, clientId?: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (isLocalDraftImageUrl(trimmed)) {
    const localId =
      (clientId && clientId.trim()) ||
      localIdFromLocalDraftImageUrl(trimmed);
    return localId ? `local:${localId}` : null;
  }
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return null;
  }
  return `remote:${trimmed}`;
}

/** True when any activity image list contains a local DraftImage sentinel. */
export function activitiesHaveLocalDraftImages(
  activities: ActivityImagesSource[] | null | undefined,
): boolean {
  for (const act of activities ?? []) {
    for (const url of act.images ?? []) {
      if (isLocalDraftImageUrl(url)) return true;
    }
  }
  return false;
}

/** True when mediaOrder includes a local DraftImage sentinel. */
export function mediaOrderHasLocalDraftImages(
  mediaOrder: DraftMediaOrderItem[] | null | undefined,
): boolean {
  return (mediaOrder ?? []).some(
    (item) => item.kind === "image" && isLocalDraftImageUrl(item.url),
  );
}

/**
 * Use mixed/local hero (preview resolver) whenever Create has video or any
 * local DraftImage identity in mediaOrder or activities.
 */
export function shouldUseCreateLocalAwareHero(params: {
  hasVideo: boolean;
  mediaOrder: DraftMediaOrderItem[];
  activities: ActivityImagesSource[];
}): boolean {
  if (params.hasVideo) return true;
  if (mediaOrderHasLocalDraftImages(params.mediaOrder)) return true;
  if (activitiesHaveLocalDraftImages(params.activities)) return true;
  return false;
}

/**
 * Unique Create image count from activities + mediaOrder (localId-stable).
 * Prefer this over activities-only when local DraftImages may land in either store first.
 */
export function countCreateFinalizeImages(params: {
  activities: ActivityImagesSource[];
  mediaOrder: DraftMediaOrderItem[];
}): number {
  const keys = new Set<string>();

  for (const act of params.activities ?? []) {
    for (const url of act.images ?? []) {
      const key = createImageIdentityKey(String(url));
      if (key) keys.add(key);
    }
  }

  for (const item of params.mediaOrder ?? []) {
    if (item.kind !== "image") continue;
    const key = createImageIdentityKey(item.url, item.clientId);
    if (key) keys.add(key);
  }

  return keys.size;
}

export function hasCreateFinalizeMedia(params: {
  imageCount: number;
  hasVideo: boolean;
}): boolean {
  return params.imageCount > 0 || params.hasVideo;
}

/**
 * When mediaOrder is briefly empty but activities already hold image identities,
 * build an ephemeral order so mixed hero can mount without waiting for reconcile.
 * Does not persist.
 */
export function buildEphemeralMediaOrderFromActivities(
  activities: ActivityImagesSource[],
  videoLocalId?: string | null,
): DraftMediaOrderItem[] {
  const order: DraftMediaOrderItem[] = [];
  if (videoLocalId?.trim()) {
    order.push(videoOrderItem(videoLocalId.trim()));
  }

  const seen = new Set<string>();
  // V4 Create: slot-0 holds post media; flatten later stops only if present.
  const lists = (activities ?? []).map((a) => a.images ?? []);
  const flat =
    lists.length <= 1
      ? lists[0] ?? []
      : lists.flatMap((imgs) => imgs);

  for (const raw of flat) {
    const url = String(raw ?? "").trim();
    if (!url) continue;
    const key = createImageIdentityKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (isLocalDraftImageUrl(url)) {
      const localId = localIdFromLocalDraftImageUrl(url);
      if (!localId) continue;
      order.push(imageOrderItem(url, localId));
      continue;
    }
    // Ephemeral remote: clientId = url (stable until real mediaOrder sync).
    order.push(imageOrderItem(url, url));
  }

  return order;
}
