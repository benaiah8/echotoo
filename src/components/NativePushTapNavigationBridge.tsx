import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  registerNativePushTapListener,
  setNativePushTapNavigateHandler,
} from "../lib/nativePushTapBridge";
import { Paths } from "../router/Paths";

function isNotificationsTabPushPath(path: string): boolean {
  const p = path.trim();
  return p === Paths.notification || p.startsWith("/notifications");
}

/**
 * Wires {@link registerNativePushTapListener} to React Router. Must mount under `BrowserRouter`.
 * Post detail opens in {@link PostDetailModal} (same as feed / in-app notification), not full page.
 * Notifications tab routes use full navigation (no backgroundLocation) so PersistentTabContainer shows the correct pane.
 */
export default function NativePushTapNavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setNativePushTapNavigateHandler((path) => {
      try {
        if (isNotificationsTabPushPath(path)) {
          console.log("[PUSH_TAP] navigate_notifications_tab", { path });
          navigate(path);
          return;
        }
        console.log("[PUSH_TAP] navigate_modal", {
          path,
          backgroundPath: location.pathname,
        });
        navigate(path, { state: { backgroundLocation: location } });
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
