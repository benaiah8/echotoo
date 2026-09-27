import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

export type ProfilePhotoStackItem =
  | { kind: "photo"; path: string; slot: number }
  | { kind: "add"; slot: number };

export type PeekSide = "left" | "right";

/** Soft face swap — opacity + small translate/scale (not a carousel). */
export const PROFILE_PHOTO_STACK_TRANSITION_MS = 280;
export const PROFILE_PHOTO_STACK_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const PROFILE_PHOTO_STACK_IN_FROM = "translateX(6px) scale(0.99)";
export const PROFILE_PHOTO_STACK_OUT_TO = "translateX(-5px) scale(0.99)";
export const PROFILE_PHOTO_STACK_SETTLED = "translateX(0) scale(1)";

export function profilePhotoStackItemKey(item: ProfilePhotoStackItem): string {
  return item.kind === "photo" ? `photo-${item.path}` : `add-${item.slot}`;
}

/** Three conceptual slots — filled photo or empty add surface per slot index. */
export function buildProfilePhotoStackItems(
  photos: string[],
): ProfilePhotoStackItem[] {
  return Array.from({ length: PROFILE_PHOTOS_MAX }, (_, slot) => {
    const path = photos[slot];
    return path
      ? { kind: "photo" as const, path, slot }
      : { kind: "add" as const, slot };
  });
}

/** Quick setup always cycles all three slots (photo or add). */
export function buildProfilePhotoCycleItems(
  photos: string[],
): ProfilePhotoStackItem[] {
  return buildProfilePhotoStackItems(photos);
}

/** Subtle rear-card peeks — front card dominant, two slots visible behind. */
export function peekTransform(side: PeekSide, depth: number): string {
  const x = side === "left" ? -6.5 - depth * 1.25 : 6.5 + depth * 1.25;
  const rot = side === "left" ? -3.75 - depth * 0.6 : 3.75 + depth * 0.6;
  const y = 5 + depth * 1.5;
  return `translate(-50%, -50%) translate(${x}%, ${y}%) rotate(${rot}deg) scale(0.94)`;
}

export function computeRearPeekItems(
  stackItems: ProfilePhotoStackItem[],
  activeItem: ProfilePhotoStackItem | null,
): { item: ProfilePhotoStackItem; side: PeekSide }[] {
  if (stackItems.length < 2 || !activeItem) return [];

  const rest = stackItems.filter((item) => {
    if (activeItem.kind === "photo" && item.kind === "photo") {
      return item.path !== activeItem.path;
    }
    if (activeItem.kind === "add" && item.kind === "add") {
      return item.slot !== activeItem.slot;
    }
    return true;
  });

  const peeks = rest.slice(0, 2);
  if (peeks.length === 1) {
    return [{ item: peeks[0]!, side: "right" }];
  }
  if (peeks.length >= 2) {
    return [
      { item: peeks[0]!, side: "left" },
      { item: peeks[1]!, side: "right" },
    ];
  }
  return [];
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function slotAriaLabel(
  item: ProfilePhotoStackItem,
  photoCount: number,
): string {
  if (item.kind === "photo") {
    return `Photo ${item.slot + 1}`;
  }
  if (photoCount >= PROFILE_PHOTOS_MAX) {
    return `Photo slot ${item.slot + 1}`;
  }
  return `Add photo ${item.slot + 1}`;
}
