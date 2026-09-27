import { Capacitor } from "@capacitor/core";
import type { Directory, FilesystemPlugin } from "@capacitor/filesystem";
import {
  classifyAndroidVideoUriScheme,
  logAndroidVideoDiagnostic,
  shortErrorFromUnknown,
} from "../devAndroidVideoDiagnostics";
import { isNativeApp } from "../storage/utils/capacitorDetection";

/**
 * Build alternate source strings for Filesystem.copy.
 * Capacitor copy accepts absolute file paths and content:// when `directory` is omitted.
 * Try at most one alternate form (file:// strip/add) — never invent permissions.
 */
export function buildNativeVideoCopySourceCandidates(
  sourceUri: string,
): string[] {
  const raw = sourceUri.trim();
  if (!raw) return [];
  const out: string[] = [raw];
  if (raw.startsWith("file://")) {
    const stripped = raw.slice("file://".length);
    if (stripped && stripped !== raw) out.push(stripped);
  } else if (raw.startsWith("/") && !raw.startsWith("//")) {
    out.push(`file://${raw}`);
  }
  return out;
}

export function classifyNativeVideoPersistError(
  err: unknown,
): "empty_copy" | "inaccessible" | "no_bytes_fallback" | "js_persist_forbidden" | "unknown" {
  const message =
    err instanceof Error ? err.message : String(err ?? "unknown");
  if (message === "NATIVE_VIDEO_COPY_EMPTY") return "empty_copy";
  if (
    message === "NATIVE_VIDEO_COPY_NO_BYTES" ||
    message === "NATIVE_VIDEO_INACCESSIBLE"
  ) {
    return "inaccessible";
  }
  if (message === "NATIVE_VIDEO_EMPTY_FILE") return "no_bytes_fallback";
  if (message === "NATIVE_VIDEO_JS_PERSIST_FORBIDDEN") {
    return "js_persist_forbidden";
  }
  return "unknown";
}

function extensionFromMime(mimeType: string, fileName: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("quicktime")) return "mov";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("mp4")) return "mp4";
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "mp4";
}

export function buildNativeDraftVideoPath(
  publishPostId: string,
  localId: string,
  ext: string,
): string {
  return `create-drafts/${publishPostId}/${localId}.${ext}`;
}

export {
  buildNativePreparedVideoPath,
  buildNativePreparedVideoTempPath,
} from "./preparedVideoPaths";

/**
 * Load Filesystem without returning the Capacitor plugin proxy from an async
 * function (that Promise-assimilates `.then` → "Filesystem.then() is not
 * implemented on android").
 */
async function withFilesystem<T>(
  fn: (filesystem: FilesystemPlugin, dataDirectory: Directory) => Promise<T>,
): Promise<T> {
  const mod = await import("@capacitor/filesystem");
  return fn(mod.Filesystem, mod.Directory.Data);
}

