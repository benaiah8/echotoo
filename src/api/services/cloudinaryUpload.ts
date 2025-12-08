// PERF: Optimized Cloudinary upload with client-side compression
import { compressImage } from "../../lib/imageTools";

export async function uploadToCloudinary(file: File): Promise<string> {
  // TODO: fill these with your Cloudinary values
  const CLOUD_NAME = "dif32yttc";
  const UPLOAD_PRESET = "unsigned_experiences"; // make sure it's UNSIGNED in Cloudinary

  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUD_NAME and UPLOAD_PRESET in cloudinaryUpload.ts"
    );
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  // PERF: Compress image client-side before upload (reduces bandwidth by ~60-80%)
  const compressedFile = await compressImage(file, 2000, 0.85); // WebP, max 2000px, 85% quality

  const form = new FormData();
  form.append("file", compressedFile);
  form.append("upload_preset", UPLOAD_PRESET);
  // Optional: form.append("folder", "experiences");

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Cloudinary upload failed: ${res.status} ${JSON.stringify(err)}`
    );
  }
  const json = await res.json();
  if (!json.secure_url) throw new Error("No secure_url from Cloudinary");
  return json.secure_url as string;
}
