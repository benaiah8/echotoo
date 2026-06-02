// Unified media upload wrapper supporting Cloudinary and Supabase Storage
import { prepareImageForUpload } from "../../lib/prepareImageForUpload";
import type { NormalizedPostImage } from "../../lib/postImagePipeline";
import {
  getMediaUploadErrorCategory,
  isMediaUploadRetryable,
} from "../../lib/isMediaUploadRetryable";
import { retry } from "../../lib/retry";
import { uploadToCloudinary, uploadToCloudinaryRaw } from "./cloudinaryUpload";
import { supabase } from "../../lib/supabaseClient";

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
    const { data, error } = await supabase.storage.from("media").upload(path, blob, {
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

  const path = `${opts.userId}/${opts.kind}/${crypto.randomUUID()}.${
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
    const file = new File([blob], `post-${crypto.randomUUID()}.${safeExt}`, {
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

  const path = `${opts.userId}/post/${crypto.randomUUID()}.${extension}`;

  try {
    return await uploadBlobToSupabaseStorage(path, blob, contentType, kind);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Supabase Storage upload failed: ${String(error)}`);
  }
}
