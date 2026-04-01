import Modal from "./Modal";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PiEye, PiEyeSlash } from "react-icons/pi";
import { RootState } from "../../app/store";
import { setAuthModal } from "../../reducers/modalReducer";
import { supabase } from "../../lib/supabaseClient";
import toast from "react-hot-toast";
import { dbg } from "../../lib/authDebug";
import {
  isCapacitor,
  isNativeApp,
} from "../../lib/storage/utils/capacitorDetection";
import { getAuthRedirectUrl } from "../../lib/authRedirect";
import Logo from "../ui/Logo";
import { ECHO_APP_DISPLAY_NAME, ECHO_TAGLINE } from "../../lib/marketingCopy";

/** Narrower glass shell (~80% viewport) so auth feels compact on phones */
const AUTH_MODAL_SHELL_CLASS = "!max-w-[80vw] w-full";

/** Our local form state (username/fullName optional for login) */
type FormState = {
  fullName?: string;
  username?: string;
  email: string;
  password: string;
  repeatPassword?: string;
};

type SignupPhase = "form" | "verify-pending" | "forgot-password-sent";

const RESEND_COOLDOWN_SEC = 60;

/** Reusable password input with visibility toggle */
function PasswordInput({
  value,
  onChange,
  placeholder = "••••••••",
  showPassword,
  onToggleVisibility,
  "data-testid": dataTestId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showPassword: boolean;
  onToggleVisibility: () => void;
  "data-testid"?: string;
}) {
  return (
    <div className="relative">
      <input
        className="ui-input pr-6"
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={dataTestId}
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <PiEyeSlash size={14} /> : <PiEye size={14} />}
      </button>
    </div>
  );
}

