/** Canonical Event/Post mapping for create (Event = hangout, Post = experience). */
export function normalizeCreatePostType(
  raw: string | null | undefined,
): "experience" | "hangout" {
  return raw?.toLowerCase() === "hangout" ? "hangout" : "experience";
}

/**
 * Saved structured schedule gate owned by Finalize (`hasSchedule`).
 * Time-only (`pendingStartTime`) is intentionally excluded.
 */
export function hasValidSavedStructuredSchedule(args: {
  selectedDatesLength: number;
  recurrenceDaysLength: number;
  isRecurring: boolean;
}): boolean {
  return (
    args.selectedDatesLength > 0 ||
    args.recurrenceDaysLength > 0 ||
    args.isRecurring
  );
}

/** Edit-only: schedule implies Event; no schedule implies Post. Does not mutate type. */
export function intendedPostTypeFromStructuredSchedule(args: {
  selectedDatesLength: number;
  recurrenceDaysLength: number;
  isRecurring: boolean;
}): "experience" | "hangout" {
  return hasValidSavedStructuredSchedule(args) ? "hangout" : "experience";
}

export type PublishedEditScheduleLockKind =
  | "post_gained_schedule"
  | "event_lost_schedule";

/** Published edit conversion when schedule classification changes from a consistent baseline. */
export type PublishedTypeConversion =
  | "experience_to_hangout"
  | "hangout_to_experience";

/** @deprecated Prefer PublishedTypeConversion (shared by owner and admin). */
export type PublishedOwnerTypeConversion = PublishedTypeConversion;

export type PublishedEditScheduleSaveDecision =
  | { action: "allow" }
  | {
      action: "request_conversion";
      kind: PublishedTypeConversion;
    };

/**
 * Baseline: when current schedule would require a published type change.
 * Historical mismatches may keep saving if classification is unchanged, or
 * may repair toward consistency without a type switch.
 */
export function shouldBlockPublishedEditSaveForScheduleTypeLock(args: {
  originalPublishedType: "experience" | "hangout";
  /** Frozen at edit entry from the published row (or first bootstrap). */
  initialHasStructuredSchedule: boolean;
  currentHasStructuredSchedule: boolean;
}): { block: false } | { block: true; kind: PublishedEditScheduleLockKind } {
  const {
    originalPublishedType,
    initialHasStructuredSchedule,
    currentHasStructuredSchedule,
  } = args;

  const currentConsistentWithLockedType =
    originalPublishedType === "hangout"
      ? currentHasStructuredSchedule
      : !currentHasStructuredSchedule;

  if (currentConsistentWithLockedType) {
    return { block: false };
  }

  const initialWasMismatch =
    originalPublishedType === "hangout"
      ? !initialHasStructuredSchedule
      : initialHasStructuredSchedule;

  if (
    initialWasMismatch &&
    currentHasStructuredSchedule === initialHasStructuredSchedule
  ) {
    return { block: false };
  }

  return {
    block: true,
    kind:
      originalPublishedType === "experience"
        ? "post_gained_schedule"
        : "event_lost_schedule",
  };
}

/**
 * Owner and admin share the same published conversion classification.
 * Callers confirm before including `type` on republish.
 */
export function resolvePublishedEditScheduleSaveDecision(args: {
  originalPublishedType: "experience" | "hangout";
  initialHasStructuredSchedule: boolean;
  currentHasStructuredSchedule: boolean;
}): PublishedEditScheduleSaveDecision {
  const lock = shouldBlockPublishedEditSaveForScheduleTypeLock(args);
  if (!lock.block) {
    return { action: "allow" };
  }
  return {
    action: "request_conversion",
    kind:
      lock.kind === "post_gained_schedule"
        ? "experience_to_hangout"
        : "hangout_to_experience",
  };
}

/** Target posts.type for a confirmed published conversion. */
export function publishedOwnerConversionTargetType(
  kind: PublishedTypeConversion,
): "experience" | "hangout" {
  return kind === "experience_to_hangout" ? "hangout" : "experience";
}

