import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { uploadNormalizedPostImage } from "../../api/services/mediaUpload";
import {
  buildLocalDraftImageUrl,
  CREATE_LOCAL_FIRST_IMAGES_ENABLED,
  deleteDraftImage,
  persistDraftImage,
  reconcileDraftImages,
} from "../../lib/createDraftImage";
import { deleteCreatePostVideo } from "../../lib/bunnyUpload/invokeBunnyVideoDelete";
import {
  clearBunnyTusSingleFlight,
} from "../../lib/bunnyUpload/bunnyTusSingleFlight";
import type { StartPostVideoUploadInput } from "../../lib/createPostMediaRouting";
import {
  formatAndroidVideoDiagFailure,
  classifyAndroidVideoUriScheme,
  logAndroidVideoDiagnostic,
  logAndroidVideoIngestOutcome,
} from "../../lib/devAndroidVideoDiagnostics";
import {
  bumpVideoCrashDraftGeneration,
  markVideoCrashCheckpoint,
  markVideoCrashDraftFileState,
} from "../../lib/videoCrashDiagnostics";
import {
  ADD_VIDEO_FAILED_USER_MESSAGE,
  applyPreparationDecisionAfterSourceReady,
  cancelActiveDraftVideoPreparation,
  deleteDraftVideo,
  deleteDraftVideoStorageBytes,
  ensurePublishVideoPreparation,
  isDraftVideoPreparationActiveFor,
  isNativeEchoVideoUploadPlatform,
  loadDraftVideo,
  persistDraftVideo,
  readDraftVideoMeta,
  reconcileDraftVideoPreparation,
  resolveDraftVideoFile,
  resolveDraftVideoPreview,
  resolveVideoPreparationPolicy,
  writeDraftVideoMeta,
  VIDEO_INACCESSIBLE_USER_MESSAGE,
  VIDEO_INGEST_UNEXPECTED_USER_MESSAGE,
} from "../../lib/createDraftVideo";
import { cleanupDraftVideoAfterSuccessfulPublish } from "../../lib/createDraftVideo/discardCleanup";
import {
  classifyNativeVideoPersistError,
  statNativeDraftVideoBytes,
} from "../../lib/createDraftVideo/nativeDraftVideoStorage";
import {
  isCreateVideoDurationOverLimit,
  isCreateVideoResolutionOverLimit,
  mapCreateVideoSourceValidationReason,
  normalizeCreateVideoDurationSeconds,
  validateCreateVideoSource,
} from "../../lib/createDraftVideo/createVideoConstraints";
import { PREPARE_FAILED_USER_MESSAGE } from "../../lib/createDraftVideo/createVideoPreparationConstants";
import { showCreateVideoValidationToast } from "../../lib/showCreateVideoValidationToast";
import {
  extractVideoPosterFrame,
  extractVideoPosterFrameFromSrc,
  isVideoElementLoadAborted,
  probeLocalVideoFile,
  probeLocalVideoFromSrc,
  revokeVideoPosterObjectUrl,
  waitForCreatePreviewConsumerSwitch,
} from "../../lib/createDraftVideo/extractVideoPosterFrame";
import { resetCreateVideoMutedPreference } from "../../lib/createFinalizeVideoMutePreference";
import type { DraftVideo } from "../../lib/createDraftVideo/types";
import { markPrepareFailed } from "../../lib/createDraftVideo/videoPreparationState";
import { ECHO_VIDEO_PREPARE_ERROR } from "../../plugins/echoVideoPrepare/errors";
import { EchoVideoUpload } from "../../plugins/echoVideoUpload";
import { createPublishVideoUpload, logPublishFailureOutcome } from "../../lib/createPublishVideoUpload";
import { ensurePublishVideoPoster } from "../../lib/createDraftVideo/publishVideoPoster";
import { resolvePublishVideoBytesSource } from "../../lib/resolvePublishVideoBytesSource";
import {
  clearDraftVideoRemoteIds,
} from "../../lib/createDraftVideo/draftVideoMeta";
import {
  LOCAL_DRAFT_VIDEO_MEDIA_ID,
  LOCAL_DRAFT_VIDEO_VIDEO_ID,
} from "../../lib/createDraftVideo/types";
import {
  ONE_VIDEO_PER_POST_MESSAGE,
  PUBLISH_VIDEO_CLEANUP_FAILED_MESSAGE,
  VIDEO_REMOVAL_FAILED_MESSAGE,
  applyPostMediaStatusToVideoJob,
  applyPublishProcessingToVideoJob,
  applyPublishUploadProgressToVideoJob,
  canAcceptNewVideoFile,
  canStartAnotherPostVideo,
  hasRemoteVideoSlot,
  isLocalDraftVideoJob,
  isVideoPublishBlocked,
  isVideoUploadInProgress,
  mapLocalDraftVideoToJob,
  mapPostMediaRowToVideoJob,
  needsPublishTimeVideoUpload,
  type PostVideoUploadJob,
} from "../../lib/createPostVideoUpload";
import {
  ensureDraftPublishPostId,
  isCreateEditModeActive,
  readDraftPublishPostId,
} from "../../lib/drafts";
import { prepareImageForUpload } from "../../lib/prepareImageForUpload";
import { mapMediaUploadError } from "../../lib/mapMediaUploadError";
import { isProbablyPostImageFile } from "../../lib/postImagePipeline";
import {
  fetchPostMediaById,
  fetchUnattachedPostMediaForPublishPost,
} from "../../lib/postMediaRow";
import {
  isTerminalPostMediaVideoStatus,
  nextPostMediaPollDelayMs,
  POST_MEDIA_POLL_MAX_ATTEMPTS,
  shouldPollPostMediaVideoStatus,
} from "../../lib/postMediaStatusPolling";
import { supabase } from "../../lib/supabaseClient";
import {
  dispatchPostImageMerged,
  syncActivityPostImagesInDraftStorage,
  CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
  type CreateFlowPostImageMergedDetail,
} from "../../lib/createFlowDraftStorage";
import {
  CREATE_FLOW_SLOT0_IMAGES_PERSISTED_EVENT,
  deriveSlot0ImagesFromMediaOrder,
  ensureDraftMediaOrderPersisted,
  persistDraftMediaOrderOnly,
  readDraftMediaOrderState,
  writeDraftMediaOrderState,
  type CreateFlowSlot0ImagesPersistedDetail,
  type DraftMediaOrderItem,
} from "../../lib/createDraftMediaOrder";
import {
  buildEditDraftMediaOrderFromPublished,
  isPublishedVideoReferenceJob,
  isPublishedVideoReferenceLocalId,
  mapPublishedVideoReferenceToJob,
  publishedVideoRefLocalId,
  readEditPublishedVideoReference,
  seedEditMediaOrderIntoDraftMeta,
} from "../../lib/editPublishedMedia";
import { readCanonicalEditPostData } from "../../lib/editPostBootstrap";
import { mediaRemoveDiag } from "../../lib/createFinalizeMediaRemoveDiag";

/** In-memory jobs only; successful uploads are removed (no terminal `done` row kept). */
export type PostImageJobStatus = "uploading" | "error";

export type PostImageUploadJob = {
  id: string;
  activityIndex: number;
  fileName: string;
  status: PostImageJobStatus;
  errorMessage?: string;
};

export type PublishVideoUploadHandle = {
  abort: () => void;
};

export type CreatePostMediaContextValue = {
  jobs: PostImageUploadJob[];
  videoJob: PostVideoUploadJob | null;
  /** Local native video ingest in flight (persist/restore) — not Bunny upload. */
  localVideoIngestPending: boolean;
  /** Local Media3/AV preparation in flight — Publish-only (not Bunny upload). */
  videoPreparing: boolean;
  /**
   * True while Publish owns heavy video work (prepare/upload).
   * Preview must stay paused/unmounted; poster enrichment must not run.
   */
  createVideoHeavyMediaExclusive: boolean;
  hasPendingUploads: boolean;
  isPublishBlockedByMedia: boolean;
  publishVideoUploadProgress: number | null;
  startPostImageUploads: (
    files: File[],
    activityIndex: number,
  ) => Promise<void>;
  /** V3G0: persist video locally only (no Bunny/TUS on pick). */
  startPostVideoUpload: (input: StartPostVideoUploadInput) => Promise<void>;
  uploadVideoForPublish: (options?: {
    onPhase?: (
      phase:
        | "preparing_video"
        | "uploading_video"
        | "processing_video",
    ) => void;
    onProgress?: (percent: number) => void;
    onPosterResolved?: (info: {
      bytes: number;
      reusedRemote: boolean;
    }) => void;
  }) => Promise<
    | { ok: true; mediaId: string | null }
    | { ok: false; error: string }
  >;
  cancelPublishVideoUpload: () => Promise<boolean>;
  removePostVideo: () => Promise<boolean>;
  cleanupDraftVideoAfterPublish: () => Promise<void>;
  getPendingJobsForActivity: (activityIndex: number) => PostImageUploadJob[];
  dismissFailedUpload: (jobId: string) => void;
  registerUploadBatchHistoryBoundary: (fn: (() => void) | null) => void;
  /** PASS C1: persisted local media order (visual order unchanged until C2). */
  mediaOrder: DraftMediaOrderItem[];
  reconcileMediaOrder: (options?: {
    images?: string[];
    videoLocalId?: string | null;
  }) => DraftMediaOrderItem[];
  persistMediaOrder: (order: DraftMediaOrderItem[]) => void;
};

