import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  registerNativePushTapListener,
  setNativePushTapNavigateHandler,
} from "../lib/nativePushTapBridge";

/**
 * Wires {@link registerNativePushTapListener} to React Router. Must mount under `BrowserRouter`.
 * Post detail opens in {@link PostDetailModal} (same as feed / in-app notification), not full page.
 */
export default function NativePushTapNavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setNativePushTapNavigateHandler((path) => {
      try {
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
