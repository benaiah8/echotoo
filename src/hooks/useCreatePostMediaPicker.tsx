import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import toast from "react-hot-toast";
import { useCreatePostMedia } from "../components/create/CreatePostMediaProvider";
import MediaAcquisitionSheet from "../components/create/MediaAcquisitionSheet";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { ensureFirstActivitySlotForPostImages } from "../lib/createFlowEnsureFirstActivitySlot";
import {
  CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT,
  setCreateFlowMediaPickerOpen,
} from "../lib/createFlowLeaveRequest";
import {
  REPLACE_VIDEO_CONFIRM_EMPHASIS,
  REPLACE_VIDEO_CONFIRM_LEAD,
  REPLACE_VIDEO_CONFIRM_TITLE,
  VIDEO_READ_FAILED_USER_MESSAGE,
} from "../lib/createDraftVideo/createVideoConstraints";
import { showCreateVideoValidationToast } from "../lib/showCreateVideoValidationToast";
import {
  canAddPostVideo,
  imageSlotsRemaining,
  isTotalMediaAtCap,
  MAX_TOTAL_POST_MEDIA,
} from "../lib/createPostMediaSlots";
import { CREATE_POST_MEDIA_WEB_LIBRARY_ACCEPT } from "../lib/createPostMediaWebAccept";
import {
  partitionNativePickedMedia,
  routeWebLibraryFiles,
  type StartPostVideoUploadInput,
} from "../lib/createPostMediaRouting";
import {
  canAcceptNewVideoFile,
  hasActivePostVideo,
  isLocalDraftVideoJob,
  ONE_VIDEO_PER_POST_MESSAGE,
} from "../lib/createPostVideoUpload";
import { isPublishedVideoReferenceJob } from "../lib/editPublishedMedia";
import {
  captureImageFromCamera,
  isCameraUserCancellation,
  pickMediaFromLibrary,
  recordVideoFromCamera,
} from "../lib/mediaAcquisition";
import { isProbablyPostImageFile } from "../lib/postImagePipeline";
import {
  getPlatform,
  isNativeApp,
} from "../lib/storage/utils/capacitorDetection";

const MAX = MAX_TOTAL_POST_MEDIA;
const TRACE = "[CreateMediaTrace]";

type Options = {
  totalImagesPost: number;
  onBeforeOpen?: () => void;
  onAfterStartUploads?: () => void;
};

type PendingVideoReplace = {
  kind: "ingest";
  input: StartPostVideoUploadInput;
};

type PendingRecordReplace = {
  kind: "record";
};

type PendingReplace = PendingVideoReplace | PendingRecordReplace;

function mediaTrace(message: string, extra?: object): void {
  if (!import.meta.env.DEV) return;
  if (extra) {
    console.log(TRACE, message, extra);
  } else {
    console.log(TRACE, message);
  }
}

function capAcceptedFiles(files: File[], remaining: number): File[] {
  if (remaining <= 0) return [];
  const accepted = files.filter(isProbablyPostImageFile);
  const capped = accepted.slice(0, remaining);
  if (capped.length < accepted.length) {
    toast(
      `Only ${remaining} slot${remaining === 1 ? "" : "s"} left — adding ${capped.length} of ${accepted.length} selected.`,
    );
  }
  return capped;
}

/**
 * Shared post media picker for create finalize (header Media + existing CTAs).
 */
