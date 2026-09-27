import type { MediaResult } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import {
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  isCreateVideoDurationOverLimit,
  isCreateVideoResolutionOverLimit,
  mapCreateVideoSourceValidationReason,
  messageForCreateVideoAcquisitionFailure,
  normalizeCreateVideoDurationSeconds,
  validateCreateVideoSource,
  type CreateVideoAcquisitionFailureReason,
} from "./createDraftVideo/createVideoConstraints";
import {
  classifyAndroidVideoUriScheme,
  formatAndroidVideoDiagFailure,
  logAndroidVideoDiagnostic,
} from "./devAndroidVideoDiagnostics";

export type NativeVideoPick = {
  file: File;
  /** Capacitor native URI/path suitable for Filesystem.copy — never webPath. */
  nativeSourceUri: string | null;
  /** Accurate byte size when known from native stat (metadata-only file). */
  sizeBytes?: number;
  /** Native metadata duration in seconds when available. */
  durationSeconds?: number | null;
};

export type NativeVideoPickOutcome =
  | { ok: true; pick: NativeVideoPick }
  | {
      ok: false;
      reason: CreateVideoAcquisitionFailureReason;
      message: string;
    };

/**
 * Resolve MIME/ext from picker format metadata.
 * Never silently claims an unknown token is MP4.
 */
export function videoMimeFromFormat(
  format: string | undefined,
):
  | { ok: true; mime: string; ext: string }
  | { ok: false; reason: "unsupported_format" | "format_unknown" } {
  const f = (format ?? "").trim().toLowerCase();
  if (!f) return { ok: false, reason: "format_unknown" };
  if (f === "mov" || f === "quicktime") {
    return { ok: true, mime: "video/quicktime", ext: "mov" };
  }
  if (f === "mp4" || f === "m4v") {
    return { ok: true, mime: "video/mp4", ext: "mp4" };
  }
  if (
    f === "webm" ||
    f === "avi" ||
    f === "mkv" ||
    f === "flv" ||
    f === "wmv" ||
    f === "3gp" ||
    f === "3gpp" ||
    f === "mpeg" ||
    f === "mpg"
  ) {
    return { ok: false, reason: "unsupported_format" };
  }
  return { ok: false, reason: "format_unknown" };
}

/**
 * Durable native source for Filesystem.copy.
 * Prefer a real filesystem path when the plugin also returns a content:// uri —
 * Ion Camera often exports to a local file while still exposing content://.
 * webPath is preview-only and must not be used for persistence.
 */
export function resolveNativeVideoSourceUri(
  result: Pick<MediaResult, "uri"> & { path?: string },
): string | null {
  const uri = result.uri?.trim() || "";
  const path = result.path?.trim() || "";
  const uriScheme = classifyAndroidVideoUriScheme(uri || null);
  if (path && (path.startsWith("/") || path.startsWith("file:"))) {
    // Prefer durable file path when content:// is temporary / grant-scoped.
    if (uriScheme === "content" || !uri) return path;
  }
  if (uri) return uri;
  if (path) return path;
  return null;
}

export function buildVideoFileFromBlob(
  blob: Blob,
  name: string,
  fallbackMime: string,
): File | null {
  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : fallbackMime;
  const file = new File([blob], name, { type });
  const validation = validateCreateVideoSource(file);
  if (!validation.ok) return null;
  return file;
}

export function buildVideoFileFromNativeStat(
  name: string,
  mime: string,
  sizeBytes: number,
  lastModified = Date.now(),
): File | null {
  const validation = validateCreateVideoSource({
    name,
    type: mime,
    size: sizeBytes,
  });
  if (!validation.ok) return null;
  return new File([], name, { type: mime, lastModified });
}

export type NativeVideoPersistStrategy = "uri-copy" | "file-bytes";

export function resolveNativeVideoPersistStrategy(options: {
  nativeSourceUri: string | null;
  isNativePlatform: boolean;
}): NativeVideoPersistStrategy {
  if (options.isNativePlatform && options.nativeSourceUri?.trim()) {
    return "uri-copy";
  }
  return "file-bytes";
}

