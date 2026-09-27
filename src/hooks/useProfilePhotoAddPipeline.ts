import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabaseClient";
import {
  deleteUncommittedProfilePhotoUpload,
  uploadPreparedProfilePhoto,
} from "../api/services/mediaUpload";
import { preparedProfilePhotoFromExport } from "../lib/prepareImageForUpload";
import {
  PROFILE_PHOTOS_MAX,
  uniqueOrderedProfilePhotos,
} from "../lib/profilePhotos";
import {
  captureImageFromCamera,
  isCameraUserCancellation,
  pickImagesFromLibrary,
} from "../lib/mediaAcquisition";
import { mapMediaUploadError } from "../lib/mapMediaUploadError";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import {
  type ProfileIdentityRow,
  updateProfilePhotosInDb,
} from "../lib/publishProfileIdentityRow";
import {
  appendCompletedCrop,
  createAddCropQueue,
  filterImageFiles,
  profilePhotoRemainingSlots,
  shiftNextPendingFile,
  sliceFilesToRemainingSlots,
  takeCompletedCrops,
  type ProfilePhotoAddCropQueue,
} from "../lib/profilePhotoAddPipelineUtils";

const PROFILE_PHOTO_OP_LOG = "[ProfilePhotoOp]";

export type UseProfilePhotoAddPipelineOptions = {
  profileId: string;
  userId: string | null;
  photos: string[];
  onIdentityPublished?: (row: ProfileIdentityRow) => void;
  onPhotosChanged?: (photos: string[]) => void;
  onError?: (message: string | null) => void;
  /** Optional shared mutex with parent (e.g. Edit Profile remove/reorder/replace). */
  beginPhotoOp?: () => boolean;
  endPhotoOp?: () => void;
  isPhotoOpBusy?: () => boolean;
};

