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
      const url = event.url;
      if (!url.startsWith(OAUTH_CALLBACK_SCHEME)) return;

      try {
        const parsed = new URL(url);
        const search = parsed.search || "";
        const hash = parsed.hash || "";
        navigate(`/auth/callback${search}${hash}`, { replace: true });

        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch (e) {
        console.error(
          "[CapacitorOAuthListener] Error handling OAuth redirect:",
          e
        );
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
