/**
 * Unified local draft media order (images + at most one video).
 *
 * Image identity strategy (PASS C1):
 * - Uploaded post images are stored as unique Supabase storage paths in
 *   `activities[0].images` (not blob URLs).
 * - Stable `clientId` values are persisted in `draftMeta.imageMediaClientIds`
 *   keyed by storage URL. Reorder/remove of other images does not reassign ids.
 * - `mediaOrder` references `clientId` + `url`; reconciliation matches images by URL.
 *
 * LI1A / LI1B forward path:
 * - `DraftImage.localId` is the canonical local identity.
 * - Long-term: mediaOrder image `clientId === DraftImage.localId`
 *   (see `draftImageLocalIdAsMediaOrderClientId`).
 * - URL-keyed `imageMediaClientIds` remains for legacy remote-eager drafts.
 *
 * Cover semantics: `mediaOrder[0]` is the primary/cover slot for future feed/publish.
 */

import { readDraftVideoMeta } from "./createDraftVideo/draftVideoMeta";
import { DRAFT_META_KEY, notifyLocalDraftPersisted } from "./drafts";
import { MAX_TOTAL_POST_MEDIA } from "./createPostMediaSlots";
import {
  buildLocalDraftImageUrl,
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
} from "./createDraftImage/localDraftImageUrl";
import { readDraftImagesMeta } from "./createDraftImage/draftImageMeta";
import {
  compactMediaOrderForDiag,
  mediaRemoveDiag,
} from "./createFinalizeMediaRemoveDiag";

const DRAFT_ACTIVITIES_KEY = "draftActivities";

export type DraftMediaOrderItem =
  | {
      kind: "image";
      clientId: string;
      url: string;
    }
  | {
      kind: "video";
      clientId: string;
    };

export type DraftImageClientIdMap = Record<string, string>;

export type PublishedMediaOrderItem =
  | { kind: "image"; url: string }
  | { kind: "video"; mediaId: string };

export type DraftMediaOrderState = {
  mediaOrder: DraftMediaOrderItem[];
  imageMediaClientIds: DraftImageClientIdMap;
};

export const CREATE_FLOW_SLOT0_IMAGES_PERSISTED_EVENT =
  "createFlow:slot0ImagesPersisted";

export type CreateFlowSlot0ImagesPersistedDetail = {
  images: string[];
};

export function dispatchSlot0ImagesPersisted(images: string[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CreateFlowSlot0ImagesPersistedDetail>(
      CREATE_FLOW_SLOT0_IMAGES_PERSISTED_EVENT,
      { detail: { images } },
    ),
  );
}

function cleanImageUrls(arr: unknown): string[] {
  return Array.isArray(arr)
    ? arr
        .map(String)
        .filter(
          (u) =>
            isLocalDraftImageUrl(u) ||
            /^https?:\/\//.test(u) ||
            (u.includes("/") && u.includes(".")),
        )
    : [];
}

function readDraftMetaRecord(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeDraftMetaRecord(meta: Record<string, unknown>): void {
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
}

function parseMediaOrder(raw: unknown): DraftMediaOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftMediaOrderItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.kind === "image") {
      if (typeof rec.clientId !== "string" || !rec.clientId) continue;
      if (typeof rec.url !== "string" || !rec.url) continue;
      out.push({ kind: "image", clientId: rec.clientId, url: rec.url });
      continue;
    }
    if (rec.kind === "video") {
      if (typeof rec.clientId !== "string" || !rec.clientId) continue;
      out.push({ kind: "video", clientId: rec.clientId });
    }
  }
  return out;
}

function parseImageClientIdMap(raw: unknown): DraftImageClientIdMap {
  if (!raw || typeof raw !== "object") return {};
  const out: DraftImageClientIdMap = {};
  for (const [url, clientId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof clientId === "string" && clientId) {
      out[url] = clientId;
    }
  }
  return out;
}

export function readDraftMediaOrderState(): DraftMediaOrderState {
  const meta = readDraftMetaRecord();
  return {
    mediaOrder: parseMediaOrder(meta.mediaOrder),
    imageMediaClientIds: parseImageClientIdMap(meta.imageMediaClientIds),
  };
}

