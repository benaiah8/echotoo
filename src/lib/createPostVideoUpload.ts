import type { BunnyUploadInitResponse } from "./bunnyUpload/types";
import type { PostMediaVideoStatus } from "./bunnyUpload/types";
import type { PostMediaRow } from "./postMediaRow";
import {
  DRAFT_VIDEO_MISSING_MESSAGE,
  LOCAL_DRAFT_VIDEO_MEDIA_ID,
  LOCAL_DRAFT_VIDEO_VIDEO_ID,
} from "./createDraftVideo/types";
import type { DraftVideo } from "./createDraftVideo/types";

export type PostVideoJobStatus =
  | "local"
  | "local_error"
  | "publish_uploading"
  | "publish_processing"
  | "preparing"
  | "uploading"
  | "processing"
  | "ready"
  | "removing"
  | "error";

export type PostVideoUploadJob = {
  mediaId: string;
  videoId: string;
  fileName?: string;
  status: PostVideoJobStatus;
  /** 0–100 during TUS upload only. */
  progress: number;
  videoStatus: PostMediaVideoStatus;
  posterUrl?: string | null;
  errorMessage?: string;
  /** Retained locally for preview and publish-time upload. */
  localFile?: File | null;
  /**
   * Native WebView-safe playable URL (convertFileSrc) or web blob URL.
   * Prefer this for Create preview — do not require localFile on native.
   */
  localPreviewUrl?: string | null;
  /** Session object URL from local poster extraction (revoked on cleanup). */
  localPosterUrl?: string | null;
  videoWidth?: number;
  videoHeight?: number;
  videoDuration?: number;
  /** Stable local draft id when persisted (V3G0). */
  localId?: string;
};

export const ONE_VIDEO_PER_POST_MESSAGE =
  "You can add one video per post.";

export const VIDEO_UPLOAD_INTERRUPTED_MESSAGE =
  "Video upload was interrupted. Re-select the same video to resume, or continue without video.";

export const VIDEO_REMOVAL_FAILED_MESSAGE =
  "Couldn't remove the video. Tap × to try again.";

export const VIDEO_REMOVAL_CANCELLED_MESSAGE =
  "Video upload cancelled.";

export const PUBLISH_VIDEO_CLEANUP_FAILED_MESSAGE =
  "Couldn't clean up the video upload. Try again or remove the video.";

export function hasActivePostVideo(job: PostVideoUploadJob | null): boolean {
  return job != null;
}

export function isVideoJobRemoving(job: PostVideoUploadJob | null): boolean {
  return job?.status === "removing";
}

export function isLocalDraftVideoJob(job: PostVideoUploadJob | null): boolean {
  return job?.status === "local" || job?.status === "local_error";
}

export function isPublishPhaseVideoJob(job: PostVideoUploadJob | null): boolean {
  return (
    job?.status === "publish_uploading" || job?.status === "publish_processing"
  );
}

export function hasRemoteVideoSlot(job: PostVideoUploadJob | null): boolean {
  if (!job?.mediaId) return false;
  return (
    job.mediaId !== LOCAL_DRAFT_VIDEO_MEDIA_ID &&
    job.mediaId !== "pending" &&
    job.mediaId !== "error"
  );
}

export function canStartAnotherPostVideo(job: PostVideoUploadJob | null): boolean {
  if (!job) return true;
  // Published Edit baseline may be replaced with a local DraftVideo (not a second slot).
  if (
    typeof job.localId === "string" &&
    job.localId.startsWith("published-ref:")
  ) {
    return true;
  }
  return job.status === "error" || job.status === "local_error";
}

export const VIDEO_SLOT_LOCKED_MESSAGE =
  "This video is still processing. Remove it before adding a different one.";

export const VIDEO_DIFFERENT_FILE_BLOCKED_MESSAGE =
  "Finish uploading the current video before choosing a different one.";

