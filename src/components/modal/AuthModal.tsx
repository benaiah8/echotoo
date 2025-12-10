import Modal from "./Modal";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { setAuthModal } from "../../reducers/modalReducer";
import { supabase } from "../../lib/supabaseClient";
import toast from "react-hot-toast";
import { dbg } from "../../lib/authDebug";

/** Our local form state (username/fullName optional for login) */
type FormState = {
  fullName?: string;
  username?: string;
  email: string;
  password: string;
  repeatPassword?: string;
};

const AuthModal = () => {
  const dispatch = useDispatch();
  const { authModal } = useSelector((s: RootState) => s.modal);

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FormState>({
    email: "",
    password: "",
    fullName: "",
    username: "",
    repeatPassword: "",
  });

  const close = () => dispatch(setAuthModal(false));

  // Close modal when Supabase reports SIGNED_IN
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      dbg("AuthModal:onAuthStateChange", event);
      if (event === "SIGNED_IN") {
        dispatch(setAuthModal(false));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [dispatch]);

  // auto-reset inputs when switching tabs
  useEffect(() => {
    setData((d) => ({
      ...d,
      password: "",
      repeatPassword: "",
    }));
  }, [tab]);

  const handleEmailLogin = async () => {
    try {
      setLoading(true);
      dbg("EmailLogin:start", { email: data.email });
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email.trim(),
        password: data.password,
      });
      dbg("EmailLogin:done", { ok: !error, error: error?.message });
      if (error) throw error;

      toast.success("Welcome back!");
      close(); // App.tsx already syncs the Redux user
    } catch (e: any) {
      toast.error(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignup = async () => {
    try {
      if (!data.email || !data.password) {
        toast.error("Email & password required");
        return;
      }
      if (data.password !== data.repeatPassword) {
        toast.error("Passwords don't match");
        return;
      }

      setLoading(true);
      dbg("EmailSignup:start", { email: data.email });

      // Add timeout protection
      const timeoutId = setTimeout(() => {
        console.warn("Signup request timed out");
        setLoading(false);
        toast.error("Signup request timed out. Please try again.");
      }, 15000); // 15 second timeout

      try {
        const { error } = await supabase.auth.signUp({
          email: data.email.trim(),
          password: data.password,
          options: {
            data: {
              full_name: data.fullName?.trim() || null,
              username: data.username?.trim() || null,
            },
            emailRedirectTo: window.location.origin, // back to app after verify
          },
        });

        clearTimeout(timeoutId);
        dbg("EmailSignup:done", { ok: !error, error: error?.message });

        if (error) throw error;

        toast.success("Check your email to confirm your account");
        close();
      } catch (signupError) {
        clearTimeout(timeoutId);
        throw signupError;
      }
    } catch (e: any) {
      console.error("Signup error:", e);
      toast.error(e?.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      // Use full URL for PWA compatibility
      const redirectUrl = `${window.location.origin}/auth/callback`;
      const isPWA = window.matchMedia("(display-mode: standalone)").matches || 
                    (window.navigator as any).standalone === true ||
                    document.referrer.includes('android-app://');
      
      console.log("[AuthModal] Google sign-in starting:", {
        redirectUrl,
        origin: window.location.origin,
        fullUrl: window.location.href,
        isPWA,
        userAgent: navigator.userAgent,
      });
      
      // Show the redirect URL to user for Supabase configuration
      if (isPWA) {
        console.warn("[AuthModal] PWA detected! Make sure this URL is in Supabase redirect URLs:", redirectUrl);
      }
      
      dbg("Google:start", {
        redirectTo: redirectUrl,
        isPWA,
        origin: window.location.origin,
      });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { 
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      dbg("Google:returned", { ok: !error, error: error?.message });
      if (error) throw error;
      // Supabase will redirect; no toast here.
    } catch (e: any) {
      dbg("Google:catch", { error: e?.message });
      setLoading(false);
      const errorMsg = e?.message ?? "Google sign-in failed";
      console.error("[AuthModal] Google sign-in error:", errorMsg);
      toast.error(`${errorMsg}. Check console for redirect URL.`);
    }
  };

  // Stop the auth prompt for 2 hours, then close the modal
  const continueAsGuest = () => {
    localStorage.setItem(
      "guest_until",
      String(Date.now() + 2 * 60 * 60 * 1000)
    );
    dispatch(setAuthModal(false));
  };

  return (
    <Modal
      isOpen={authModal}
      onClose={close}
      modalType="center"
      centerModalOverrideClassname="!bg-[var(--surface)]/20"
    >
      <div className="w-full max-w-[380px] ui-surface ui-border rounded-2xl p-4 ui-text">
        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          {(["login", "signup"] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 ui-chip ${active ? "ui-chip--active" : ""}`}
              >
                {t === "login" ? "Login" : "Sign up"}
              </button>
            );
          })}
        </div>

        {/* Fields */}
        <div className="ui-surface-2 ui-border rounded-xl p-3 space-y-2">
          {tab === "signup" && (
            <>
              <label className="text-[10px] ui-muted">Full name</label>
              <input
                className="ui-input"
                placeholder="Full name"
                value={data.fullName ?? ""}
                onChange={(e) => setData({ ...data, fullName: e.target.value })}
              />

              <label className="text-[10px] ui-muted">Username</label>
              <input
                className="ui-input"
                placeholder="Choose a username"
                value={data.username ?? ""}
                onChange={(e) => setData({ ...data, username: e.target.value })}
              />
            </>
          )}

          <label className="text-[10px] ui-muted">Email/Username</label>
          <input
            className="ui-input"
            type="email"
            placeholder="you@email.com"
            value={data.email}
            onChange={(e) => setData({ ...data, email: e.target.value })}
          />

          <label className="text-[10px] ui-muted">Password</label>
          <input
            className="ui-input"
            type="password"
            placeholder="••••••••"
            value={data.password}
            onChange={(e) => setData({ ...data, password: e.target.value })}
          />

          {tab === "signup" && (
            <>
              <label className="text-[10px] ui-muted">Repeat password</label>
              <input
                className="ui-input"
                type="password"
                placeholder="••••••••"
                value={data.repeatPassword ?? ""}
                onChange={(e) =>
                  setData({ ...data, repeatPassword: e.target.value })
                }
              />
            </>
          )}

          <button
            className={`ui-btn ui-btn--primary mt-2`}
            disabled={loading}
            onClick={tab === "login" ? handleEmailLogin : handleEmailSignup}
          >
            {loading ? "Please wait..." : tab === "login" ? "Login" : "Sign up"}
          </button>
        </div>

        {/* Google */}
        <div className="flex items-center gap-2 my-3">
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border)" }}
          />
          <span className="text-[10px] ui-muted">or</span>
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border)" }}
          />
        </div>

        <button className="ui-btn" onClick={handleGoogle} disabled={loading}>
          <span className="inline-flex items-center gap-2 justify-center">
            <img src="/IconGoogle.svg" alt="" width={18} height={18} />
            Continue with Google
          </span>
        </button>

        {/* Continue as guest */}
        <button
          className="w-full text-[11px] text-[var(--muted)] hover:text-[var(--text)] mt-4"
          onClick={continueAsGuest}
        >
          Continue as guest
        </button>
      </div>
    </Modal>
  );
};

export default AuthModal;
