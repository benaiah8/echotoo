import { compressImage } from "./imageTools";
import {
  normalizeImageForUploadWithPolicy,
  POST_IMAGE_POLICY,
  type ImageNormalizePolicy,
} from "./postImagePipeline";
import { isCapacitor } from "./storage/utils/capacitorDetection";

/** Matches {@link UploadImageOptions}["kind"] without importing the service module. */
export type PrepareImagePreset = "avatar" | "post" | "comment";

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
 * Client-side image preparation before storage upload.
 *
 * - **`post`:** {@link normalizeImageForUploadWithPolicy} with {@link POST_IMAGE_POLICY} on web,
 *   {@link POST_NATIVE_CAPACITOR_IMAGE_POLICY} on Capacitor (same 1600px edge, slightly higher quality).
 * - **Native `avatar` | `comment`:** {@link AVATAR_NATIVE_IMAGE_POLICY}.
 * - **Web `avatar` | `comment`:** legacy {@link compressImage}(1200, 0.78) WebP.
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