export function isSameVideoFileIdentity(
  left: Pick<File, "name" | "type" | "size" | "lastModified">,
  right: Pick<File, "name" | "type" | "size" | "lastModified">,
): boolean {
  return (
    left.name === right.name &&
    left.type === right.type &&
    left.size === right.size &&
    left.lastModified === right.lastModified
  );
}

export function isVideoSlotLockedForReplacement(
  job: PostVideoUploadJob | null,
): boolean {
  if (!job) return false;
  // Published edit reference may be replaced via Edit UX (local DraftVideo swap).
  if (
    typeof job.localId === "string" &&
    job.localId.startsWith("published-ref:")
  ) {
    return false;
  }
  return job.status === "processing" || job.status === "ready";
}

export function canAcceptNewVideoFile(
  job: PostVideoUploadJob | null,
  file: File,
):
  | { ok: true }
  | { ok: false; message: string } {
  if (!job || job.status === "error" || job.status === "local_error") {
    return { ok: true };
  }

  if (job.status === "local") {
    return { ok: true };
  }

  if (isVideoSlotLockedForReplacement(job)) {
    if (job.localFile && !isSameVideoFileIdentity(job.localFile, file)) {
      return { ok: false, message: VIDEO_SLOT_LOCKED_MESSAGE };
    }
    if (!job.localFile) {
      return { ok: false, message: VIDEO_SLOT_LOCKED_MESSAGE };
    }
    return { ok: true };
  }

  if (
    (job.status === "preparing" ||
      job.status === "uploading" ||
      job.status === "publish_uploading" ||
      job.status === "processing" ||
      job.status === "ready") &&
    job.localFile &&
    !isSameVideoFileIdentity(job.localFile, file)
  ) {
    return { ok: false, message: VIDEO_DIFFERENT_FILE_BLOCKED_MESSAGE };
  }

  return { ok: true };
}

export function mapLocalDraftVideoToJob(
  draftVideo: DraftVideo,
  localFile: File | null,
  localPreviewUrl: string | null = null,
): PostVideoUploadJob {
  const remoteMediaId = draftVideo.remoteMediaId?.trim() || null;
  const remoteVideoId = draftVideo.remoteVideoId?.trim() || null;
  const hasPlayable = Boolean(localFile || localPreviewUrl);

  if (!hasPlayable) {
    return {
      mediaId: remoteMediaId ?? LOCAL_DRAFT_VIDEO_MEDIA_ID,
      videoId: remoteVideoId ?? LOCAL_DRAFT_VIDEO_VIDEO_ID,
      fileName: draftVideo.fileName,
      status: "local_error",
      progress: 0,
      videoStatus: "pending",
      errorMessage: DRAFT_VIDEO_MISSING_MESSAGE,
      localFile: null,
      localPreviewUrl: null,
      localId: draftVideo.localId,
    };
  }

  return {
    mediaId: remoteMediaId ?? LOCAL_DRAFT_VIDEO_MEDIA_ID,
    videoId: remoteVideoId ?? LOCAL_DRAFT_VIDEO_VIDEO_ID,
    fileName: draftVideo.fileName,
    status: "local",
    progress: 0,
    videoStatus: "pending",
    localFile: localFile ?? null,
    localPreviewUrl: localPreviewUrl ?? null,
    localId: draftVideo.localId,
    videoWidth: draftVideo.width,
    videoHeight: draftVideo.height,
    videoDuration: draftVideo.duration,
  };
}

export function mapInitResponseToVideoJob(
  init: BunnyUploadInitResponse,
  file: File,
): PostVideoUploadJob {
  const base = {
    mediaId: init.mediaId,
    videoId: init.videoId,
    fileName: file.name,
    localFile: file,
    videoStatus: init.videoStatus,
    progress: 0,
  };

  if (!init.uploadRequired) {
    if (init.videoStatus === "ready") {
      return { ...base, status: "ready", progress: 100 };
    }
    if (init.videoStatus === "failed") {
      return {
        ...base,
        status: "error",
        progress: 0,
        errorMessage: "Video processing failed.",
      };
    }
    return { ...base, status: "processing", progress: 100 };
  }

  return { ...base, status: "uploading", progress: 0 };
}