async function ensureNativeDraftParentDirectory(publishPostId: string): Promise<void> {
  const parent = `create-drafts/${publishPostId}`;
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
 * Copy from a native acquisition URI into app-owned draft storage when possible.
 * Never writes an empty metadata-only File as a fallback.
 * Never materializes large library videos into JS base64 as a recovery path.
 */
export async function saveNativeDraftVideoFromUri(
  publishPostId: string,
  localId: string,
  sourceUri: string,
  file: File,
): Promise<{ path: string; strategy: "uri-copy" } | { path: string; strategy: "file-bytes" }> {
  const ext = extensionFromMime(file.type, file.name);
  const path = buildNativeDraftVideoPath(publishPostId, localId, ext);
  const sourceScheme = classifyAndroidVideoUriScheme(sourceUri);
  const candidates = buildNativeVideoCopySourceCandidates(sourceUri);

  await ensureNativeDraftParentDirectory(publishPostId);

  let lastCopyError: unknown = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const from = candidates[i]!;
    try {
      await withFilesystem(async (Filesystem, Directory) => {
        await Filesystem.copy({
          from,
          to: path,
          toDirectory: Directory,
        });
      });

      const size = await statNativeDraftVideoBytes(path);
      if (size == null || size <= 0) {
        await deleteNativeDraftVideoFile(path);
        logAndroidVideoDiagnostic("ANDROID_VIDEO_COPY_FAIL", {
          sourceScheme,
          shortErrorCode: "ZERO_BYTE",
          shortMessage: "copy-produced-empty-file",
          fallbackAttempted: false,
          candidateIndex: i,
        });
        throw new Error("NATIVE_VIDEO_COPY_EMPTY");
      }

      logAndroidVideoDiagnostic("ANDROID_VIDEO_COPY_SUCCESS", {
        strategy: "filesystem-copy",
        sourceScheme,
        destinationKind: "data",
        candidateIndex: i,
      });
      return { path, strategy: "uri-copy" };
    } catch (err) {
      lastCopyError = err;
      if (err instanceof Error && err.message === "NATIVE_VIDEO_COPY_EMPTY") {
        // Empty destination is terminal — do not try alternate URI forms.
        break;
      }
      const { shortErrorCode, shortMessage } = shortErrorFromUnknown(err);
      logAndroidVideoDiagnostic("ANDROID_VIDEO_COPY_FAIL", {
        sourceScheme,
        shortErrorCode,
        shortMessage,
        fallbackAttempted: false,
        candidateIndex: i,
      });
      // Try at most one alternate candidate, then fall through.
      if (i + 1 >= candidates.length) break;
    }
  }

  // No JavaScript File / base64 recovery. Large library videos must never be
  // materialized in JS memory. Caller surfaces VIDEO_INACCESSIBLE_USER_MESSAGE.
  const { shortErrorCode, shortMessage } = shortErrorFromUnknown(lastCopyError);
  logAndroidVideoDiagnostic("ANDROID_VIDEO_FILE_FALLBACK", {
    runtimeFileSize: file.size,
    sourceScheme,
    shortErrorCode,
    shortMessage,
    fallbackAttempted: false,
  });
  throw new Error("NATIVE_VIDEO_INACCESSIBLE");
}

/**
 * Native draft persistence requires a durable URI copy — never arrayBuffer/btoa.
 * Kept for API compatibility; always rejects so callers use URI copy instead.
 */
export async function saveNativeDraftVideoFile(
  _publishPostId: string,
  _localId: string,
  file: File,
): Promise<string> {
  if (file.size <= 0) {
    throw new Error("NATIVE_VIDEO_EMPTY_FILE");
  }
  throw new Error("NATIVE_VIDEO_JS_PERSIST_FORBIDDEN");
}

/**
 * WebView-safe playable URL for an app-owned Directory.Data draft video.
 * Does NOT read file bytes / base64.
 */
export async function resolveNativeDraftVideoPreviewUrl(
  localReference: string,
): Promise<string | null> {
  if (!isNativeApp() || !localReference.trim()) return null;
  try {
    const size = await statNativeDraftVideoBytes(localReference);
    if (size == null || size <= 0) {
      logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_FAIL", {
        shortErrorCode: "ZERO_BYTE",
        shortMessage: "preview-stat-empty",
      });
      return null;
    }

    const { uri } = await withFilesystem(async (Filesystem, Directory) =>
      Filesystem.getUri({
        path: localReference,
        directory: Directory,
      }),
    );
    if (!uri?.trim()) return null;
    const previewUrl = Capacitor.convertFileSrc(uri);
    logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_SUCCESS", {
      reconstructedFileSize: size,
      mimeType: null,
    });
    return previewUrl || null;
  } catch (err) {
    const { shortErrorCode, shortMessage } = shortErrorFromUnknown(err);
    logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_FAIL", {
      shortErrorCode,
      shortMessage,
    });
    console.warn("[createDraftVideo] native preview URL failed", err);
    return null;
  }
}

