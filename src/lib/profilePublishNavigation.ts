import type { NavigateFunction } from "react-router-dom";
import { Paths } from "../router/Paths";
import { PROFILE_TAB_REFRESH_EVENT } from "./homeRefreshEvents";

/** Route state after create-flow publish success → own profile Created refresh. */
export type OwnProfilePublishNavigationState = {
  fromPublish: true;
  postId?: string;
};

export function isOwnProfilePublishNavigationState(
  value: unknown
): value is OwnProfilePublishNavigationState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as OwnProfilePublishNavigationState).fromPublish === true
  );
}

/**
 * After new publish: scroll top, navigate with refresh signal, dispatch profile tab refresh.
 * Profile tab may not be visible until after navigation — event is deferred one frame.
 */
export function navigateToOwnProfileAfterPublish(
  navigate: NavigateFunction,
  options?: { postId?: string | null }
): void {
  window.scrollTo({ top: 0, behavior: "auto" });

  const state: OwnProfilePublishNavigationState = {
    fromPublish: true,
    ...(options?.postId ? { postId: options.postId } : {}),
  };

  navigate(Paths.profileMe, { state });

  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent(PROFILE_TAB_REFRESH_EVENT));
  });
}

/** Beat browser scroll restoration after profile mount from publish. */
export function scrollOwnProfileToTopAfterPublish(): void {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "auto" });
  scrollToTop();
  requestAnimationFrame(() => {
    scrollToTop();
    requestAnimationFrame(scrollToTop);
  });
}
