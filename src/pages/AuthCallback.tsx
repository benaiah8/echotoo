// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { dbg, dumpAuthEnv } from "../lib/authDebug";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import { persistProviderProfileDefaultsAfterSignIn } from "../lib/persistProviderProfileDefaults";

/** Native WebView: `setSession` sometimes resolves before the session is readable via `getSession`. */
async function authCallbackPollObservableSession(
  maxAttempts: number,
  delayMs: number
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) {
      dbg("AuthCallback:poll_session_hit", {
        attempt: i + 1,
        userId: data.session.user.id,
      });
      console.log("[AUTHDBG] poll observable session hit", {
        attempt: i + 1,
        sessionUserId: data.session.user.id,
        t: Date.now(),
      });
      return true;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Native: idempotent backup if OAuth in-app browser is still open after successful sign-in. */
async function closeNativeOAuthBrowserBackup(): Promise<void> {
  if (!isNativeApp()) return;
  console.log("[DBG:OAUTH] authcallback_backup_close_start", {
    t: Date.now(),
  });
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    console.log("[DBG:OAUTH] authcallback_backup_close_ok", {
      t: Date.now(),
    });
  } catch (e) {
    console.warn("[DBG:OAUTH] authcallback_backup_close_throw", {
      t: Date.now(),
      err: e instanceof Error ? e.message : String(e),
    });
    /* noop — safe if already closed */
  }
}

