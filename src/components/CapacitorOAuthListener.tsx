/**
 * Capacitor-only: Listens for OAuth redirect (com.experience.app://auth/callback)
 * and navigates the WebView to /auth/callback with query params so AuthCallback
 * can run exchangeCodeForSession.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";

const OAUTH_CALLBACK_SCHEME = "com.echotoo.app://auth/callback";

export default function CapacitorOAuthListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) return;

    const handler = async (event: { url: string }) => {
      console.log("APP URL OPEN RAW:", event.url);
      console.log("[DBG:OAUTH] appUrlOpen", {
        t: Date.now(),
        url: event.url,
      });
      const url = event.url;
      if (!url.startsWith(OAUTH_CALLBACK_SCHEME)) {
        console.log("[DBG:OAUTH] appUrlOpen_scheme_mismatch", {
          t: Date.now(),
          url,
        });
        return;
      }

      try {
        const parsed = new URL(url);
        const search = parsed.search || "";
        const hash = parsed.hash || "";
        console.log("[DBG:OAUTH] navigate_before", { t: Date.now() });
        navigate(`/auth/callback${search}${hash}`, { replace: true });
        console.log("[DBG:OAUTH] navigate_after", { t: Date.now() });
      } catch (e) {
        console.error(
          "[CapacitorOAuthListener] Error handling OAuth redirect:",
          e
        );
      } finally {
        try {
          console.log("[DBG:OAUTH] browser_close_before", { t: Date.now() });
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
          console.log("[DBG:OAUTH] browser_close_after", { t: Date.now() });
        } catch (closeErr) {
          console.warn(
            "[CapacitorOAuthListener] Browser.close failed:",
            closeErr instanceof Error ? closeErr.message : String(closeErr)
          );
          console.warn("[DBG:OAUTH] browser_close_throw", {
            t: Date.now(),
            err:
              closeErr instanceof Error
                ? closeErr.message
                : String(closeErr),
          });
        }
      }
    };

    let listener: { remove: () => Promise<void> } | null = null;

    const setup = async () => {
      const { App } = await import("@capacitor/app");
      listener = await App.addListener("appUrlOpen", handler);
    };

    setup();

    return () => {
      listener?.remove();
    };
  }, [navigate]);

  return null;
}
