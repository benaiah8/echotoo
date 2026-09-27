/**
 * Native app-owned Create draft image storage (Directory.Data).
 * Paths stay under create-drafts/{publishPostId}/images/.
 */

import { Capacitor } from "@capacitor/core";
import type { Directory, FilesystemPlugin } from "@capacitor/filesystem";
import { isNativeApp } from "../storage/utils/capacitorDetection";

const DRAFT_IMAGES_ROOT = "create-drafts";

function extensionFromMime(mimeType: string, fileName: string): string {
  const lower = (mimeType || "").toLowerCase();
  if (lower.includes("webp")) return "webp";
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "jpeg") return "jpg";
  if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 5) return ext;
  return "webp";
}

export function buildNativeDraftImagePath(
  publishPostId: string,
  localId: string,
  ext: string,
): string {
  const safeExt = ext.replace(/^\./, "").toLowerCase() || "webp";
  return `${DRAFT_IMAGES_ROOT}/${publishPostId.trim()}/images/${localId.trim()}.${safeExt}`;
}

export function buildNativeDraftImageDirectory(publishPostId: string): string {
  return `${DRAFT_IMAGES_ROOT}/${publishPostId.trim()}/images`;
}

/**
 * Reject path traversal and anything outside create-drafts/.../images/.
 */
export function assertSafeNativeDraftImagePath(
  path: string,
  publishPostId?: string,
): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) {
    throw new Error("UNSAFE_DRAFT_IMAGE_PATH");
  }
  if (normalized.includes("..") || normalized.includes("\0")) {
    throw new Error("UNSAFE_DRAFT_IMAGE_PATH");
  }
  if (!normalized.startsWith(`${DRAFT_IMAGES_ROOT}/`)) {
    throw new Error("UNSAFE_DRAFT_IMAGE_PATH");
  }
  const parts = normalized.split("/");
  // create-drafts / {publishPostId} / images / {file}
  if (parts.length !== 4 || parts[2] !== "images") {
    throw new Error("UNSAFE_DRAFT_IMAGE_PATH");
  }
  if (!parts[1] || !parts[3] || parts[3].includes("/")) {
    throw new Error("UNSAFE_DRAFT_IMAGE_PATH");
  }
  if (publishPostId && parts[1] !== publishPostId.trim()) {
    throw new Error("UNSAFE_DRAFT_IMAGE_PATH");
  }
  return normalized;
}

export function isNativeDraftImagePath(path: string): boolean {
  try {
    assertSafeNativeDraftImagePath(path);
    return true;
  } catch {
    return false;
  }
}

async function withFilesystem<T>(
  fn: (filesystem: FilesystemPlugin, dataDirectory: Directory) => Promise<T>,
): Promise<T> {
  const mod = await import("@capacitor/filesystem");
  return fn(mod.Filesystem, mod.Directory.Data);
}

async function ensureNativeDraftImageParent(
  publishPostId: string,
): Promise<void> {
  const parent = buildNativeDraftImageDirectory(publishPostId);
  try {
    await withFilesystem(async (Filesystem, Directory) => {
      await Filesystem.mkdir({
        path: parent,
        directory: Directory,
        recursive: true,
      });
    });
  } catch {
    /* may exist */
  }
}

/**
 * Persist optimized image bytes into Directory.Data.
 * Base64 is only the Capacitor writeFile transport — not durable identity.
 */
export async function saveNativeDraftImageBlob(
  publishPostId: string,
  localId: string,
  blob: Blob,
  meta: { fileName: string; mimeType: string },
): Promise<string> {
  if (!isNativeApp()) {
    throw new Error("NATIVE_DRAFT_IMAGE_UNAVAILABLE");
  }
  if (blob.size <= 0) {
    throw new Error("NATIVE_DRAFT_IMAGE_EMPTY");
  }
  const ext = extensionFromMime(meta.mimeType, meta.fileName);
  const path = assertSafeNativeDraftImagePath(
    buildNativeDraftImagePath(publishPostId, localId, ext),
    publishPostId,
  );
  await ensureNativeDraftImageParent(publishPostId);
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength <= 0) {
    throw new Error("NATIVE_DRAFT_IMAGE_EMPTY");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const data = btoa(binary);
  await withFilesystem(async (Filesystem, Directory) => {
    await Filesystem.writeFile({
      path,
      directory: Directory,
      data,
    });
  });
  return path;
}