export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let finished = false;

    const finish = (path = "/", reason = "unspecified") => {
      console.log("[AUTHDBG] finish() called", {
        path,
        navigateReplace: path,
        t: Date.now(),
        skippedAlreadyFinished: finished,
      });
      console.log("[DBG:OAUTH] authcallback_finish", {
        t: Date.now(),
        path,
        reason,
        skippedAlreadyFinished: finished,
      });
      if (finished) return;
      window.history.replaceState({}, "", "/"); // clean address bar
      finished = true;
      nav(path, { replace: true });
    };

    const run = async () => {
      console.log("[AUTHDBG] AuthCallback entry", {
        t: Date.now(),
        pathname: window.location.pathname,
        hasSearch: !!window.location.search?.length,
        hasHash: !!window.location.hash?.length,
      });
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
        console.log("[AUTHDBG] provider_error → finish / in 3s", {
          err,
          errCode,
          t: Date.now(),
        });
        const errorMsg = errDesc || err || "Authentication failed";
        dbg("AuthCallback:provider_error", {
          err,
          errCode,
          errDesc,
          href: window.location.href,
        });
        setError(errorMsg);
        setTimeout(() => finish("/", "provider_error_delayed"), 3000);
        return;
      }

      // 1) Already have a session? Done.
      const { data: s0 } = await supabase.auth.getSession();
      dbg("AuthCallback:getSession", {
        has: !!s0.session,
        user: s0.session?.user?.id,
      });
      console.log("[AUTHDBG] AuthCallback initial getSession", {
        t: Date.now(),
        hasSession: !!s0.session,
        sessionUserId: s0.session?.user?.id ?? null,
      });
      if (s0.session) {
        console.log("[AUTHDBG] AuthCallback branch session_already_present → finish()");
        await persistProviderProfileDefaultsAfterSignIn(s0.session.user);
        void closeNativeOAuthBrowserBackup();
        return finish("/", "session_already_present");
      }

      // 2a) Capacitor implicit flow: tokens in hash (access_token, refresh_token)
      if (isNativeApp() && loc.hash) {
        const hashParams = new URLSearchParams(loc.hash.replace(/^#/, ""));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        console.log("[AUTHDBG] native hash branch", {
          t: Date.now(),
          hashLen: loc.hash?.length ?? 0,
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
        });
        if (access_token && refresh_token) {
          console.log("[AUTHDBG] before setSession(hash tokens)", {
            t: Date.now(),
          });
          console.log("Setting session from hash tokens");
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            console.log("[AUTHDBG] after setSession(hash tokens)", {
              t: Date.now(),
              ok: !error && !!data?.session,
              sessionUserId: data?.session?.user?.id ?? null,
              errorMessage: error?.message ?? null,
            });
            if (!error && data?.session) {
              dbg("AuthCallback:hash_session_success", {
                userId: data.session.user?.id,
              });
              console.log(
                "[AUTHDBG] hash_session_success → finish()",
                data.session.user?.id
              );
              await persistProviderProfileDefaultsAfterSignIn(data.session.user);
              void closeNativeOAuthBrowserBackup();
              return finish("/", "hash_session_success");
            }
            // No error but session not in payload yet (seen on Android) — observe via getSession.
            if (
              !error &&
              !data?.session &&
              isNativeApp() &&
              access_token &&
              refresh_token
            ) {
              console.log(
                "[AUTHDBG] hash setSession missing session payload; polling getSession",
                { t: Date.now() }
              );
              const observed = await authCallbackPollObservableSession(20, 160);
              if (observed) {
                dbg("AuthCallback:hash_session_observed_after_poll");
                console.log(
                  "[AUTHDBG] observable session after hash setSession → finish()",
                  { t: Date.now() }
                );
                const { data: polSession } = await supabase.auth.getSession();
                if (polSession.session?.user) {
                  await persistProviderProfileDefaultsAfterSignIn(
                    polSession.session.user,
                  );
                }
                void closeNativeOAuthBrowserBackup();
                return finish("/", "hash_poll_success");
              }
            }
            if (error) {
              console.error(
                "[AuthCallback] setSession from hash failed:",
                error
              );
              setError(`Sign-in error: ${error.message}`);
              setTimeout(() => finish("/", "hash_setSession_error"), 5000);
              return;
            }
          } catch (e: any) {
            console.error("[AuthCallback] setSession exception:", e);
            setError(`Sign-in error: ${e?.message || "Unknown error"}`);
            setTimeout(() => finish("/", "hash_setSession_exception"), 3000);
            return;
          }
        }
      }

      // 2b) If PKCE code present (query or hash), try manual exchange (web + native WebView).
      if (loc.search.includes("code=") || loc.hash.includes("code=")) {
        console.log("[AUTHDBG] PKCE/code exchange branch", {
          t: Date.now(),
          hasCodeInSearch: loc.search.includes("code="),
          hasCodeInHash: loc.hash.includes("code="),
        });
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
            console.log("[AUTHDBG] exchange_success → finish()", {
              t: Date.now(),
              sessionUserId: data.session.user?.id ?? null,
            });
            await persistProviderProfileDefaultsAfterSignIn(data.session.user);
            void closeNativeOAuthBrowserBackup();
            return finish("/", "exchange_success");
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
            setTimeout(() => finish("/", "exchange_error_delayed"), 5000);
            return;
          }
        } catch (e: any) {
          console.error("[AuthCallback] exchange exception:", e);
          setError(`Sign-in error: ${e?.message || "Unknown error"}`);
          setTimeout(() => finish("/", "exchange_exception_delayed"), 3000);
          return;
        }
      }

      // 3) Otherwise rely on automatic parsing (implicit flow).
      console.log("[AUTHDBG] AuthCallback subscribe onAuthStateChange (implicit wait)", {
        t: Date.now(),
      });
      const { data: sub } = supabase.auth.onAuthStateChange((authEvent, session) => {
        dbg("AuthCallback:onAuthStateChange", {
          event: authEvent,
          has: !!session,
          user: session?.user?.id,
        });
        console.log("[AUTHDBG] AuthCallback inner onAuthStateChange", {
          t: Date.now(),
          event: authEvent,
          hasSession: !!session,
          sessionUserId: session?.user?.id ?? null,
        });
        if (authEvent === "SIGNED_IN" && session?.user) {
          void persistProviderProfileDefaultsAfterSignIn(
            session.user,
          ).finally(() => {
            void closeNativeOAuthBrowserBackup();
            finish("/", "onAuthStateChange_session");
          });
        }
      });

      // 4) Hard stop after 5s to avoid spinner purgatory.
      const timer = setTimeout(() => {
        dbg("AuthCallback:timeoutFallback");
        console.warn("[AUTHDBG] AuthCallback timeoutFallback (5s) → error + finish in 2s", {
          t: Date.now(),
        });
        setError("Sign-in is taking longer than expected. Redirecting...");
        setTimeout(() => finish("/", "timeout_fallback_delayed"), 2000);
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
