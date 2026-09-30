// Unified media upload wrapper supporting Cloudinary and Supabase Storage
import {
  prepareImageForUpload,
  type PreparedImageForUpload,
} from "../../lib/prepareImageForUpload";
import type { NormalizedPostImage } from "../../lib/postImagePipeline";
import {
  getMediaUploadErrorCategory,
  isMediaUploadRetryable,
} from "../../lib/isMediaUploadRetryable";
import { retry } from "../../lib/retry";
import { uploadToCloudinary, uploadToCloudinaryRaw } from "./cloudinaryUpload";
import { createRandomUuid } from "../../lib/createRandomUuid";
import { supabase } from "../../lib/supabaseClient";
import {
  decideProfilePhotoStorageDeletion,
  isManagedProfilePhotoStoragePath,
  type ProfilePhotoDeleteSkipReason,
} from "../../lib/profilePhotos";

/** Supabase Storage bucket used for posts, avatars, and Profile photos. */
export const MEDIA_STORAGE_BUCKET = "media";

export interface UploadImageOptions {
  userId: string;
  kind: "avatar" | "post" | "comment";
}

type MediaProvider = "cloudinary" | "supabase";
type MediaUploadKind = UploadImageOptions["kind"];

const MEDIA_UPLOAD_LOG = "[MediaUpload]";

const MEDIA_UPLOAD_RETRY_OPTIONS = {
  maxRetries: 2,
  initialDelay: 900,
  maxDelay: 5000,
  backoffMultiplier: 2,
  retryCondition: isMediaUploadRetryable,
} as const;

type MediaUploadIoMeta = {
  kind: MediaUploadKind;
  provider: MediaProvider;
  bytes: number;
  contentType: string;
};

/**
 * Result of a best-effort Profile photo Storage cleanup.
 * Never throws for skip/failure — orphaned objects are preferable to broken Profile state.
 */
export type ProfilePhotoStorageCleanupResult = {
  deleted: boolean;
  skipped: boolean;
  /** Set when skipped before calling Storage, or when Storage returned an error. */
  reason?: ProfilePhotoDeleteSkipReason | "storage_error";
  /** Managed object key when a delete was attempted or would have been. */
  path?: string;
  /** Storage / unexpected error message (cleanup failed; profile metadata already OK). */
  error?: string;
};

function readMediaProvider(): MediaProvider {
  return (
    (import.meta.env.VITE_MEDIA_PROVIDER as MediaProvider) || "supabase"
  );
}

function isSupabaseDuplicateError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already exists") ||
    lower.includes("duplicate") ||
    lower.includes("409")
  );
}

function logMediaUploadDiagnostic(
  level: "info" | "error",
  event: string,
  meta: MediaUploadIoMeta & {
    attempt?: number;
    maxAttempts?: number;
    err?: unknown;
  }
): void {
  const payload: Record<string, unknown> = {
    event,
    kind: meta.kind,
    provider: meta.provider,
    bytes: meta.bytes,
    contentType: meta.contentType,
  };

  if (meta.attempt != null) {
    payload.attempt = meta.attempt;
    payload.maxAttempts = meta.maxAttempts;
  }

  if (meta.err != null) {
    payload.category = getMediaUploadErrorCategory(meta.err);
    payload.retryable = isMediaUploadRetryable(meta.err);
    payload.raw =
      meta.err instanceof Error ? meta.err.message : String(meta.err);
  }

  if (level === "info") {
    console.info(MEDIA_UPLOAD_LOG, payload);
  } else {
    console.error(MEDIA_UPLOAD_LOG, payload);
  }
}

async function runMediaUploadWithRetry<T>(
  meta: MediaUploadIoMeta,
  fn: () => Promise<T>
): Promise<T> {
  const maxAttempts = MEDIA_UPLOAD_RETRY_OPTIONS.maxRetries + 1;

  try {
    return await retry(fn, {
      ...MEDIA_UPLOAD_RETRY_OPTIONS,
      onRetry: (attempt, error) => {
        logMediaUploadDiagnostic("info", "retry", {
          ...meta,
          attempt,
          maxAttempts,
          err: error,
        });
      },
    });
  } catch (error) {
    logMediaUploadDiagnostic("error", "failed", {
      ...meta,
      attempt: maxAttempts,
      maxAttempts,
      err: error,
    });
    throw error;
  }
}

