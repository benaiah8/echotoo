import "./App.css";
import GlobalErrorHandler from "./wrappers/GlobalErrorHandler";
import AppErrorBoundary from "./wrappers/AppErrorBoundary";
import AppRouter from "./router/AppRouter";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setAuthUser } from "./reducers/authReducer";
import { supabase } from "./lib/supabaseClient";
import { clearAuthCache } from "./api/services/follows";
import { clearCachedProfile } from "./lib/profileCache";
import { applyTheme, getInitialTheme } from "./lib/theme";
import { BrowserRouter } from "react-router-dom";
import { CreateChooserProvider } from "./context/CreateChooserContext";
import { OwlMessageModalProvider } from "./context/OwlMessageModalContext";
import OnboardingWrapper from "./components/onboarding/OnboardingWrapper";
import CapacitorOAuthListener from "./components/CapacitorOAuthListener";
import DesktopShellWrapper from "./components/DesktopShellWrapper";
import AppFloatingChrome from "./components/AppFloatingChrome";
import {
  isCapacitor,
  isNativeApp,
} from "./lib/storage/utils/capacitorDetection";
import { dbg, dumpAuthEnv } from "./lib/authDebug";
import { store } from "./app/store";
import AnimatedLogo from "./components/ui/AnimatedLogo";
import { setupCacheInvalidationListeners } from "./lib/cacheInvalidation";
import { networkRecovery } from "./lib/networkRecovery";
import { initAppSafeAreaBottom } from "./lib/appSafeAreaBottom";
import AppUpdateRuntimeController from "./components/AppUpdateRuntimeController";
import PostEngagementRealtimeMount from "./components/PostEngagementRealtimeMount";
import PushRegistrationMount from "./components/PushRegistrationMount";
import NativePushPermissionPromptGate from "./components/notifications/NativePushPermissionPromptGate";
import NativePushTapNavigationBridge from "./components/NativePushTapNavigationBridge";
import {
  consumeProfileDefaultsLoginPending,
  persistProviderProfileDefaultsAfterSignIn,
} from "./lib/persistProviderProfileDefaults";

