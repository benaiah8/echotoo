import type { Location, NavigateFunction } from "react-router-dom";
import { isNotificationsTabPath } from "./notificationRouteResolver";
import type { NotificationRouteResult } from "./notificationRouteResolver";

/**
 * Apply resolved route using the same navigation rules as native push tap bridge.
 */
export function navigateFromNotificationRoute(
  navigate: NavigateFunction,
  location: Location,
  route: Extract<NotificationRouteResult, { supported: true }>
): void {
  if (route.mode === "navigate_full" || isNotificationsTabPath(route.path)) {
    navigate(route.path);
    return;
  }
  navigate(route.path, { state: { backgroundLocation: location } });
}