async function uploadBlobToSupabaseStorage(
  path: string,
  blob: Blob,
  contentType: string,
  kind: MediaUploadKind
): Promise<string> {
  const meta: MediaUploadIoMeta = {
    kind,
    provider: "supabase",
    bytes: blob.size,
    contentType,
  };

  return runMediaUploadWithRetry(meta, async () => {
    const { data, error } = await supabase.storage
      .from(MEDIA_STORAGE_BUCKET)
      .upload(path, blob, {
        contentType,
        upsert: false,
      });

    if (error) {
      const message = error.message || JSON.stringify(error);
      if (isSupabaseDuplicateError(message)) {
        logMediaUploadDiagnostic("info", "duplicate_path_ok", meta);
        return path;
      }
      throw new Error(`Supabase Storage upload failed: ${message}`);
    }

    if (!data?.path) {
      throw new Error("Supabase Storage upload succeeded but no path returned");
    }

    return data.path;
  });
}

async function uploadFileToCloudinaryWithRetry(
  meta: MediaUploadIoMeta,
  uploadFn: () => Promise<string>
): Promise<string> {
  return runMediaUploadWithRetry(meta, uploadFn);
}

/**
 * Low-level `media` bucket object remove. Caller must already have validated the path.
 * Does not throw — returns structured success/failure.
 *
 * Intentional limitation: Cloudinary objects are never deleted from the client
 * (no Admin API / secrets in this app).
 */
export async function deleteMediaStorageObject(
  path: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = typeof path === "string" ? path.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Missing storage path." };
  }

  try {
    const { error } = await supabase.storage
      .from(MEDIA_STORAGE_BUCKET)
      .remove([trimmed]);

    if (error) {
      const message = error.message || JSON.stringify(error);
      console.warn(MEDIA_UPLOAD_LOG, {
        event: "storage_remove_failed",
        path: trimmed,
        raw: message,
      });
      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(MEDIA_UPLOAD_LOG, {
      event: "storage_remove_exception",
      path: trimmed,
      raw: message,
    });
    return { ok: false, error: message };
  }
}

/**
 * After a successful `profile_photos` DB update: best-effort delete a superseded
 * managed Storage object. Never consults `avatar_url`. Never mutates profile rows.
 *
 * Skip (no delete) when preset / http(s) / other-user / still referenced / unknown.
 */
export async function deleteProfilePhotoIfSafe(args: {
  userId: string;
  removedPhoto: string | null | undefined;
  remainingPhotos?: string[] | null;
}): Promise<ProfilePhotoStorageCleanupResult> {
  const decision = decideProfilePhotoStorageDeletion({
    userId: args.userId,
    removedPhoto: args.removedPhoto,
    remainingPhotos: args.remainingPhotos,
  });

  if (decision.action === "skip") {
    return {
      deleted: false,
      skipped: true,
      reason: decision.reason,
      path:
        typeof args.removedPhoto === "string"
          ? args.removedPhoto.trim() || undefined
          : undefined,
    };
  }

  const removed = await deleteMediaStorageObject(decision.path);
  if (!removed.ok) {
    return {
      deleted: false,
      skipped: false,
      reason: "storage_error",
      path: decision.path,
      error: removed.error,
    };
  }

  return {
    deleted: true,
    skipped: false,
    path: decision.path,
  };
}

/**
 * Clean up a newly uploaded managed object when upload succeeded but the
 * subsequent `profile_photos` DB write failed (object never committed).
 *
 * Still requires `{userId}/avatar/...` — skips http(s) / Cloudinary / presets.
 */
