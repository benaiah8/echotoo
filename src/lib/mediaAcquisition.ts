/**
 * Platform image acquisition — returns browser `File` objects only.
 * No post/Supabase/upload coupling (reusable for comments, DMs, profile later).
 */
import {
  Camera,
  CameraErrorCode,
  EncodingType,
  MediaType,
  MediaTypeSelection,
  type MediaResult,
} from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { isProbablyPostImageFile, POST_IMAGE_POLICY } from "./postImagePipeline";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import {
  buildAndroidVideoPickResultPayload,
  logAndroidVideoDiagnostic,
} from "./devAndroidVideoDiagnostics";
import { nativeVideoPickFromMediaResult } from "./mediaAcquisitionVideo";
import type { NativeVideoPickOutcome } from "./mediaAcquisitionVideo";
import type { CreateVideoAcquisitionFailureReason } from "./createDraftVideo/createVideoConstraints";

const LOG = "[MediaAcquisition]";

/** Align native picker resize with post compressor long-edge (no double aggressive shrink). */
const NATIVE_TARGET_PX = POST_IMAGE_POLICY.maxEdgePx;

const NATIVE_GALLERY_PROCESSING = {
  quality: 90,
  targetWidth: NATIVE_TARGET_PX,
  targetHeight: NATIVE_TARGET_PX,
  correctOrientation: true,
} as const;

export type PickImagesFromLibraryOptions = {
  /** Remaining selectable slots (post cap applied by caller). */
  maxCount: number;
};

export type PickImagesFromLibraryResult = {
  files: File[];
  /** Photo assets returned by the native picker. */
  selectedCount: number;
  /** Assets that could not be normalized into valid Files. */
  failedCount: number;
};

export type CaptureImageFromCameraResult = {
  file: File | null;
  /** Photo captured but normalization failed (not user cancel). */
  readFailed: boolean;
};

export type PickVideoFromLibraryResult = {
  file: File | null;
  nativeSourceUri: string | null;
  sizeBytes?: number;
  durationSeconds?: number | null;
  /** Video asset returned by the native picker. */
  selected: boolean;
  /** Asset could not be normalized into a valid File. */
  readFailed: boolean;
  failureReason?: CreateVideoAcquisitionFailureReason | null;
  failureMessage?: string | null;
};

export type PickedMediaItem =
  | { kind: "image"; file: File }
  | {
      kind: "video";
      file: File;
      nativeSourceUri: string | null;
      sizeBytes?: number;
      durationSeconds?: number | null;
    };

export type PickMediaFromLibraryResult = {
  items: PickedMediaItem[];
  selectedCount: number;
  failedCount: number;
  /** Prefer this toast over generic read failures when set. */
  videoFailure?: {
    reason: CreateVideoAcquisitionFailureReason;
    message: string;
  } | null;
};

export type RecordVideoFromCameraResult = {
  file: File | null;
  nativeSourceUri: string | null;
  sizeBytes?: number;
  durationSeconds?: number | null;
  readFailed: boolean;
  failureReason?: CreateVideoAcquisitionFailureReason | null;
  failureMessage?: string | null;
};

function devLog(message: string, extra?: object): void {
  if (!import.meta.env.DEV) return;
  if (extra) {
    console.log(LOG, message, extra);
  } else {
    console.log(LOG, message);
  }
}

function normalizeFormatToken(format: string | undefined): string {
  return (format ?? "").trim().toLowerCase();
}

function mimeFromFormat(format: string | undefined): { mime: string; ext: string } {
  const f = normalizeFormatToken(format) || "jpeg";
  if (f === "jpg" || f === "jpeg") return { mime: "image/jpeg", ext: "jpg" };
  if (f === "png") return { mime: "image/png", ext: "png" };
  if (f === "webp") return { mime: "image/webp", ext: "webp" };
  if (f === "gif") return { mime: "image/gif", ext: "gif" };
  if (f === "heic") return { mime: "image/heic", ext: "heic" };
  if (f === "heif") return { mime: "image/heif", ext: "heif" };
  if (f === "avif") return { mime: "image/avif", ext: "avif" };
  return { mime: "image/jpeg", ext: "jpg" };
}

