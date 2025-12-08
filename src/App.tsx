import "./App.css";
import GlobalErrorHandler from "./wrappers/GlobalErrorHandler";
import AppRouter from "./router/AppRouter";
import * as Paths from "./router/Paths";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setAuthUser } from "./reducers/authReducer";
import { supabase } from "./lib/supabaseClient";
import { clearAuthCache } from "./api/services/follows";
import { Toaster } from "react-hot-toast";
import { applyTheme, getInitialTheme } from "./lib/theme";
import BottomTab from "./components/BottomTab";
import { BrowserRouter } from "react-router-dom";
import InstallAppButton from "./components/InstallAppButton"; // PWA: Install app button
import OnboardingWrapper from "./components/onboarding/OnboardingWrapper";
import { dbg, dumpAuthEnv } from "./lib/authDebug";
import { store } from "./app/store";

function App() {
  const dispatch = useDispatch();

  if (process.env.NODE_ENV !== "production") {
    // @ts-ignore
    if (!(store.getState() as any).auth)
      console.warn(
        "[auth] Redux 'auth' reducer not mounted; falling back to Supabase session only"
      );
  }

  useEffect(() => {
    applyTheme(getInitialTheme());

    dumpAuthEnv();

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      dbg("getSession", {
        hasSession: !!data.session,
        userId: u?.id,
        email: u?.email,
      });
      dispatch(setAuthUser(u ? { id: u.id, email: u.email } : (null as any)));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      dbg("onAuthStateChange", { event, hasSession: !!session, userId: u?.id });
      clearAuthCache(); // Clear cache when auth state changes
      dispatch(setAuthUser(u ? { id: u.id, email: u.email } : (null as any)));
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [dispatch]);

  return (
    <GlobalErrorHandler>
      {/* Router MUST wrap BottomTab and all route content */}
      <BrowserRouter>
        <div className="app-shell">
          <OnboardingWrapper>
            <AppRouter />
          </OnboardingWrapper>

          {/* Bottom bar rendered once for the whole app */}
          <div className="fixed inset-x-0 bottom-0 z-40">
            <div className="w-full bg-[var(--bg)] border-t border-white/10">
              <div className="max-w-[640px] mx-auto">
                <BottomTab />
              </div>
              <div style={{ height: "env(safe-area-inset-bottom)" }} />
            </div>
          </div>

          <Toaster
            position="top-center"
            toastOptions={{
              style: { background: "#111", color: "#fff" },
              success: { iconTheme: { primary: "#F7D047", secondary: "#111" } },
            }}
          />

          {/* PWA: Install app button */}
          <InstallAppButton />
        </div>
      </BrowserRouter>
    </GlobalErrorHandler>
  );
}

export default App;