export async function hasNativeDraftImageFile(
  localReference: string,
): Promise<boolean> {
  if (!isNativeApp() || !localReference.trim()) return false;
  try {
    const path = assertSafeNativeDraftImagePath(localReference);
    const size = await statNativeDraftImageBytes(path);
    return size != null && size > 0;
  } catch {
    return false;
  }
}

export async function statNativeDraftImageBytes(
  localReference: string,
): Promise<number | null> {
  try {
    const path = assertSafeNativeDraftImagePath(localReference);
    const stat = await withFilesystem(async (Filesystem, Directory) =>
      Filesystem.stat({
        path,
        directory: Directory,
      }),
    );
    const size =
      typeof stat.size === "number" && Number.isFinite(stat.size)
        ? stat.size
        : null;
    return size;
  } catch {
    return null;
  }
}

export async function resolveNativeDraftImagePreviewUrl(
  localReference: string,
): Promise<string | null> {
  if (!isNativeApp() || !localReference.trim()) return null;
  try {
    const path = assertSafeNativeDraftImagePath(localReference);
    const size = await statNativeDraftImageBytes(path);
    if (size == null || size <= 0) return null;
    const { uri } = await withFilesystem(async (Filesystem, Directory) =>
      Filesystem.getUri({
        path,
        directory: Directory,
      }),
    );
    if (!uri?.trim()) return null;
    return Capacitor.convertFileSrc(uri) || null;
  } catch {
    return null;
  }
}

/**
 * Publish-time: read optimized draft image bytes from Directory.Data.
 * Not for preview — preview uses convertFileSrc.
 */
export async function loadNativeDraftImageBlob(
  localReference: string,
  meta?: { mimeType?: string },
): Promise<Blob | null> {
  if (!isNativeApp() || !localReference.trim()) return null;
  try {
    const path = assertSafeNativeDraftImagePath(localReference);
    const size = await statNativeDraftImageBytes(path);
    if (size == null || size <= 0) return null;
    const read = await withFilesystem(async (Filesystem, Directory) =>
      Filesystem.readFile({
        path,
        directory: Directory,
      }),
    );
    if (typeof read.data !== "string" || !read.data.length) return null;
    const binary = atob(read.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length <= 0) return null;
    const mimeType =
      typeof meta?.mimeType === "string" && meta.mimeType.trim()
        ? meta.mimeType.trim()
        : "image/webp";
    return new Blob([bytes], { type: mimeType });
  } catch (err) {
    console.warn("[createDraftImage] native publish blob restore failed", err);
    return null;
  }
}

export async function deleteNativeDraftImageFile(
  localReference: string,
): Promise<void> {
  if (!isNativeApp() || !localReference) return;
  try {
    const path = assertSafeNativeDraftImagePath(localReference);
    await withFilesystem(async (Filesystem, Directory) => {
      await Filesystem.deleteFile({
        path,
        directory: Directory,
      });
    });
  } catch {
    /* best-effort */
  }
}

export async function deleteNativeDraftImagesForPost(
  publishPostId: string,
): Promise<void> {
  if (!isNativeApp()) return;
  const id = publishPostId.trim();
  if (!id || id.includes("..") || id.includes("/")) return;
  try {
    await withFilesystem(async (Filesystem, Directory) => {
      await Filesystem.rmdir({
        path: buildNativeDraftImageDirectory(id),
        directory: Directory,
        recursive: true,
      });
    });
  } catch {
    /* best-effort */
  }
}

export function isNativeDraftImageStorageAvailable(): boolean {
  return Capacitor.isNativePlatform();
}
