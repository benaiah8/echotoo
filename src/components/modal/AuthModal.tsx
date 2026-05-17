import Modal from "./Modal";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { PiAppleLogo, PiEye, PiEyeSlash } from "react-icons/pi";
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
import { openOAuthUrl } from "../../lib/openOAuthUrl";
import {
  canUseNativeAppleSignIn,
  isAppleNativeSignInUserCancel,
  signInWithAppleNative,
} from "../../lib/nativeAppleSignIn";
import {
  canUseNativeGoogleSignInAndroid,
  isGoogleNativeSignInUserCancel,
  signInWithGoogleNativeAndroid,
} from "../../lib/nativeGoogleSignInAndroid";
import Logo from "../ui/Logo";
import { ECHO_APP_DISPLAY_NAME, ECHO_TAGLINE } from "../../lib/marketingCopy";
import { invalidateProfileByUserIdCache } from "../../api/services/follows";
import { pickRandomPresetAvatarValue } from "../../lib/avatarPresets";
import { Paths } from "../../router/Paths";
import { markProfileDefaultsLoginPending } from "../../lib/persistProviderProfileDefaults";

const AUTH_AGREEMENT_TOAST =
  "Please agree to the Terms of Service, Community Guidelines, and Privacy Policy before continuing.";

const policyLinkClass =
  "text-[var(--brand)] underline underline-offset-2 decoration-[var(--brand)]/50 font-medium hover:opacity-90";

/**
 * After Apple DB writes: clear profile fetch dedupe + legacy LS rows, then republish
 * the latest row to client caches (mirrors FullScreenProfileCreation.save()).
 */
async function finalizeAppleProfileClientSync(userId: string): Promise<void> {
  invalidateProfileByUserIdCache(userId);

  const { data: row, error } = await supabase
    .from("profiles")
    .select(
      "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, user_number, onboarding_completed, onboarding_step"
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.warn(
      "[AuthModal] Apple profile refetch for client sync:",
      error.message
    );
    return;
  }
  if (!row?.id) return;

  const profilePayload = {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    xp: row.xp ?? 0,
    member_no: row.member_no ?? null,
    instagram_url: row.instagram_url ?? null,
    tiktok_url: row.tiktok_url ?? null,
    telegram_url: row.telegram_url ?? null,
    is_private: row.is_private ?? false,
    social_media_public: row.social_media_public ?? false,
    user_number: row.user_number ?? null,
    onboarding_completed: row.onboarding_completed ?? null,
    onboarding_step: row.onboarding_step ?? null,
  };

  const { setCachedProfile } = await import("../../lib/profileCache");
  const { setCachedAvatar, preloadAvatar } = await import(
    "../../lib/avatarCache"
  );
  const { clearCachedFollowCounts } = await import(
    "../../lib/followCountsCache"
  );

  setCachedProfile(profilePayload);
  if (profilePayload.avatar_url) {
    setCachedAvatar(profilePayload.user_id, profilePayload.avatar_url);
    preloadAvatar(profilePayload.avatar_url);
  }
  clearCachedFollowCounts(row.id);

  window.dispatchEvent(
    new CustomEvent("profile:updated", {
      detail: { id: row.id, profile: profilePayload },
    })
  );
}

/** Narrower glass shell (~80% viewport) so auth feels compact on phones */
const AUTH_MODAL_SHELL_CLASS = "!max-w-[80vw] w-full";

/**
 * Native Sign in with Apple only: persist Apple-provided person name to
 * `profiles.display_name` when missing (never overwrites). Keeps auth
 * `user_metadata.full_name` in sync. Assigns a random Echo `preset:` avatar
 * when `profiles.avatar_url` is empty (never overwrites an existing avatar).
 */
