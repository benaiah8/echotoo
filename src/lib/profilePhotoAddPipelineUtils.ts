import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

export type ProfilePhotoAddCropQueue = {
  pending: File[];
  completed: File[];
};

export function profilePhotoRemainingSlots(currentPhotoCount: number): number {
  return Math.max(0, PROFILE_PHOTOS_MAX - Math.max(0, currentPhotoCount));
}

export function filterImageFiles(files: File[]): File[] {
  return files.filter((f) => f.type.startsWith("image/") || !f.type);
}

export type SliceFilesToRemainingResult = {
  accepted: File[];
  pending: File[];
  ignoredCount: number;
};

/**
 * Slice incoming files to remaining capacity and split first vs queue.
 * Matches Edit Profile add flow: first file crops immediately, rest pending.
 */
export function sliceFilesToRemainingSlots(
  imageFiles: File[],
  remaining: number,
): SliceFilesToRemainingResult | null {
  if (remaining <= 0) return null;
  const accepted = imageFiles.slice(0, remaining);
  if (accepted.length === 0) return null;
  return {
    accepted,
    pending: accepted.slice(1),
    ignoredCount: Math.max(0, imageFiles.length - remaining),
  };
}

export function createAddCropQueue(firstFile: File, pending: File[]): {
  firstFile: File;
  session: ProfilePhotoAddCropQueue;
} {
  return {
    firstFile,
    session: {
      pending: [...pending],
      completed: [],
    },
  };
}

export function shiftNextPendingFile(
  session: ProfilePhotoAddCropQueue,
): File | null {
  return session.pending.shift() ?? null;
}

export function appendCompletedCrop(
  session: ProfilePhotoAddCropQueue,
  croppedFile: File,
): void {
  session.completed.push(croppedFile);
}

export function takeCompletedCrops(session: ProfilePhotoAddCropQueue): File[] {
  return [...session.completed];
}