export async function deleteUncommittedProfilePhotoUpload(args: {
  userId: string;
  uploadedPath: string | null | undefined;
}): Promise<ProfilePhotoStorageCleanupResult> {
  const path =
    typeof args.uploadedPath === "string" ? args.uploadedPath.trim() : "";
  const userId =
    typeof args.userId === "string" ? args.userId.trim() : "";

  if (!path) {
    return { deleted: false, skipped: true, reason: "empty" };
  }
  if (!userId) {
    return { deleted: false, skipped: true, reason: "missing_user_id", path };
  }
  if (/^https?:\/\//i.test(path) || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return { deleted: false, skipped: true, reason: "http_url", path };
  }
  if (!isManagedProfilePhotoStoragePath(path, userId)) {
    return {
      deleted: false,
      skipped: true,
      reason: "not_managed_path",
      path,
    };
  }

  const removed = await deleteMediaStorageObject(path);
  if (!removed.ok) {
    return {
      deleted: false,
      skipped: false,
      reason: "storage_error",
      path,
      error: removed.error,
    };
  }

  return { deleted: true, skipped: false, path };
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
  const provider = readMediaProvider();

  if (provider === "cloudinary") {
    const compressedFile = new File([prepared.blob], file.name, {
      type: prepared.contentType,
      lastModified: Date.now(),
    });
    return uploadFileToCloudinaryWithRetry(
      {
        kind: opts.kind,
        provider: "cloudinary",
        bytes: prepared.blob.size,
        contentType: prepared.contentType,
      },
      () => uploadToCloudinary(compressedFile)
    );
  }

  const path = `${opts.userId}/${opts.kind}/${createRandomUuid()}.${
    prepared.extension
  }`;

  try {
    return await uploadBlobToSupabaseStorage(
      path,
      prepared.blob,
      prepared.contentType,
      opts.kind
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Supabase Storage upload failed: ${String(error)}`);
  }
}

/**
 * Upload a blob already prepared by {@link prepareImageForUpload}(file, "post") (create-post)
 * or equivalent. Does not run client compression again — used by create-post only.
 */
export async function uploadNormalizedPostImage(
  normalized: NormalizedPostImage,
  opts: Pick<UploadImageOptions, "userId">
): Promise<string> {
  const { blob, contentType, extension } = normalized;
  const provider = readMediaProvider();
  const kind: MediaUploadKind = "post";

  if (provider === "cloudinary") {
    const safeExt = extension === "jpeg" ? "jpg" : extension;
    const file = new File([blob], `post-${createRandomUuid()}.${safeExt}`, {
      type: contentType,
      lastModified: Date.now(),
    });
    return uploadFileToCloudinaryWithRetry(
      {
        kind,
        provider: "cloudinary",
        bytes: blob.size,
        contentType,
      },
      () => uploadToCloudinaryRaw(file)
    );
  }

  const path = `${opts.userId}/post/${createRandomUuid()}.${extension}`;

  try {
    return await uploadBlobToSupabaseStorage(path, blob, contentType, kind);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Supabase Storage upload failed: ${String(error)}`);
  }
}

/**
 * Upload a Profile Photo already finalized by {@link exportProfilePhotoCropToFile}
 * (or {@link preparedProfilePhotoFromExport}). Does not re-compress.
 * Storage path stays the existing avatar convention: `{userId}/avatar/{uuid}.{ext}`.
 */
export async function uploadPreparedProfilePhoto(
  prepared: PreparedImageForUpload,
  opts: Pick<UploadImageOptions, "userId">
): Promise<string> {
  const { blob, contentType, extension } = prepared;
  const provider = readMediaProvider();
  const kind: MediaUploadKind = "avatar";
  const safeExt = extension === "jpeg" ? "jpg" : extension;

  if (provider === "cloudinary") {
    const file = new File(
      [blob],
      `profile-photo-${createRandomUuid()}.${safeExt}`,
      {
        type: contentType,
        lastModified: Date.now(),
      }
    );
    return uploadFileToCloudinaryWithRetry(
      {
        kind,
        provider: "cloudinary",
        bytes: blob.size,
        contentType,
      },
      () => uploadToCloudinaryRaw(file)
    );
  }

  const path = `${opts.userId}/avatar/${createRandomUuid()}.${safeExt}`;

  try {
    return await uploadBlobToSupabaseStorage(path, blob, contentType, kind);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Supabase Storage upload failed: ${String(error)}`);
  }
}