async function readBlobViaFilesystemUri(
  uri: string,
  fallbackMime: string,
): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    const read = await Filesystem.readFile({ path: uri });

    if (typeof read.data === "string" && read.data.length > 0) {
      const binary = atob(read.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: fallbackMime });
    }

    if (read.data instanceof Blob && read.data.size > 0) {
      return read.data;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchBlobFromWebPath(webPath: string): Promise<Blob | null> {
  try {
    const response = await fetch(webPath);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function statNativeVideoUri(uri: string): Promise<number | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    const stat = await Filesystem.stat({ path: uri });
    if (typeof stat.size === "number" && stat.size > 0) {
      return stat.size;
    }
    return null;
  } catch {
    return null;
  }
}

function logPickFailed(stage: string, shortReason: string): void {
  logAndroidVideoDiagnostic(
    "ANDROID_VIDEO_PICK_FAILED",
    formatAndroidVideoDiagFailure({ stage, shortReason }),
  );
}

function fail(
  reason: CreateVideoAcquisitionFailureReason,
): NativeVideoPickOutcome {
  return {
    ok: false,
    reason,
    message: messageForCreateVideoAcquisitionFailure(reason),
  };
}

/**
 * Normalize a native Capacitor video pick.
 * Validates duration/size/format from metadata BEFORE expensive byte reads.
 */
export async function nativeVideoPickFromMediaResult(
  result: MediaResult,
  prefix: string,
  deps: {
    readBlobViaFilesystemUri?: typeof readBlobViaFilesystemUri;
    fetchBlobFromWebPath?: typeof fetchBlobFromWebPath;
    statNativeVideoUri?: typeof statNativeVideoUri;
    isNativePlatform?: boolean;
  } = {},
): Promise<NativeVideoPickOutcome> {
  const readUri = deps.readBlobViaFilesystemUri ?? readBlobViaFilesystemUri;
  const fetchWeb = deps.fetchBlobFromWebPath ?? fetchBlobFromWebPath;
  const statUri = deps.statNativeVideoUri ?? statNativeVideoUri;
  const isNative = deps.isNativePlatform ?? Capacitor.isNativePlatform();

  const formatToken = result.metadata?.format;
  const formatResolved = videoMimeFromFormat(formatToken);

  // --- Public constraints from native metadata (before any heavy IO) ---
  if (!formatResolved.ok && formatResolved.reason === "unsupported_format") {
    logPickFailed("metadata-format", "unsupported create video format");
    return fail("unsupported_format");
  }

  // Unknown format: allow byte-path acquisition to discover MIME from blob.type.
  // Do not invent video/mp4 for the metadata-only / stat path.
  const mimeKnown = formatResolved.ok ? formatResolved.mime : null;
  const ext = formatResolved.ok ? formatResolved.ext : "mp4";
  const name = `${prefix}-${Date.now()}.${ext}`;
  const nativeSourceUri = resolveNativeVideoSourceUri(result);
  const uriScheme = classifyAndroidVideoUriScheme(nativeSourceUri);
  const metadataSize =
    typeof result.metadata?.size === "number" ? result.metadata.size : null;
  const durationSeconds = normalizeCreateVideoDurationSeconds(
    (result.metadata as { duration?: unknown } | undefined)?.duration,
  );
  const metadataWidth = (() => {
    const meta = result.metadata as
      | { width?: unknown; height?: unknown }
      | undefined;
    return typeof meta?.width === "number" && meta.width > 0 ? meta.width : null;
  })();
  const metadataHeight = (() => {
    const meta = result.metadata as
      | { width?: unknown; height?: unknown }
      | undefined;
    return typeof meta?.height === "number" && meta.height > 0
      ? meta.height
      : null;
  })();

  if (isCreateVideoDurationOverLimit(durationSeconds)) {
    logPickFailed(
      "metadata-duration",
      `duration ${durationSeconds}s exceeds create max`,
    );
    return fail("too_long");
  }

  if (isCreateVideoResolutionOverLimit(metadataWidth, metadataHeight)) {
    logPickFailed(
      "metadata-resolution",
      `resolution ${metadataWidth}x${metadataHeight} exceeds 4K`,
    );
    return fail("too_high_resolution");
  }

  if (
    typeof metadataSize === "number" &&
    metadataSize > MAX_CREATE_VIDEO_SOURCE_BYTES
  ) {
    logPickFailed("metadata-size", "source exceeds 200 MB");
    return fail("too_large");
  }

  let statAttempted = false;
  let statOk = false;
  let statSize: number | null = null;
  let usedMetadataSize = false;

  const persistStrategy = resolveNativeVideoPersistStrategy({
    nativeSourceUri,
    isNativePlatform: isNative,
  });

  if (isNative && nativeSourceUri && mimeKnown) {
    statAttempted = true;
    const sizeBytes = await statUri(nativeSourceUri);
    if (sizeBytes != null) {
      statOk = true;
      statSize = sizeBytes;

      if (sizeBytes > MAX_CREATE_VIDEO_SOURCE_BYTES) {
        logPickFailed("native-stat-size", "stat size exceeds 200 MB");
        return fail("too_large");
      }

      const validation = validateCreateVideoSource({
        name,
        type: mimeKnown,
        size: sizeBytes,
      });
      if (!validation.ok) {
        logPickFailed(
          "native-stat-validation",
          `validateCreateVideoSource:${validation.reason}`,
        );
        return fail(mapCreateVideoSourceValidationReason(validation.reason));
      }

      const file = new File([], name, {
        type: validation.mimeType,
        lastModified: Date.now(),
      });
      logAndroidVideoDiagnostic("ANDROID_VIDEO_SOURCE_SELECTED", {
        uriScheme,
        statAttempted,
        statOk,
        statSize,
        metadataSize,
        usedMetadataSize,
        inferredMime: mimeKnown,
        validationOk: true,
        persistStrategy,
      });
      return {
        ok: true,
        pick: { file, nativeSourceUri, sizeBytes, durationSeconds },
      };
    }

    logAndroidVideoDiagnostic("ANDROID_VIDEO_SOURCE_SELECTED", {
      uriScheme,
      statAttempted,
      statOk: false,
      statSize: null,
      metadataSize,
      usedMetadataSize,
      inferredMime: mimeKnown,
      validationOk: false,
      persistStrategy,
    });
  } else {
    logAndroidVideoDiagnostic("ANDROID_VIDEO_SOURCE_SELECTED", {
      uriScheme,
      statAttempted: false,
      statOk: false,
      statSize: null,
      metadataSize,
      usedMetadataSize,
      inferredMime: mimeKnown,
      validationOk: false,
      persistStrategy,
      formatUnknown: !mimeKnown,
    });
  }

  if (result.webPath) {
    const blob = await fetchWeb(result.webPath);
    if (blob) {
      if (blob.size > MAX_CREATE_VIDEO_SOURCE_BYTES) {
        logPickFailed("webPath-size", "blob exceeds 200 MB");
        return fail("too_large");
      }
      const blobMime = blob.type || mimeKnown || "";
      const validation = validateCreateVideoSource({
        name,
        type: blobMime,
        size: blob.size,
      });
      if (!validation.ok) {
        logPickFailed(
          "webPath-validation",
          `validateCreateVideoSource:${validation.reason}`,
        );
        return fail(mapCreateVideoSourceValidationReason(validation.reason));
      }
      const file = new File([blob], name, { type: validation.mimeType });
      logAndroidVideoDiagnostic("ANDROID_VIDEO_SOURCE_SELECTED", {
        uriScheme,
        statAttempted,
        statOk,
        statSize,
        metadataSize,
        usedMetadataSize,
        inferredMime: validation.mimeType,
        validationOk: true,
        persistStrategy: resolveNativeVideoPersistStrategy({
          nativeSourceUri,
          isNativePlatform: isNative,
        }),
      });
      return {
        ok: true,
        pick: { file, nativeSourceUri, durationSeconds },
      };
    }
    logPickFailed("webPath-fetch", "empty or unreadable webPath blob");
  }

  if (result.uri) {
    const blob = await readUri(result.uri, mimeKnown || "application/octet-stream");
    if (blob) {
      if (blob.size > MAX_CREATE_VIDEO_SOURCE_BYTES) {
        logPickFailed("uri-read-size", "uri bytes exceed 200 MB");
        return fail("too_large");
      }
      const blobMime = blob.type || mimeKnown || "";
      const validation = validateCreateVideoSource({
        name,
        type: blobMime,
        size: blob.size,
      });
      if (!validation.ok) {
        logPickFailed(
          "uri-read-validation",
          `validateCreateVideoSource:${validation.reason}`,
        );
        return fail(mapCreateVideoSourceValidationReason(validation.reason));
      }
      const file = new File([blob], name, { type: validation.mimeType });
      logAndroidVideoDiagnostic("ANDROID_VIDEO_SOURCE_SELECTED", {
        uriScheme,
        statAttempted,
        statOk,
        statSize,
        metadataSize,
        usedMetadataSize,
        inferredMime: validation.mimeType,
        validationOk: true,
        persistStrategy: resolveNativeVideoPersistStrategy({
          nativeSourceUri,
          isNativePlatform: isNative,
        }),
      });
      return {
        ok: true,
        pick: { file, nativeSourceUri, durationSeconds },
      };
    }
    logPickFailed("uri-read", "empty or unreadable uri bytes");
  }

  if (!mimeKnown && !result.webPath && !result.uri) {
    logPickFailed("metadata-format", "format unknown and no readable bytes");
    return fail("unsupported_format");
  }

  logPickFailed(
    "native-video-pick",
    !nativeSourceUri && !result.webPath && !result.uri
      ? "no readable source"
      : "all acquisition paths failed",
  );
  if (nativeSourceUri || result.uri) {
    return fail("file_inaccessible");
  }
  return fail("read_failed");
}
