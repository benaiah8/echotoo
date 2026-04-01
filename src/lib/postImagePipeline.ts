/**
 * Decode / resize / encode pipeline shared by create-post and (on native) avatar uploads.
 */

const LOG = "[PostImagePipeline]";

/** Tunable output for {@link normalizeImageForUploadWithPolicy}. */
export type ImageNormalizePolicy = {
  maxEdgePx: number;
  webpQuality: number;
  jpegQuality: number;
};

/** Single place to tune post-image output (feed / create UX). */
export const POST_IMAGE_POLICY: ImageNormalizePolicy = {
  /** Longest edge after normalization (px). */
  maxEdgePx: 1600,
  /** WebP encoder quality (0–1). */
  webpQuality: 0.74,
  /** JPEG fallback quality (0–1). */
  jpegQuality: 0.78,
};

/** Extensions commonly produced by phone cameras / galleries (lowercase, with dot). */
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".heic",
  ".heif",
  ".avif",
]);

/** Obvious non-images — reject even if MIME is wrong. */
const BLOCKED_EXTENSIONS = new Set([
  ".pdf",
  ".exe",
  ".zip",
  ".apk",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
]);

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

/**
 * Conservative acceptance for create-post picks: real images, including empty MIME + known ext.
 */
export function isProbablyPostImageFile(file: File): boolean {
  const t = (file.type || "").trim().toLowerCase();
  const ext = extensionOf(file.name || "");

  if (BLOCKED_EXTENSIONS.has(ext)) {
    console.log(LOG, "rejected blocked extension", { name: file.name, ext });
    return false;
  }

  if (t.startsWith("video/")) {
    console.log(LOG, "rejected video mime", { name: file.name, type: t });
    return false;
  }

  if (t.startsWith("image/")) {
    console.log(LOG, "accepted file (image/*)", { name: file.name, type: t });
    return true;
  }

  if (
    t === "" ||
    t === "application/octet-stream" ||
    t === "binary/octet-stream"
  ) {
    if (ext && IMAGE_EXTENSIONS.has(ext)) {
      console.log(LOG, "accepted file (empty/octet MIME + image ext)", {
        name: file.name,
        ext,
      });
      return true;
    }
    console.log(LOG, "rejected empty MIME without image extension", {
      name: file.name,
    });
    return false;
  }

  console.log(LOG, "rejected non-image MIME", { name: file.name, type: t });
  return false;
}

export type NormalizedPostImage = {
  blob: Blob;
  contentType: string;
  /** Without leading dot, for storage path */
  extension: string;
};

/**
 * Decode with optional resize during decode (reduces peak memory when supported).
 */
async function decodeToBitmapResized(
  file: File,
  policy: ImageNormalizePolicy
): Promise<ImageBitmap> {
  const { maxEdgePx } = policy;

  if (typeof createImageBitmap === "function") {
    try {
      // Single-axis resize preserves aspect ratio (both width+height would distort).
      const bmp = await createImageBitmap(file, {
        resizeWidth: maxEdgePx,
        resizeQuality: "high",
      });
      console.log(LOG, "decode via createImageBitmap (resized)", {
        w: bmp.width,
        h: bmp.height,
      });
      return bmp;
    } catch (e) {
      console.warn(
        LOG,
        "createImageBitmap resized failed, trying full decode",
        e
      );
    }

    try {
      const bmp = await createImageBitmap(file);
      console.log(
        LOG,
        "decode via createImageBitmap (full, will scale in canvas)"
      );
      return bmp;
    } catch (e) {
      console.warn(LOG, "createImageBitmap full failed, img fallback", e);
    }
  }

  return decodeViaImgElement(file);
}

