/**
 * Focused local video asset contract for Create (PASS A).
 * Structured so local-first images can reuse a similar shape later.
 */

import type { DraftVideoStorageKind } from "./types";

export type LocalVideoAsset = {
  localReference: string;
  storageKind: DraftVideoStorageKind;
  /** WebView-safe playable URL (convertFileSrc / blob). Not a full-file reconstruct. */
  previewUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  duration?: number;
};

export function isBlobPreviewUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("blob:");
}

/** Revoke only blob: object URLs — never Capacitor convertFileSrc URLs. */
export function revokeLocalVideoPreviewUrlIfBlob(
  url: string | null | undefined,
): void {
  if (isBlobPreviewUrl(url)) {
    URL.revokeObjectURL(url!);
  }
}

export const ADD_VIDEO_FAILED_USER_MESSAGE =
  "Couldn't add this video. Please try again.";

/** @deprecated Prefer VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE from createVideoConstraints. */
export const VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE =
  "This video format isn't supported. Choose an MP4 or MOV video.";
