import { compressImage } from "./imageTools";
import {
  normalizeImageForUploadWithPolicy,
  POST_IMAGE_POLICY,
  type ImageNormalizePolicy,
} from "./postImagePipeline";
import { isCapacitor } from "./storage/utils/capacitorDetection";
import {
  PROFILE_PHOTO_JPEG_QUALITY,
  PROFILE_PHOTO_MAX_EDGE_PX,
  PROFILE_PHOTO_WEBP_QUALITY,
} from "./avatarCropExport";

/** Matches {@link UploadImageOptions}["kind"] without importing the service module. */
export type PrepareImagePreset = "avatar" | "post" | "comment" | "profilePhoto";

export type PreparedImageForUpload = {
  blob: Blob;
  contentType: string;
  /** Without leading dot; used in storage object key */
  extension: string;
};

export type PrepareImageForUploadOptions = {
  /** If true, always use legacy {@link compressImage} (escape hatch for tests / debugging). */
  forceWebLegacy?: boolean;
};

/**
 * Create-post on Capacitor: same long-edge as {@link POST_IMAGE_POLICY}, modestly higher encode quality.
 */
export const POST_NATIVE_CAPACITOR_IMAGE_POLICY: ImageNormalizePolicy = {
  maxEdgePx: 1600,
  webpQuality: 0.77,
  jpegQuality: 0.8,
};

/**
 * Modest quality bump on Capacitor for avatar + comment vs legacy web
 * {@link compressImage}(1200, 0.78). Same pipeline as create-post: resize-at-decode when
 * possible, WebP then JPEG fallback. Long-edge 1400 (below post feed images).
 */
export const AVATAR_NATIVE_IMAGE_POLICY: ImageNormalizePolicy = {
  maxEdgePx: 1400,
  webpQuality: 0.82,
  jpegQuality: 0.82,
};

/**
 * Profile Photo (Migration A / 3-slot editor) — single coherent size+quality policy.
 * Prefer {@link exportProfilePhotoCropToFile} which already applies this; use this
 * preset only for non-crop Profile Photo files. Does not change post/avatar/comment.
 */
export const PROFILE_PHOTO_IMAGE_POLICY: ImageNormalizePolicy = {
  maxEdgePx: PROFILE_PHOTO_MAX_EDGE_PX,
  webpQuality: PROFILE_PHOTO_WEBP_QUALITY,
  jpegQuality: PROFILE_PHOTO_JPEG_QUALITY,
};

/**
 * Wrap a file already finalized by {@link exportProfilePhotoCropToFile}
 * (WebP/JPEG) without re-encoding. Throws if the type is unexpected.
 */
export function preparedProfilePhotoFromExport(
  file: File
): PreparedImageForUpload {
  const type = (file.type || "").toLowerCase();
  if (type === "image/webp") {
    return { blob: file, contentType: "image/webp", extension: "webp" };
  }
  if (type === "image/jpeg" || type === "image/jpg") {
    return { blob: file, contentType: "image/jpeg", extension: "jpg" };
  }
  throw new Error(
    "Profile Photo export must be WebP or JPEG before upload."
  );
}

/**
 * Client-side image preparation before storage upload.
 *
 * - **`post`:** {@link normalizeImageForUploadWithPolicy} with {@link POST_IMAGE_POLICY} on web,
 *   {@link POST_NATIVE_CAPACITOR_IMAGE_POLICY} on Capacitor (same 1600px edge, slightly higher quality).
 * - **Native `avatar` | `comment`:** {@link AVATAR_NATIVE_IMAGE_POLICY}.
 * - **Web `avatar` | `comment`:** legacy {@link compressImage}(1200, 0.78) WebP.
 * - **`profilePhoto`:** {@link PROFILE_PHOTO_IMAGE_POLICY} (1200 / WebP 0.82). Prefer crop export
 *   + {@link preparedProfilePhotoFromExport} to avoid a second encode.
 */
export async function prepareImageForUpload(
  file: File,
  preset: PrepareImagePreset,
  options?: PrepareImageForUploadOptions
): Promise<PreparedImageForUpload> {
  if (options?.forceWebLegacy) {
    const blob = await compressImage(file, 1200, 0.78);
    return {
      blob,
      contentType: "image/webp",
      extension: "webp",
    };
  }

  if (preset === "post") {
    const policy = isCapacitor()
      ? POST_NATIVE_CAPACITOR_IMAGE_POLICY
      : POST_IMAGE_POLICY;
    const normalized = await normalizeImageForUploadWithPolicy(file, policy);
    return {
      blob: normalized.blob,
      contentType: normalized.contentType,
      extension: normalized.extension,
    };
  }

  if (preset === "profilePhoto") {
    // Prefer passthrough when crop export already produced final WebP/JPEG.
    const type = (file.type || "").toLowerCase();
    if (type === "image/webp" || type === "image/jpeg" || type === "image/jpg") {
      try {
        return preparedProfilePhotoFromExport(file);
      } catch {
        /* fall through to normalize */
      }
    }
    const normalized = await normalizeImageForUploadWithPolicy(
      file,
      PROFILE_PHOTO_IMAGE_POLICY
    );
    return {
      blob: normalized.blob,
      contentType: normalized.contentType,
      extension: normalized.extension,
    };
  }

  const useNativeRichPipeline =
    isCapacitor() && (preset === "avatar" || preset === "comment");

  if (useNativeRichPipeline) {
    const normalized = await normalizeImageForUploadWithPolicy(
      file,
      AVATAR_NATIVE_IMAGE_POLICY
    );
    return {
      blob: normalized.blob,
      contentType: normalized.contentType,
      extension: normalized.extension,
    };
  }

  const blob = await compressImage(file, 1200, 0.78);
  return {
    blob,
    contentType: "image/webp",
    extension: "webp",
  };
}