export function useCreatePostMediaPicker(options: Options): {
  openPicker: () => void;
  fileInput: ReactNode;
  mediaAcquisitionSheet: ReactNode;
  hasPendingUploads: boolean;
  atCap: boolean;
} {
  const { totalImagesPost, onBeforeOpen, onAfterStartUploads } = options;
  const {
    startPostImageUploads,
    startPostVideoUpload,
    hasPendingUploads,
    videoJob,
  } = useCreatePostMedia();

  const [chooserOpen, setChooserOpen] = useState(false);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(
    null,
  );
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  const atCap = isTotalMediaAtCap(totalImagesPost, hasActivePostVideo(videoJob));
  const hasVideo = hasActivePostVideo(videoJob);
  const remaining = imageSlotsRemaining(totalImagesPost, hasVideo);
  const showNativeCamera = isNativeApp();

  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;
  const totalImagesPostRef = useRef(totalImagesPost);
  totalImagesPostRef.current = totalImagesPost;
  const hasVideoRef = useRef(hasVideo);
  hasVideoRef.current = hasVideo;
  const videoJobRef = useRef(videoJob);
  videoJobRef.current = videoJob;
  const startPostVideoUploadRef = useRef(startPostVideoUpload);
  startPostVideoUploadRef.current = startPostVideoUpload;
  const startPostImageUploadsRef = useRef(startPostImageUploads);
  startPostImageUploadsRef.current = startPostImageUploads;
  const onBeforeOpenRef = useRef(onBeforeOpen);
  onBeforeOpenRef.current = onBeforeOpen;
  const onAfterStartUploadsRef = useRef(onAfterStartUploads);
  onAfterStartUploadsRef.current = onAfterStartUploads;

  useEffect(() => {
    setCreateFlowMediaPickerOpen(chooserOpen);
  }, [chooserOpen]);

  useEffect(() => {
    const onDismiss = () => {
      setChooserOpen(false);
      setNativeBusy(false);
    };
    window.addEventListener(
      CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT,
      onDismiss,
    );
    return () =>
      window.removeEventListener(
        CREATE_FLOW_MEDIA_PICKER_DISMISS_EVENT,
        onDismiss,
      );
  }, []);

  const requestReplaceOrIngest = useCallback(
    (input: StartPostVideoUploadInput, needsReplace: boolean) => {
      if (needsReplace) {
        setPendingReplace({ kind: "ingest", input });
        setReplaceConfirmOpen(true);
        return;
      }
      onBeforeOpenRef.current?.();
      void startPostVideoUploadRef.current(input);
    },
    [],
  );

  const routeAndUploadSelection = useCallback(
    (
      images: File[],
      video: File | null,
      rejectedExtraVideo: boolean,
      replaceExistingVideo: boolean,
      videoNativeSourceUri: string | null = null,
      videoSizeBytes?: number,
      videoDurationSeconds?: number | null,
    ) => {
      if (rejectedExtraVideo) {
        toast.error(ONE_VIDEO_PER_POST_MESSAGE);
      }

      if (video) {
        const job = videoJobRef.current;
        const replacing =
          replaceExistingVideo ||
          (hasActivePostVideo(job) && isLocalDraftVideoJob(job)) ||
          (hasActivePostVideo(job) && isPublishedVideoReferenceJob(job));

        if (
          !replacing &&
          !canAddPostVideo(
            totalImagesPostRef.current,
            hasActivePostVideo(job),
          )
        ) {
          toast.error("You've reached the media limit for this post.");
          return;
        }

        if (
          hasActivePostVideo(job) &&
          !isLocalDraftVideoJob(job) &&
          !isPublishedVideoReferenceJob(job)
        ) {
          const accept = canAcceptNewVideoFile(job, video);
          toast.error(accept.ok ? ONE_VIDEO_PER_POST_MESSAGE : accept.message);
        } else {
          const accept = canAcceptNewVideoFile(job, video);
          if (!accept.ok) {
            toast.error(accept.message);
          } else {
            requestReplaceOrIngest(
              {
                file: video,
                nativeSourceUri: videoNativeSourceUri,
                sizeBytes: videoSizeBytes,
                durationSeconds: videoDurationSeconds,
              },
              replacing,
            );
          }
        }
      }

      if (images.length) {
        const capped = capAcceptedFiles(images, remainingRef.current);
        if (capped.length) {
          ensureFirstActivitySlotForPostImages();
          onAfterStartUploadsRef.current?.();
          void startPostImageUploadsRef.current(capped, 0);
        }
      }
    },
    [requestReplaceOrIngest],
  );

  const routeAndUploadSelectionRef = useRef(routeAndUploadSelection);
  routeAndUploadSelectionRef.current = routeAndUploadSelection;

  const skipEmptyLibraryChangeRef = useRef(false);

  const handleLibraryFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const selectedFiles = Array.from(input.files ?? []);

      if (!selectedFiles.length) {
        if (skipEmptyLibraryChangeRef.current) {
          skipEmptyLibraryChangeRef.current = false;
        }
        return;
      }

      skipEmptyLibraryChangeRef.current = true;
      input.value = "";

      const routed = routeWebLibraryFiles(selectedFiles, {
        hasActiveVideo: hasVideoRef.current,
        imageSlotsRemaining: remainingRef.current,
      });

      if (routed.unsupported.length > 0) {
        toast.error("Couldn't use one or more selected files.");
      }

      routeAndUploadSelectionRef.current(
        routed.images,
        routed.video,
        routed.rejectedExtraVideo,
        routed.replaceExistingVideo,
        routed.videoNativeSourceUri,
      );
    },
    [],
  );

  const openPicker = useCallback(() => {
    mediaTrace("openPicker called", {
      platform: getPlatform(),
      isNativePlatform: Capacitor.isNativePlatform(),
      totalImagesPost,
      remaining,
      hasPendingUploads,
      atCap,
      hasVideo,
    });

    if (hasPendingUploads) {
      toast.error("Media is still uploading. Please wait.");
      return;
    }

    onBeforeOpenRef.current?.();
    setChooserOpen(true);
  }, [atCap, hasPendingUploads, hasVideo, remaining, totalImagesPost]);

  const openWebLibraryInput = useCallback(() => {
    setChooserOpen(false);
    if (remaining <= 0) {
      toast.error("You've reached the media limit for this post.");
      return;
    }
    const input = libraryInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, [remaining]);

  const handleLibrary = useCallback(async () => {
    if (showNativeCamera) {
      setChooserOpen(false);
      if (remaining <= 0) {
        toast.error("You've reached the media limit for this post.");
        return;
      }
      setNativeBusy(true);
      try {
        const { items, selectedCount, failedCount, videoFailure } =
          await pickMediaFromLibrary({
            maxCount: remaining,
          });
        if (videoFailure) {
          showCreateVideoValidationToast(videoFailure.reason);
        } else if (selectedCount > 0 && items.length === 0) {
          toast.error(VIDEO_READ_FAILED_USER_MESSAGE);
        } else if (failedCount > 0) {
          toast.error(
            failedCount === 1
              ? "Couldn't read 1 selected item."
              : `Couldn't read ${failedCount} selected items.`,
          );
        }
        const partitioned = partitionNativePickedMedia(items, {
          hasActiveVideo: hasVideoRef.current,
          imageSlotsRemaining: remaining,
        });
        routeAndUploadSelectionRef.current(
          partitioned.images,
          partitioned.video,
          partitioned.rejectedExtraVideo,
          partitioned.replaceExistingVideo,
          partitioned.videoNativeSourceUri,
          partitioned.videoSizeBytes,
          partitioned.videoDurationSeconds,
        );
      } catch (error) {
        if (!isCameraUserCancellation(error)) {
          console.error("[useCreatePostMediaPicker] library pick failed", error);
          toast.error("Couldn't open your library. Please try again.");
        }
      } finally {
        setNativeBusy(false);
      }
      return;
    }

    openWebLibraryInput();
  }, [openWebLibraryInput, remaining, showNativeCamera]);

  const handleTakePhoto = useCallback(async () => {
    setChooserOpen(false);
    if (remaining <= 0) {
      toast.error("You've reached the media limit for this post.");
      return;
    }
    setNativeBusy(true);
    try {
      const { file, readFailed } = await captureImageFromCamera();
      if (readFailed) {
        toast.error("Couldn't read the captured photo.");
        return;
      }
      if (file) {
        ensureFirstActivitySlotForPostImages();
        onAfterStartUploadsRef.current?.();
        void startPostImageUploadsRef.current([file], 0);
      }
    } catch (error) {
      if (!isCameraUserCancellation(error)) {
        console.error("[useCreatePostMediaPicker] camera capture failed", error);
        toast.error("Couldn't open the camera. Please try again.");
      }
    } finally {
      setNativeBusy(false);
    }
  }, [remaining]);

  const runRecordVideo = useCallback(async () => {
    setNativeBusy(true);
    try {
      const {
        file,
        nativeSourceUri,
        sizeBytes,
        durationSeconds,
        readFailed,
        failureReason,
        failureMessage,
      } = await recordVideoFromCamera();
      if (failureReason) {
        showCreateVideoValidationToast(failureReason);
        return;
      }
      if (failureMessage) {
        toast.error(failureMessage);
        return;
      }
      if (readFailed) {
        toast.error(VIDEO_READ_FAILED_USER_MESSAGE);
        return;
      }
      if (file) {
        const accept = canAcceptNewVideoFile(videoJobRef.current, file);
        if (!accept.ok) {
          toast.error(accept.message);
          return;
        }
        onBeforeOpenRef.current?.();
        void startPostVideoUploadRef.current({
          file,
          nativeSourceUri,
          sizeBytes,
          durationSeconds,
        });
      }
    } catch (error) {
      if (!isCameraUserCancellation(error)) {
        console.error("[useCreatePostMediaPicker] video record failed", error);
        toast.error("Couldn't record a video. Please try again.");
      }
    } finally {
      setNativeBusy(false);
    }
  }, []);

  const handleRecordVideo = useCallback(async () => {
    setChooserOpen(false);
    const job = videoJobRef.current;
    if (
      hasActivePostVideo(job) &&
      (isLocalDraftVideoJob(job) || isPublishedVideoReferenceJob(job))
    ) {
      setPendingReplace({ kind: "record" });
      setReplaceConfirmOpen(true);
      return;
    }
    if (hasActivePostVideo(job)) {
      toast.error(ONE_VIDEO_PER_POST_MESSAGE);
      return;
    }
    if (!canAddPostVideo(totalImagesPostRef.current, false)) {
      toast.error("You've reached the media limit for this post.");
      return;
    }
    await runRecordVideo();
  }, [runRecordVideo]);

  const handleReplaceConfirmClose = useCallback(() => {
    setReplaceConfirmOpen(false);
    setPendingReplace(null);
  }, []);

  const handleReplaceConfirm = useCallback(async () => {
    const pending = pendingReplace;
    setReplaceConfirmOpen(false);
    setPendingReplace(null);
    if (!pending) return;

    if (pending.kind === "ingest") {
      onBeforeOpenRef.current?.();
      await startPostVideoUploadRef.current(pending.input);
      return;
    }

    await runRecordVideo();
  }, [pendingReplace, runRecordVideo]);

  const fileInput = useMemo(
    () => (
      <input
        ref={libraryInputRef}
        type="file"
        accept={CREATE_POST_MEDIA_WEB_LIBRARY_ACCEPT}
        multiple
        className="hidden"
        onChange={handleLibraryFileInputChange}
      />
    ),
    [handleLibraryFileInputChange],
  );

  const mediaAcquisitionSheet = (
    <>
      <MediaAcquisitionSheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onLibrary={() => void handleLibrary()}
        onTakePhoto={() => void handleTakePhoto()}
        onRecordVideo={() => void handleRecordVideo()}
        busy={nativeBusy}
        showCamera={showNativeCamera}
      />
      <ConfirmDialog
        open={replaceConfirmOpen}
        onClose={handleReplaceConfirmClose}
        onConfirm={() => void handleReplaceConfirm()}
        title={REPLACE_VIDEO_CONFIRM_TITLE}
        message={
          <>
            {REPLACE_VIDEO_CONFIRM_LEAD}{" "}
            <span
              className="font-bold text-[var(--brand-readable)] app-dark:text-[var(--create-accent-icon-fg)]"
              data-replace-video-emphasis
            >
              {REPLACE_VIDEO_CONFIRM_EMPHASIS}
            </span>
            .
          </>
        }
        cancelLabel="Cancel"
        confirmLabel="Replace"
        confirmVariant="primary"
      />
    </>
  );

  return {
    openPicker,
    fileInput,
    mediaAcquisitionSheet,
    hasPendingUploads,
    atCap,
  };
}