export function writeDraftMediaOrderState(
  state: DraftMediaOrderState,
  options?: { notify?: boolean },
): void {
  const prev = readDraftMetaRecord();
  const next: Record<string, unknown> = {
    ...prev,
    mediaOrder: state.mediaOrder,
    imageMediaClientIds: state.imageMediaClientIds,
  };
  if (!state.mediaOrder.length) {
    delete next.mediaOrder;
  }
  if (!Object.keys(state.imageMediaClientIds).length) {
    delete next.imageMediaClientIds;
  }
  writeDraftMetaRecord(next);
  if (options?.notify !== false) {
    notifyLocalDraftPersisted();
  }
}

export function readSlot0ImagesFromDraft(): string[] {
  // Edit mode stores activities on editPostData — prefer that for mediaOrder reconcile.
  try {
    const editRaw = localStorage.getItem("editPostData");
    if (editRaw) {
      const parsed = JSON.parse(editRaw) as { activities?: unknown[] };
      if (Array.isArray(parsed.activities) && parsed.activities.length > 0) {
        const act = parsed.activities[0] as Record<string, unknown> | undefined;
        return cleanImageUrls(act?.images);
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    if (!raw) return [];
    const activities = JSON.parse(raw) as unknown;
    if (!Array.isArray(activities) || !activities.length) return [];
    const act = activities[0] as Record<string, unknown> | undefined;
    return cleanImageUrls(act?.images);
  } catch {
    return [];
  }
}

/**
 * LI1D.5: synchronously persist slot-0 image identity before React effects run,
 * so ensureDraftMediaOrderPersisted cannot read a stale activities list and
 * resurrect an explicitly removed local image.
 */
export function writeSlot0ImagesForMediaReconcile(images: string[]): void {
  const cleaned = cleanImageUrls(images);
  try {
    const draftRaw = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    if (draftRaw) {
      const activities = JSON.parse(draftRaw) as unknown;
      if (Array.isArray(activities) && activities.length > 0) {
        const act0 =
          activities[0] && typeof activities[0] === "object"
            ? (activities[0] as Record<string, unknown>)
            : {};
        activities[0] = { ...act0, images: cleaned };
        localStorage.setItem(DRAFT_ACTIVITIES_KEY, JSON.stringify(activities));
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const editRaw = localStorage.getItem("editPostData");
    if (editRaw) {
      const parsed = JSON.parse(editRaw) as Record<string, unknown>;
      const activities = parsed.activities;
      if (Array.isArray(activities) && activities.length > 0) {
        const act0 =
          activities[0] && typeof activities[0] === "object"
            ? (activities[0] as Record<string, unknown>)
            : {};
        activities[0] = { ...act0, images: cleaned };
        parsed.activities = activities;
        localStorage.setItem("editPostData", JSON.stringify(parsed));
      }
    }
  } catch {
    /* ignore */
  }
}

export function createImageClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateImageClientId(
  url: string,
  map: DraftImageClientIdMap,
): { clientId: string; map: DraftImageClientIdMap } {
  const existing = map[url];
  if (existing) return { clientId: existing, map };
  const clientId = createImageClientId();
  return { clientId, map: { ...map, [url]: clientId } };
}

export function imageOrderItem(
  url: string,
  clientId: string,
): DraftMediaOrderItem {
  return { kind: "image", clientId, url };
}

export function videoOrderItem(clientId: string): DraftMediaOrderItem {
  return { kind: "video", clientId };
}

function pruneImageClientIdMap(
  map: DraftImageClientIdMap,
  images: string[],
): DraftImageClientIdMap {
  const out: DraftImageClientIdMap = {};
  for (const url of images) {
    if (map[url]) out[url] = map[url];
  }
  // Keep local-draft sentinel mappings even if temporarily absent from images[].
  for (const [url, clientId] of Object.entries(map)) {
    if (isLocalDraftImageUrl(url) && clientId) {
      out[url] = clientId;
    }
  }
  return out;
}

export function capDraftMediaOrder(
  order: DraftMediaOrderItem[],
): DraftMediaOrderItem[] {
  let videoCount = 0;
  const out: DraftMediaOrderItem[] = [];
  for (const item of order) {
    if (item.kind === "video") {
      if (videoCount >= 1) continue;
      videoCount += 1;
    }
    out.push(item);
    if (out.length >= MAX_TOTAL_POST_MEDIA) break;
  }
  return out;
}

function ordersEqual(
  a: DraftMediaOrderItem[],
  b: DraftMediaOrderItem[],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mapsEqual(a: DraftImageClientIdMap, b: DraftImageClientIdMap): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Legacy bootstrap when no persisted `mediaOrder` exists.
 * VIDEO + IMAGES → [video, ...images]; IMAGE ONLY → images; VIDEO ONLY → [video]; EMPTY → [].
 */
export function bootstrapMediaOrder(params: {
  images: string[];
  videoLocalId: string | null;
  clientIdMap: DraftImageClientIdMap;
}): { order: DraftMediaOrderItem[]; clientIdMap: DraftImageClientIdMap } {
  const { images, videoLocalId } = params;
  let map = { ...params.clientIdMap };
  const order: DraftMediaOrderItem[] = [];

  if (videoLocalId) {
    order.push(videoOrderItem(videoLocalId));
  }
  for (const url of images) {
    if (isLocalDraftImageUrl(url)) {
      const localId = localIdFromLocalDraftImageUrl(url);
      if (!localId) continue;
      order.push(imageOrderItem(url, localId));
      map = { ...map, [url]: localId };
      continue;
    }
    const { clientId, map: nextMap } = getOrCreateImageClientId(url, map);
    map = nextMap;
    order.push(imageOrderItem(url, clientId));
  }

  return {
    order: capDraftMediaOrder(order),
    clientIdMap: pruneImageClientIdMap(map, images),
  };
}

/**
 * Reconcile persisted order against current images + draft video.
 * Valid survivors keep their relative order; missing refs are appended at the end.
 *
 * videoLocalId contract (canonical):
 * - `undefined` — video state unknown / not supplied → preserve any existing
 *   video survivor; do not invent a new video slot.
 * - `null` — video was explicitly removed → drop any video survivor.
 * - `string` — authoritative current video localId → exactly one video entry
 *   with that clientId (position preserved when a video survivor exists).
 */
export function reconcileMediaOrder(params: {
  currentOrder: DraftMediaOrderItem[];
  images: string[];
  videoLocalId?: string | null;
  clientIdMap: DraftImageClientIdMap;
}): {
  order: DraftMediaOrderItem[];
  clientIdMap: DraftImageClientIdMap;
  changed: boolean;
} {
  const { currentOrder, images, videoLocalId } = params;
  let map = { ...params.clientIdMap };
  const imageSet = new Set(images);

  const survivors: DraftMediaOrderItem[] = [];
  for (const item of currentOrder) {
    if (item.kind === "video") {
      if (videoLocalId === null) {
        // Explicit remove — drop video slot.
        continue;
      }
      if (survivors.some((s) => s.kind === "video")) {
        continue;
      }
      if (typeof videoLocalId === "string" && videoLocalId) {
        // Keep slot position; rewrite clientId when the draft video is replaced.
        survivors.push(videoOrderItem(videoLocalId));
      } else {
        // undefined / unknown — preserve existing survivor as-is.
        survivors.push(item);
      }
      continue;
    }
    // Local sentinels must appear in `images` (activities and/or draftImages merge).
    // Do not keep orphaned local entries after remove / reconcileDraftImages.
    if (imageSet.has(item.url)) {
      survivors.push(item);
    }
  }

  const urlsInOrder = new Set(
    survivors
      .filter((item): item is Extract<DraftMediaOrderItem, { kind: "image" }> =>
        item.kind === "image",
      )
      .map((item) => item.url),
  );

  if (
    typeof videoLocalId === "string" &&
    videoLocalId &&
    !survivors.some((item) => item.kind === "video")
  ) {
    survivors.push(videoOrderItem(videoLocalId));
  }

  for (const url of images) {
    if (urlsInOrder.has(url)) continue;
    if (isLocalDraftImageUrl(url)) {
      const localId = localIdFromLocalDraftImageUrl(url);
      if (!localId) continue;
      survivors.push(imageOrderItem(url, localId));
      map = { ...map, [url]: localId };
      urlsInOrder.add(url);
      continue;
    }
    const { clientId, map: nextMap } = getOrCreateImageClientId(url, map);
    map = nextMap;
    survivors.push(imageOrderItem(url, clientId));
    urlsInOrder.add(url);
  }

  const order = capDraftMediaOrder(survivors);
  const clientIdMap = pruneImageClientIdMap(map, images);

  const changed =
    !ordersEqual(order, currentOrder) ||
    !mapsEqual(clientIdMap, params.clientIdMap);

  return { order, clientIdMap, changed };
}

export type EnsureDraftMediaOrderOptions = {
  images?: string[];
  videoLocalId?: string | null;
};

/**
 * Load, bootstrap (legacy), reconcile, and persist when needed.
 * Returns the authoritative local media order.
 *
 * LI1D.5 contract:
 * - Empty mediaOrder (bootstrap / resume recovery): may union DraftImage meta
 *   so local sentinels can be restored.
 * - Non-empty mediaOrder (active session): activity images are authoritative.
 *   Do NOT re-union draftImages meta — that resurrects explicitly removed locals
 *   while async IDB/FS cleanup is still in flight.
 */
export function ensureDraftMediaOrderPersisted(
  options: EnsureDraftMediaOrderOptions = {},
): DraftMediaOrderItem[] {
  const activityImages = options.images ?? readSlot0ImagesFromDraft();
  const { mediaOrder, imageMediaClientIds } = readDraftMediaOrderState();
  const beforeClientIds = mediaOrder.map((i) => i.clientId);

  // Canonical videoLocalId: undefined = unknown (do not coerce to null).
  let videoLocalId: string | null | undefined = options.videoLocalId;

  if (videoLocalId === undefined) {
    const fromMeta = readDraftVideoMeta()?.localId?.trim();
    if (fromMeta) {
      videoLocalId = fromMeta;
    } else if (typeof localStorage !== "undefined") {
      try {
        const editRaw = localStorage.getItem("editPostData");
        if (editRaw) {
          const parsed = JSON.parse(editRaw) as {
            publishedVideo?: { mediaId?: string } | null;
          };
          const mediaId = parsed.publishedVideo?.mediaId?.trim();
          if (mediaId) {
            videoLocalId = `published-ref:${mediaId}`;
          }
          // else leave undefined — preserve any existing video survivor
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!mediaOrder.length) {
    // Bootstrap / resume: DraftImage metadata may restore missing order entries.
    const localDraftUrls = readDraftImagesMeta().map((img) =>
      buildLocalDraftImageUrl(img.localId),
    );
    const images = Array.from(new Set([...activityImages, ...localDraftUrls]));
    const bootVideoId =
      typeof videoLocalId === "string" && videoLocalId ? videoLocalId : null;
    if (!images.length && !bootVideoId) {
      return [];
    }
    const boot = bootstrapMediaOrder({
      images,
      videoLocalId: bootVideoId,
      clientIdMap: imageMediaClientIds,
    });
    writeDraftMediaOrderState(
      {
        mediaOrder: boot.order,
        imageMediaClientIds: boot.clientIdMap,
      },
      { notify: false },
    );
    mediaRemoveDiag("reconcile", {
      reason: "ensureDraftMediaOrderPersisted:bootstrap",
      beforeClientIds,
      afterClientIds: boot.order.map((i) => i.clientId),
      mediaOrder: compactMediaOrderForDiag(boot.order),
    });
    return boot.order;
  }

  // Active session: activities (or explicit options.images) only — no draftImages union.
  const images = activityImages;
  const rec = reconcileMediaOrder({
    currentOrder: mediaOrder,
    images,
    videoLocalId,
    clientIdMap: imageMediaClientIds,
  });

  if (rec.changed) {
    writeDraftMediaOrderState(
      {
        mediaOrder: rec.order,
        imageMediaClientIds: rec.clientIdMap,
      },
      { notify: false },
    );
    mediaRemoveDiag("reconcile", {
      reason: "ensureDraftMediaOrderPersisted:changed",
      beforeClientIds,
      afterClientIds: rec.order.map((i) => i.clientId),
      mediaOrder: compactMediaOrderForDiag(rec.order),
    });
  }

  return rec.order;
}

/** Future publish mapping (C4 wiring deferred). */
export function mapDraftMediaOrderToPublished(
  order: DraftMediaOrderItem[],
  videoMediaId: string | null | undefined,
): PublishedMediaOrderItem[] {
  return order.map((item) => {
    if (item.kind === "image") {
      return { kind: "image", url: item.url };
    }
    if (!videoMediaId) {
      throw new Error(
        "Published video mediaId is required when media order includes video.",
      );
    }
    return { kind: "video", mediaId: videoMediaId };
  });
}

/** `mediaOrder[0]` is the primary/cover media for future feed + publish. */
export function getDraftMediaCoverItem(
  order: DraftMediaOrderItem[],
): DraftMediaOrderItem | null {
  return order[0] ?? null;
}

export function deriveSlot0ImagesFromMediaOrder(
  order: DraftMediaOrderItem[],
): string[] {
  return order
    .filter(
      (item): item is Extract<DraftMediaOrderItem, { kind: "image" }> =>
        item.kind === "image",
    )
    .map((item) => item.url);
}

function moveArrayItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Reorder by stable clientId without bootstrap or reconciliation. */
export function reorderMediaOrderByClientIds(
  order: DraftMediaOrderItem[],
  activeClientId: string,
  overClientId: string,
): DraftMediaOrderItem[] | null {
  const from = order.findIndex((item) => item.clientId === activeClientId);
  const to = order.findIndex((item) => item.clientId === overClientId);
  if (from < 0 || to < 0 || from === to) return null;
  return moveArrayItem(order, from, to);
}

export function removeMediaOrderItemByClientId(
  order: DraftMediaOrderItem[],
  clientId: string,
): DraftMediaOrderItem[] {
  return order.filter((item) => item.clientId !== clientId);
}

/**
 * LI1A/LI1B: DraftImage.localId is the canonical clientId for local-first images.
 */
export {
  draftImageLocalIdAsMediaOrderClientId,
  mediaOrderClientIdMatchesDraftImageLocalId,
} from "./createDraftImage/types";
export {
  buildLocalDraftImageUrl,
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
} from "./createDraftImage/localDraftImageUrl";

export function persistDraftMediaOrderOnly(
  order: DraftMediaOrderItem[],
  options?: { notify?: boolean },
): void {
  const { imageMediaClientIds } = readDraftMediaOrderState();
  writeDraftMediaOrderState(
    { mediaOrder: order, imageMediaClientIds },
    options,
  );
}

export type ReconcileActiveVideoIntoPublishMediaOrderResult = {
  order: DraftMediaOrderItem[];
  /** True when a missing video entry was inserted into the snapshot. */
  reconciledVideo: boolean;
  draftKinds: Array<"image" | "video">;
  finalDraftKinds: Array<"image" | "video">;
};

/**
 * PV3.3 — Ensure an active DraftVideo appears in the publish mediaOrder snapshot
 * even if React state has not yet reconciled the video clientId.
 *
 * - If mediaOrder already has a video: preserve its position; align clientId.
 * - If missing: recover index from preferredVideoIndex, else persisted draft
 *   mediaOrder, else append (documented deterministic fallback).
 * - At most one video entry (via capDraftMediaOrder).
 */
export function reconcileActiveVideoIntoPublishMediaOrder(params: {
  mediaOrder: DraftMediaOrderItem[];
  activeVideoLocalId: string | null | undefined;
  preferredVideoIndex?: number | null;
}): ReconcileActiveVideoIntoPublishMediaOrderResult {
  const draftKinds = params.mediaOrder.map((item) => item.kind);
  const videoId =
    typeof params.activeVideoLocalId === "string"
      ? params.activeVideoLocalId.trim()
      : "";
  if (!videoId) {
    const order = params.mediaOrder.map((item) => ({ ...item }));
    return {
      order,
      reconciledVideo: false,
      draftKinds,
      finalDraftKinds: order.map((item) => item.kind),
    };
  }

  const existingVideoIdx = params.mediaOrder.findIndex(
    (item) => item.kind === "video",
  );
  if (existingVideoIdx >= 0) {
    const aligned = params.mediaOrder.map((item) =>
      item.kind === "video" ? videoOrderItem(videoId) : { ...item },
    );
    const order = capDraftMediaOrder(aligned);
    return {
      order,
      reconciledVideo: false,
      draftKinds,
      finalDraftKinds: order.map((item) => item.kind),
    };
  }

  let insertAt: number | null = null;
  const preferred = params.preferredVideoIndex;
  if (
    typeof preferred === "number" &&
    Number.isFinite(preferred) &&
    preferred >= 0
  ) {
    insertAt = Math.floor(preferred);
  } else {
    const persisted = readDraftMediaOrderState().mediaOrder;
    const persistedIdx = persisted.findIndex((item) => item.kind === "video");
    if (persistedIdx >= 0) insertAt = persistedIdx;
  }

  const next = params.mediaOrder.map((item) => ({ ...item }));
  if (insertAt == null) {
    // Fallback: append video last when no positional evidence exists.
    next.push(videoOrderItem(videoId));
  } else {
    next.splice(Math.min(insertAt, next.length), 0, videoOrderItem(videoId));
  }
  const order = capDraftMediaOrder(next);
  return {
    order,
    reconciledVideo: true,
    draftKinds,
    finalDraftKinds: order.map((item) => item.kind),
  };
}
