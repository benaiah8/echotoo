// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { dbg, dumpAuthEnv } from "../lib/authDebug";

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

      // 2) If PKCE code present, try manual exchange.
      if (loc.search.includes("code=") || loc.hash.includes("code=")) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );
          if (!error && data?.session) {
            dbg("AuthCallback:exchange_success", { userId: data.session.user?.id });
            return finish();
          }
          if (error) {
            console.error("[AuthCallback] exchange failed:", error);
            dbg("AuthCallback:exchange_error", {
              message: error.message,
              status: error.status,
            });
            setError(`Sign-in error: ${error.message}`);
            setTimeout(() => finish("/"), 3000);
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
  }, [nav, loc.search]);

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