const CreatePostMediaContext =
  createContext<CreatePostMediaContextValue | null>(null);

const STRICT_MODE_UNMOUNT_GRACE_MS = 150;

async function enrichLocalVideoPresentation(
  job: PostVideoUploadJob,
  options: {
    file?: File | null;
    previewUrl?: string | null;
    signal?: AbortSignal | null;
  },
  draftVideo?: DraftVideo | null,
): Promise<PostVideoUploadJob> {
  const file = options.file ?? job.localFile ?? null;
  const previewUrl = options.previewUrl ?? job.localPreviewUrl ?? null;
  const signal = options.signal ?? null;
  const base: PostVideoUploadJob = {
    ...job,
    localFile: file,
    localPreviewUrl: previewUrl,
  };

  if (signal?.aborted) {
    return base;
  }

  markVideoCrashCheckpoint("poster-start");
  try {
    const frame = previewUrl
      ? await extractVideoPosterFrameFromSrc(previewUrl, { signal })
      : file
        ? await extractVideoPosterFrame(file, { signal })
        : null;
    if (signal?.aborted) {
      if (frame?.objectUrl) revokeVideoPosterObjectUrl(frame.objectUrl);
      return base;
    }
    if (!frame) {
      markVideoCrashCheckpoint("poster-finish");
      return base;
    }

    if (draftVideo) {
      writeDraftVideoMeta({
        ...draftVideo,
        width: frame.width || draftVideo.width,
        height: frame.height || draftVideo.height,
        duration: frame.duration || draftVideo.duration,
      });
    }
    markVideoCrashCheckpoint("poster-finish");
    return {
      ...base,
      localPosterUrl: frame.objectUrl,
      videoWidth: frame.width || job.videoWidth,
      videoHeight: frame.height || job.videoHeight,
      videoDuration: frame.duration || job.videoDuration,
    };
  } catch (err) {
    if (isVideoElementLoadAborted(err) || signal?.aborted) {
      // Abort is not a video incompatibility — keep base job silently.
      return base;
    }
    console.warn("[CreatePostMedia] local poster extraction failed", err);
    markVideoCrashCheckpoint("poster-finish");
    return base;
  }
}

function revokeJobLocalPoster(job: PostVideoUploadJob | null): void {
  revokeVideoPosterObjectUrl(job?.localPosterUrl);
}

