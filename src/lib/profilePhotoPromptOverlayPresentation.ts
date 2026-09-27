import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

export type ProfilePhotoPromptCtaPresentation = {
  photoCount: number;
  isComplete: boolean;
  showContinueAnyway: boolean;
  primaryLabel: string;
  primaryIsProminent: boolean;
  continueStyle: "subtle" | "medium" | "primary";
};

export type ProfilePhotoPromptCtaOptions = {
  continueLabel?: string;
  continueAnywayLabel?: string;
};

export type ProfilePhotoPromptSentenceParts = {
  accent: string;
  rest: string;
  full: string;
};

export function clampPromptPhotoCount(count: number): number {
  return Math.max(0, Math.min(PROFILE_PHOTOS_MAX, count));
}

export function deriveProfilePhotoPromptCta(
  photoCount: number,
  options: ProfilePhotoPromptCtaOptions = {},
): ProfilePhotoPromptCtaPresentation {
  const count = clampPromptPhotoCount(photoCount);
  const continueLabel = options.continueLabel?.trim() || "Continue";
  const continueAnywayLabel =
    options.continueAnywayLabel?.trim() || "Continue anyway";

  if (count >= PROFILE_PHOTOS_MAX) {
    return {
      photoCount: count,
      isComplete: true,
      showContinueAnyway: false,
      primaryLabel: continueLabel,
      primaryIsProminent: true,
      continueStyle: "primary",
    };
  }

  if (count >= 2) {
    return {
      photoCount: count,
      isComplete: false,
      showContinueAnyway: false,
      primaryLabel: continueLabel,
      primaryIsProminent: true,
      continueStyle: "medium",
    };
  }

  return {
    photoCount: count,
    isComplete: false,
    showContinueAnyway: true,
    primaryLabel: continueAnywayLabel,
    primaryIsProminent: false,
    continueStyle: "subtle",
  };
}

export function canCloseProfilePhotoPrompt(busy: boolean): boolean {
  return !busy;
}

export function canFireProfilePhotoPromptContinue(busy: boolean): boolean {
  return !busy;
}

/** Accent + rest for yellow phrase highlighting. */
export function deriveProfilePhotoPromptSentenceParts(
  photoCount: number,
): ProfilePhotoPromptSentenceParts {
  const count = clampPromptPhotoCount(photoCount);
  if (count === 0) {
    return {
      accent: "Add two photos",
      rest: " so people know who they're making plans with.",
      full: "Add two photos so people know who they're making plans with.",
    };
  }
  if (count === 1) {
    return {
      accent: "Add one more photo",
      rest: " so people can get a better sense of you.",
      full: "Add one more photo so people can get a better sense of you.",
    };
  }
  if (count === 2) {
    return {
      accent: "Add one more photo",
      rest: " so people can get a fuller sense of you.",
      full: "Add one more photo so people can get a fuller sense of you.",
    };
  }
  return { accent: "", rest: "", full: "" };
}

/** Single sentence keyed to real photo count — no title + description pair. */
export function deriveProfilePhotoPromptSentenceByCount(
  photoCount: number,
): string {
  return deriveProfilePhotoPromptSentenceParts(photoCount).full;
}

/** Single sentence for minimal floating prompt — title only, no description. */
export function deriveProfilePhotoPromptSentence(
  title?: string,
  description?: string,
): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) return trimmedTitle;
  const trimmedDescription = description?.trim();
  if (trimmedDescription) return trimmedDescription;
  return "Add photos once so people know who they're making plans with.";
}