async function decodeViaImgElement(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const bmp = await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          createImageBitmap(img).then(resolve, reject);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = url;
    });
    console.log(LOG, "decode fallback: <img> + createImageBitmap", {
      w: bmp.width,
      h: bmp.height,
    });
    return bmp;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaleDimensions(
  width: number,
  height: number,
  maxEdge: number
): { w: number; h: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { w: width, h: height };
  const scale = maxEdge / long;
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

type CanvasLike = OffscreenCanvas | HTMLCanvasElement;

function isOffscreenCanvasAvailable(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

async function canvasToBlob(
  canvas: CanvasLike,
  mime: string,
  quality: number
): Promise<Blob | null> {
  try {
    if (canvas instanceof OffscreenCanvas) {
      return await canvas.convertToBlob({ type: mime, quality });
    }
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality);
    });
  } catch {
    return null;
  }
}

async function encodeBitmap(
  bitmap: ImageBitmap,
  policy: ImageNormalizePolicy
): Promise<{ blob: Blob; mime: string; extension: string }> {
  const { maxEdgePx, webpQuality, jpegQuality } = policy;
  const { w, h } = scaleDimensions(bitmap.width, bitmap.height, maxEdgePx);

  const draw = (canvas: CanvasLike) => {
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx || !("drawImage" in ctx)) throw new Error("No 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
  };

  const tryEncode = async (
    canvas: CanvasLike,
    mime: string,
    quality: number,
    label: string
  ): Promise<Blob | null> => {
    const blob = await canvasToBlob(canvas, mime, quality);
    if (blob && blob.size > 0) {
      console.log(LOG, label, { bytes: blob.size, mime });
      return blob;
    }
    return null;
  };

  const tryWebpOffscreen = async (): Promise<Blob | null> => {
    if (!isOffscreenCanvasAvailable()) return null;
    try {
      const c = new OffscreenCanvas(w, h);
      draw(c);
      return await tryEncode(
        c,
        "image/webp",
        webpQuality,
        "encoded webp (OffscreenCanvas)"
      );
    } catch (e) {
      console.warn(LOG, "OffscreenCanvas webp failed", e);
      return null;
    }
  };

  const tryWebpHtml = async (): Promise<Blob | null> => {
    console.log(LOG, "encode fallback: HTMLCanvas for WebP");
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c);
    return await tryEncode(
      c,
      "image/webp",
      webpQuality,
      "encoded webp (HTMLCanvas)"
    );
  };

  const tryJpegOffscreen = async (): Promise<Blob | null> => {
    if (!isOffscreenCanvasAvailable()) return null;
    try {
      const c = new OffscreenCanvas(w, h);
      draw(c);
      return await tryEncode(
        c,
        "image/jpeg",
        jpegQuality,
        "encoded jpeg fallback (OffscreenCanvas)"
      );
    } catch (e) {
      console.warn(LOG, "OffscreenCanvas jpeg failed", e);
      return null;
    }
  };

  const tryJpegHtml = async (): Promise<Blob | null> => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c);
    return await tryEncode(
      c,
      "image/jpeg",
      jpegQuality,
      "encoded jpeg fallback (HTMLCanvas)"
    );
  };

  let blob = await tryWebpOffscreen();
  if (blob && blob.size > 0) {
    return { blob, mime: "image/webp", extension: "webp" };
  }
  blob = await tryWebpHtml();
  if (blob && blob.size > 0) {
    return { blob, mime: "image/webp", extension: "webp" };
  }
  blob = await tryJpegOffscreen();
  if (blob && blob.size > 0) {
    return { blob, mime: "image/jpeg", extension: "jpeg" };
  }
  blob = await tryJpegHtml();
  if (blob && blob.size > 0) {
    return { blob, mime: "image/jpeg", extension: "jpeg" };
  }

  throw new Error("Could not encode image (WebP and JPEG both failed)");
}

/**
 * Normalize a user-selected file to a small upload-ready blob (WebP preferred, JPEG fallback).
 */
export async function normalizeImageForUploadWithPolicy(
  file: File,
  policy: ImageNormalizePolicy
): Promise<NormalizedPostImage> {
  if (!isProbablyPostImageFile(file)) {
    throw new Error("Not a supported image file");
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeToBitmapResized(file, policy);
    const { blob, mime, extension } = await encodeBitmap(bitmap, policy);
    return {
      blob,
      contentType: mime,
      extension,
    };
  } finally {
    try {
      bitmap?.close();
    } catch {
      /* ignore */
    }
  }
}
