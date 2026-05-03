import type { NavigateFunction, Location } from "react-router-dom";
import { postDetailPath } from "../router/Paths";
import type { PostDetailNavigateState } from "./postDetailNavigationState";

/**
 * In-app post opens should pass `state.backgroundLocation` so `AppRouter` keeps the
 * underlying screen mounted and shows `PostDetailModal`. Plain
 * `navigate(postDetailPath(type, id))` with no `state` is correct only for
 * true standalone / cold-URL / new-tab opens where the document has no previous route.
 */
export type NavigateToPostDetailInAppExtras = Omit<
  PostDetailNavigateState,
  "backgroundLocation"
>;

/**
 * Navigates to `/experience/:id` or `/hangout/:id` with modal overlay state.
 * @param currentLocation - pass `useLocation()` from the calling route (becomes the background).
 */
export function navigateToPostDetailInApp(
  navigate: NavigateFunction,
  currentLocation: Location,
  postType: "experience" | "hangout",
  postId: string,
  extras?: NavigateToPostDetailInAppExtras
): void {
  navigate(postDetailPath(postType, postId), {
    state: {
      backgroundLocation: currentLocation,
      ...extras,
    },
  });
}
