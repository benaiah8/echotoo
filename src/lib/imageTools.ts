// PERF: compress originals and generate thumbnails client-side before upload
export async function fileToBitmap(file: File) {
  // Safari fallback: createImageBitmap may fail; fallback via <img>
  try {
    return await createImageBitmap(file);
  } catch {
    return await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => {
          if (!b) return reject(new Error("toBlob failed"));
          createImageBitmap(b).then(resolve, reject);
        });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}

function bitmapToBlob(bitmap: ImageBitmap, maxW: number, quality = 0.8) {
  const ratio = bitmap.height / bitmap.width;
  const w = Math.min(bitmap.width, maxW);
  const h = Math.round(w * ratio);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: "image/webp", quality });
}

export async function compressImage(file: File, maxW = 2000, quality = 0.85) {
  const bmp = await fileToBitmap(file);
  return await bitmapToBlob(bmp, maxW, quality); // WebP
}

export async function makeThumbnail(file: File, thumbW = 800, quality = 0.78) {
  const bmp = await fileToBitmap(file);
  return await bitmapToBlob(bmp, thumbW, quality); // WebP
}
