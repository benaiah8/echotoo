/** User-facing post-type copy. Internal values remain `hangout` | `experience`. */

export type PostTypeLabelKind = "hangout" | "experience";

function asKind(type: string | null | undefined): PostTypeLabelKind {
  return type === "hangout" ? "hangout" : "experience";
}

/** Compact singular: Event / Place (chips, badges, invite prefix). */
export function postTypeCompactLabel(
  type: string | null | undefined,
): "Event" | "Place" {
  return asKind(type) === "hangout" ? "Event" : "Place";
}

/** Home type filter chip when that segment is active (Events / Places). */
export function postTypeHomeFilterLabel(
  viewMode: "all" | "hangouts" | "experiences",
): "Events" | "Places" | null {
  if (viewMode === "hangouts") return "Events";
  if (viewMode === "experiences") return "Places";
  return null;
}

export function postTypeCreateTitle(type: PostTypeLabelKind): string {
  return type === "hangout" ? "Events / Experiences" : "Places / Plans";
}

export function postTypeCreateSubtitle(type: PostTypeLabelKind): string {
  return type === "hangout"
    ? "Plan something people can join"
    : "Share a place, route, or idea";
}

export function postTypeCreateHelper(type: PostTypeLabelKind): string {
  return type === "hangout"
    ? "For events, hangouts, meetups, classes, or anything happening soon."
    : "For food spots, places, routes, itineraries, or ideas others can save, try, and rate.";
}

export function postTypeCreateCta(type: PostTypeLabelKind): string {
  return type === "hangout" ? "Create event" : "Create places / plans";
}

/** Invite drawer / thread peek prefix with colon. */
export function postTypeInvitePrefix(
  type: string | null | undefined,
): "Event:" | "Place:" {
  return asKind(type) === "hangout" ? "Event:" : "Place:";
}

/** Notification fallback when referring to an experience-type post. */
export function postTypeNotificationPhrase(
  type: string | null | undefined,
): "an event" | "a place" {
  return asKind(type) === "hangout" ? "an event" : "a place";
}
