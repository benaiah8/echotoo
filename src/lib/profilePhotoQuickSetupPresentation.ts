import { PROFILE_PHOTOS_MAX } from "./profilePhotos";
import type { ProfilePhotoStackItem } from "./profilePhotoStackPresentation";

export type AddAffordanceMode = "empty-card" | "plus-ring" | "none";

export type QuickSetupPresentation = {
  photoCount: number;
  canAdd: boolean;
  addAffordance: AddAffordanceMode;
  emptyCardLabel: string;
  addAriaLabel: string;
  plusRingRatio: number;
  suggestedAddSlot: number;
  isComplete: boolean;
};

export function clampPhotoCount(count: number): number {
  return Math.max(0, Math.min(PROFILE_PHOTOS_MAX, count));
}

/** Prompt opens on the next empty slot when room remains; else primary. */
export function deriveInitialCycleIndex(photoCount: number = 0): number {
  const count = clampPhotoCount(photoCount);
  if (count >= PROFILE_PHOTOS_MAX) return 0;
  return count;
}

/** After a successful add, advance to the next actionable empty slot. */
export function deriveCycleIndexAfterPhotoAdd(photoCount: number): number {
  return deriveInitialCycleIndex(photoCount);
}

/** Shallow-V vertical offset (px) for navigation dot at slot index. */
export function deriveNavigationDotOffsetY(slotIndex: number): number {
  if (slotIndex === 1) return 4;
  return 0;
}

export function derivePlusRingRatio(photoCount: number): number {
  return clampPhotoCount(photoCount) / PROFILE_PHOTOS_MAX;
}

export function deriveEmptyCardCopyLines(photoCount: number): [string, string] {
  const count = clampPhotoCount(photoCount);
  if (count === 0) return ["Add", "photo"];
  return ["Add another", "photo"];
}

export function deriveEmptyCardButtonLabel(photoCount: number): string {
  const [line1, line2] = deriveEmptyCardCopyLines(photoCount);
  return `${line1} ${line2}`;
}

export function deriveAddAffordanceForFront(
  photoCount: number,
  frontIsPhoto: boolean,
): AddAffordanceMode {
  const count = clampPhotoCount(photoCount);
  if (count >= PROFILE_PHOTOS_MAX) return "none";
  if (!frontIsPhoto) return "empty-card";
  if (count >= 1) return "plus-ring";
  return "empty-card";
}

/** @deprecated Use deriveAddAffordanceForFront at render time. */
export function deriveAddAffordanceMode(photoCount: number): AddAffordanceMode {
  const count = clampPhotoCount(photoCount);
  if (count >= PROFILE_PHOTOS_MAX) return "none";
  if (count === 0) return "empty-card";
  return "plus-ring";
}

export function deriveFloatingPlusAriaLabel(photoCount: number): string {
  const count = clampPhotoCount(photoCount);
  if (count >= PROFILE_PHOTOS_MAX) return "";
  return `${count} of ${PROFILE_PHOTOS_MAX} profile photos added. Add another profile photo.`;
}

export function deriveQuickSetupPresentation(
  photoCount: number,
): QuickSetupPresentation {
  const count = clampPhotoCount(photoCount);
  const canAdd = count < PROFILE_PHOTOS_MAX;
  const addAffordance = deriveAddAffordanceMode(count);
  const suggestedAddSlot = canAdd ? count : -1;

  const addAriaLabel =
    count === 0
      ? "Add profile photo"
      : deriveFloatingPlusAriaLabel(count);

  return {
    photoCount: count,
    canAdd,
    addAffordance,
    emptyCardLabel: deriveEmptyCardButtonLabel(count),
    addAriaLabel,
    plusRingRatio: derivePlusRingRatio(count),
    suggestedAddSlot,
    isComplete: count >= PROFILE_PHOTOS_MAX,
  };
}

export type SlotDotPresentation = {
  slot: number;
  isPrimary: boolean;
  isCurrent: boolean;
  filled: boolean;
};

export function deriveSlotDotPresentation(
  slot: number,
  currentSlot: number,
  filled: boolean,
): SlotDotPresentation {
  return {
    slot,
    isPrimary: slot === 0,
    isCurrent: slot === currentSlot,
    filled,
  };
}

/** Read-only empty slots cycle only — do not imply tap-to-upload. */
export function quickSetupSlotAriaLabel(
  item: ProfilePhotoStackItem,
  photoCount: number,
): string {
  if (item.kind === "photo") {
    return item.slot === 0
      ? "Photo 1, primary"
      : `Photo ${item.slot + 1}`;
  }
  if (photoCount >= PROFILE_PHOTOS_MAX) {
    return `Photo slot ${item.slot + 1}`;
  }
  return `Empty photo slot ${item.slot + 1}, swipe to view other slots`;
}

/** @deprecated Numeric ring beside dots removed — use derivePlusRingRatio on add button. */
export function derivePhotoProgressRing(photoCount: number): {
  filled: number;
  total: number;
  label: string;
  ratio: number;
} {
  const filled = clampPhotoCount(photoCount);
  const total = PROFILE_PHOTOS_MAX;
  return {
    filled,
    total,
    label: `${filled}/${total}`,
    ratio: filled / total,
  };
}

/** @deprecated Use derivePhotoProgressRing */
export function derivePhotoProgressSegments(photoCount: number): {
  filled: number;
  total: number;
  label: string;
} {
  const ring = derivePhotoProgressRing(photoCount);
  return {
    filled: ring.filled,
    total: ring.total,
    label: `${ring.filled} of ${ring.total}`,
  };
}