/** Stat app-owned draft / prepared path under Directory.Data. */
export async function statNativeDraftVideoBytes(
  localReference: string,
): Promise<number | null> {
  try {
    const stat = await withFilesystem(async (Filesystem, Directory) =>
      Filesystem.stat({
        path: localReference,
        directory: Directory,
      }),
    );
    if (typeof stat.size === "number" && stat.size > 0) return stat.size;
    return null;
  } catch {
    return null;
  }
}

/**
 * Poster / frame-extract compatibility only: full-file read into a JS File.
 * Must NOT be used for Create preview, draft resume, or VIDEO publish upload
 * (Capacitor native publish uses EchoVideoUpload native-path — PASS IOS3).
 */
export async function loadNativeDraftVideoFile(
  localReference: string,
  meta: { fileName: string; mimeType: string; lastModified?: number },
): Promise<File | null> {
  if (!isNativeApp()) return null;
  logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_START", {
    localReferenceKind: "data",
  });
  try {
    const read = await withFilesystem(async (Filesystem, Directory) =>
      Filesystem.readFile({
        path: localReference,
        directory: Directory,
      }),
    );

    if (typeof read.data !== "string" || !read.data.length) {
      logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_FAIL", {
        shortErrorCode: null,
        shortMessage: "empty-read-data",
      });
      return null;
    }

    const binary = atob(read.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length <= 0) {
      logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_FAIL", {
        shortErrorCode: "ZERO_BYTE",
        shortMessage: "decoded-empty",
      });
      return null;
    }
    const blob = new Blob([bytes], { type: meta.mimeType });
    const file = new File([blob], meta.fileName, {
      type: meta.mimeType,
      lastModified: meta.lastModified ?? Date.now(),
    });
    logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_SUCCESS", {
      reconstructedFileSize: file.size,
      mimeType: meta.mimeType || null,
    });
    return file;
  } catch (err) {
    const { shortErrorCode, shortMessage } = shortErrorFromUnknown(err);
    logAndroidVideoDiagnostic("ANDROID_VIDEO_RESTORE_FAIL", {
      shortErrorCode,
      shortMessage,
    });
    console.warn("[createDraftVideo] native publish File restore failed", err);
    return null;
  }
}

export async function deleteNativeDraftVideoFile(
  localReference: string,
  options?: {
    /**
     * Optional artifact (prepared / prepared.tmp). When true, skip deleteFile
     * if the path is already missing so Capacitor does not log OS-PLUG-FILE-0008.
     * Never use for required current-source deletes.
     */
    optional?: boolean;
  },
): Promise<void> {
  if (!isNativeApp() || !localReference) return;
  try {
    await withFilesystem(async (Filesystem, Directory) => {
      if (options?.optional) {
        try {
          await Filesystem.stat({
            path: localReference,
            directory: Directory,
          });
        } catch {
          // Already absent — idempotent success for optional cleanup.
          return;
        }
      }
      await Filesystem.deleteFile({
        path: localReference,
        directory: Directory,
      });
    });
  } catch (err) {
    if (options?.optional && isOptionalNativeFileMissingError(err)) {
      return;
    }
    /* best-effort */
  }
}

function isOptionalNativeFileMissingError(err: unknown): boolean {
  const { shortErrorCode, shortMessage } = shortErrorFromUnknown(err);
  const code = (shortErrorCode ?? "").toUpperCase();
  const msg = shortMessage.toLowerCase();
  if (code.includes("OS-PLUG-FILE-0008") || code.includes("FILE-0008")) {
    return true;
  }
  if (
    msg.includes("does not exist") ||
    msg.includes("not found") ||
    msg.includes("enoent") ||
    msg.includes("no such file")
  ) {
    return true;
  }
  return false;
}

export async function deleteNativeDraftVideoDirectory(
  publishPostId: string,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await withFilesystem(async (Filesystem, Directory) => {
      await Filesystem.rmdir({
        path: `create-drafts/${publishPostId}`,
        directory: Directory,
        recursive: true,
      });
    });
  } catch {
    /* best-effort */
  }
}

export function isNativeDraftStorageAvailable(): boolean {
  return Capacitor.isNativePlatform();
}