export function CreatePostMediaProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<PostImageUploadJob[]>([]);
  const [videoJob, setVideoJob] = useState<PostVideoUploadJob | null>(() => {
    const ref = readEditPublishedVideoReference();
    return ref ? mapPublishedVideoReferenceToJob(ref) : null;
  });
  const [localVideoIngestPending, setLocalVideoIngestPending] =
    useState(false);
  /** Bumps when preparationStatus changes so consumers re-read draft meta. */
  const [preparationEpoch, setPreparationEpoch] = useState(0);
  const bumpPreparationEpoch = useCallback(() => {
    setPreparationEpoch((n) => n + 1);
  }, []);

  const videoPreparing = useMemo(() => {
    void preparationEpoch;
    const draft = loadDraftVideo();
    return draft?.preparationStatus === "preparing";
  }, [preparationEpoch, videoJob?.localId]);

  const preparationCallbacks = useMemo(
    () => ({
      onDraftUpdated: (_draft: DraftVideo) => {
        bumpPreparationEpoch();
      },
      onPrepareFailedUserMessage: (message: string, errorCode?: string) => {
        if (
          errorCode === ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high
        ) {
          showCreateVideoValidationToast("too_high_resolution");
          return;
        }
        toast.error(message || PREPARE_FAILED_USER_MESSAGE);
      },
    }),
    [bumpPreparationEpoch],
  );

  const [publishVideoUploadProgress, setPublishVideoUploadProgress] =
    useState<number | null>(null);
  const uploadBatchHistoryBoundaryRef = useRef<(() => void) | null>(null);
  const publishUploadAbortRef = useRef<AbortController | null>(null);
  const publishNativeUploadJobIdRef = useRef<string | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptRef = useRef(0);
  const hydratedPublishPostIdRef = useRef<string | null>(null);
  const videoJobRef = useRef<PostVideoUploadJob | null>(null);
  const providerGenerationRef = useRef(0);
  const videoIngestGenerationRef = useRef(0);
  const videoRemovalRequestedRef = useRef(false);
  /** Bumps to cancel in-flight poster enrichment (never overlaps Publish prepare). */
  const posterEnrichGenerationRef = useRef(0);
  const posterAbortRef = useRef<AbortController | null>(null);
  const heavyMediaExclusiveRef = useRef(false);
  const [createVideoHeavyMediaExclusive, setCreateVideoHeavyMediaExclusive] =
    useState(false);

  const abortPosterEnrichment = useCallback(() => {
    posterEnrichGenerationRef.current += 1;
    const prev = posterAbortRef.current;
    posterAbortRef.current = null;
    try {
      prev?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  const beginPosterEnrichment = useCallback((): AbortSignal => {
    abortPosterEnrichment();
    const next = new AbortController();
    posterAbortRef.current = next;
    return next.signal;
  }, [abortPosterEnrichment]);

  const setHeavyMediaExclusive = useCallback(
    (active: boolean) => {
      heavyMediaExclusiveRef.current = active;
      setCreateVideoHeavyMediaExclusive(active);
      if (active) {
        // Cancel any in-flight Create poster decode before native prepare.
        abortPosterEnrichment();
      }
    },
    [abortPosterEnrichment],
  );

  const [mediaOrder, setMediaOrder] = useState<DraftMediaOrderItem[]>(() =>
    ensureDraftMediaOrderPersisted(),
  );

  const reconcileMediaOrder = useCallback(
    (options?: { images?: string[]; videoLocalId?: string | null }) => {
      // LI1D.4: read persisted before-state (do not close over React mediaOrder —
      // keeps this callback stable; diagnostics only).
      const beforeClientIds = readDraftMediaOrderState().mediaOrder.map(
        (i) => i.clientId,
      );
      // When caller omits videoLocalId, prefer live videoJob over disk meta so
      // image/slot0 reconcile cannot treat a temporary meta lag as "no video".
      // Do not coerce missing live job to null (that would mean explicit remove).
      let merged = options;
      if (options?.videoLocalId === undefined) {
        const liveId = videoJobRef.current?.localId?.trim();
        if (liveId) {
          merged = { ...options, videoLocalId: liveId };
        }
      }
      const order = ensureDraftMediaOrderPersisted(merged);
      const afterClientIds = order.map((i) => i.clientId);
      const changed =
        beforeClientIds.length !== afterClientIds.length ||
        beforeClientIds.some((id, idx) => id !== afterClientIds[idx]);
      if (changed) {
        mediaRemoveDiag("reconcile", {
          reason: "CreatePostMediaProvider.reconcileMediaOrder",
          beforeClientIds,
          afterClientIds,
          optionsKeys: merged ? Object.keys(merged) : [],
        });
      }
      setMediaOrder(order);
      return order;
    },
    [],
  );

  const persistMediaOrder = useCallback((order: DraftMediaOrderItem[]) => {
    persistDraftMediaOrderOnly(order, { notify: false });
    setMediaOrder(order);
  }, []);

  useEffect(() => {
    reconcileMediaOrder();
  }, [reconcileMediaOrder]);

  useEffect(() => {
    const onPostImageMerged = (e: Event) => {
      const detail = (e as CustomEvent<CreateFlowPostImageMergedDetail>).detail;
      if (!detail || !Array.isArray(detail.images)) return;
      mediaRemoveDiag("reconcile", {
        reason: "event:CREATE_FLOW_POST_IMAGE_MERGED",
        imageCount: detail.images.length,
      });
      reconcileMediaOrder({ images: detail.images });
    };
    const onSlot0ImagesPersisted = (e: Event) => {
      const detail = (e as CustomEvent<CreateFlowSlot0ImagesPersistedDetail>)
        .detail;
      if (!detail || !Array.isArray(detail.images)) return;
      mediaRemoveDiag("reconcile", {
        reason: "event:CREATE_FLOW_SLOT0_IMAGES_PERSISTED",
        imageCount: detail.images.length,
      });
      reconcileMediaOrder({ images: detail.images });
    };

    window.addEventListener(
      CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
      onPostImageMerged as EventListener,
    );
    window.addEventListener(
      CREATE_FLOW_SLOT0_IMAGES_PERSISTED_EVENT,
      onSlot0ImagesPersisted as EventListener,
    );
    return () => {
      window.removeEventListener(
        CREATE_FLOW_POST_IMAGE_MERGED_EVENT,
        onPostImageMerged as EventListener,
      );
      window.removeEventListener(
        CREATE_FLOW_SLOT0_IMAGES_PERSISTED_EVENT,
        onSlot0ImagesPersisted as EventListener,
      );
    };
  }, [reconcileMediaOrder]);

  useEffect(() => {
    videoJobRef.current = videoJob;
  }, [videoJob]);

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current != null) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const registerUploadBatchHistoryBoundary = useCallback(
    (fn: (() => void) | null) => {
      uploadBatchHistoryBoundaryRef.current = fn;
    },
    [],
  );

  const hasImageUploadsInFlight = useMemo(
    () => jobs.some((j) => j.status === "uploading"),
    [jobs],
  );

  const hasPendingUploads = useMemo(
    () =>
      hasImageUploadsInFlight ||
      isVideoUploadInProgress(videoJob) ||
      localVideoIngestPending,
    [hasImageUploadsInFlight, localVideoIngestPending, videoJob],
  );

  const isPublishBlockedByMedia = useMemo(
    () =>
      hasImageUploadsInFlight ||
      isVideoPublishBlocked(videoJob) ||
      localVideoIngestPending,
    [hasImageUploadsInFlight, localVideoIngestPending, videoJob],
  );

  const getPendingJobsForActivity = useCallback(
    (activityIndex: number) =>
      jobs.filter(
        (j) =>
          j.activityIndex === activityIndex &&
          (j.status === "uploading" || j.status === "error"),
      ),
    [jobs],
  );

  const dismissFailedUpload = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const markJobError = useCallback(
    (jobId: string, err: unknown, logLabel: string, logExtra?: object) => {
      const raw =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      const friendly = mapMediaUploadError(err, "post");
      console.error(`[CreatePostMedia] ${logLabel}`, {
        ...logExtra,
        raw,
        friendly,
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: "error" as const, errorMessage: friendly }
            : j,
        ),
      );
      toast.error(friendly);
    },
    [],
  );

  const completeVideoRemovalLocal = useCallback(() => {
    revokeJobLocalPoster(videoJobRef.current);
    setVideoJob(null);
    videoRemovalRequestedRef.current = false;
    publishUploadAbortRef.current = null;
    pollAttemptRef.current = 0;
    setPublishVideoUploadProgress(null);
    resetCreateVideoMutedPreference();
  }, []);

  const schedulePostMediaPoll = useCallback(
    (mediaId: string) => {
      clearPollTimeout();

      const runPoll = async () => {
        const current = videoJobRef.current;
        if (!current || current.mediaId !== mediaId) return;
        if (current.status === "removing") return;

        if (pollAttemptRef.current >= POST_MEDIA_POLL_MAX_ATTEMPTS) {
          console.warn("[CreatePostMedia] post_media poll stopped (max attempts)", {
            mediaId,
          });
          setVideoJob((prev) => {
            if (!prev || prev.mediaId !== mediaId) return prev;
            if (prev.status === "ready" || prev.status === "error") return prev;
            return {
              ...prev,
              status: "error",
              errorMessage: "Video status check timed out.",
            };
          });
          return;
        }

        pollAttemptRef.current += 1;
        const row = await fetchPostMediaById(mediaId);
        if (!row) {
          pollTimeoutRef.current = setTimeout(
            runPoll,
            nextPostMediaPollDelayMs(pollAttemptRef.current),
          );
          return;
        }

        setVideoJob((prev) => {
          if (!prev || prev.mediaId !== mediaId) return prev;
          return applyPostMediaStatusToVideoJob(prev, row);
        });

        if (isTerminalPostMediaVideoStatus(row.video_status)) {
          pollAttemptRef.current = 0;
          return;
        }

        if (shouldPollPostMediaVideoStatus(row.video_status)) {
          pollTimeoutRef.current = setTimeout(
            runPoll,
            nextPostMediaPollDelayMs(pollAttemptRef.current),
          );
        }
      };

      pollAttemptRef.current = 0;
      pollTimeoutRef.current = setTimeout(
        runPoll,
        nextPostMediaPollDelayMs(0),
      );
    },
    [clearPollTimeout],
  );

  const hydrateLocalDraftVideo = useCallback(async (publishPostId: string) => {
    let draftVideo = loadDraftVideo();
    if (!draftVideo) return false;

    markVideoCrashCheckpoint("draft-hydrate-start");
    try {
      const reconciled = await reconcileDraftVideoPreparation(draftVideo);
      if (reconciled.changed) {
        writeDraftVideoMeta(reconciled.draftVideo);
        draftVideo = reconciled.draftVideo;
      }

      // Preview always uses SOURCE localReference — never prepared artifact.
      const resolved = await resolveDraftVideoPreview({ draftVideo });
      if (!resolved.localPreviewUrl && !resolved.localFile) {
        // Keep draft meta + images/caption. Represent video as recoverable local_error.
        markVideoCrashDraftFileState("missing_on_hydrate");
        const unavailable = mapLocalDraftVideoToJob(draftVideo, null, null);
        setVideoJob((prev) => {
          revokeJobLocalPoster(prev);
          return unavailable;
        });
        bumpPreparationEpoch();
        return true;
      }

      // Resolve display dims cheaply before poster / Media3 (PASS C3.1).
      let width = draftVideo.width ?? 0;
      let height = draftVideo.height ?? 0;
      let duration = draftVideo.duration ?? 0;
      if (!(width > 0 && height > 0)) {
        try {
          const probed = resolved.localPreviewUrl
            ? await probeLocalVideoFromSrc(resolved.localPreviewUrl)
            : resolved.localFile
              ? await probeLocalVideoFile(resolved.localFile)
              : null;
          if (probed) {
            width = probed.width || width;
            height = probed.height || height;
            duration = probed.duration || duration;
          }
        } catch {
          /* metadata unavailable — keep existing meta; do not delete draft */
        }
      }

      let skipPosterAndPrep = false;
      if (isCreateVideoResolutionOverLimit(width, height)) {
        skipPosterAndPrep = true;
        const alreadyFlagged =
          draftVideo.prepareErrorCode ===
          ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high;
        if (!alreadyFlagged) {
          draftVideo = markPrepareFailed(
            {
              ...draftVideo,
              width: width || draftVideo.width,
              height: height || draftVideo.height,
              ...(duration > 0 ? { duration } : {}),
            },
            ECHO_VIDEO_PREPARE_ERROR.source_resolution_too_high,
          );
          writeDraftVideoMeta(draftVideo);
          showCreateVideoValidationToast("too_high_resolution");
        } else if (width > 0 && height > 0) {
          draftVideo = {
            ...draftVideo,
            width,
            height,
            ...(duration > 0 ? { duration } : {}),
          };
          writeDraftVideoMeta(draftVideo);
        }
      } else if (width > 0 && height > 0) {
        draftVideo = {
          ...draftVideo,
          width,
          height,
          ...(duration > 0 ? { duration } : {}),
        };
        writeDraftVideoMeta(draftVideo);
      }

      let hydrated = mapLocalDraftVideoToJob(
        draftVideo,
        resolved.localFile,
        resolved.localPreviewUrl,
      );
      if (!skipPosterAndPrep && !heavyMediaExclusiveRef.current) {
        const posterSignal = beginPosterEnrichment();
        hydrated = await enrichLocalVideoPresentation(
          hydrated,
          {
            file: resolved.localFile,
            previewUrl: resolved.localPreviewUrl,
            signal: posterSignal,
          },
          draftVideo,
        );
        if (posterSignal.aborted || heavyMediaExclusiveRef.current) {
          revokeJobLocalPoster(hydrated);
          hydrated = { ...hydrated, localPosterUrl: null };
        }
      }
      setVideoJob((prev) => {
        revokeJobLocalPoster(prev);
        if (prev?.localId === hydrated.localId && prev?.status === hydrated.status) {
          return hydrated;
        }
        return hydrated;
      });
      bumpPreparationEpoch();

      if (skipPosterAndPrep) {
        return true;
      }

      // Publish-only prepare: do NOT start Media3/AVFoundation on draft reopen.
      // Reconcile already mapped stale "preparing" → local_ready when needed.
      return true;
    } catch (err) {
      console.warn("[CreatePostMedia] draft video preview restore failed", err);
      // Never auto-delete draft video meta/images on hydrate failure.
      const fallbackMeta = loadDraftVideo();
      if (fallbackMeta) {
        const unavailable = mapLocalDraftVideoToJob(fallbackMeta, null, null);
        setVideoJob((prev) => {
          revokeJobLocalPoster(prev);
          return unavailable;
        });
        bumpPreparationEpoch();
        return true;
      }
      setVideoJob((prev) => {
        revokeJobLocalPoster(prev);
        return null;
      });
      return false;
    }
  }, [beginPosterEnrichment, bumpPreparationEpoch, preparationCallbacks]);

  const hydrateLegacyRemoteVideo = useCallback(
    async (publishPostId: string) => {
      const row = await fetchUnattachedPostMediaForPublishPost(publishPostId);
      if (!row) return;

      setVideoJob((prev) => {
        if (prev?.mediaId === row.id) return prev;
        const hydrated = mapPostMediaRowToVideoJob(row, prev?.localFile ?? null);
        if (shouldPollPostMediaVideoStatus(hydrated.videoStatus)) {
          schedulePostMediaPoll(row.id);
        }
        return hydrated;
      });
    },
    [schedulePostMediaPoll],
  );

  const hydratePublishedEditVideo = useCallback((): boolean => {
    const editData = readCanonicalEditPostData();
    if (!editData?.postId) return false;

    const ref =
      editData.publishedVideo ?? readEditPublishedVideoReference();
    const gallery: string[] = [];
    for (const a of editData.activities || []) {
      for (const url of a.images || []) {
        if (typeof url === "string" && url.trim()) gallery.push(url);
      }
    }

    if (
      (Array.isArray(editData.mediaOrder) && editData.mediaOrder.length > 0) ||
      (Array.isArray(editData.postMedia) && editData.postMedia.length > 0) ||
      ref
    ) {
      const built = buildEditDraftMediaOrderFromPublished({
        mediaOrder: editData.mediaOrder ?? null,
        postMedia: editData.postMedia ?? [],
        imageUrls: gallery,
      });
      if (built.draftOrder.length > 0) {
        seedEditMediaOrderIntoDraftMeta(
          built.draftOrder,
          built.imageClientIdMap,
        );
        setMediaOrder(built.draftOrder);
      }
    }

    if (!ref) return false;

    const job = mapPublishedVideoReferenceToJob(ref);
    setVideoJob((prev) => {
      if (prev && isPublishedVideoReferenceJob(prev) && prev.mediaId === job.mediaId) {
        return prev;
      }
      // Don't clobber an in-progress local DraftVideo replacement/add.
      if (
        prev &&
        !isPublishedVideoReferenceJob(prev) &&
        (prev.status === "local" ||
          prev.status === "local_error" ||
          (typeof prev.localId === "string" &&
            prev.localId.trim() &&
            !isPublishedVideoReferenceLocalId(prev.localId)))
      ) {
        return prev;
      }
      return job;
    });
    reconcileMediaOrder({
      videoLocalId: publishedVideoRefLocalId(ref.mediaId),
      images: gallery,
    });
    return true;
  }, [reconcileMediaOrder]);

  const hydrateLocalDraftImages = useCallback(
    async (publishPostId: string) => {
      if (isCreateEditModeActive()) return;

      const { kept, removed } = await reconcileDraftImages({ publishPostId });
      if (removed.length === 0) {
        reconcileMediaOrder();
        return;
      }

      const removedUrls = new Set(
        removed.map((img) => buildLocalDraftImageUrl(img.localId)),
      );
      const removedIds = new Set(removed.map((img) => img.localId));

      const { mediaOrder: currentOrder, imageMediaClientIds } =
        readDraftMediaOrderState();
      const nextOrder = currentOrder.filter((item) => {
        if (item.kind !== "image") return true;
        if (removedUrls.has(item.url) || removedIds.has(item.clientId)) {
          return false;
        }
        return true;
      });
      const nextMap: Record<string, string> = {};
      for (const [url, clientId] of Object.entries(imageMediaClientIds)) {
        if (removedUrls.has(url) || removedIds.has(clientId)) continue;
        nextMap[url] = clientId;
      }
      writeDraftMediaOrderState(
        { mediaOrder: nextOrder, imageMediaClientIds: nextMap },
        { notify: false },
      );
      setMediaOrder(nextOrder);

      try {
        const raw = localStorage.getItem("draftActivities");
        if (raw) {
          const activities = JSON.parse(raw) as unknown[];
          if (Array.isArray(activities) && activities[0]) {
            const act = activities[0] as Record<string, unknown>;
            const cur = Array.isArray(act.images)
              ? (act.images as unknown[]).map(String)
              : [];
            const nextImages = cur.filter((u) => !removedUrls.has(u));
            if (nextImages.length !== cur.length) {
              activities[0] = { ...act, images: nextImages };
              localStorage.setItem(
                "draftActivities",
                JSON.stringify(activities),
              );
              dispatchPostImageMerged({
                activityIndex: 0,
                images: nextImages,
              });
            }
          }
        }
      } catch {
        /* ignore */
      }

      reconcileMediaOrder({
        images: deriveSlot0ImagesFromMediaOrder(nextOrder),
      });

      if (kept.length === 0 && removed.length > 0) {
        console.warn(
          "[CreatePostMedia] dropped stale local draft images",
          removed.length,
        );
      }
    },
    [reconcileMediaOrder],
  );

  const hydrateVideoFromDraft = useCallback(async () => {
    // Owner Edit: prefer active local DraftVideo replacement/add over published baseline.
    if (isCreateEditModeActive()) {
      const publishPostId = ensureDraftPublishPostId({ fresh: false });
      if (publishPostId) {
        const hadLocal = await hydrateLocalDraftVideo(publishPostId);
        if (hadLocal) {
          const draftVideo = readDraftVideoMeta();
          reconcileMediaOrder({
            videoLocalId: draftVideo?.localId ?? null,
          });
          return;
        }
      }
      if (hydratePublishedEditVideo()) {
        return;
      }
      return;
    }

    const publishPostId = ensureDraftPublishPostId({ fresh: false });
    if (!publishPostId) return;

    await hydrateLocalDraftImages(publishPostId);

    if (hydratedPublishPostIdRef.current === publishPostId && videoJobRef.current) {
      return;
    }

    hydratedPublishPostIdRef.current = publishPostId;

    const hadLocal = await hydrateLocalDraftVideo(publishPostId);
    if (!hadLocal) {
      await hydrateLegacyRemoteVideo(publishPostId);
    }

    const draftVideo = readDraftVideoMeta();
    reconcileMediaOrder({ videoLocalId: draftVideo?.localId ?? null });
  }, [
    hydrateLegacyRemoteVideo,
    hydrateLocalDraftImages,
    hydrateLocalDraftVideo,
    hydratePublishedEditVideo,
    reconcileMediaOrder,
  ]);

  useEffect(() => {
    providerGenerationRef.current += 1;
    const generationAtMount = providerGenerationRef.current;
    void hydrateVideoFromDraft();

    return () => {
      clearPollTimeout();
      const generationAtUnmount = generationAtMount;
      window.setTimeout(() => {
        if (providerGenerationRef.current !== generationAtUnmount) {
          return;
        }
        publishUploadAbortRef.current?.abort();
        publishUploadAbortRef.current = null;
      }, STRICT_MODE_UNMOUNT_GRACE_MS);
    };
  }, [clearPollTimeout, hydrateVideoFromDraft]);

  useEffect(() => {
    if (!videoJob) return;
    if (
      (videoJob.status === "processing" || videoJob.status === "ready") &&
      shouldPollPostMediaVideoStatus(videoJob.videoStatus)
    ) {
      schedulePostMediaPoll(videoJob.mediaId);
    }
  }, [schedulePostMediaPoll, videoJob]);

  const startPostVideoUpload = useCallback(async (input: StartPostVideoUploadInput) => {
    const { file, nativeSourceUri, sizeBytes, durationSeconds: inputDuration } = input;
    const currentJob = videoJobRef.current;
    const previousDraft = loadDraftVideo();
    const replacingLocal =
      Boolean(currentJob && isLocalDraftVideoJob(currentJob) && previousDraft);
    const uriScheme = classifyAndroidVideoUriScheme(nativeSourceUri);
    let persistStrategy: string | null = nativeSourceUri?.trim()
      ? "uri-copy"
      : file.size > 0
        ? "file-bytes"
        : null;
    let outcomeStage = "validate";
    let outcomeReason: string | null = null;

    const emitOutcome = (ok: boolean) => {
      logAndroidVideoIngestOutcome({
        stage: outcomeStage,
        ok,
        reasonCode: outcomeReason,
        uriScheme,
        persistStrategy,
        hasSize: Boolean(
          (typeof sizeBytes === "number" && sizeBytes > 0) || file.size > 0,
        ),
        hasDuration: normalizeCreateVideoDurationSeconds(inputDuration) != null,
      });
    };

    if (!canStartAnotherPostVideo(currentJob) && currentJob?.status !== "local") {
      toast.error(ONE_VIDEO_PER_POST_MESSAGE);
      return;
    }

    const accept = canAcceptNewVideoFile(currentJob, file);
    if (!accept.ok) {
      toast.error(accept.message);
      return;
    }

    const validation = validateCreateVideoSource({
      name: file.name,
      type: file.type,
      size: sizeBytes ?? file.size,
    });
    if (!validation.ok) {
      showCreateVideoValidationToast(
        mapCreateVideoSourceValidationReason(validation.reason),
      );
      return;
    }

    const knownDuration = normalizeCreateVideoDurationSeconds(inputDuration);
    if (isCreateVideoDurationOverLimit(knownDuration)) {
      showCreateVideoValidationToast("too_long");
      return;
    }

    // Probe duration + resolution before persist when bytes are available (web / file-bytes).
    let probedDuration: number | null = knownDuration;
    let probedWidth: number | null = null;
    let probedHeight: number | null = null;
    if (file.size > 0) {
      try {
        const probed = await probeLocalVideoFile(file);
        probedWidth = probed.width || null;
        probedHeight = probed.height || null;
        if (isCreateVideoResolutionOverLimit(probed.width, probed.height)) {
          showCreateVideoValidationToast("too_high_resolution");
          return;
        }
        if (probedDuration == null) {
          probedDuration = normalizeCreateVideoDurationSeconds(probed.duration);
        }
      } catch {
        /* probe after persist/preview if needed */
      }
    }
    if (isCreateVideoDurationOverLimit(probedDuration)) {
      showCreateVideoValidationToast("too_long");
      return;
    }

    // Selection accepted — show "Adding video…" before native persist/restore.
    const ingestGeneration = ++videoIngestGenerationRef.current;
    const isStale = () => ingestGeneration !== videoIngestGenerationRef.current;
    setLocalVideoIngestPending(true);
    markVideoCrashCheckpoint("ingest-start");

    let uncommitted: Awaited<ReturnType<typeof persistDraftVideo>> | null = null;

    try {
      outcomeStage = "auth";
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        outcomeReason = "not_authenticated";
        emitOutcome(false);
        toast.error(mapMediaUploadError(new Error("not authenticated"), "post"));
        return;
      }

      const publishPostId = ensureDraftPublishPostId({
        fresh: false,
        ownerUserId: session.user.id,
      });
      if (!publishPostId) {
        outcomeReason = "missing_publish_id";
        emitOutcome(false);
        toast.error(ADD_VIDEO_FAILED_USER_MESSAGE);
        return;
      }

      if (isStale()) {
        outcomeReason = "stale_selection";
        emitOutcome(false);
        return;
      }

      videoRemovalRequestedRef.current = false;

      // Invalidate prior poster/probe consumers before new bytes land / old bytes leave.
      abortPosterEnrichment();

      // Cancel old encoder before new decode/persist so replace does not overlap Media3 + probe.
      if (replacingLocal && previousDraft) {
        if (isDraftVideoPreparationActiveFor(previousDraft.localId)) {
          await cancelActiveDraftVideoPreparation("replace-start");
        }
      }

      outcomeStage = "persist";
      // Never overwrite draft meta until the replacement/add is validated and the job is ready.
      const draftVideo = await persistDraftVideo({
        publishPostId,
        file,
        nativeSourceUri,
        sizeBytes,
        commitMeta: false,
      });
      uncommitted = draftVideo;
      persistStrategy = nativeSourceUri?.trim() ? "uri-copy" : "file-bytes";
      void bumpVideoCrashDraftGeneration().then((gen) => {
        markVideoCrashDraftFileState("exists_after_copy", {
          draftGeneration: gen,
        });
      });

      if (isStale()) {
        await deleteDraftVideoStorageBytes(draftVideo);
        uncommitted = null;
        outcomeReason = "stale_selection";
        emitOutcome(false);
        return;
      }

      outcomeStage = "preview";
      const resolved = await resolveDraftVideoPreview({ draftVideo });
      const hasPreview = Boolean(resolved.localPreviewUrl || resolved.localFile);
      if (!hasPreview) {
        // Preview is not ingest: keep a durable native draft even if convertFileSrc fails.
        let durableBytes: number | null = null;
        if (draftVideo.localStorageKind === "native-fs") {
          durableBytes = await statNativeDraftVideoBytes(draftVideo.localReference);
        }
        const knownSize =
          (typeof durableBytes === "number" && durableBytes > 0) ||
          (typeof draftVideo.size === "number" && draftVideo.size > 0) ||
          (typeof sizeBytes === "number" && sizeBytes > 0) ||
          file.size > 0;

        if (!knownSize) {
          await deleteDraftVideoStorageBytes(draftVideo);
          uncommitted = null;
          outcomeReason = "preview_unusable";
          emitOutcome(false);
          if (!isStale()) {
            toast.error(ADD_VIDEO_FAILED_USER_MESSAGE);
          }
          return;
        }
        // Keep job with placeholder — no localPreviewUrl.
      }

      if (isStale()) {
        await deleteDraftVideoStorageBytes(draftVideo);
        uncommitted = null;
        outcomeReason = "stale_selection";
        emitOutcome(false);
        return;
      }

      let resolvedDuration =
        probedDuration ??
        normalizeCreateVideoDurationSeconds(draftVideo.duration) ??
        null;
      let resolvedWidth = probedWidth ?? draftVideo.width ?? null;
      let resolvedHeight = probedHeight ?? draftVideo.height ?? null;

      if (
        resolvedDuration == null ||
        !(typeof resolvedWidth === "number" && resolvedWidth > 0) ||
        !(typeof resolvedHeight === "number" && resolvedHeight > 0)
      ) {
        try {
          const probed = resolved.localPreviewUrl
            ? await probeLocalVideoFromSrc(resolved.localPreviewUrl)
            : resolved.localFile
              ? await probeLocalVideoFile(resolved.localFile)
              : null;
          if (probed) {
            if (resolvedDuration == null) {
              resolvedDuration = normalizeCreateVideoDurationSeconds(
                probed.duration,
              );
            }
            if (!(typeof resolvedWidth === "number" && resolvedWidth > 0)) {
              resolvedWidth = probed.width || null;
            }
            if (!(typeof resolvedHeight === "number" && resolvedHeight > 0)) {
              resolvedHeight = probed.height || null;
            }
          }
        } catch {
          /* keep nulls — metadata unavailable / timeout is not an automatic reject */
        }
      }

      if (
        isCreateVideoResolutionOverLimit(resolvedWidth, resolvedHeight)
      ) {
        await deleteDraftVideoStorageBytes(draftVideo);
        uncommitted = null;
        outcomeReason = "too_high_resolution";
        emitOutcome(false);
        if (!isStale()) {
          showCreateVideoValidationToast("too_high_resolution");
        }
        return;
      }

      if (isCreateVideoDurationOverLimit(resolvedDuration)) {
        await deleteDraftVideoStorageBytes(draftVideo);
        uncommitted = null;
        outcomeReason = "too_long";
        emitOutcome(false);
        if (!isStale()) {
          showCreateVideoValidationToast("too_long");
        }
        return;
      }

      const draftWithDuration: typeof draftVideo = {
        ...draftVideo,
        ...(resolvedDuration != null ? { duration: resolvedDuration } : {}),
        ...(typeof resolvedWidth === "number" && resolvedWidth > 0
          ? { width: resolvedWidth }
          : {}),
        ...(typeof resolvedHeight === "number" && resolvedHeight > 0
          ? { height: resolvedHeight }
          : {}),
      };

      if (isStale()) {
        await deleteDraftVideoStorageBytes(draftVideo);
        uncommitted = null;
        outcomeReason = "stale_selection";
        emitOutcome(false);
        return;
      }

      const previousJob = videoJobRef.current;

      let hydrated = mapLocalDraftVideoToJob(
        draftWithDuration,
        resolved.localFile,
        resolved.localPreviewUrl,
      );
      // During replace, defer poster decode until after job commit to avoid overlapping
      // old player decode + new poster work. Poster failure never rolls back ingest.
      if (!replacingLocal && !heavyMediaExclusiveRef.current) {
        const posterSignal = beginPosterEnrichment();
        const posterGen = posterEnrichGenerationRef.current;
        hydrated = await enrichLocalVideoPresentation(
          hydrated,
          {
            file: resolved.localFile,
            previewUrl: resolved.localPreviewUrl,
            signal: posterSignal,
          },
          null,
        );
        if (
          posterGen !== posterEnrichGenerationRef.current ||
          heavyMediaExclusiveRef.current ||
          posterSignal.aborted
        ) {
          revokeJobLocalPoster(hydrated);
          hydrated = {
            ...hydrated,
            localPosterUrl: null,
          };
        }
      }

      if (isStale()) {
        revokeJobLocalPoster(hydrated);
        await deleteDraftVideoStorageBytes(draftVideo);
        uncommitted = null;
        outcomeReason = "stale_selection";
        emitOutcome(false);
        return;
      }

      // Preparation decision after source + dims/duration are known.
      // Preview continues on SOURCE — never switches to prepared artifact.
      const policy = resolveVideoPreparationPolicy({
        durationSeconds: draftWithDuration.duration ?? resolvedDuration,
        sizeBytes: draftWithDuration.size,
        width: draftWithDuration.width ?? hydrated.videoWidth,
        height: draftWithDuration.height ?? hydrated.videoHeight,
        mimeType: draftWithDuration.mimeType,
      });
      const withPreparation = applyPreparationDecisionAfterSourceReady(
        {
          ...draftWithDuration,
          ...(typeof hydrated.videoWidth === "number" && hydrated.videoWidth > 0
            ? { width: hydrated.videoWidth }
            : {}),
          ...(typeof hydrated.videoHeight === "number" &&
          hydrated.videoHeight > 0
            ? { height: hydrated.videoHeight }
            : {}),
          ...(typeof hydrated.videoDuration === "number" &&
          hydrated.videoDuration > 0
            ? { duration: hydrated.videoDuration }
            : {}),
        },
        policy,
      );

      // Atomic-ish commit: meta + job together; old bytes only after this point.
      writeDraftVideoMeta(withPreparation);
      uncommitted = null;
      revokeJobLocalPoster(previousJob);
      resetCreateVideoMutedPreference();
      setVideoJob(hydrated);
      reconcileMediaOrder({ videoLocalId: withPreparation.localId });
      bumpPreparationEpoch();
      markVideoCrashDraftFileState("exists_after_job_commit");

      if (replacingLocal && previousDraft) {
        // Let React commit the new preview src before deleting old bytes so
        // mounted hero/tile consumers are no longer requesting the old path.
        await waitForCreatePreviewConsumerSwitch();
        await deleteDraftVideoStorageBytes(previousDraft, {
          protectLocalId: withPreparation.localId,
          protectLocalReference: withPreparation.localReference,
        });
        // Confirm replacement source survived old-generation cleanup.
        if (withPreparation.localStorageKind === "native-fs") {
          const bytes = await statNativeDraftVideoBytes(
            withPreparation.localReference,
          );
          if (typeof bytes === "number" && bytes > 0) {
            markVideoCrashDraftFileState("exists_after_old_cleanup");
          } else {
            // New source missing after old cleanup — keep meta for Unavailable;
            // never delete draft meta/images/caption here.
            markVideoCrashDraftFileState("missing_on_hydrate");
            console.warn(
              "[CreatePostMedia] replacement source missing after old cleanup",
            );
          }
        } else {
          markVideoCrashDraftFileState("exists_after_old_cleanup");
        }
        // Poster after swap — deferred; skipped while Publish prepare is exclusive.
        if (!heavyMediaExclusiveRef.current) {
          const posterSignal = beginPosterEnrichment();
          const posterGen = posterEnrichGenerationRef.current;
          void enrichLocalVideoPresentation(
            hydrated,
            {
              file: resolved.localFile,
              previewUrl: resolved.localPreviewUrl,
              signal: posterSignal,
            },
            withPreparation,
          ).then((enriched) => {
            if (
              posterGen !== posterEnrichGenerationRef.current ||
              posterSignal.aborted
            ) {
              revokeJobLocalPoster(enriched);
              return;
            }
            if (isStale()) {
              revokeJobLocalPoster(enriched);
              return;
            }
            if (videoJobRef.current?.localId !== enriched.localId) {
              revokeJobLocalPoster(enriched);
              return;
            }
            if (heavyMediaExclusiveRef.current) {
              revokeJobLocalPoster(enriched);
              return;
            }
            setVideoJob(enriched);
          });
        }
      }

      // Publish-only prepare: do NOT start native encode after ingest/replace.
      markVideoCrashCheckpoint("ingest-job-created");
      logAndroidVideoDiagnostic("ANDROID_VIDEO_JOB_CREATED", {
        status: hydrated.status,
        hasLocalFile: Boolean(hydrated.localFile),
        hasPoster: Boolean(hydrated.localPosterUrl),
        hasPreview: Boolean(hydrated.localPreviewUrl),
        sizeBytes: sizeBytes ?? hydrated.localFile?.size ?? draftWithDuration.size,
        width: hydrated.videoWidth ?? null,
        height: hydrated.videoHeight ?? null,
        duration: hydrated.videoDuration ?? null,
      });
      outcomeStage = "job_created";
      outcomeReason = null;
      emitOutcome(true);
    } catch (err) {
      if (uncommitted) {
        try {
          await deleteDraftVideoStorageBytes(uncommitted);
        } catch {
          /* best-effort */
        }
      }
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown");
      const persistClass = classifyNativeVideoPersistError(err);
      logAndroidVideoDiagnostic(
        "ANDROID_VIDEO_JOB_FAILED",
        formatAndroidVideoDiagFailure({
          stage: outcomeStage,
          shortReason: message,
        }),
      );
      if (import.meta.env.DEV) {
        console.error(
          "[echotoo android video] ANDROID_VIDEO_JOB_FAILED",
          err,
        );
      }

      if (isStale()) {
        outcomeReason = "stale_selection";
        emitOutcome(false);
        return;
      }

      if (
        persistClass === "inaccessible" ||
        persistClass === "empty_copy" ||
        persistClass === "no_bytes_fallback" ||
        persistClass === "js_persist_forbidden"
      ) {
        outcomeReason = "file_inaccessible";
        emitOutcome(false);
        toast.error(VIDEO_INACCESSIBLE_USER_MESSAGE);
      } else if (
        message.includes("NATIVE_VIDEO") ||
        message === "DRAFT_VIDEO_MISSING"
      ) {
        outcomeReason = "persist_failed";
        emitOutcome(false);
        toast.error(ADD_VIDEO_FAILED_USER_MESSAGE);
      } else {
        outcomeReason = "unexpected";
        emitOutcome(false);
        toast.error(VIDEO_INGEST_UNEXPECTED_USER_MESSAGE);
      }
    } finally {
      if (ingestGeneration === videoIngestGenerationRef.current) {
        setLocalVideoIngestPending(false);
      }
    }
  }, [
    abortPosterEnrichment,
    beginPosterEnrichment,
    bumpPreparationEpoch,
    preparationCallbacks,
    reconcileMediaOrder,
  ]);

  const uploadVideoForPublish = useCallback(async (options?: {
    onPhase?: (
      phase:
        | "preparing_video"
        | "uploading_video"
        | "processing_video",
    ) => void;
    onProgress?: (percent: number) => void;
    /** Optional: tiny poster bytes for combined publish progress (PV3.4). */
    onPosterResolved?: (info: {
      bytes: number;
      reusedRemote: boolean;
    }) => void;
  }): Promise<
    | { ok: true; mediaId: string | null }
    | { ok: false; error: string }
  > => {
    const job = videoJobRef.current;
    if (!job || !needsPublishTimeVideoUpload(job)) {
      const draftRemote =
        readDraftVideoMeta()?.remoteMediaId?.trim() || null;
      const fromJob =
        hasRemoteVideoSlot(job) && job?.mediaId ? job.mediaId.trim() : null;
      return {
        ok: true,
        mediaId: fromJob || draftRemote,
      };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return { ok: false, error: "Not authenticated" };
    }

    const publishPostId = ensureDraftPublishPostId({
      fresh: false,
      ownerUserId: session.user.id,
    });
    if (!publishPostId) {
      return { ok: false, error: "Missing publish id for this draft." };
    }

    let draftVideo = readDraftVideoMeta();
    if (!draftVideo) {
      return { ok: false, error: "Local video is missing." };
    }

    if (heavyMediaExclusiveRef.current) {
      return { ok: false, error: "Video publish already in progress." };
    }

    publishUploadAbortRef.current?.abort();
    const abortController = new AbortController();
    publishUploadAbortRef.current = abortController;
    publishNativeUploadJobIdRef.current = null;

    setHeavyMediaExclusive(true);
    try {
      const prep = await ensurePublishVideoPreparation(draftVideo, {
        signal: abortController.signal,
        onPreparing: () => options?.onPhase?.("preparing_video"),
        callbacks: preparationCallbacks,
      });
      if (!prep.ok) {
        logPublishFailureOutcome({
          stage: "prep",
          errorCode: abortController.signal.aborted ? "cancelled" : "prep_failed",
          recoverable: true,
        });
        setPublishVideoUploadProgress(null);
        return { ok: false, error: prep.error };
      }
      draftVideo = prep.draft;

      if (abortController.signal.aborted) {
        setPublishVideoUploadProgress(null);
        return { ok: false, error: "Upload cancelled." };
      }

      const uploadJobId = `pub-upload-${draftVideo.localId}-${Date.now().toString(36)}`;
      publishNativeUploadJobIdRef.current = uploadJobId;

      const bytesResolved = await resolvePublishVideoBytesSource({
        draft: draftVideo,
        uploadJobId,
        // Web only. Capacitor native never materializes video File for publish (IOS3).
        resolveFile: async () => {
          if (isNativeEchoVideoUploadPlatform()) return null;
          return job.localFile ?? (await resolveDraftVideoFile(draftVideo));
        },
      });
      if (!bytesResolved.ok) {
        logPublishFailureOutcome({
          stage: "prep",
          errorCode: "bytes_unresolved",
          recoverable: true,
        });
        setPublishVideoUploadProgress(null);
        return { ok: false, error: bytesResolved.error };
      }

      options?.onPhase?.("uploading_video");
      setPublishVideoUploadProgress(0);
      setVideoJob((prev) =>
        prev
          ? applyPublishUploadProgressToVideoJob(prev, 0)
          : prev,
      );

      // PV3.4: tiny poster before bunny-upload-init so poster_url exists early.
      // Runs only after native prepare completed (exclusive gate held; Create poster cancelled).
      const poster = await ensurePublishVideoPoster({
        userId: session.user.id,
        draftVideo,
        localPosterUrl: job.localPosterUrl,
        localPreviewUrl: job.localPreviewUrl,
        localFile: job.localFile ?? null,
      });
      options?.onPosterResolved?.({
        bytes: poster?.bytes ?? 0,
        reusedRemote: poster?.reusedRemote ?? false,
      });
      draftVideo = readDraftVideoMeta() ?? draftVideo;

      let result: Awaited<ReturnType<typeof createPublishVideoUpload>>;
      try {
        result = await createPublishVideoUpload({
          publishPostId,
          bytes: bytesResolved.bytes,
          draftVideo,
          posterStoragePath: poster?.storagePath ?? null,
          signal: abortController.signal,
          onProgress: (percent) => {
            setPublishVideoUploadProgress(percent);
            options?.onProgress?.(percent);
            setVideoJob((prev) =>
              prev ? applyPublishUploadProgressToVideoJob(prev, percent) : prev,
            );
          },
          onProcessing: () => {
            options?.onPhase?.("processing_video");
            setVideoJob((prev) =>
              prev ? applyPublishProcessingToVideoJob(prev) : prev,
            );
          },
        });
      } catch (error) {
        // Defense in depth — createPublishVideoUpload must not reject; contain anyway.
        publishNativeUploadJobIdRef.current = null;
        setPublishVideoUploadProgress(null);
        setVideoJob((prev) =>
          prev
            ? {
                ...prev,
                status: "local",
                progress: 0,
                videoStatus: "pending",
                errorMessage: undefined,
              }
            : prev,
        );
        logPublishFailureOutcome({
          stage: "tus",
          errorCode: "unexpected",
          recoverable: true,
        });
        return {
          ok: false,
          error:
            error instanceof Error && error.message.trim()
              ? error.message
              : "Video upload failed. Please try again.",
        };
      }

      publishNativeUploadJobIdRef.current = null;

      if (abortController.signal.aborted) {
        setPublishVideoUploadProgress(null);
        return { ok: false, error: "Upload cancelled." };
      }

      if (!result.ok) {
        setVideoJob((prev) =>
          prev
            ? {
                ...prev,
                status: "local",
                progress: 0,
                videoStatus: "pending",
                errorMessage: undefined,
              }
            : prev,
        );
        setPublishVideoUploadProgress(null);
        return result;
      }

      setVideoJob((prev) => {
        if (!prev) return prev;
        const next = applyPublishProcessingToVideoJob({
          ...prev,
          mediaId: result.mediaId,
        });
        return applyPostMediaStatusToVideoJob(next, {
          id: result.mediaId,
          publish_post_id: publishPostId,
          owner_user_id: session.user.id,
          post_id: null,
          bunny_video_id: readDraftVideoMeta()?.remoteVideoId ?? prev.videoId,
          video_status: "processing",
          poster_url: null,
        });
      });
      setPublishVideoUploadProgress(100);

      // Return mediaId synchronously for this Publish transaction — do not wait
      // for React setVideoJob to flush before owner_create_post.
      return { ok: true, mediaId: result.mediaId };
    } finally {
      setHeavyMediaExclusive(false);
      setPublishVideoUploadProgress((p) => (p === 100 ? p : null));
    }
  }, [preparationCallbacks, setHeavyMediaExclusive]);

  const cancelPublishVideoUpload = useCallback(async (): Promise<boolean> => {
    const job = videoJobRef.current;
    const nativeJobId = publishNativeUploadJobIdRef.current;
    publishUploadAbortRef.current?.abort();
    publishUploadAbortRef.current = null;
    setPublishVideoUploadProgress(null);

    if (nativeJobId) {
      try {
        await EchoVideoUpload.cancelVideoUpload({ jobId: nativeJobId });
      } catch {
        /* best-effort */
      }
      publishNativeUploadJobIdRef.current = null;
    }

    const draftVideo = readDraftVideoMeta();
    const remoteMediaId =
      draftVideo?.remoteMediaId?.trim() ||
      (hasRemoteVideoSlot(job) ? job!.mediaId : null);

    if (!remoteMediaId) {
      setVideoJob((prev) =>
        prev && prev.localFile
          ? {
              ...prev,
              status: "local",
              progress: 0,
              videoStatus: "pending",
              errorMessage: undefined,
            }
          : prev,
      );
      return true;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const publishPostId = ensureDraftPublishPostId({ fresh: false });
    if (!session?.user || !publishPostId) {
      toast.error(PUBLISH_VIDEO_CLEANUP_FAILED_MESSAGE);
      return false;
    }

    if (job?.videoId && job.videoId !== "pending" && job.videoId !== "error") {
      clearBunnyTusSingleFlight(job.videoId);
    }

    const deleteResult = await deleteCreatePostVideo({
      publishPostId,
      mediaId: remoteMediaId,
    });

    if (!deleteResult.ok) {
      toast.error(deleteResult.error || PUBLISH_VIDEO_CLEANUP_FAILED_MESSAGE);
      setVideoJob((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              errorMessage: PUBLISH_VIDEO_CLEANUP_FAILED_MESSAGE,
            }
          : prev,
      );
      return false;
    }

    clearDraftVideoRemoteIds();
    setVideoJob((prev) =>
      prev && prev.localFile
        ? {
            ...prev,
            mediaId: LOCAL_DRAFT_VIDEO_MEDIA_ID,
            videoId: LOCAL_DRAFT_VIDEO_VIDEO_ID,
            status: "local",
            progress: 0,
            videoStatus: "pending",
            errorMessage: undefined,
          }
        : prev,
    );
    return true;
  }, []);

  const runServerVideoDelete = useCallback(
    async (mediaId: string, publishPostId: string): Promise<boolean> => {
      const result = await deleteCreatePostVideo({ publishPostId, mediaId });
      if (result.ok) {
        return true;
      }
      toast.error(result.error || VIDEO_REMOVAL_FAILED_MESSAGE);
      return false;
    },
    [],
  );

  const removePostVideo = useCallback(async (): Promise<boolean> => {
    const job = videoJobRef.current;
    if (!job || job.status === "removing") return false;

    const removalSnapshot: PostVideoUploadJob = { ...job };
    videoRemovalRequestedRef.current = true;
    clearPollTimeout();
    pollAttemptRef.current = 0;
    publishUploadAbortRef.current?.abort();

    if (job.videoId && job.videoId !== "pending" && job.videoId !== "error") {
      clearBunnyTusSingleFlight(job.videoId);
    }

    setVideoJob((prev) =>
      prev ? { ...prev, status: "removing", errorMessage: undefined } : prev,
    );

    const draftVideo = readDraftVideoMeta();
    const remoteMediaId =
      draftVideo?.remoteMediaId?.trim() ||
      (hasRemoteVideoSlot(job) && !isPublishedVideoReferenceJob(job)
        ? job.mediaId
        : null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const publishPostId = session?.user
      ? ensureDraftPublishPostId({
          fresh: false,
          ownerUserId: session.user.id,
        })
      : ensureDraftPublishPostId({ fresh: false });

    // Published remote video in Edit: clear local edit state only — never Bunny delete.
    if (isPublishedVideoReferenceJob(job)) {
      completeVideoRemovalLocal();
      bumpPreparationEpoch();
      reconcileMediaOrder({ videoLocalId: null });
      videoRemovalRequestedRef.current = false;
      return true;
    }

    if (remoteMediaId && publishPostId) {
      const deleted = await runServerVideoDelete(remoteMediaId, publishPostId);
      if (!deleted) {
        setVideoJob({
          ...removalSnapshot,
          status: "error",
          errorMessage: VIDEO_REMOVAL_FAILED_MESSAGE,
          localFile: removalSnapshot.localFile ?? null,
        });
        videoRemovalRequestedRef.current = false;
        return false;
      }
    }

    try {
      await cancelActiveDraftVideoPreparation("remove");
    } catch {
      /* best-effort */
    }

    try {
      await deleteDraftVideo(publishPostId);
    } catch (err) {
      console.warn("[CreatePostMedia] local draft video delete failed", err);
    }

    completeVideoRemovalLocal();
    bumpPreparationEpoch();
    reconcileMediaOrder({ videoLocalId: null });
    return true;
  }, [
    bumpPreparationEpoch,
    clearPollTimeout,
    completeVideoRemovalLocal,
    reconcileMediaOrder,
    runServerVideoDelete,
  ]);

  const cleanupDraftVideoAfterPublish = useCallback(async () => {
    await cleanupDraftVideoAfterSuccessfulPublish();
    setPublishVideoUploadProgress(null);
  }, []);

  const startPostImageUploads = useCallback(
    async (files: File[], activityIndex: number) => {
      const toUpload = Array.from(files).filter((f) =>
        isProbablyPostImageFile(f),
      );
      if (!toUpload.length) {
        console.log(
          "[CreatePostMedia] start skipped: no accepted post image files",
        );
        return;
      }

      const editMode = isCreateEditModeActive();
      const useLocalFirstCreate =
        !editMode && CREATE_LOCAL_FIRST_IMAGES_ENABLED;

      if (!useLocalFirstCreate) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
          const friendly = mapMediaUploadError(
            new Error("not authenticated"),
            "post",
          );
        toast.error(friendly);
        return;
      }

        uploadBatchHistoryBoundaryRef.current?.();

        const uploadedInBatch: string[] = [];
      const batchJobs: PostImageUploadJob[] = toUpload.map((file) => ({
        id: crypto.randomUUID(),
        activityIndex,
        fileName: file.name,
        status: "uploading" as const,
      }));
      setJobs((prev) => [...prev, ...batchJobs]);

      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        const id = batchJobs[i].id;

        try {
          let normalized;
          try {
            normalized = await prepareImageForUpload(file, "post");
          } catch (normErr) {
            markJobError(id, normErr, "normalization failed", {
              file: file.name,
            });
            continue;
          }

          const path = await uploadNormalizedPostImage(normalized, {
            userId,
          });

          uploadedInBatch.push(path);
          const mergedImages = syncActivityPostImagesInDraftStorage(
            activityIndex,
              uploadedInBatch,
          );
          if (!mergedImages) {
            uploadedInBatch.pop();
            markJobError(
              id,
              new Error(
                  "Upload succeeded but could not attach image to this activity.",
              ),
              "merge returned null after upload",
              {
                activityIndex,
                path: path.slice(0, 80),
                },
            );
            continue;
          }

          dispatchPostImageMerged({
            activityIndex,
            images: mergedImages,
          });

          setJobs((prev) => prev.filter((j) => j.id !== id));
        } catch (e) {
          markJobError(id, e, "upload failed", { file: file.name });
        }
        }
        return;
      }

      // NEW Create (LI1B): optimize → persist DraftImage locally — no Storage upload.
      const publishPostId = ensureDraftPublishPostId({ fresh: false });
      if (!publishPostId) {
        toast.error("Could not start draft. Please try again.");
        return;
      }

      uploadBatchHistoryBoundaryRef.current?.();

      const persistedInBatch: string[] = [];
      const batchJobs: PostImageUploadJob[] = toUpload.map((file) => ({
        id: crypto.randomUUID(),
        activityIndex,
        fileName: file.name,
        status: "uploading" as const,
      }));
      setJobs((prev) => [...prev, ...batchJobs]);

      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        const id = batchJobs[i].id;
        const localId = crypto.randomUUID();

        try {
          let normalized;
          try {
            normalized = await prepareImageForUpload(file, "post");
          } catch (normErr) {
            markJobError(id, normErr, "normalization failed", {
              file: file.name,
            });
            continue;
          }

          const baseName =
            typeof file.name === "string" && file.name.trim()
              ? file.name.replace(/\.[^.]+$/, "")
              : `image-${localId}`;
          const fileName = `${baseName}.${normalized.extension}`;

          const draftImage = await persistDraftImage({
            publishPostId,
            localId,
            blob: normalized.blob,
            fileName,
            mimeType: normalized.contentType,
          });

          const sentinel = buildLocalDraftImageUrl(draftImage.localId);
          persistedInBatch.push(sentinel);

          const mergedImages = syncActivityPostImagesInDraftStorage(
            activityIndex,
            persistedInBatch,
          );
          if (!mergedImages) {
            persistedInBatch.pop();
            await deleteDraftImage(draftImage.localId, {
              publishPostId,
              draftImage,
            });
            markJobError(
              id,
              new Error(
                "Image saved locally but could not attach to this activity.",
              ),
              "merge returned null after local persist",
              {
                activityIndex,
                localId: draftImage.localId,
              },
            );
            continue;
          }

          dispatchPostImageMerged({
            activityIndex,
            images: mergedImages,
          });

          setJobs((prev) => prev.filter((j) => j.id !== id));
        } catch (e) {
          markJobError(id, e, "local persist failed", { file: file.name });
        }
      }
    },
    [markJobError],
  );

  const value = useMemo<CreatePostMediaContextValue>(
    () => ({
      jobs,
      videoJob,
      localVideoIngestPending,
      videoPreparing,
      createVideoHeavyMediaExclusive,
      hasPendingUploads,
      isPublishBlockedByMedia,
      publishVideoUploadProgress,
      startPostImageUploads,
      startPostVideoUpload,
      uploadVideoForPublish,
      cancelPublishVideoUpload,
      removePostVideo,
      cleanupDraftVideoAfterPublish,
      getPendingJobsForActivity,
      dismissFailedUpload,
      registerUploadBatchHistoryBoundary,
      mediaOrder,
      reconcileMediaOrder,
      persistMediaOrder,
    }),
    [
      jobs,
      videoJob,
      localVideoIngestPending,
      videoPreparing,
      createVideoHeavyMediaExclusive,
      hasPendingUploads,
      isPublishBlockedByMedia,
      publishVideoUploadProgress,
      startPostImageUploads,
      startPostVideoUpload,
      uploadVideoForPublish,
      cancelPublishVideoUpload,
      removePostVideo,
      cleanupDraftVideoAfterPublish,
      getPendingJobsForActivity,
      dismissFailedUpload,
      registerUploadBatchHistoryBoundary,
      mediaOrder,
      reconcileMediaOrder,
      persistMediaOrder,
    ],
  );

  return (
    <CreatePostMediaContext.Provider value={value}>
      {children}
    </CreatePostMediaContext.Provider>
  );
}

export function useCreatePostMedia(): CreatePostMediaContextValue {
  const ctx = useContext(CreatePostMediaContext);
  if (ctx == null) {
    throw new Error(
      "useCreatePostMedia must be used within CreatePostMediaProvider (create flow layout).",
    );
  }
  return ctx;
}

export type { PostVideoUploadJob };
