// Unified media upload wrapper supporting Cloudinary and Supabase Storage
import { prepareImageForUpload } from "../../lib/prepareImageForUpload";
import type { NormalizedPostImage } from "../../lib/postImagePipeline";
import { uploadToCloudinary, uploadToCloudinaryRaw } from "./cloudinaryUpload";
import { supabase } from "../../lib/supabaseClient";

export interface UploadImageOptions {
  userId: string;
  kind: "avatar" | "post" | "comment";
}

/**
 * Upload an image file to the configured media provider (Cloudinary or Supabase Storage).
 * Always compresses the image client-side before upload.
 *
 * @param file - The image file to upload
 * @param opts - Upload options: userId and kind (avatar, post, or comment)
 * @returns Promise resolving to:
 *   - Full Cloudinary URL if provider is 'cloudinary'
 *   - Storage path string (e.g., "userId/kind/uuid.webp") if provider is 'supabase'
 */
export async function uploadImage(
  file: File,
  opts: UploadImageOptions
): Promise<string> {
  const prepared = await prepareImageForUpload(file, opts.kind);

  // Read provider from env, default to 'supabase'
  const provider =
    (import.meta.env.VITE_MEDIA_PROVIDER as "cloudinary" | "supabase") ||
    "supabase";

  if (provider === "cloudinary") {
    // For Cloudinary, we need to pass a File, not a Blob
    // Convert Blob back to File for uploadToCloudinary
    const compressedFile = new File([prepared.blob], file.name, {
      type: prepared.contentType,
      lastModified: Date.now(),
    });
    return await uploadToCloudinary(compressedFile);
  }

  // Supabase Storage path (extension matches prepared output, usually webp)
  const path = `${opts.userId}/${opts.kind}/${crypto.randomUUID()}.${
    prepared.extension
  }`;

  try {
    const { data, error } = await supabase.storage
      .from("media")
      .upload(path, prepared.blob, {
        contentType: prepared.contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(
        `Supabase Storage upload failed: ${
          error.message || JSON.stringify(error)
        }`
      );
    }

    if (!data?.path) {
      throw new Error("Supabase Storage upload succeeded but no path returned");
    }

    // Return the storage path string (not a public URL)
    return data.path;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Supabase Storage upload failed: ${String(error)}`);
  }
}

const POST_IMAGE_PIPELINE_LOG = "[PostImagePipeline]";

/**
 * Upload a blob already prepared by {@link prepareImageForUpload}(file, "post") (create-post)
 * or equivalent. Does not run client compression again — used by create-post only.
 */
export async function uploadNormalizedPostImage(
  normalized: NormalizedPostImage,
  opts: Pick<UploadImageOptions, "userId">
): Promise<string> {
  const { blob, contentType, extension } = normalized;
  const provider =
    (import.meta.env.VITE_MEDIA_PROVIDER as "cloudinary" | "supabase") ||
    "supabase";

  if (provider === "cloudinary") {
    const safeExt = extension === "jpeg" ? "jpg" : extension;
    const file = new File([blob], `post-${crypto.randomUUID()}.${safeExt}`, {
      type: contentType,
      lastModified: Date.now(),
    });
    try {
      return await uploadToCloudinaryRaw(file);
    } catch (e) {
      console.error(POST_IMAGE_PIPELINE_LOG, "upload failed", {
        provider: "cloudinary",
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  const path = `${opts.userId}/post/${crypto.randomUUID()}.${extension}`;

  try {
    const { data, error } = await supabase.storage
      .from("media")
      .upload(path, blob, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(
        `Supabase Storage upload failed: ${
          error.message || JSON.stringify(error)
        }`
      );
    }

    if (!data?.path) {
      throw new Error("Supabase Storage upload succeeded but no path returned");
    }

    return data.path;
  } catch (error) {
    console.error(POST_IMAGE_PIPELINE_LOG, "upload failed", {
      provider: "supabase",
      pathPrefix: path.slice(0, 48),
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Supabase Storage upload failed: ${String(error)}`);
  }
}
