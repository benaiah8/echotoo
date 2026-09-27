import { supabase } from "../supabaseClient";
import type {
  BunnyUploadInitResponse,
  PostMediaVideoStatus,
} from "./types";

export type InvokeBunnyUploadInitParams = {
  publishPostId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Optional owner-scoped media-bucket poster key (not a URL). */
  posterStoragePath?: string | null;
};

export type InvokeBunnyUploadInitResult =
  | { ok: true; data: BunnyUploadInitResponse }
  | { ok: false; error: string; data?: unknown };

function isPostMediaVideoStatus(value: unknown): value is PostMediaVideoStatus {
  return (
    value === "pending" ||
    value === "uploading" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  );
}

export function parseBunnyUploadInitResponse(
  value: unknown,
): BunnyUploadInitResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (
    typeof record.mediaId !== "string" ||
    typeof record.videoId !== "string" ||
    typeof record.libraryId !== "string" ||
    !isPostMediaVideoStatus(record.videoStatus) ||
    typeof record.uploadRequired !== "boolean"
  ) {
    return null;
  }

  const base = {
    mediaId: record.mediaId,
    videoId: record.videoId,
    libraryId: record.libraryId,
    videoStatus: record.videoStatus,
    uploadRequired: record.uploadRequired,
    reused: typeof record.reused === "boolean" ? record.reused : undefined,
  };

  if (record.uploadRequired === true) {
    if (
      typeof record.tusEndpoint !== "string" ||
      typeof record.authorizationExpire !== "number" ||
      typeof record.authorizationSignature !== "string"
    ) {
      return null;
    }

    return {
      ...base,
      uploadRequired: true,
      tusEndpoint: record.tusEndpoint,
      authorizationExpire: record.authorizationExpire,
      authorizationSignature: record.authorizationSignature,
    };
  }

  if (
    record.tusEndpoint != null ||
    record.authorizationExpire != null ||
    record.authorizationSignature != null
  ) {
    return null;
  }

  return {
    ...base,
    uploadRequired: false,
  };
}

export async function invokeBunnyUploadInit(
  params: InvokeBunnyUploadInitParams,
): Promise<InvokeBunnyUploadInitResult> {
  const body: Record<string, unknown> = {
    publishPostId: params.publishPostId,
    fileName: params.fileName,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
  };
  const poster = params.posterStoragePath?.trim();
  if (poster) body.posterStoragePath = poster;

  const { data, error } = await supabase.functions.invoke("bunny-upload-init", {
    body,
  });

  if (error) {
    const body = data as { error?: string } | null;
    return {
      ok: false,
      error: body?.error ?? error.message,
      data,
    };
  }

  const parsed = parseBunnyUploadInitResponse(data);
  if (!parsed) {
    return { ok: false, error: "Invalid upload-init response", data };
  }

  return { ok: true, data: parsed };
}
