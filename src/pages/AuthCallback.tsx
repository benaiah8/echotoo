// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { dbg, dumpAuthEnv, summarizeAuthUrl } from "../lib/authDebug";
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
        hasUserId: true,
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
  dbg("oauth:authcallback_backup_close_start", {});
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    dbg("oauth:authcallback_backup_close_ok", {});
  } catch (e) {
    dbg("oauth:authcallback_backup_close_throw", {
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
    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    let authSubscription: { unsubscribe: () => void } | null = null;

    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeoutIds.push(id);
      return id;
    };

    const finish = (path = "/", reason = "unspecified") => {
      dbg("AuthCallback:finish", {
        path,
        reason,
        skippedAlreadyFinished: finished,
        cancelled,
      });
      if (cancelled || finished) return;
      window.history.replaceState({}, "", "/"); // clean address bar
      finished = true;
      nav(path, { replace: true });
    };

    const run = async () => {
      dbg("AuthCallback:entry", {
        pathname: window.location.pathname,
        hasSearch: !!window.location.search?.length,
        hasHash: !!window.location.hash?.length,
      });
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
          hasErrDesc: !!errDesc,
          ...summarizeAuthUrl(window.location.href),
        });
        if (!cancelled) setError(errorMsg);
        schedule(() => finish("/", "provider_error_delayed"), 3000);
        return;
      }

      // 1) Already have a session? Done.
      const { data: s0 } = await supabase.auth.getSession();
      if (cancelled) return;
      dbg("AuthCallback:getSession", {
        hasSession: !!s0.session,
        hasUserId: !!s0.session?.user?.id,
      });
      if (s0.session) {
        dbg("AuthCallback:branch_session_already_present", {});
        await persistProviderProfileDefaultsAfterSignIn(s0.session.user);
        if (cancelled) return;
        void closeNativeOAuthBrowserBackup();
        return finish("/", "session_already_present");
      }

      // 2a) Capacitor implicit flow: tokens in hash (access_token, refresh_token)
      if (isNativeApp() && loc.hash) {
        const hashParams = new URLSearchParams(loc.hash.replace(/^#/, ""));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        dbg("AuthCallback:native_hash_branch", {
          hashLen: loc.hash?.length ?? 0,
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
        });
        if (access_token && refresh_token) {
          dbg("AuthCallback:before_setSession_hash", {});
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (cancelled) return;
            dbg("AuthCallback:after_setSession_hash", {
              ok: !error && !!data?.session,
              hasUserId: !!data?.session?.user?.id,
              errorMessage: error?.message ?? null,
            });
            if (!error && data?.session) {
              dbg("AuthCallback:hash_session_success", {
                hasUserId: !!data.session.user?.id,
              });
              await persistProviderProfileDefaultsAfterSignIn(data.session.user);
              if (cancelled) return;
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
              dbg("AuthCallback:hash_setSession_missing_payload_poll", {});
              const observed = await authCallbackPollObservableSession(20, 160);
              if (cancelled) return;
              if (observed) {
                dbg("AuthCallback:hash_session_observed_after_poll", {});
                const { data: polSession } = await supabase.auth.getSession();
                if (polSession.session?.user) {
                  await persistProviderProfileDefaultsAfterSignIn(
                    polSession.session.user,
                  );
                }
                if (cancelled) return;
                void closeNativeOAuthBrowserBackup();
                return finish("/", "hash_poll_success");
              }
            }
            if (error) {
              console.error(
                "[AuthCallback] setSession from hash failed:",
                error.message
              );
              if (!cancelled) setError(`Sign-in error: ${error.message}`);
              schedule(() => finish("/", "hash_setSession_error"), 5000);
              return;
            }
          } catch (e: unknown) {
            console.error(
              "[AuthCallback] setSession exception:",
              e instanceof Error ? e.message : String(e)
            );
            const msg = e instanceof Error ? e.message : "Unknown error";
            if (!cancelled) setError(`Sign-in error: ${msg}`);
            schedule(() => finish("/", "hash_setSession_exception"), 3000);
            return;
          }
        }
      }

      // 2b) If PKCE code present (query or hash), try manual exchange (web + native WebView).
      if (loc.search.includes("code=") || loc.hash.includes("code=")) {
        dbg("AuthCallback:pkce_exchange_branch", {
          hasCodeInSearch: loc.search.includes("code="),
          hasCodeInHash: loc.hash.includes("code="),
        });
        try {
          const exchangeUrl = window.location.href;
          dbg("AuthCallback:exchange_start", {
            ...summarizeAuthUrl(exchangeUrl),
            isNativeApp: isNativeApp(),
          });
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            exchangeUrl
          );
          if (cancelled) return;
          dbg("AuthCallback:exchange_result", {
            hasSession: !!data?.session,
            hasUserId: !!data?.session?.user?.id,
            errorMessage: error?.message ?? null,
            errorStatus: error?.status ?? null,
          });
          if (!error && data?.session) {
            dbg("AuthCallback:exchange_success", {
              hasUserId: !!data.session.user?.id,
            });
            await persistProviderProfileDefaultsAfterSignIn(data.session.user);
            if (cancelled) return;
            void closeNativeOAuthBrowserBackup();
            return finish("/", "exchange_success");
          }
          if (error) {
            const suggestedRedirect = `${window.location.origin}/auth/callback`;
            console.error(
              "[AuthCallback] exchange failed:",
              error.message,
              error.status ?? ""
            );
            dbg("AuthCallback:exchange_error", {
              message: error.message,
              status: error.status,
              ...summarizeAuthUrl(exchangeUrl),
              suggestedRedirectPath: "/auth/callback",
              suggestedOriginPresent: Boolean(window.location.origin),
            });
            // Keep redirect hint for local debugging without printing raw callback URL.
            if (import.meta.env.DEV) {
              console.error(
                "[AuthCallback] Ensure Supabase redirect allowlist includes origin + /auth/callback",
                suggestedRedirect
              );
            }
            if (!cancelled) {
              setError(
                `Sign-in error: ${error.message}. Check console for redirect URL to add to Supabase.`
              );
            }
            schedule(() => finish("/", "exchange_error_delayed"), 5000);
            return;
          }
        } catch (e: unknown) {
          console.error(
            "[AuthCallback] exchange exception:",
            e instanceof Error ? e.message : String(e)
          );
          const msg = e instanceof Error ? e.message : "Unknown error";
          if (!cancelled) setError(`Sign-in error: ${msg}`);
          schedule(() => finish("/", "exchange_exception_delayed"), 3000);
          return;
        }
      }

      // 3) Otherwise rely on automatic parsing (implicit flow).
      dbg("AuthCallback:subscribe_onAuthStateChange_implicit_wait", {});
      const { data: sub } = supabase.auth.onAuthStateChange((authEvent, session) => {
        if (cancelled) return;
        dbg("AuthCallback:onAuthStateChange", {
          event: authEvent,
          hasSession: !!session,
          hasUserId: !!session?.user?.id,
        });
        if (authEvent === "SIGNED_IN" && session?.user) {
          void persistProviderProfileDefaultsAfterSignIn(
            session.user,
          ).finally(() => {
            if (cancelled) return;
            void closeNativeOAuthBrowserBackup();
            finish("/", "onAuthStateChange_session");
          });
        }
      });
      if (cancelled) {
        sub.subscription.unsubscribe();
      } else {
        authSubscription = sub.subscription;
      }

      // 4) Hard stop after 5s to avoid spinner purgatory.
      schedule(() => {
        dbg("AuthCallback:timeoutFallback", {});
        if (!cancelled) {
          setError("Sign-in is taking longer than expected. Redirecting...");
        }
        schedule(() => finish("/", "timeout_fallback_delayed"), 2000);
      }, 5000);
    };

    void run();

    return () => {
      cancelled = true;
      timeoutIds.forEach((id) => clearTimeout(id));
      authSubscription?.unsubscribe();
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
