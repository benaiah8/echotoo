import type { ProfileGender } from "../api/services/profilePrivate";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar display for YYYY-MM-DD (no UTC day-shift). Returns "" when unset/invalid. */
export function formatDobDisplay(ymd: string | null): string {
  if (!ymd || !DATE_ONLY_RE.test(ymd)) return "";
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Read-only birthday row — never exposes raw YYYY-MM-DD. */
export function formatBirthdayDisplay(ymd: string | null): string {
  const formatted = formatDobDisplay(ymd);
  return formatted || "Not set";
}

const GENDER_DISPLAY: Record<ProfileGender, string> = {
  male: "Male",
  female: "Female",
  prefer_not_to_say: "Prefer not to say",
};

/** Read-only gender row — never exposes raw enum strings. */
export function formatGenderDisplay(gender: ProfileGender | null): string {
  if (gender == null) return "Not set";
  return GENDER_DISPLAY[gender] ?? "Not set";
}

export function hasAboutYouBirthday(dateOfBirth: string | null): boolean {
  return formatDobDisplay(dateOfBirth) !== "";
}

export function hasAboutYouGender(gender: ProfileGender | null): boolean {
  return gender != null;
}

/** Complete only when both birthday and gender are set (prefer_not_to_say counts as set). */
export function isAboutYouComplete(
  dateOfBirth: string | null,
  gender: ProfileGender | null,
): boolean {
  return hasAboutYouBirthday(dateOfBirth) && hasAboutYouGender(gender);
}

export type AboutYouVisualState = "complete" | "incomplete";

export function deriveAboutYouVisualState(
  dateOfBirth: string | null,
  gender: ProfileGender | null,
): AboutYouVisualState {
  return isAboutYouComplete(dateOfBirth, gender) ? "complete" : "incomplete";
}

/** Complete profiles require confirmation before entering edit mode. */
export function shouldConfirmAboutYouEdit(
  dateOfBirth: string | null,
  gender: ProfileGender | null,
): boolean {
  return isAboutYouComplete(dateOfBirth, gender);
}

export function isAboutYouBirthdayMissing(dateOfBirth: string | null): boolean {
  return !hasAboutYouBirthday(dateOfBirth);
}

export function isAboutYouGenderMissing(gender: ProfileGender | null): boolean {
  return !hasAboutYouGender(gender);
}

export type AboutYouField = "birthday" | "gender";

/** Per-field incomplete — drives individual card styling. */
export function isAboutYouFieldIncomplete(
  field: AboutYouField,
  dateOfBirth: string | null,
  gender: ProfileGender | null,
): boolean {
  return field === "birthday"
    ? isAboutYouBirthdayMissing(dateOfBirth)
    : isAboutYouGenderMissing(gender);
}

export function isBirthdayMissing(dateOfBirth: string | null): boolean {
  return isAboutYouBirthdayMissing(dateOfBirth);
}

export function isGenderMissing(gender: ProfileGender | null): boolean {
  return isAboutYouGenderMissing(gender);
}

/** Header action when About You is read-only: Add when both empty, otherwise Edit. */
export function deriveAboutYouActionLabel(
  dateOfBirth: string | null,
  gender: ProfileGender | null,
): "Add" | "Edit" {
  if (!hasAboutYouBirthday(dateOfBirth) && !hasAboutYouGender(gender)) {
    return "Add";
  }
  return "Edit";
}

export type AboutYouSnapshot = {
  dateOfBirth: string | null;
  gender: ProfileGender | null;
};

/** Restore staged About You values after Cancel; recompute touched flags vs save baseline. */
export function applyAboutYouEditCancel(
  baseline: AboutYouSnapshot,
  initial: AboutYouSnapshot,
): AboutYouSnapshot & { dobTouched: boolean; genderTouched: boolean } {
  return {
    dateOfBirth: baseline.dateOfBirth,
    gender: baseline.gender,
    dobTouched: baseline.dateOfBirth !== initial.dateOfBirth,
    genderTouched: baseline.gender !== initial.gender,
  };
}