function App() {
  const dispatch = useDispatch();
  const [showSplash, setShowSplash] = useState(true);

  if (process.env.NODE_ENV !== "production") {
    // @ts-ignore
    if (!(store.getState() as any).auth)
      console.warn(
        "[auth] Redux 'auth' reducer not mounted; falling back to Supabase session only"
      );
  }

  useEffect(() => {
    applyTheme(getInitialTheme());
    const stopSafeArea = initAppSafeAreaBottom();

    // [OPTIMIZATION: Phase 3 - Event] Setup event-based cache invalidation
    // Why: Automatically invalidates related caches when profile or follow status changes
    setupCacheInvalidationListeners();

    // [OPTIMIZATION: Phase 7.1.6] Initialize network recovery
    // Why: Automatically retries failed requests when network comes back online
    // Note: networkRecovery singleton is initialized automatically

    dumpAuthEnv();

    let authDbgOrder = 0;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      dbg("getSession", {
        hasSession: !!data.session,
        userId: u?.id,
        email: u?.email,
      });
      console.log("[AUTHDBG] App bootstrap getSession", {
        t: Date.now(),
        order: ++authDbgOrder,
        source: "initial_getSession",
        hasSession: !!data.session,
        sessionUserId: u?.id ?? null,
      });
      dispatch(setAuthUser(u ? { id: u.id, email: u.email } : (null as any)));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      dbg("onAuthStateChange", { event, hasSession: !!session, userId: u?.id });
      console.log("[AUTHDBG] App onAuthStateChange", {
        t: Date.now(),
        order: ++authDbgOrder,
        event,
        hasSession: !!session,
        sessionUserId: u?.id ?? null,
      });

      // [PHASE 2.3 - FIX] Only clear feed cache on explicit logout (SIGNED_OUT)
      // Why: Cache keys already include viewerProfileId, so no cross-user data leakage
      // Clearing on all auth changes causes cache to be cleared when user ID changes from guest → actual user
      // This was causing cache misses and duplicate RPC calls on every page load
      if (event === "SIGNED_OUT") {
        // Import dataCache dynamically to avoid circular dependencies
        import("./lib/dataCache").then(({ dataCache }) => {
          dataCache.clearFeedCache().catch((error) => {
            console.warn("[App] Failed to clear feed cache on logout:", error);
          });
        });

        // [PHASE 2.3 - FIX] Clear profile cache and my_profile_id on explicit logout
        // Why: Prevents stale profile cache from reviving soft-deleted accounts on re-login
        try {
          const profileId = localStorage.getItem("my_profile_id");
          if (profileId) clearCachedProfile(profileId);
          localStorage.removeItem("my_profile_id");
        } catch (error) {
          // Ignore localStorage errors (might be unavailable in private browsing)
          console.debug(
            "[App] Failed to clear profile cache / my_profile_id:",
            error
          );
        }

        // [OPTIMIZATION: Phase 2] Clear notification count cache on logout
        // Why: Prevents cross-user data leakage
        import("./lib/notificationCountCache")
          .then(({ clearAllNotificationCountCache }) => {
            clearAllNotificationCountCache();
          })
          .catch((error) => {
            console.warn(
              "[App] Failed to clear notification count cache on logout:",
              error
            );
          });

        import("./lib/notificationListCache")
          .then(({ clearAllNotificationListCaches }) => {
            clearAllNotificationListCaches();
          })
          .catch((error) => {
            console.warn(
              "[App] Failed to clear notification list cache on logout:",
              error
            );
          });

        // [OPTIMIZATION: Phase 2] Clear invite data cache on logout
        // Why: Prevents cross-user data leakage
        import("./lib/inviteDataCache")
          .then(({ clearAllInviteDataCache }) => {
            clearAllInviteDataCache();
          })
          .catch((error) => {
            console.warn(
              "[App] Failed to clear invite data cache on logout:",
              error
            );
          });
      }

      clearAuthCache(); // Clear auth cache and mutual friends cache (feed cache cleared separately above)
      dispatch(setAuthUser(u ? { id: u.id, email: u.email } : (null as any)));

      // Real sign-in only (email/OAuth intent flag). Skip INITIAL_SESSION / restored sessions.
      if (event === "SIGNED_IN" && u && consumeProfileDefaultsLoginPending()) {
        void persistProviderProfileDefaultsAfterSignIn(u);
      }
    });

    return () => {
      stopSafeArea();
      sub.subscription.unsubscribe();
      // Cleanup network recovery on unmount
      networkRecovery.destroy();
    };
  }, [dispatch]);

  return (
    <GlobalErrorHandler>
      {/* Animated Logo Splash Screen */}
      {showSplash && (
        <AnimatedLogo
          duration={isCapacitor() ? 3000 : 600}
          onComplete={() => setShowSplash(false)}
        />
      )}

      {/* Router MUST wrap BottomTab and all route content */}
      <BrowserRouter>
        {!showSplash && isNativeApp() && <NativePushTapNavigationBridge />}
        <PostEngagementRealtimeMount />
        {isNativeApp() && <PushRegistrationMount />}
        {isNativeApp() && <CapacitorOAuthListener />}
        {!showSplash && <AppUpdateRuntimeController />}
        <AppErrorBoundary>
          <CreateChooserProvider>
            <OwlMessageModalProvider>
              <NativePushPermissionPromptGate appContentReady={!showSplash} />
              <div className="app-shell">
                <DesktopShellWrapper>
                  <OnboardingWrapper>
                    <AppRouter contentReady={!showSplash} />
                  </OnboardingWrapper>
                </DesktopShellWrapper>

                <AppFloatingChrome />
              </div>
            </OwlMessageModalProvider>
          </CreateChooserProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </GlobalErrorHandler>
  );
}

export default App;