const AuthModal = () => {
  const dispatch = useDispatch();
  const { authModal } = useSelector((s: RootState) => s.modal);

  const [tab, setTab] = useState<"login" | "signup">("login");
  /** When true, show Login / Sign up tabs + email fields (Google + guest stay visible above). */
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupPhase, setSignupPhase] = useState<SignupPhase>("form");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
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

  // auto-reset inputs and login error when switching tabs
  useEffect(() => {
    setData((d) => ({
      ...d,
      password: "",
      repeatPassword: "",
    }));
    setLoginError(null);
  }, [tab]);

  // Reset loading, email panel, and signupPhase when modal opens or closes
  useEffect(() => {
    setLoading(false);
    if (!authModal) {
      setSignupPhase("form");
      setShowEmailForm(false);
    }
  }, [authModal]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

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

      setLoginError(null);
      toast.success("Welcome back!");
      close(); // App.tsx already syncs the Redux user
    } catch (e: any) {
      const msg = e?.message ?? "Login failed";
      setLoginError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!data.email?.trim()) {
      toast.error("Enter your email above first");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(
        data.email.trim(),
        { redirectTo: getAuthRedirectUrl() }
      );
      if (error) throw error;
      setSignupPhase("forgot-password-sent");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send reset email");
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
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });

        clearTimeout(timeoutId);
        dbg("EmailSignup:done", { ok: !error, error: error?.message });

        if (error) throw error;

        setSignupPhase("verify-pending");
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
      const redirectTo = getAuthRedirectUrl();

      // Temporary validation logging (remove when stable)
      console.log("[AuthRedirectDebug] Google sign-in", {
        origin: window.location.origin,
        redirectTo,
        isCapacitor: isCapacitor(),
        isNativeApp: isNativeApp(),
      });

      dbg("Google:start", {
        redirectTo,
        isCapacitor: isCapacitor(),
        isNativeApp: isNativeApp(),
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      dbg("Google:returned", { ok: !error, error: error?.message });
      if (error) throw error;

      if (isNativeApp() && data?.url) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
        // User will return via appUrlOpen; no redirect here.
      } else if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      dbg("Google:catch", { error: e?.message });
      setLoading(false);
      const errorMsg = e?.message ?? "Google sign-in failed";
      console.error("[AuthModal] Google sign-in error:", errorMsg);
      toast.error(`${errorMsg}. Check console for redirect URL.`);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0 || !data.email) return;
    try {
      setLoading(true);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: data.email.trim(),
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) throw error;
      toast.success("Verification email sent. Check your inbox.");
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to resend email");
    } finally {
      setLoading(false);
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

  // Forgot-password-sent view: show after requesting password reset
  if (signupPhase === "forgot-password-sent") {
    return (
      <Modal
        isOpen={authModal}
        onClose={close}
        modalType="center"
        centerVariant="glass"
        centerModalOverrideClassname={AUTH_MODAL_SHELL_CLASS}
      >
        <div className="w-full mx-auto text-[var(--text)]">
          <h3 className="text-lg font-semibold mb-2">Check your email</h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            We sent a password reset link to{" "}
            <span className="text-[var(--text)] font-medium">{data.email}</span>
            . Click it to set a new password.
          </p>
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              backgroundColor: "var(--glass-active-bg)",
              border: "1px solid var(--glass-active-border)",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
            }}
          >
            <button
              className="auth-guest-link w-full"
              onClick={close}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Verify-pending view: show after sign-up instead of closing
  if (signupPhase === "verify-pending") {
    return (
      <Modal
        isOpen={authModal}
        onClose={close}
        modalType="center"
        centerVariant="glass"
        centerModalOverrideClassname={AUTH_MODAL_SHELL_CLASS}
      >
        <div className="w-full mx-auto text-[var(--text)]">
          <h3 className="text-lg font-semibold mb-2">Verify your email</h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            We sent a verification link to{" "}
            <span className="text-[var(--text)] font-medium">{data.email}</span>
            . Click it to finish sign-up.
          </p>
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              backgroundColor: "var(--glass-active-bg)",
              border: "1px solid var(--glass-active-border)",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
            }}
          >
            <button
              className="ui-btn ui-btn--primary mb-3"
              disabled={loading || resendCooldown > 0}
              onClick={handleResendVerification}
            >
              {loading
                ? "Sending..."
                : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "I still haven't received the email"}
            </button>
            <button
              className="auth-guest-link w-full"
              onClick={close}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={authModal}
      onClose={close}
      modalType="center"
      centerVariant="glass"
      centerModalOverrideClassname={AUTH_MODAL_SHELL_CLASS}
    >
      <div className="w-full mx-auto text-[var(--text)]">
        <div className="flex flex-col items-center text-center mb-5">
          <Logo size={52} rounded={14} className="mb-3" />
          <h2 className="text-lg font-semibold leading-tight">
            Welcome to {ECHO_APP_DISPLAY_NAME}
          </h2>
          <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed px-0.5">
            {ECHO_TAGLINE}
          </p>
        </div>

        {/* Continue with Google — always visible (collapsed + expanded) */}
        <button
          type="button"
          className="ui-btn auth-google-btn flex w-full items-center justify-center gap-2 mb-3"
          onClick={handleGoogle}
          disabled={loading}
        >
          <img src="/IconGoogle.svg" alt="" width={20} height={20} />
          Continue with Google
        </button>

        <button
          type="button"
          className="auth-guest-link w-full mb-1"
          onClick={continueAsGuest}
        >
          Continue as guest
        </button>

        {!showEmailForm ? (
          <button
            type="button"
            className="w-full text-center text-xs font-normal text-[var(--brand)] opacity-70 py-2 mt-1 transition-opacity hover:opacity-100 hover:underline"
            onClick={() => setShowEmailForm(true)}
            aria-expanded={false}
            aria-controls="auth-email-sign-in"
          >
            Log in or sign up with email
          </button>
        ) : (
          <div
            id="auth-email-sign-in"
            className="mt-4 pt-4 border-t border-[var(--border)]"
            role="region"
            aria-label="Email sign-in"
          >
            <button
              type="button"
              className="w-full text-center text-xs text-[var(--muted)] mb-3 hover:text-[var(--text)] transition-colors"
              onClick={() => setShowEmailForm(false)}
            >
              Hide email sign-in
            </button>

            <div className="flex gap-2 mb-4">
              {(["login", "signup"] as const).map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex-1 ui-chip ${
                      active ? "ui-chip--active" : ""
                    }`}
                  >
                    {t === "login" ? "Login" : "Sign up"}
                  </button>
                );
              })}
            </div>

            <div
              className="rounded-xl p-4 mb-1"
              style={{
                backgroundColor: "var(--glass-active-bg)",
                border: "1px solid var(--glass-active-border)",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
              }}
            >
              <div className="space-y-3">
                {tab === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-[var(--muted)]">
                        Full name
                      </label>
                      <input
                        className="ui-input"
                        placeholder="Full name"
                        value={data.fullName ?? ""}
                        onChange={(e) =>
                          setData({ ...data, fullName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-[var(--muted)]">
                        Username
                      </label>
                      <input
                        className="ui-input"
                        placeholder="Choose a username"
                        value={data.username ?? ""}
                        onChange={(e) =>
                          setData({ ...data, username: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Email/Username
                  </label>
                  <input
                    className="ui-input"
                    type="email"
                    placeholder="you@email.com"
                    value={data.email}
                    onChange={(e) =>
                      setData({ ...data, email: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Password
                  </label>
                  <PasswordInput
                    value={data.password}
                    onChange={(v) => setData({ ...data, password: v })}
                    showPassword={showPassword}
                    onToggleVisibility={() => setShowPassword((p) => !p)}
                  />
                </div>

                {tab === "signup" && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[var(--muted)]">
                      Repeat password
                    </label>
                    <PasswordInput
                      value={data.repeatPassword ?? ""}
                      onChange={(v) => setData({ ...data, repeatPassword: v })}
                      showPassword={showRepeatPassword}
                      onToggleVisibility={() =>
                        setShowRepeatPassword((p) => !p)
                      }
                    />
                  </div>
                )}

                <button
                  type="button"
                  className="ui-btn ui-btn--primary mt-1 w-full"
                  disabled={loading}
                  onClick={
                    tab === "login" ? handleEmailLogin : handleEmailSignup
                  }
                >
                  {loading
                    ? "Please wait..."
                    : tab === "login"
                    ? "Login"
                    : "Sign up"}
                </button>

                {tab === "login" && loginError && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-[var(--brand)] hover:underline mt-2"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AuthModal;
