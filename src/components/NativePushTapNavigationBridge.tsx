import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  registerNativePushTapListener,
  setNativePushTapNavigateHandler,
} from "../lib/nativePushTapBridge";
import { navigateFromNotificationRoute } from "../lib/notifications/notificationRouteNavigation";

/**
 * Wires {@link registerNativePushTapListener} to React Router. Must mount under `BrowserRouter`.
 * Uses the same {@link navigateFromNotificationRoute} rules as in-app banner taps.
 */
export default function NativePushTapNavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setNativePushTapNavigateHandler((route) => {
      try {
        console.log("[PUSH_TAP] navigate_apply", {
          kind: route.kind,
          mode: route.mode,
          path: route.path,
        });
        navigateFromNotificationRoute(navigate, location, route);
      } catch (e) {
        console.warn(
          "[PUSH_TAP] navigate error:",
          e instanceof Error ? e.message : String(e)
        );
      }
    });
    registerNativePushTapListener();
    return () => setNativePushTapNavigateHandler(null);
  }, [navigate, location]);

  return null;
}
