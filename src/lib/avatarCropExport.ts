import type { Area } from "react-easy-crop";

/** Square avatar export size (px). Kept moderate for WebView memory. */
export const AVATAR_CROP_OUTPUT_PX = 768;

/** Crop / export modes. Default callers use `avatar` (unchanged production behavior). */
export type CropExportMode = "avatar" | "profilePhoto";

/** Profile Photo crop frame (width:height). */
export const PROFILE_PHOTO_ASPECT = 4 / 5;

/** Long-edge cap for Profile Photo export (portrait → ~960×1200). */
export const PROFILE_PHOTO_MAX_EDGE_PX = 1200;

/** WebP encode quality for Profile Photo (final upload bytes). */
export const PROFILE_PHOTO_WEBP_QUALITY = 0.82;

/** JPEG fallback quality when WebP encode is unavailable. */
export const PROFILE_PHOTO_JPEG_QUALITY = 0.82;

const PNG_TYPE = "image/png";
const JPEG_TYPE = "image/jpeg";
const WEBP_TYPE = "image/webp";
const JPEG_FALLBACK_QUALITY = 0.92;

/** Avatar square only — Profile Photo uses source size with a long-edge cap (no min upscale). */
const MIN_AVATAR_OUTPUT_EDGE = 64;

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for cropping."));
    img.src = src;
  });
}

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
            return;
          }
          reject(new Error(`${mime} export failed (empty blob).`));
        },
        mime,
        quality
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function clampCropToImage(
  img: HTMLImageElement,
  cropPixels: Area
): { sx: number; sy: number; sourceW: number; sourceH: number } {
  const { x, y, width, height } = cropPixels;
  if (
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error("Invalid crop area.");
  }

  const sx = Math.max(0, Math.round(x));
  const sy = Math.max(0, Math.round(y));
  const sw = Math.max(1, Math.round(width));
  const sh = Math.max(1, Math.round(height));

  const maxSw = Math.max(0, img.naturalWidth - sx);
  const maxSh = Math.max(0, img.naturalHeight - sy);
  const sourceW = Math.min(sw, maxSw);
  const sourceH = Math.min(sh, maxSh);
  if (sourceW < 1 || sourceH < 1) {
    throw new Error("Crop is outside image bounds.");
  }
  return { sx, sy, sourceW, sourceH };
}

/**
 * Output size for a 4:5 Profile Photo crop.
 * Caps the long edge at {@link PROFILE_PHOTO_MAX_EDGE_PX}; does not upscale
 * above the source crop’s long edge.
 */
export function computeProfilePhotoOutputSize(
  sourceW: number,
  sourceH: number
): { width: number; height: number } {
  const srcLong = Math.max(1, Math.max(sourceW, sourceH));
  // Cap long edge; never upscale above the source crop.
  const longEdge = Math.min(PROFILE_PHOTO_MAX_EDGE_PX, Math.round(srcLong));
  // Portrait 4:5 → height is the long edge.
  const height = Math.max(1, longEdge);
  const width = Math.max(1, Math.round(height * PROFILE_PHOTO_ASPECT));
  return { width, height };
}

async function exportAvatarMode(
  imageSrc: string,
  cropPixels: Area,
  outputSize: number
): Promise<File> {
  const img = await loadImageFromSrc(imageSrc);
  const { sx, sy, sourceW, sourceH } = clampCropToImage(img, cropPixels);

  const size = Math.max(
    MIN_AVATAR_OUTPUT_EDGE,
    Math.min(Math.round(outputSize), AVATAR_CROP_OUTPUT_PX)
  );

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sourceW, sourceH, 0, 0, size, size);

  try {
    const blob = await blobFromCanvas(canvas, PNG_TYPE, 1);
    return new File([blob], "avatar-crop.png", { type: PNG_TYPE });
  } catch (pngErr) {
    console.warn("[avatarCropExport] PNG export failed, trying JPEG", pngErr);
    const jpegBlob = await blobFromCanvas(
      canvas,
      JPEG_TYPE,
      JPEG_FALLBACK_QUALITY
    );
    return new File([jpegBlob], "avatar-crop.jpg", { type: JPEG_TYPE });
  }
}

/**
 * Profile Photo path: crop → resize (≤1200 long edge) → single WebP encode.
 * No PNG intermediary; no second pass through prepareImageForUpload.
 */
async function exportProfilePhotoMode(
  imageSrc: string,
  cropPixels: Area
): Promise<File> {
  const img = await loadImageFromSrc(imageSrc);
  const { sx, sy, sourceW, sourceH } = clampCropToImage(img, cropPixels);
  const { width, height } = computeProfilePhotoOutputSize(sourceW, sourceH);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sourceW, sourceH, 0, 0, width, height);

  try {
    const blob = await blobFromCanvas(
      canvas,
      WEBP_TYPE,
      PROFILE_PHOTO_WEBP_QUALITY
    );
    return new File([blob], "profile-photo.webp", { type: WEBP_TYPE });
  } catch (webpErr) {
    console.warn(
      "[avatarCropExport] Profile Photo WebP export failed, trying JPEG",
      webpErr
    );
    try {
      const jpegBlob = await blobFromCanvas(
        canvas,
        JPEG_TYPE,
        PROFILE_PHOTO_JPEG_QUALITY
      );
      return new File([jpegBlob], "profile-photo.jpg", { type: JPEG_TYPE });
    } catch (jpegErr) {
      const msg =
        jpegErr instanceof Error ? jpegErr.message : String(jpegErr);
      throw new Error(`Profile Photo export failed: ${msg}`);
    }
  }
}

/**
 * Unified crop export.
 * - `avatar`: square PNG (or JPEG fallback) at ≤768 — existing production path;
 *   upload still re-encodes via {@link prepareImageForUpload}("avatar").
 * - `profilePhoto`: 4:5 WebP (JPEG fallback), max long edge 1200, single encode —
 *   ready for upload without a second compress pass.
 */
export async function exportCropToFile(args: {
  mode: CropExportMode;
  imageSrc: string;
  cropPixels: Area;
  /** Avatar mode only; ignored for profilePhoto. */
  outputSize?: number;
}): Promise<File> {
  const { mode, imageSrc, cropPixels, outputSize = AVATAR_CROP_OUTPUT_PX } =
    args;
  if (!imageSrc) {
    throw new Error("Missing image source.");
  }
  if (mode === "profilePhoto") {
    return exportProfilePhotoMode(imageSrc, cropPixels);
  }
  return exportAvatarMode(imageSrc, cropPixels, outputSize);
}

/**
 * Renders the given crop from an image (object URL or other same-origin src) to a square file.
 * Uses lossless PNG first to limit double-compression artifacts before `uploadImage` re-encodes.
 */
export async function exportAvatarCropToFile(
  imageSrc: string,
  cropPixels: Area,
  outputSize: number = AVATAR_CROP_OUTPUT_PX
): Promise<File> {
  return exportCropToFile({
    mode: "avatar",
    imageSrc,
    cropPixels,
    outputSize,
  });
}

/**
 * Profile Photo crop → final compressed file (WebP @ 0.82, max long edge 1200).
 * Prefer uploading via a prepared-blob path so this is not re-encoded.
 */
export async function exportProfilePhotoCropToFile(
  imageSrc: string,
  cropPixels: Area
): Promise<File> {
  return exportCropToFile({
    mode: "profilePhoto",
    imageSrc,
    cropPixels,
  });
}
