/**
 * Fresh Create leave baseline — tab sessionStorage, owned by create leave guard.
 * Kept separate from drafts.ts to avoid import cycles with discardAllDrafts.
 */

export type FreshCreateLeaveBaseline = {
  /** Local publish id owned by this fresh session; null if unavailable at establish. */
  publishPostId: string | null;
  createPostType: "hangout" | "experience";
  visibility: "public" | "friends";
  ratingEnabled: boolean;
  rsvpEnabled: boolean;
};

/** sessionStorage — tab-scoped; survives finalize remounts within the same fresh entry. */
export const FRESH_CREATE_LEAVE_BASELINE_KEY = "createFlowFreshLeaveBaseline";

export function defaultRatingEnabledForCreatePostType(
  postType: "experience" | "hangout",
): boolean {
  return postType === "experience";
}

export function buildFreshCreateLeaveBaseline(args: {
  publishPostId?: string | null;
  createPostType: "hangout" | "experience";
  visibility?: "public" | "friends";
  ratingEnabled?: boolean;
  rsvpEnabled?: boolean;
}): FreshCreateLeaveBaseline {
  const createPostType =
    args.createPostType === "hangout" ? "hangout" : "experience";
  return {
    publishPostId:
      typeof args.publishPostId === "string" && args.publishPostId.trim()
        ? args.publishPostId.trim()
        : null,
    createPostType,
    visibility: args.visibility === "friends" ? "friends" : "public",
    ratingEnabled:
      typeof args.ratingEnabled === "boolean"
        ? args.ratingEnabled
        : defaultRatingEnabledForCreatePostType(createPostType),
    rsvpEnabled: args.rsvpEnabled === true,
  };
}

export function establishFreshCreateLeaveBaseline(
  baseline: FreshCreateLeaveBaseline,
): void {
  try {
    sessionStorage.setItem(
      FRESH_CREATE_LEAVE_BASELINE_KEY,
      JSON.stringify(buildFreshCreateLeaveBaseline(baseline)),
    );
  } catch {
    /* ignore */
  }
}

export function clearFreshCreateLeaveBaseline(): void {
  try {
    sessionStorage.removeItem(FRESH_CREATE_LEAVE_BASELINE_KEY);
  } catch {
    /* ignore */
  }
}

export function readFreshCreateLeaveBaseline(): FreshCreateLeaveBaseline | null {
  try {
    const raw = sessionStorage.getItem(FRESH_CREATE_LEAVE_BASELINE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FreshCreateLeaveBaseline>;
    if (!parsed || typeof parsed !== "object") return null;
    const createPostType =
      parsed.createPostType === "hangout" ? "hangout" : "experience";
    return buildFreshCreateLeaveBaseline({
      publishPostId: parsed.publishPostId ?? null,
      createPostType,
      visibility: parsed.visibility === "friends" ? "friends" : "public",
      ratingEnabled:
        typeof parsed.ratingEnabled === "boolean"
          ? parsed.ratingEnabled
          : defaultRatingEnabledForCreatePostType(createPostType),
      rsvpEnabled: parsed.rsvpEnabled === true,
    });
  } catch {
    return null;
  }
}