/** Explicit equality — MediaType.Photo is `0` and must not be truthiness-checked. */
function isMediaPhoto(result: MediaResult): boolean {
  return result.type === MediaType.Photo;
}

function isMediaVideo(result: MediaResult): boolean {
  return result.type === MediaType.Video;
}

function logAndroidVideoCameraResult(
  source: "library" | "record",
  result: MediaResult,
): void {
  logAndroidVideoDiagnostic(
    "ANDROID_VIDEO_PICK_RESULT",
    buildAndroidVideoPickResultPayload({
      source,
      type: result.type,
      format: result.metadata?.format,
      uri: result.uri,
      path: (result as MediaResult & { path?: string }).path,
      webPath: result.webPath,
      metadataSize: result.metadata?.size,
      metadataDuration: result.metadata?.duration,
      metadataResolution: result.metadata?.resolution,
    }),
  );
}

async function videoMediaResultToPick(
  result: MediaResult,
  prefix: string,
): Promise<NativeVideoPickOutcome> {
  return nativeVideoPickFromMediaResult(result, prefix);
}

function logPickerResults(results: MediaResult[]): void {
  devLog("picker results", {
    count: results.length,
    items: results.map((result) => ({
      type: result.type,
      format: result.metadata?.format,
      hasUri: Boolean(result.uri),
      hasWebPath: Boolean(result.webPath),
    })),
  });
}

/** User dismissed native camera / gallery UI — not an error. */
export function isCameraUserCancellation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return (
    code === CameraErrorCode.TakePhotoCancelled ||
    code === CameraErrorCode.ChooseMediaCancelled ||
    code === CameraErrorCode.EditPhotoCancelled ||
    code === CameraErrorCode.RecordVideoCancelled
  );
}

