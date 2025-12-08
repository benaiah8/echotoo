// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { dbg, dumpAuthEnv } from "../lib/authDebug";

export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();

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
        dbg("AuthCallback:provider_error", {
          err,
          errCode,
          errDesc,
          href: window.location.href,
        });
        // You can show a toast/UI here if you like
        return finish("/"); // bounce home; user is not signed in
      }

      // 1) Already have a session? Done.
      const { data: s0 } = await supabase.auth.getSession();
      dbg("AuthCallback:getSession", {
        has: !!s0.session,
        user: s0.session?.user?.id,
      });
      if (s0.session) return finish();

      // 2) If PKCE code present, try manual exchange.
      if (loc.search.includes("code=")) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (!error) return finish();
        console.warn("[AuthCallback] exchange failed:", error?.message);
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

      // 4) Hard stop after 2.5s to avoid spinner purgatory.
      const timer = setTimeout(() => {
        dbg("AuthCallback:timeoutFallback");
        finish("/");
      }, 2500);

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
    <div className="w-full min-h-[40vh] flex items-center justify-center text-[var(--text)]/80">
      Finishing sign-in…
    </div>
  );
}
