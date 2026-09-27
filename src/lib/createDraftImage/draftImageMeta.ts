/**
 * draftMeta.draftImages read/write (PASS LI1A).
 * Metadata only — never Blob/File/blob: URLs.
 */

import { dispatchCreateFlowDraftContentChanged } from "../createFlowLeaveRequest";
import {
  parseDraftImage,
  parseDraftImages,
  type DraftImage,
} from "./types";

export const DRAFT_META_KEY = "draftMeta";

const DIRTY_FLAG = "draftDirty";
const DRAFT_SAVED_AT_KEY = "draftSavedAt";

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

function touchDraftSavedAt(): void {
  try {
    localStorage.setItem(DRAFT_SAVED_AT_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function notifyLocalDraftPersisted(): void {
  try {
    localStorage.setItem(DIRTY_FLAG, "1");
  } catch {
    /* ignore */
  }
  touchDraftSavedAt();
  dispatchCreateFlowDraftContentChanged();
}

export function readDraftImagesMeta(): DraftImage[] {
  return parseDraftImages(readDraftMetaRecord().draftImages);
}

export function writeDraftImagesMeta(images: DraftImage[]): void {
  const prev = readDraftMetaRecord();
  const next = { ...prev };
  const cleaned = images
    .map((img) => parseDraftImage(img))
    .filter((img): img is DraftImage => Boolean(img));
  if (cleaned.length) {
    next.draftImages = cleaned;
  } else {
    delete next.draftImages;
  }
  writeDraftMetaRecord(next);
  notifyLocalDraftPersisted();
}

export function upsertDraftImageMeta(image: DraftImage): DraftImage[] {
  const parsed = parseDraftImage(image);
  if (!parsed) return readDraftImagesMeta();
  const prev = readDraftImagesMeta();
  const without = prev.filter((img) => img.localId !== parsed.localId);
  const next = [...without, parsed];
  writeDraftImagesMeta(next);
  return next;
}

export function removeDraftImageMeta(localId: string): DraftImage[] {
  const id = localId.trim();
  const next = readDraftImagesMeta().filter((img) => img.localId !== id);
  writeDraftImagesMeta(next);
  return next;
}

export function clearDraftImagesMeta(): void {
  writeDraftImagesMeta([]);
}

export function updateDraftImageRemoteFields(
  localId: string,
  fields: {
    remoteUrl?: string | null;
    remoteStoragePath?: string | null;
  },
): DraftImage | null {
  const id = localId.trim();
  const prev = readDraftImagesMeta();
  const idx = prev.findIndex((img) => img.localId === id);
  if (idx < 0) return null;
  const current = prev[idx];
  const nextImage: DraftImage = {
    ...current,
    ...(fields.remoteUrl !== undefined ? { remoteUrl: fields.remoteUrl } : {}),
    ...(fields.remoteStoragePath !== undefined
      ? { remoteStoragePath: fields.remoteStoragePath }
      : {}),
  };
  const next = [...prev];
  next[idx] = nextImage;
  writeDraftImagesMeta(next);
  return nextImage;
}
