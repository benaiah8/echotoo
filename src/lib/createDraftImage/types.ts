/**
 * Local-first Create draft image model (PASS LI1A).
 * Image-specific — no video prep / Bunny / TUS fields.
 */

export type DraftImageStorageKind = "idb-blob" | "native-fs";

/**
 * Durable Create draft image metadata (localStorage-safe).
 * Bytes live in IndexedDB (web) or Directory.Data (native).
 */
export type DraftImage = {
  localId: string;
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  localStorageKind: DraftImageStorageKind;
  /** Durable local identity: IDB composite key or app-owned FS path. */
  localReference: string;
  /** Storage path or public URL after publish-time upload (LI1C retry). */
  remoteUrl?: string | null;
  /** Canonical Supabase object key when uploaded (LI1C). */
  remoteStoragePath?: string | null;
};

/** Discriminate DraftImage from DraftVideo-shaped objects in tests / guards. */
export const DRAFT_IMAGE_FORBIDDEN_VIDEO_FIELDS = [
  "preparationStatus",
  "preparedReference",
  "nativeTusUploadUrl",
  "remoteMediaId",
  "bunnyVideoId",
  "duration",
] as const;

export function isDraftImageStorageKind(
  value: unknown,
): value is DraftImageStorageKind {
  return value === "idb-blob" || value === "native-fs";
}

/**
 * Parse / validate a DraftImage from unknown JSON.
 * Rejects blob: localReference and missing required fields.
 */
export function parseDraftImage(raw: unknown): DraftImage | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.localId !== "string" || !row.localId.trim()) return null;
  if (typeof row.fileName !== "string") return null;
  if (typeof row.mimeType !== "string" || !row.mimeType.trim()) return null;
  if (typeof row.size !== "number" || !Number.isFinite(row.size) || row.size < 0) {
    return null;
  }
  if (!isDraftImageStorageKind(row.localStorageKind)) return null;
  if (typeof row.localReference !== "string" || !row.localReference.trim()) {
    return null;
  }
  if (row.localReference.startsWith("blob:")) return null;
  if (row.localReference.startsWith("data:")) return null;

  const out: DraftImage = {
    localId: row.localId.trim(),
    fileName: row.fileName,
    mimeType: row.mimeType.trim(),
    size: row.size,
    localStorageKind: row.localStorageKind,
    localReference: row.localReference.trim(),
  };

  if (
    typeof row.width === "number" &&
    Number.isFinite(row.width) &&
    row.width > 0
  ) {
    out.width = row.width;
  }
  if (
    typeof row.height === "number" &&
    Number.isFinite(row.height) &&
    row.height > 0
  ) {
    out.height = row.height;
  }
  if (row.remoteUrl === null || typeof row.remoteUrl === "string") {
    out.remoteUrl = row.remoteUrl;
  }
  if (
    row.remoteStoragePath === null ||
    typeof row.remoteStoragePath === "string"
  ) {
    out.remoteStoragePath = row.remoteStoragePath;
  }

  return out;
}

export function parseDraftImages(raw: unknown): DraftImage[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftImage[] = [];
  for (const item of raw) {
    const parsed = parseDraftImage(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Long-term: mediaOrder image.clientId === DraftImage.localId */
export function draftImageLocalIdAsMediaOrderClientId(localId: string): string {
  return localId.trim();
}

export function mediaOrderClientIdMatchesDraftImageLocalId(
  clientId: string,
  localId: string,
): boolean {
  return clientId.trim() === localId.trim();
}