async function fetchBlobFromWebPath(webPath: string): Promise<Blob | null> {
  try {
    const response = await fetch(webPath);
    if (!response.ok) {
      devLog("reject stage", {
        stage: "webPath-fetch",
        reason: "http-status",
        status: response.status,
      });
      return null;
    }
    const blob = await response.blob();
    if (blob.size <= 0) {
      devLog("reject stage", { stage: "webPath-fetch", reason: "empty-blob" });
      return null;
    }
    return blob;
  } catch (err) {
    devLog("reject stage", {
      stage: "webPath-fetch",
      reason: "fetch-error",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Capacitor Camera docs: read full-resolution native media with
 * `Filesystem.readFile({ path: result.uri })` — pass uri unchanged.
 */
async function readBlobViaFilesystemUri(
  uri: string,
  fallbackMime: string,
): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    const read = await Filesystem.readFile({ path: uri });

    if (typeof read.data === "string" && read.data.length > 0) {
      const blob = base64ToBlob(read.data, fallbackMime);
      if (blob.size > 0) return blob;
    }

    if (read.data instanceof Blob && read.data.size > 0) {
      return read.data;
    }

    devLog("reject stage", {
      stage: "filesystem-read",
      reason: "empty-data",
    });
    return null;
  } catch (err) {
    devLog("reject stage", {
      stage: "filesystem-read",
      reason: "read-failed",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function buildFileFromBlob(
  blob: Blob,
  name: string,
  fallbackMime: string,
): File | null {
  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : fallbackMime;
  const file = new File([blob], name, { type });

  if (file.size <= 0) {
    devLog("reject stage", {
      stage: "file-validate",
      reason: "empty-file",
      name,
    });
    return null;
  }

  if (!isProbablyPostImageFile(file)) {
    devLog("reject stage", {
      stage: "file-validate",
      reason: "unsupported-image",
      name: file.name,
      type: file.type,
      size: file.size,
    });
    return null;
  }

  devLog("file ready", {
    name: file.name,
    type: file.type,
    size: file.size,
  });
  return file;
}

async function mediaResultToFile(
  result: MediaResult,
  index: number,
  prefix: string,
): Promise<File | null> {
  const { mime, ext } = mimeFromFormat(result.metadata?.format);
  const name = `${prefix}-${Date.now()}-${index}.${ext}`;

  if (result.webPath) {
    const blob = await fetchBlobFromWebPath(result.webPath);
    if (blob) {
      const file = buildFileFromBlob(blob, name, mime);
      if (file) return file;
    }
  }

  if (result.uri) {
    const blob = await readBlobViaFilesystemUri(result.uri, mime);
    if (blob) {
      const file = buildFileFromBlob(blob, name, mime);
      if (file) return file;
    }
  }

  devLog("reject stage", {
    stage: "media-result-to-file",
    reason: "no-readable-source",
    index,
    format: result.metadata?.format,
    hasUri: Boolean(result.uri),
    hasWebPath: Boolean(result.webPath),
  });
  return null;
}

async function normalizeMediaResults(
  results: MediaResult[],
  prefix: string,
): Promise<PickImagesFromLibraryResult> {
  const files: File[] = [];
  let failedCount = 0;

  for (let i = 0; i < results.length; i++) {
    const file = await mediaResultToFile(results[i]!, i, prefix);
    if (file) {
      files.push(file);
    } else {
      failedCount += 1;
    }
  }

  devLog("batch normalized", {
    selectedCount: results.length,
    successCount: files.length,
    failedCount,
  });

  return {
    files,
    selectedCount: results.length,
    failedCount,
  };
}

/**
 * Native multi-image gallery pick (Android/iOS). Returns empty on web or cancel.
 */
export async function pickImagesFromLibrary(
  options: PickImagesFromLibraryOptions,
): Promise<PickImagesFromLibraryResult> {
  const empty: PickImagesFromLibraryResult = {
    files: [],
    selectedCount: 0,
    failedCount: 0,
  };

  if (!isNativeApp()) return empty;

  const maxCount = Math.max(0, Math.floor(options.maxCount));
  if (maxCount <= 0) return empty;

  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: true,
      limit: maxCount,
      includeMetadata: true,
      editable: "no",
      ...NATIVE_GALLERY_PROCESSING,
    });

    logPickerResults(results);

    const photos = results.filter(isMediaPhoto);
    if (photos.length !== results.length) {
      devLog("skipped non-photo results", {
        total: results.length,
        photos: photos.length,
      });
    }

    if (!photos.length) return empty;

    return normalizeMediaResults(photos, "library");
  } catch (error) {
    if (isCameraUserCancellation(error)) return empty;
    throw error;
  }
}

/**
 * Native single-video gallery pick (Android/iOS). Returns empty on web or cancel.
 */
export async function pickVideoFromLibrary(): Promise<PickVideoFromLibraryResult> {
  const empty: PickVideoFromLibraryResult = {
    file: null,
    nativeSourceUri: null,
    selected: false,
    readFailed: false,
  };

  if (!isNativeApp()) return empty;

  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Video,
      allowMultipleSelection: false,
      limit: 1,
      includeMetadata: true,
      editable: "no",
    });

    logPickerResults(results);

    const videos = results.filter(isMediaVideo);
    if (!videos.length) return empty;

    logAndroidVideoCameraResult("library", videos[0]!);
    const outcome = await videoMediaResultToPick(videos[0]!, "library-video");
    if (outcome.ok) {
      const pick = outcome.pick;
      devLog("video file ready", {
        name: pick.file.name,
        type: pick.file.type,
        size: pick.sizeBytes ?? pick.file.size,
        hasNativeUri: Boolean(pick.nativeSourceUri),
      });
      return {
        file: pick.file,
        nativeSourceUri: pick.nativeSourceUri,
        sizeBytes: pick.sizeBytes,
        durationSeconds: pick.durationSeconds,
        selected: true,
        readFailed: false,
      };
    }
    return {
      file: null,
      nativeSourceUri: null,
      selected: true,
      readFailed: outcome.reason === "read_failed",
      failureReason: outcome.reason,
      failureMessage: outcome.message,
    };
  } catch (error) {
    if (isCameraUserCancellation(error)) return empty;
    throw error;
  }
}

/**
 * Native mixed gallery pick (photos + videos). Returns empty on web or cancel.
 */
