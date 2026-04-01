// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { dbg, dumpAuthEnv } from "../lib/authDebug";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";

export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let finished = false;

    const finish = (path = "/u/me") => {
      if (finished) return;
      window.history.replaceState({}, "", "/"); // clean address bar
      finished = true;
      nav(path, { replace: true });
    };

    const run = async () => {
      dumpAuthEnv();

      // Log the actual URL being used for debugging
      console.log("[AuthCallback] Current URL:", {
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        isPWA: window.matchMedia("(display-mode: standalone)").matches,
      });

      // Parse URL for provider errors (both search params and hash)
      const url = new URL(window.location.href);
      const err =
        url.searchParams.get("error") ||
        new URLSearchParams(url.hash.replace(/^#/, "")).get("error");
      const errCode =
        url.searchParams.get("error_code") ||
        new URLSearchParams(url.hash.replace(/^#/, "")).get("error_code");
      const errDesc =
        url.searchParams.get("error_description") ||
        new URLSearchParams(url.hash.replace(/^#/, "")).get(
          "error_description"
        );
      if (err || errCode || errDesc) {
        const errorMsg = errDesc || err || "Authentication failed";
        dbg("AuthCallback:provider_error", {
          err,
          errCode,
          errDesc,
          href: window.location.href,
        });
        setError(errorMsg);
        setTimeout(() => finish("/"), 3000);
        return;
      }

      // 1) Already have a session? Done.
      const { data: s0 } = await supabase.auth.getSession();
      dbg("AuthCallback:getSession", {
        has: !!s0.session,
        user: s0.session?.user?.id,
      });
      if (s0.session) return finish();

      // 2a) Capacitor implicit flow: tokens in hash (access_token, refresh_token)
      if (isNativeApp() && loc.hash) {
        const hashParams = new URLSearchParams(loc.hash.replace(/^#/, ""));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          console.log("Setting session from hash tokens");
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!error && data?.session) {
              dbg("AuthCallback:hash_session_success", {
                userId: data.session.user?.id,
              });
              return finish();
            }
            if (error) {
              console.error(
                "[AuthCallback] setSession from hash failed:",
                error
              );
              setError(`Sign-in error: ${error.message}`);
              setTimeout(() => finish("/"), 5000);
              return;
            }
          } catch (e: any) {
            console.error("[AuthCallback] setSession exception:", e);
            setError(`Sign-in error: ${e?.message || "Unknown error"}`);
            setTimeout(() => finish("/"), 3000);
            return;
          }
        }
      }

      // 2b) If PKCE code present (web / non-native), try manual exchange.
      if (
        !isNativeApp() &&
        (loc.search.includes("code=") || loc.hash.includes("code="))
      ) {
        try {
          const exchangeUrl = window.location.href;
          console.log("[AuthCallback] EXCHANGE DEBUG:", {
            locSearch: loc.search,
            locHash: loc.hash,
            exchangeUrl,
            isNativeApp: isNativeApp(),
          });
          console.log(
            "[AuthCallback] Calling exchangeCodeForSession with:",
            exchangeUrl
          );
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            exchangeUrl
          );
          console.log("EXCHANGE RESULT", data, error);
          if (error) {
            console.log(
              "[AuthCallback] exchange error.message:",
              error.message
            );
            console.log("[AuthCallback] exchange error.status:", error.status);
          }
          if (!error && data?.session) {
            dbg("AuthCallback:exchange_success", {
              userId: data.session.user?.id,
            });
            return finish();
          }
          if (error) {
            const suggestedRedirect = `${window.location.origin}/auth/callback`;
            console.error("[AuthCallback] exchange failed:", error);
            console.error("[AuthCallback] URL used for exchange:", exchangeUrl);
            console.error(
              "[AuthCallback] Make sure this redirect URL is in Supabase:",
              suggestedRedirect
            );
            dbg("AuthCallback:exchange_error", {
              message: error.message,
              status: error.status,
              exchangeUrlUsed: exchangeUrl,
              redirectUrl: suggestedRedirect,
            });
            setError(
              `Sign-in error: ${error.message}. Check console for redirect URL to add to Supabase.`
            );
            setTimeout(() => finish("/"), 5000);
            return;
          }
        } catch (e: any) {
          console.error("[AuthCallback] exchange exception:", e);
          setError(`Sign-in error: ${e?.message || "Unknown error"}`);
          setTimeout(() => finish("/"), 3000);
          return;
        }
      }

      // 3) Otherwise rely on automatic parsing (implicit flow).
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        dbg("AuthCallback:onAuthStateChange", {
          event: _e,
          has: !!session,
          user: session?.user?.id,
        });
        if (session) finish();
      });

      // 4) Hard stop after 5s to avoid spinner purgatory.
      const timer = setTimeout(() => {
        dbg("AuthCallback:timeoutFallback");
        setError("Sign-in is taking longer than expected. Redirecting...");
        setTimeout(() => finish("/"), 2000);
      }, 5000);

      return () => {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
      };
    };

    const cleanup = run();
    return () => {
      void cleanup;
    };
  }, [nav, loc.search, loc.hash]);

  return (
    <div className="w-full min-h-[40vh] flex flex-col items-center justify-center text-[var(--text)]/80 px-4">
      {error ? (
        <>
          <div className="text-red-500 mb-4">⚠️ {error}</div>
          <div className="text-sm text-[var(--text)]/60">Redirecting...</div>
        </>
      ) : (
        <div>Finishing sign-in…</div>
      )}
    </div>
  );
}
