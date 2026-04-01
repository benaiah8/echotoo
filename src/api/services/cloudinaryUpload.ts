// PERF: Optimized Cloudinary upload with client-side compression
import { compressImage } from "../../lib/imageTools";

const CLOUD_NAME = "dif32yttc";
const UPLOAD_PRESET = "unsigned_experiences"; // make sure it's UNSIGNED in Cloudinary

function assertCloudinaryConfigured() {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUD_NAME and UPLOAD_PRESET in cloudinaryUpload.ts"
    );
  }
}

async function postCloudinaryForm(form: FormData): Promise<string> {
  assertCloudinaryConfigured();
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
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

export async function uploadToCloudinary(file: File): Promise<string> {
  // PERF: Compress image client-side before upload (reduces bandwidth by ~60-80%)
  const compressedFile = await compressImage(file, 1200, 0.78); // WebP, max 1200px, 78% quality

  const form = new FormData();
  form.append("file", compressedFile);
  form.append("upload_preset", UPLOAD_PRESET);
  return postCloudinaryForm(form);
}

/** Upload without re-compression (e.g. create-post pipeline already normalized the file). */
export async function uploadToCloudinaryRaw(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  return postCloudinaryForm(form);
}