async function persistAppleFullNameAfterNativeSignIn(
  fullNameFromApple: string
): Promise<void> {
  const trimmed = fullNameFromApple.trim();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  if (trimmed) {
    const { error: metaErr } = await supabase.auth.updateUser({
      data: { full_name: trimmed },
    });
    if (metaErr) {
      console.warn("[AuthModal] Apple updateUser full_name:", metaErr.message);
    }
  }

  const preset = pickRandomPresetAvatarValue();

  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) {
    console.warn("[AuthModal] Apple profile lookup:", selErr.message);
    await finalizeAppleProfileClientSync(userId);
    return;
  }

  if (!existing) {
    if (!trimmed) {
      await finalizeAppleProfileClientSync(userId);
      return;
    }
    const { error: insErr } = await supabase.from("profiles").insert({
      user_id: userId,
      display_name: trimmed,
      username: null,
      avatar_url: preset ?? null,
      onboarding_completed: false,
      onboarding_step: 0,
    });
    if (insErr) {
      const isDup =
        insErr.code === "23505" ||
        String(insErr.message || "").includes("duplicate");
      if (isDup) {
        const { data: row } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .eq("user_id", userId)
          .maybeSingle();
        if (row?.id) {
          const patch: Record<string, string> = {};
          if (!String(row.display_name ?? "").trim()) {
            patch.display_name = trimmed;
          }
          const av = String(row.avatar_url ?? "").trim();
          if (!av && preset) {
            patch.avatar_url = preset;
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("profiles").update(patch).eq("id", row.id);
          }
        }
      } else {
        console.warn("[AuthModal] Apple profile insert:", insErr.message);
      }
    }
  } else {
    const patch: Record<string, string> = {};
    if (trimmed && !String(existing.display_name ?? "").trim()) {
      patch.display_name = trimmed;
    }
    const av = String(existing.avatar_url ?? "").trim();
    if (!av && preset) {
      patch.avatar_url = preset;
    }
    if (Object.keys(patch).length > 0) {
      const { error: upErr } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", existing.id);
      if (upErr) {
        console.warn("[AuthModal] Apple profile patch:", upErr.message);
      }
    }
  }

  await finalizeAppleProfileClientSync(userId);
}

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
  const navigate = useNavigate();
  const { authModal } = useSelector((s: RootState) => s.modal);

  const [tab, setTab] = useState<"login" | "signup">("login");
  /** When true, show Login / Sign up tabs + email fields (OAuth + guest stay visible above). */
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [authAgreementError, setAuthAgreementError] = useState<string | null>(
    null,
  );

  const close = () => dispatch(setAuthModal(false));

  const requireAuthAgreement = (): boolean => {
    if (!acceptedTerms) {
      setAuthAgreementError(AUTH_AGREEMENT_TOAST);
      return false;
    }
    return true;
  };

  const openPolicy = (path: string) => {
    close();
    navigate(path);
  };

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
    setAuthAgreementError(null);
  }, [tab]);

  useEffect(() => {
    if (acceptedTerms) setAuthAgreementError(null);
  }, [acceptedTerms]);

  // Reset loading, email panel, and signupPhase when modal opens or closes
  useEffect(() => {
    setLoading(false);
    if (!authModal) {
      setSignupPhase("form");
      setShowEmailForm(false);
      setAuthAgreementError(null);
    } else {
      setAcceptedTerms(false);
      setAuthAgreementError(null);
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
    if (!requireAuthAgreement()) return;
    try {
      setLoading(true);
      dbg("EmailLogin:start", { email: data.email });
      markProfileDefaultsLoginPending();
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
    if (!requireAuthAgreement()) return;
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
    if (!requireAuthAgreement()) return;
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
    if (!requireAuthAgreement()) return;
    try {
      setLoading(true);

      if (canUseNativeGoogleSignInAndroid()) {
        try {
          dbg("Google:native_start", {});
          markProfileDefaultsLoginPending();
          const idToken = await signInWithGoogleNativeAndroid();
          const { error: nativeError } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: idToken,
          });
          dbg("Google:native_supabase", {
            ok: !nativeError,
            error: nativeError?.message,
          });
          if (nativeError) throw nativeError;

          const {
            data: { session: postGoogle },
          } = await supabase.auth.getSession();
          const postUid = postGoogle?.user?.id;
          if (postUid) {
            invalidateProfileByUserIdCache(postUid);
          }

          setLoading(false);
          return;
        } catch (nativeErr: unknown) {
          if (isGoogleNativeSignInUserCancel(nativeErr)) {
            dbg("Google:native_canceled", {});
            setLoading(false);
            return;
          }
          console.warn(
            "[AuthModal] Native Google sign-in failed, falling back to OAuth:",
            nativeErr
          );
        }
      }

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

      markProfileDefaultsLoginPending();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      dbg("Google:returned", { ok: !error, error: error?.message });
      if (error) throw error;

      if (data?.url) {
        console.log("[DBG:OAUTH] browser_open_before", {
          t: Date.now(),
          source: "AuthModal.handleGoogle",
        });
        await openOAuthUrl(data.url);
        console.log("[DBG:OAUTH] browser_open_after", {
          t: Date.now(),
          source: "AuthModal.handleGoogle",
        });
      }
    } catch (e: any) {
      dbg("Google:catch", { error: e?.message });
      setLoading(false);
      const errorMsg = e?.message ?? "Google sign-in failed";
      console.error("[AuthModal] Google sign-in error:", errorMsg);
      toast.error(`${errorMsg}. Check console for redirect URL.`);
    }
  };

  const handleApple = async () => {
    if (!requireAuthAgreement()) return;
    try {
      setLoading(true);

      if (canUseNativeAppleSignIn()) {
        dbg("Apple:native_start", {});
        const { idToken, rawNonce, givenName, familyName } =
          await signInWithAppleNative();

        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: idToken,
          nonce: rawNonce,
        });
        dbg("Apple:native_supabase", { ok: !error, error: error?.message });
        if (error) throw error;

        const fullName =
          [givenName?.trim(), familyName?.trim()].filter(Boolean).join(" ") ||
          "";
        await persistAppleFullNameAfterNativeSignIn(fullName);

        const {
          data: { session: postApple },
        } = await supabase.auth.getSession();
        const postUid = postApple?.user?.id;
        if (postUid) {
          invalidateProfileByUserIdCache(postUid);
          window.dispatchEvent(
            new CustomEvent("echotoo:native-apple-signin-complete", {
              detail: { userId: postUid },
            })
          );
        }

        return;
      }

      const redirectTo = getAuthRedirectUrl();

      console.log("[AuthRedirectDebug] Apple sign-in", {
        origin: window.location.origin,
        redirectTo,
        isCapacitor: isCapacitor(),
        isNativeApp: isNativeApp(),
      });

      dbg("Apple:start", {
        redirectTo,
        isCapacitor: isCapacitor(),
        isNativeApp: isNativeApp(),
      });

      markProfileDefaultsLoginPending();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo, skipBrowserRedirect: true },
      });

      dbg("Apple:returned", { ok: !error, error: error?.message });
      if (error) throw error;

      if (data?.url) {
        console.log("[DBG:OAUTH] browser_open_before", {
          t: Date.now(),
          source: "AuthModal.handleApple",
        });
        await openOAuthUrl(data.url);
        console.log("[DBG:OAUTH] browser_open_after", {
          t: Date.now(),
          source: "AuthModal.handleApple",
        });
      }
    } catch (e: any) {
      if (isAppleNativeSignInUserCancel(e)) {
        dbg("Apple:native_canceled", {});
        return;
      }
      dbg("Apple:catch", { error: e?.message });
      const errorMsg = e?.message ?? "Apple sign-in failed";
      console.warn("[AuthModal] Apple sign-in error:", errorMsg);
      toast.error(
        canUseNativeAppleSignIn()
          ? errorMsg
          : `${errorMsg}. Check console for redirect URL.`
      );
    } finally {
      setLoading(false);
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

  // Continue browsing as guest for this session; timer logic is handled elsewhere.
  const continueAsGuest = () => {
    if (!requireAuthAgreement()) return;
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

        <label className="flex items-start gap-2.5 mb-4 cursor-pointer text-left w-full rounded-xl px-3 py-2.5 border border-[var(--border)]/80 bg-[color-mix(in_oklab,var(--surface)_35%,transparent)]">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[var(--border)] accent-[var(--brand)]"
            aria-describedby="auth-legal-summary"
            aria-invalid={authAgreementError ? true : undefined}
          />
          <span
            id="auth-legal-summary"
            className="text-[11px] leading-snug text-[var(--text)]/95"
          >
            I agree to the{" "}
            <button
              type="button"
              className={policyLinkClass}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openPolicy(Paths.terms);
              }}
            >
              Terms of Service
            </button>
            ,{" "}
            <button
              type="button"
              className={policyLinkClass}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openPolicy(Paths.communityGuidelines);
              }}
            >
              Community Guidelines
            </button>
            , and{" "}
            <button
              type="button"
              className={policyLinkClass}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openPolicy(Paths.privacy);
              }}
            >
              Privacy Policy
            </button>
            , including EchoToo&apos;s zero-tolerance policy for objectionable
            content and abusive behavior.
          </span>
        </label>
        {authAgreementError ? (
          <p
            className="mb-3 rounded-lg border border-red-500/35 bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-red-800 app-dark:text-red-200"
            role="alert"
          >
            {authAgreementError}
          </p>
        ) : null}

        {/* Continue with Google — always visible (collapsed + expanded) */}
        <button
          type="button"
          className={`ui-btn auth-google-btn flex w-full items-center justify-center gap-2 mb-3 ${
            !acceptedTerms && !loading ? "opacity-55" : ""
          }`}
          onClick={handleGoogle}
          disabled={loading}
        >
          <img src="/IconGoogle.svg" alt="" width={20} height={20} />
          Continue with Google
        </button>

        <button
          type="button"
          className={`ui-btn auth-apple-btn flex w-full items-center justify-center gap-2 mb-3 ${
            !acceptedTerms && !loading ? "opacity-55" : ""
          }`}
          onClick={handleApple}
          disabled={loading}
        >
          <PiAppleLogo className="shrink-0" size={20} aria-hidden />
          Continue with Apple
        </button>

        <button
          type="button"
          className={`auth-guest-link w-full mb-1 ${
            !acceptedTerms && !loading ? "opacity-55" : ""
          }`}
          onClick={continueAsGuest}
        >
          Continue as guest
        </button>

        {!showEmailForm ? (
          <button
            type="button"
            className={`w-full text-center text-xs font-normal text-[var(--brand)] py-2 mt-1 transition-opacity hover:opacity-100 hover:underline ${
              !acceptedTerms && !loading ? "opacity-55" : "opacity-70"
            }`}
            onClick={() => {
              if (!requireAuthAgreement()) return;
              setShowEmailForm(true);
            }}
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
