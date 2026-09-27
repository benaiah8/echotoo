import type { Location, NavigateFunction } from "react-router-dom";
import { isNotificationsTabPath } from "./notificationRouteResolver";
import type { NotificationRouteResult } from "./notificationRouteResolver";
import type { PostDetailNavigateState } from "../postDetailNavigationState";

/**
 * Apply resolved route using the same navigation rules as native push tap bridge.
 * Banner taps pass `forceReopen` so same-path modal opens still update when needed.
 */
export function navigateFromNotificationRoute(
  navigate: NavigateFunction,
  location: Location,
  route: Extract<NotificationRouteResult, { supported: true }>,
  options?: { forceReopen?: boolean }
): void {
  if (route.mode === "navigate_full" || isNotificationsTabPath(route.path)) {
    navigate(route.path);
    return;
  }

  const isSamePath = location.pathname === route.path;
  const state: PostDetailNavigateState & { bannerTapKey?: number } = {
    backgroundLocation: location,
  };
  if (route.scrollToComments) {
    state.scrollToComments = true;
  }
  if (options?.forceReopen || isSamePath) {
    state.bannerTapKey = Date.now();
  }

  navigate(route.path, { state });
}
