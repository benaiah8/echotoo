/**
 * Capacitor-only: Listens for OAuth redirect (com.echotoo.app://auth/callback)
 * and navigates the WebView to /auth/callback with query params so AuthCallback
 * can run exchangeCodeForSession.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { dbg, summarizeAuthUrl } from "../lib/authDebug";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";

const OAUTH_CALLBACK_SCHEME = "com.echotoo.app://auth/callback";

export default function CapacitorOAuthListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let listener: { remove: () => Promise<void> } | null = null;

    const handler = async (event: { url: string }) => {
      const url = event.url;
      const schemeMatch = url.startsWith(OAUTH_CALLBACK_SCHEME);
      dbg("oauth:appUrlOpen", {
        schemeMatch,
        ...summarizeAuthUrl(url),
      });
      if (!schemeMatch) {
        dbg("oauth:appUrlOpen_scheme_mismatch", {
          ...summarizeAuthUrl(url),
        });
        return;
      }

      try {
        const parsed = new URL(url);
        const search = parsed.search || "";
        const hash = parsed.hash || "";
        dbg("oauth:navigate_before", {
          hasSearch: search.length > 1,
          hasHash: hash.length > 1,
        });
        navigate(`/auth/callback${search}${hash}`, { replace: true });
        dbg("oauth:navigate_after", {});
      } catch (e) {
        console.error(
          "[CapacitorOAuthListener] Error handling OAuth redirect:",
          e instanceof Error ? e.message : String(e)
        );
      } finally {
        try {
          dbg("oauth:browser_close_before", {});
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
          dbg("oauth:browser_close_after", {});
        } catch (closeErr) {
          console.warn(
            "[CapacitorOAuthListener] Browser.close failed:",
            closeErr instanceof Error ? closeErr.message : String(closeErr)
          );
          dbg("oauth:browser_close_throw", {
            err:
              closeErr instanceof Error
                ? closeErr.message
                : String(closeErr),
          });
        }
      }
    };

    const setup = async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        const handle = await App.addListener("appUrlOpen", handler);
        if (cancelled) {
          void handle.remove();
          return;
        }

        listener = handle;
      } catch (e) {
        console.warn(
          "[CapacitorOAuthListener] Failed to register appUrlOpen:",
          e instanceof Error ? e.message : String(e)
        );
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (listener) {
        void listener.remove();
        listener = null;
      }
    };
  }, [navigate]);

  return null;
}