export function applyPublishUploadProgressToVideoJob(
  job: PostVideoUploadJob,
  percent: number,
): PostVideoUploadJob {
  return {
    ...job,
    status: "publish_uploading",
    progress: percent,
    videoStatus: "uploading",
  };
}

export function applyPublishProcessingToVideoJob(
  job: PostVideoUploadJob,
): PostVideoUploadJob {
  return {
    ...job,
    status: "publish_processing",
    progress: 100,
    videoStatus: "processing",
  };
}

export function applyUploadProgressToVideoJob(
  job: PostVideoUploadJob,
  percent: number,
): PostVideoUploadJob {
  return {
    ...job,
    status: "uploading",
    progress: percent,
    videoStatus: "uploading",
  };
}

export function mapTusCompleteToVideoJob(
  job: PostVideoUploadJob,
): PostVideoUploadJob {
  return {
    ...job,
    status: "processing",
    progress: 100,
    videoStatus: "processing",
  };
}

export function mapPostMediaRowToVideoJob(
  row: PostMediaRow,
  localFile: File | null = null,
): PostVideoUploadJob {
  const base = {
    mediaId: row.id,
    videoId: row.bunny_video_id,
    posterUrl: row.poster_url,
    videoStatus: row.video_status,
    progress: row.video_status === "ready" ? 100 : 0,
    localFile,
  };

  if (row.video_status === "ready") {
    return { ...base, status: "ready" };
  }
  if (row.video_status === "failed") {
    return {
      ...base,
      status: "error",
      errorMessage: "Video processing failed.",
    };
  }
  if (row.video_status === "processing") {
    return { ...base, status: "processing" };
  }
  if (localFile && (row.video_status === "pending" || row.video_status === "uploading")) {
    return { ...base, status: "uploading", fileName: localFile.name };
  }
  if (row.video_status === "pending" || row.video_status === "uploading") {
    return {
      ...base,
      status: "error",
      errorMessage: VIDEO_UPLOAD_INTERRUPTED_MESSAGE,
    };
  }
  return { ...base, status: "processing" };
}

export function applyPostMediaStatusToVideoJob(
  job: PostVideoUploadJob,
  row: PostMediaRow,
): PostVideoUploadJob {
  const next = mapPostMediaRowToVideoJob(row, job.localFile ?? null);
  return {
    ...next,
    fileName: job.fileName ?? next.fileName,
    localFile: job.localFile ?? null,
    localId: job.localId,
  };
}

export function isVideoPublishBlocked(job: PostVideoUploadJob | null): boolean {
  if (!job) return false;
  if (job.status === "local") return false;
  if (job.status === "processing" || job.status === "ready") return false;
  return (
    job.status === "local_error" ||
    job.status === "publish_uploading" ||
    job.status === "publish_processing" ||
    job.status === "preparing" ||
    job.status === "uploading" ||
    job.status === "removing" ||
    job.status === "error"
  );
}

/** Pre-publish Create notices — images only; publish-phase upload is separate. */
export function isVideoUploadInProgress(job: PostVideoUploadJob | null): boolean {
  if (!job) return false;
  return job.status === "preparing" || job.status === "uploading";
}

export function shouldStartTusForInit(init: BunnyUploadInitResponse): boolean {
  return init.uploadRequired === true;
}

export function needsPublishTimeVideoUpload(
  job: PostVideoUploadJob | null,
): boolean {
  if (!job) return false;
  if (job.status === "local" || job.status === "local_error") {
    return job.status === "local";
  }
  if (job.status === "processing" || job.status === "ready") {
    return false;
  }
  if (hasRemoteVideoSlot(job)) {
    return job.status === "error" || job.status === "uploading";
  }
  return false;
}
