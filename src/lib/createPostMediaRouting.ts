import { isProbablyPostImageFile } from "./postImagePipeline";
import { isAllowedCreateVideoMimeType } from "./createDraftVideo/createVideoConstraints";
import type { PickedMediaItem } from "./mediaAcquisition";

export type StartPostVideoUploadInput = {
  file: File;
  nativeSourceUri?: string | null;
  sizeBytes?: number;
  /** Native metadata duration (seconds) when available. */
  durationSeconds?: number | null;
};

export type RoutedWebLibrarySelection = {
  images: File[];
  video: File | null;
  videoNativeSourceUri: string | null;
  /** True when a video was selected while a draft video already exists (replace candidate). */
  replaceExistingVideo: boolean;
  /** Second video in the same batch (not a replace of the draft slot). */
  rejectedExtraVideo: boolean;
  unsupported: File[];
};

export function routeWebLibraryFiles(
  files: File[],
  options: { hasActiveVideo: boolean; imageSlotsRemaining: number },
): RoutedWebLibrarySelection {
  const images: File[] = [];
  let video: File | null = null;
  let replaceExistingVideo = false;
  let rejectedExtraVideo = false;
  const unsupported: File[] = [];

  for (const file of files) {
    const mime = (file.type || "").trim().toLowerCase();
    if (isAllowedCreateVideoMimeType(mime)) {
      if (video) {
        rejectedExtraVideo = true;
        continue;
      }
      if (options.hasActiveVideo) {
        replaceExistingVideo = true;
      }
      video = file;
      continue;
    }
    if (isProbablyPostImageFile(file)) {
      images.push(file);
      continue;
    }
    unsupported.push(file);
  }

  return {
    images: images.slice(0, Math.max(0, options.imageSlotsRemaining)),
    video,
    videoNativeSourceUri: null,
    replaceExistingVideo,
    rejectedExtraVideo,
    unsupported,
  };
}

export function partitionNativePickedMedia(
  items: PickedMediaItem[],
  options: { hasActiveVideo: boolean; imageSlotsRemaining: number },
): {
  images: File[];
  video: File | null;
  videoNativeSourceUri: string | null;
  videoSizeBytes?: number;
  videoDurationSeconds?: number | null;
  replaceExistingVideo: boolean;
  rejectedExtraVideo: boolean;
} {
  const images: File[] = [];
  let video: File | null = null;
  let videoNativeSourceUri: string | null = null;
  let videoSizeBytes: number | undefined;
  let videoDurationSeconds: number | null | undefined;
  let replaceExistingVideo = false;
  let rejectedExtraVideo = false;

  for (const item of items) {
    if (item.kind === "image") {
      images.push(item.file);
      continue;
    }
    if (video) {
      rejectedExtraVideo = true;
      continue;
    }
    if (options.hasActiveVideo) {
      replaceExistingVideo = true;
    }
    video = item.file;
    videoNativeSourceUri = item.nativeSourceUri;
    videoSizeBytes = item.sizeBytes;
    videoDurationSeconds = item.durationSeconds ?? null;
  }

  return {
    images: images.slice(0, Math.max(0, options.imageSlotsRemaining)),
    video,
    videoNativeSourceUri,
    videoSizeBytes,
    videoDurationSeconds,
    replaceExistingVideo,
    rejectedExtraVideo,
  };
}