/**
 * Owner republish: omit `type` unless an explicit confirmed conversion.
 * Does not invent conversion from schedule alone.
 */
export function withOwnerRepublishTypeKey(
  payload: Record<string, unknown>,
  confirmedOwnerTypeConversion?: "experience" | "hangout" | null,
): Record<string, unknown> {
  const next = { ...payload };
  if (
    confirmedOwnerTypeConversion === "hangout" ||
    confirmedOwnerTypeConversion === "experience"
  ) {
    next.type = confirmedOwnerTypeConversion;
  } else {
    delete next.type;
  }
  return next;
}

/**
 * Admin republish type gate: same type always allowed; confirmed conversion
 * unlocks only hangout|experience targets. Arbitrary switches throw.
 */
export function resolveAdminRepublishTypeGate(args: {
  originalPostType?: "experience" | "hangout" | null;
  postType: "experience" | "hangout";
  confirmedTypeConversion?: "experience" | "hangout" | null;
}): { nextType: "experience" | "hangout"; confirmedSwitch: boolean } {
  const lockedType = args.originalPostType ?? args.postType;
  const nextType = args.postType === "hangout" ? "hangout" : "experience";
  const confirmed = args.confirmedTypeConversion;
  const confirmedSwitch =
    confirmed === nextType &&
    (confirmed === "hangout" || confirmed === "experience") &&
    (lockedType === "experience" || lockedType === "hangout") &&
    lockedType !== nextType;

  if (lockedType !== nextType && !confirmedSwitch) {
    throw new Error("Post type cannot be changed");
  }
  return { nextType, confirmedSwitch };
}

/**
 * Fresh Create: Post (`experience`) becomes Event (`hangout`) only after
 * committing a valid structured schedule. Edit mode and already-Event stay put.
 */
export function shouldConvertExperienceToHangoutOnScheduleCommit(args: {
  isEditMode: boolean;
  createPostType: "hangout" | "experience";
  selectedDatesLength: number;
  recurrenceDaysLength: number;
  isRecurring: boolean;
}): boolean {
  if (args.isEditMode) return false;
  if (args.createPostType !== "experience") return false;
  return hasValidSavedStructuredSchedule(args);
}

/**
 * Fresh Create: Event (`hangout`) whose committed structured schedule is empty
 * must confirm Event → Post before applying. Do not count time-only as valid.
 * Edit mode never requests this conversion.
 */
export function shouldRequestEventToPlaceOnFinalScheduleRemoval(args: {
  isEditMode: boolean;
  createPostType: "hangout" | "experience";
  selectedDatesLength: number;
  recurrenceDaysLength: number;
  isRecurring: boolean;
}): boolean {
  if (args.isEditMode) return false;
  if (args.createPostType !== "hangout") return false;
  return !hasValidSavedStructuredSchedule(args);
}

/** CREATE Event date-chip Remove routes to Event → Post (one confirmation). */
export function shouldRouteDateChipRemoveToEventToPlace(args: {
  isEditMode: boolean;
  createPostType: "hangout" | "experience";
}): boolean {
  return !args.isEditMode && args.createPostType === "hangout";
}

/**
 * Resolve active create type for a tab session.
 * Resume/continue: stored draft type wins. Fresh entry: explicit URL wins over stale meta.
 */
export function resolveCreatePostTypeForSession(opts: {
  urlType: string | null;
  resumeDraft?: boolean;
  storedType?: "hangout" | "experience" | null;
  isResumedSession?: boolean;
}): "experience" | "hangout" {
  const stored =
    opts.storedType === "hangout" || opts.storedType === "experience"
      ? opts.storedType
      : null;
  const hasExplicitUrl =
    opts.urlType != null && opts.urlType.trim() !== "";
  const urlNormalized = normalizeCreatePostType(opts.urlType);
  const isResume =
    opts.resumeDraft === true || opts.isResumedSession === true;

  if (isResume && stored) {
    return stored;
  }

  if (hasExplicitUrl) {
    return urlNormalized;
  }

  if (stored) {
    return stored;
  }

  return "experience";
}