export function useProfilePhotoAddPipeline({
  profileId,
  userId,
  photos,
  onIdentityPublished,
  onPhotosChanged,
  onError,
  beginPhotoOp: beginPhotoOpExternal,
  endPhotoOp: endPhotoOpExternal,
  isPhotoOpBusy,
}: UseProfilePhotoAddPipelineOptions) {
  const mountedRef = useRef(true);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const photoOpBusyRef = useRef(false);
  const cropSessionRef = useRef<ProfilePhotoAddCropQueue | null>(null);
  const cropObjectUrlRef = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaChooserOpen, setMediaChooserOpen] = useState(false);
  const [mediaNativeBusy, setMediaNativeBusy] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const onIdentityPublishedRef = useRef(onIdentityPublished);
  const onPhotosChangedRef = useRef(onPhotosChanged);
  const onErrorRef = useRef(onError);
  onIdentityPublishedRef.current = onIdentityPublished;
  onPhotosChangedRef.current = onPhotosChanged;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetError = useCallback((message: string | null) => {
    if (!mountedRef.current) return;
    setError(message);
    onErrorRef.current?.(message);
  }, []);

  const remainingSlots = profilePhotoRemainingSlots(photos.length);
  const externalBusy = isPhotoOpBusy?.() ?? false;
  const canAdd =
    remainingSlots > 0 && !busy && !mediaNativeBusy && !externalBusy;

  const closeCropUi = useCallback(() => {
    const url = cropObjectUrlRef.current;
    if (url) {
      URL.revokeObjectURL(url);
      cropObjectUrlRef.current = null;
    }
    if (!mountedRef.current) return;
    setCropImageSrc(null);
    setCropOpen(false);
  }, []);

  const resetAddSession = useCallback(() => {
    closeCropUi();
    cropSessionRef.current = null;
  }, [closeCropUi]);

  const openCropForFile = useCallback(
    (file: File) => {
      closeCropUi();
      const url = URL.createObjectURL(file);
      cropObjectUrlRef.current = url;
      if (!mountedRef.current) return;
      setCropImageSrc(url);
      setCropOpen(true);
    },
    [closeCropUi],
  );

  const beginPhotoOp = useCallback(() => {
    if (isPhotoOpBusy?.()) return false;
    if (beginPhotoOpExternal) return beginPhotoOpExternal();
    if (photoOpBusyRef.current) return false;
    photoOpBusyRef.current = true;
    if (mountedRef.current) setBusy(true);
    return true;
  }, [beginPhotoOpExternal, isPhotoOpBusy]);

  const endPhotoOp = useCallback(() => {
    if (endPhotoOpExternal) {
      endPhotoOpExternal();
      return;
    }
    photoOpBusyRef.current = false;
    if (mountedRef.current) setBusy(false);
  }, [endPhotoOpExternal]);

  const commitBatchAdd = useCallback(
    async (croppedFiles: File[]) => {
      if (croppedFiles.length === 0) return;
      if (!beginPhotoOp()) {
        console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", { reason: "busy" });
        safeSetError("Another photo update is in progress. Please wait.");
        return;
      }

      safeSetError(null);
      const uploadedPaths: string[] = [];
      let authUserId: string | null = userId;

      try {
        if (!authUserId) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.user?.id) {
            throw new Error("User not authenticated");
          }
          authUserId = session.user.id;
        }

        const current = photosRef.current;
        const capacity = PROFILE_PHOTOS_MAX - current.length;
        const toUpload = croppedFiles.slice(0, Math.max(0, capacity));
        if (toUpload.length === 0) {
          throw new Error("You already have 3 photos.");
        }

        for (const croppedFile of toUpload) {
          const prepared = preparedProfilePhotoFromExport(croppedFile);
          const path = await uploadPreparedProfilePhoto(prepared, {
            userId: authUserId,
          });
          uploadedPaths.push(path);
        }

        const next = uniqueOrderedProfilePhotos([...current, ...uploadedPaths]);

        try {
          const row = await updateProfilePhotosInDb(profileId, next);
          const publishedPhotos = uniqueOrderedProfilePhotos(row.profile_photos);
          if (mountedRef.current) {
            onIdentityPublishedRef.current?.(row);
            onPhotosChangedRef.current?.(publishedPhotos);
          }
        } catch (dbErr) {
          for (const uploadedPath of uploadedPaths) {
            const cleanup = await deleteUncommittedProfilePhotoUpload({
              userId: authUserId,
              uploadedPath,
            });
            if (!cleanup.deleted && !cleanup.skipped) {
              console.warn(
                PROFILE_PHOTO_OP_LOG,
                "uncommitted_cleanup_failed",
                cleanup,
              );
            }
          }
          throw dbErr;
        }
      } catch (err: unknown) {
        if (uploadedPaths.length > 0 && authUserId) {
          for (const uploadedPath of uploadedPaths) {
            const cleanup = await deleteUncommittedProfilePhotoUpload({
              userId: authUserId,
              uploadedPath,
            });
            if (!cleanup.deleted && !cleanup.skipped) {
              console.warn(
                PROFILE_PHOTO_OP_LOG,
                "uncommitted_cleanup_failed",
                cleanup,
              );
            }
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(PROFILE_PHOTO_OP_LOG, "failed", { message: msg });
        safeSetError(mapMediaUploadError(err, "avatar"));
      } finally {
        endPhotoOp();
      }
    },
    [beginPhotoOp, endPhotoOp, profileId, safeSetError, userId],
  );

  const advanceAddCropQueueOrCommit = useCallback(() => {
    const session = cropSessionRef.current;
    if (!session) {
      resetAddSession();
      return;
    }
    closeCropUi();
    const nextFile = shiftNextPendingFile(session);
    if (nextFile) {
      openCropForFile(nextFile);
      return;
    }
    const completed = takeCompletedCrops(session);
    cropSessionRef.current = null;
    if (completed.length > 0) {
      void commitBatchAdd(completed);
    }
  }, [closeCropUi, commitBatchAdd, openCropForFile, resetAddSession]);

  const beginAddFilesForCrop = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      if (!cropSessionRef.current) {
        console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", {
          reason: "no_session_on_file",
        });
        safeSetError("Couldn't add this photo. Please try again.");
        return;
      }

      const imageFiles = filterImageFiles(files);
      if (imageFiles.length === 0) {
        safeSetError("Please choose an image file.");
        return;
      }

      safeSetError(null);

      const remaining = profilePhotoRemainingSlots(photosRef.current.length);
      if (remaining <= 0) {
        toast.error("Remove a photo to add another.");
        resetAddSession();
        return;
      }

      const sliced = sliceFilesToRemainingSlots(imageFiles, remaining);
      if (!sliced) {
        toast.error("Remove a photo to add another.");
        resetAddSession();
        return;
      }

      if (sliced.ignoredCount > 0) {
        toast.error(
          remaining === 1
            ? "Only 1 photo slot left — extra selections were ignored."
            : `Only ${remaining} photo slots left — extra selections were ignored.`,
        );
      }

      const { firstFile, session } = createAddCropQueue(
        sliced.accepted[0]!,
        sliced.pending,
      );
      cropSessionRef.current = session;
      openCropForFile(firstFile);
    },
    [openCropForFile, resetAddSession, safeSetError],
  );

  const openAddPhotos = useCallback((options?: { preferChooser?: boolean }) => {
    if (isPhotoOpBusy?.() || photoOpBusyRef.current) {
      console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", { reason: "busy" });
      safeSetError("Another photo update is in progress. Please wait.");
      return false;
    }
    const remaining = profilePhotoRemainingSlots(photosRef.current.length);
    if (remaining <= 0) {
      toast.error("Remove a photo to add another.");
      return false;
    }
    cropSessionRef.current = { pending: [], completed: [] };
    if (isNativeApp() || options?.preferChooser) {
      if (mountedRef.current) setMediaChooserOpen(true);
    }
    return true;
  }, [safeSetError, isPhotoOpBusy]);

  const closeMediaChooser = useCallback(() => {
    if (!mountedRef.current) return;
    setMediaChooserOpen(false);
    if (!mediaNativeBusy && !cropOpen) {
      cropSessionRef.current = null;
    }
  }, [cropOpen, mediaNativeBusy]);

  const chooseLibrary = useCallback(async () => {
    if (!mountedRef.current) return;
    setMediaChooserOpen(false);
    if (!cropSessionRef.current) return;

    const remaining = profilePhotoRemainingSlots(photosRef.current.length);
    if (remaining <= 0) {
      toast.error("Remove a photo to add another.");
      resetAddSession();
      return;
    }

    if (mountedRef.current) setMediaNativeBusy(true);
    try {
      const { files, selectedCount, failedCount } = await pickImagesFromLibrary({
        maxCount: remaining,
      });
      if (selectedCount > 0 && files.length === 0) {
        toast.error("Couldn't read the selected photos.");
        return;
      }
      if (failedCount > 0 && files.length > 0) {
        toast.error(
          failedCount === 1
            ? "Couldn't read 1 selected photo."
            : `Couldn't read ${failedCount} selected photos.`,
        );
      }
      if (files.length) {
        beginAddFilesForCrop(files);
      } else if (selectedCount <= 0) {
        resetAddSession();
      }
    } catch (err) {
      if (!isCameraUserCancellation(err)) {
        console.error("[useProfilePhotoAddPipeline] gallery pick failed", err);
        toast.error("Couldn't open your photo library. Please try again.");
      }
      resetAddSession();
    } finally {
      if (mountedRef.current) setMediaNativeBusy(false);
    }
  }, [beginAddFilesForCrop, resetAddSession]);

  const captureCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    setMediaChooserOpen(false);
    if (!cropSessionRef.current) return;

    if (photosRef.current.length >= PROFILE_PHOTOS_MAX) {
      toast.error("Remove a photo to add another.");
      resetAddSession();
      return;
    }

    if (mountedRef.current) setMediaNativeBusy(true);
    try {
      const { file, readFailed } = await captureImageFromCamera();
      if (readFailed) {
        toast.error("Couldn't read the captured photo.");
        resetAddSession();
        return;
      }
      if (file) {
        beginAddFilesForCrop([file]);
      } else {
        resetAddSession();
      }
    } catch (err) {
      if (!isCameraUserCancellation(err)) {
        console.error("[useProfilePhotoAddPipeline] camera capture failed", err);
        toast.error("Couldn't open the camera. Please try again.");
      }
      resetAddSession();
    } finally {
      if (mountedRef.current) setMediaNativeBusy(false);
    }
  }, [beginAddFilesForCrop, resetAddSession]);

  const acceptWebFiles = useCallback(
    (files: File[]) => {
      beginAddFilesForCrop(files);
    },
    [beginAddFilesForCrop],
  );

  const confirmCrop = useCallback(
    async (croppedFile: File) => {
      const session = cropSessionRef.current;
      if (!session) {
        console.warn(PROFILE_PHOTO_OP_LOG, "early_abort", {
          reason: "no_intent",
        });
        safeSetError("Couldn't add this photo. Please try again.");
        resetAddSession();
        return;
      }
      appendCompletedCrop(session, croppedFile);
      advanceAddCropQueueOrCommit();
    },
    [advanceAddCropQueueOrCommit, resetAddSession, safeSetError],
  );

  const cancelCrop = useCallback(() => {
    advanceAddCropQueueOrCommit();
  }, [advanceAddCropQueueOrCommit]);

  const reset = useCallback(() => {
    resetAddSession();
    if (!mountedRef.current) return;
    setMediaChooserOpen(false);
    setMediaNativeBusy(false);
    setError(null);
    endPhotoOp();
  }, [endPhotoOp, resetAddSession]);

  const hasAddSession = useCallback(() => cropSessionRef.current != null, []);

  return {
    busy: busy || mediaNativeBusy || externalBusy,
    error,
    canAdd,
    remainingSlots,
    mediaChooserOpen,
    setMediaChooserOpen,
    closeMediaChooser,
    mediaNativeBusy,
    cropOpen,
    cropImageSrc,
    openAddPhotos,
    chooseLibrary,
    captureCamera,
    acceptWebFiles,
    confirmCrop,
    cancelCrop,
    reset,
    hasAddSession,
  };
}
