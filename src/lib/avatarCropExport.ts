import type { Area } from "react-easy-crop";

/** Square avatar export size (px). Kept moderate for WebView memory. */
export const AVATAR_CROP_OUTPUT_PX = 768;

const PNG_TYPE = "image/png";
const JPEG_TYPE = "image/jpeg";
const JPEG_FALLBACK_QUALITY = 0.92;

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for cropping."));
    img.src = src;
  });
}

function blobFromCanvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
            return;
          }
          reject(new Error("PNG export failed (empty blob)."));
        },
        PNG_TYPE,
        1
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function blobFromCanvasJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
            return;
          }
          reject(new Error("JPEG export failed (empty blob)."));
        },
        JPEG_TYPE,
        JPEG_FALLBACK_QUALITY
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
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
  const { x, y, width, height } = cropPixels;
  if (!imageSrc) {
    throw new Error("Missing image source.");
  }
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Invalid crop area.");
  }

  const size = Math.max(
    64,
    Math.min(Math.round(outputSize), AVATAR_CROP_OUTPUT_PX)
  );

  const img = await loadImageFromSrc(imageSrc);

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
    const blob = await blobFromCanvasPng(canvas);
    return new File([blob], "avatar-crop.png", { type: PNG_TYPE });
  } catch (pngErr) {
    console.warn("[avatarCropExport] PNG export failed, trying JPEG", pngErr);
    const jpegBlob = await blobFromCanvasJpeg(canvas);
    return new File([jpegBlob], "avatar-crop.jpg", { type: JPEG_TYPE });
  }
}
