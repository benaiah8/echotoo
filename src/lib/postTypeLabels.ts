/** User-facing post-type copy. Internal values remain `hangout` | `experience`. */

export type PostTypeLabelKind = "hangout" | "experience";

function asKind(type: string | null | undefined): PostTypeLabelKind {
  return type === "hangout" ? "hangout" : "experience";
}

/** Compact singular: Event / Post (chips, badges, invite prefix). */
export function postTypeCompactLabel(
  type: string | null | undefined,
): "Event" | "Post" {
  return asKind(type) === "hangout" ? "Event" : "Post";
}

/** Home type filter chip when that segment is active (Events / Posts). */
export function postTypeHomeFilterLabel(
  viewMode: "all" | "hangouts" | "experiences",
): "Events" | "Posts" | null {
  if (viewMode === "hangouts") return "Events";
  if (viewMode === "experiences") return "Posts";
  return null;
}

export function postTypeCreateTitle(type: PostTypeLabelKind): string {
  return type === "hangout" ? "Events" : "Posts";
}

export function postTypeCreateSubtitle(type: PostTypeLabelKind): string {
  return type === "hangout"
    ? "Plan something people can join"
    : "Share a place, route, idea, or recommendation";
}

export function postTypeCreateHelper(type: PostTypeLabelKind): string {
  return type === "hangout"
    ? "For events, hangouts, meetups, classes, or anything happening soon."
    : "For places, routes, itineraries, ideas, and recommendations others can save, try, and rate.";
}

export function postTypeCreateCta(type: PostTypeLabelKind): string {
  return type === "hangout" ? "Create event" : "Create post";
}

/**
 * V4 finalize header primary CTA. Copy is centralized so later visual tests can swap
 * without changing publish wiring. Option A: Publish Event/Post on create, Save on edit.
 */
export function createFlowPrimaryCtaLabel(options: {
  isEditMode: boolean;
  type: string | null | undefined;
}): string {
  if (options.isEditMode) return "Save";
  return asKind(options.type) === "hangout" ? "Publish Event" : "Publish Post";
}

/** Header CTA busy label — does not change the publish handler. */
export function createFlowPrimaryCtaBusyLabel(isEditMode: boolean): string {
  return isEditMode ? "Saving…" : "Publishing…";
}

/** Invite drawer / thread peek prefix with colon. */
export function postTypeInvitePrefix(
  type: string | null | undefined,
): "Event:" | "Post:" {
  return asKind(type) === "hangout" ? "Event:" : "Post:";
}

/** Notification fallback when referring to an experience-type post. */
export function postTypeNotificationPhrase(
  type: string | null | undefined,
): "an event" | "a post" {
  return asKind(type) === "hangout" ? "an event" : "a post";
}
