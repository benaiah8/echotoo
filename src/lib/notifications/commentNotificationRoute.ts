import type { Location } from "react-router-dom";
import { Paths, postDetailPath } from "../../router/Paths";
import type { PostDetailNavigateState } from "../postDetailNavigationState";
import { parsePostType } from "./notificationRouteResolver";

/**
 * Resolve post detail path for comment notifications.
 * Legacy rows without post_type fall back to /experience/:id (prior behavior).
 */
export function resolveCommentNotificationPostPath(
  postId: unknown,
  postTypeRaw: unknown
): string {
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return "#";
  const postType = parsePostType(postTypeRaw);
  if (postType) return postDetailPath(postType, id);
  return `${Paths.experience}/${id}`;
}

export function commentNotificationNavigateState(
  location: Location
): PostDetailNavigateState {
  return {
    backgroundLocation: location,
    scrollToComments: true,
  };
}

export function notificationNavigateState(
  notificationType: string,
  location: Location
): PostDetailNavigateState {
  if (notificationType === "comment") {
    return commentNotificationNavigateState(location);
  }
  return { backgroundLocation: location };
}