export async function pickMediaFromLibrary(
  options: PickImagesFromLibraryOptions,
): Promise<PickMediaFromLibraryResult> {
  const empty: PickMediaFromLibraryResult = {
    items: [],
    selectedCount: 0,
    failedCount: 0,
  };

  if (!isNativeApp()) return empty;

  const maxCount = Math.max(0, Math.floor(options.maxCount));
  if (maxCount <= 0) return empty;

  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.All,
      allowMultipleSelection: true,
      limit: maxCount + 1,
      includeMetadata: true,
      editable: "no",
    });

    logPickerResults(results);
    if (!results.length) return empty;

    const items: PickedMediaItem[] = [];
    let failedCount = 0;
    let videoCount = 0;
    let videoFailure: PickMediaFromLibraryResult["videoFailure"] = null;

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (isMediaVideo(result)) {
        if (videoCount >= 1) {
          failedCount += 1;
          continue;
        }
        logAndroidVideoCameraResult("library", result);
        const outcome = await videoMediaResultToPick(
          result,
          `library-video-${i}`,
        );
        if (outcome.ok) {
          const pick = outcome.pick;
          items.push({
            kind: "video",
            file: pick.file,
            nativeSourceUri: pick.nativeSourceUri,
            sizeBytes: pick.sizeBytes,
            durationSeconds: pick.durationSeconds,
          });
          videoCount += 1;
        } else {
          failedCount += 1;
          if (!videoFailure) {
            videoFailure = {
              reason: outcome.reason,
              message: outcome.message,
            };
          }
        }
        continue;
      }

      if (isMediaPhoto(result)) {
        const file = await mediaResultToFile(result, i, "library");
        if (file) {
          items.push({ kind: "image", file });
        } else {
          failedCount += 1;
        }
      }
    }

    const images = items.filter((item) => item.kind === "image");
    const cappedImages = images.slice(0, maxCount);
    const videoItem = items.find((item) => item.kind === "video");
    const nextItems: PickedMediaItem[] = [...cappedImages];
    if (videoItem) nextItems.push(videoItem);

    return {
      items: nextItems,
      selectedCount: results.length,
      failedCount,
      videoFailure,
    };
  } catch (error) {
    if (isCameraUserCancellation(error)) return empty;
    throw error;
  }
}

/**
 * Native camera video recording (Android/iOS). Not available on web.
 */
export async function recordVideoFromCamera(): Promise<RecordVideoFromCameraResult> {
  const empty: RecordVideoFromCameraResult = {
    file: null,
    nativeSourceUri: null,
    readFailed: false,
  };
  if (!isNativeApp()) return empty;

  try {
    const result = await Camera.recordVideo({
      saveToGallery: false,
      isPersistent: true,
      includeMetadata: true,
    });

    logPickerResults([result]);

    if (!isMediaVideo(result)) {
      return empty;
    }

    logAndroidVideoCameraResult("record", result);
    const outcome = await videoMediaResultToPick(result, "camera-video");
    if (outcome.ok) {
      const pick = outcome.pick;
      devLog("video file ready", {
        name: pick.file.name,
        type: pick.file.type,
        size: pick.sizeBytes ?? pick.file.size,
        hasNativeUri: Boolean(pick.nativeSourceUri),
      });
      return {
        file: pick.file,
        nativeSourceUri: pick.nativeSourceUri,
        sizeBytes: pick.sizeBytes,
        durationSeconds: pick.durationSeconds,
        readFailed: false,
      };
    }
    return {
      file: null,
      nativeSourceUri: null,
      readFailed: outcome.reason === "read_failed",
      failureReason: outcome.reason,
      failureMessage: outcome.message,
    };
  } catch (error) {
    if (isCameraUserCancellation(error)) return empty;
    throw error;
  }
}

export async function captureImageFromCamera(): Promise<CaptureImageFromCameraResult> {
  const empty: CaptureImageFromCameraResult = { file: null, readFailed: false };

  if (!isNativeApp()) return empty;

  try {
    const result = await Camera.takePhoto({
      saveToGallery: false,
      includeMetadata: true,
      editable: "no",
      encodingType: EncodingType.JPEG,
      ...NATIVE_GALLERY_PROCESSING,
    });

    logPickerResults([result]);

    if (!isMediaPhoto(result)) {
      devLog("reject stage", {
        stage: "camera-result",
        reason: "non-photo-type",
        type: result.type,
      });
      return empty;
    }

    const file = await mediaResultToFile(result, 0, "camera");
    if (file) {
      return { file, readFailed: false };
    }
    return { file: null, readFailed: true };
  } catch (error) {
    if (isCameraUserCancellation(error)) return empty;
    throw error;
  }
}
