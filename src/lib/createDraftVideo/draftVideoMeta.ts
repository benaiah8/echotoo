import { dispatchCreateFlowDraftContentChanged } from "../createFlowLeaveRequest";
import type { DraftVideo } from "./types";

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

export function readDraftVideoMeta(): DraftVideo | null {
  const raw = readDraftMetaRecord().draftVideo;
  if (!raw || typeof raw !== "object") return null;
  const video = raw as Record<string, unknown>;
  if (typeof video.localId !== "string" || !video.localId) return null;
  if (typeof video.fileName !== "string") return null;
  if (typeof video.mimeType !== "string") return null;
  if (typeof video.size !== "number") return null;
  if (video.localStorageKind !== "native-fs" && video.localStorageKind !== "idb-blob") {
    return null;
  }
  if (typeof video.localReference !== "string" || !video.localReference) return null;
  return video as DraftVideo;
}

export function writeDraftVideoMeta(video: DraftVideo | null): void {
  const prev = readDraftMetaRecord();
  const next = { ...prev };
  if (video) {
    next.draftVideo = video;
  } else {
    delete next.draftVideo;
  }
  writeDraftMetaRecord(next);
  notifyLocalDraftPersisted();
}

export function updateDraftVideoRemoteIds(
  remoteMediaId: string | null,
  remoteVideoId: string | null,
): DraftVideo | null {
  const current = readDraftVideoMeta();
  if (!current) return null;
  const next: DraftVideo = {
    ...current,
    remoteMediaId,
    remoteVideoId,
  };
  writeDraftVideoMeta(next);
  return next;
}

export function clearDraftVideoRemoteIds(): DraftVideo | null {
  const current = readDraftVideoMeta();
  if (!current) return null;
  const next: DraftVideo = {
    ...current,
    remoteMediaId: null,
    remoteVideoId: null,
    nativeTusUploadUrl: null,
  };
  writeDraftVideoMeta(next);
  return next;
}

/** Persist Bunny TUS Location for Android native resume (PASS P2). */
export function updateDraftVideoNativeTusUploadUrl(
  uploadUrl: string | null,
): DraftVideo | null {
  const current = readDraftVideoMeta();
  if (!current) return null;
  const next: DraftVideo = {
    ...current,
    nativeTusUploadUrl: uploadUrl,
  };
  writeDraftVideoMeta(next);
  return next;
}

/** Persist successful tiny poster Storage identity for publish retry (PV3.4). */
export function updateDraftVideoRemotePoster(
  remotePosterStoragePath: string | null,
  remotePosterUrl: string | null,
): DraftVideo | null {
  const current = readDraftVideoMeta();
  if (!current) return null;
  const next: DraftVideo = {
    ...current,
    remotePosterStoragePath,
    remotePosterUrl,
  };
  writeDraftVideoMeta(next);
  return next;
}
