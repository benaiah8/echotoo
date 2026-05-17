import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { supabase } from "../../lib/supabaseClient";
import { SKIP_WELCOME_ONBOARDING } from "../../lib/featureFlags";
import {
  clearAuthCache,
  invalidateProfileByUserIdCache,
} from "../../api/services/follows";
import { clearCachedFollowCounts } from "../../lib/followCountsCache";
import OnboardingFlow from "./OnboardingFlow";
import FullScreenProfileCreation from "../profile/FullScreenProfileCreation";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../ui/FrostedCenterModal";

interface OnboardingCheck {
  needsProfile: boolean;
  needsOnboarding: boolean;
  memberNo: number;
  profileId: string;
}

/** Dispatched from AuthModal after native Apple sign-in + profile/metadata writes. */
const NATIVE_APPLE_SIGNIN_COMPLETE_EVENT = "echotoo:native-apple-signin-complete";

const PROFILE_DEFAULTS_STARTED_EVENT = "echotoo:profile-defaults-started";
const PROFILE_DEFAULTS_FINISHED_EVENT = "echotoo:profile-defaults-finished";
/** Failsafe if persist never signals finished (network/DB hang). */
const PROFILE_DEFAULTS_SYNC_TIMEOUT_MS = 9_000;
/** Avoid painting overlay for very fast no-op or sub-250ms syncs. */
const PROFILE_DEFAULTS_OVERLAY_DEBOUNCE_MS = 250;

export default function OnboardingWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const authState = useSelector((state: RootState) => state.auth);
  const user = authState?.user;
  const authLoading = authState?.loading ?? true;
  const [onboardingCheck, setOnboardingCheck] =
    useState<OnboardingCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileCreation, setShowProfileCreation] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileDefaultsSyncing, setProfileDefaultsSyncing] = useState(false);
  const [showProfileDefaultsOverlay, setShowProfileDefaultsOverlay] =
    useState(false);
  // [OPTIMIZATION] Fetch-once-per-session guard: avoid repeated getProfileByUserId when auth events fire
  const lastCheckedUserIdRef = useRef<string | null>(null);
  const profileDefaultsSyncTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const profileDefaultsOverlayDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const checkOnboardingStatus = useCallback(async () => {
    const uid = user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }

    try {
      // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
      // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
      // getProfileByUserId() now includes onboarding fields (member_no, onboarding_completed, onboarding_step)
      const { getProfileByUserId } = await import("../../api/services/follows");
      const profile = await getProfileByUserId(uid);

      if (!profile) {
        // [POST-DELETE FIX] getProfileByUserId excludes soft-deleted profiles.
        // If a soft-deleted row exists, reset it to fresh-user state (not restore).
        // Truly new users (no row) use the insert flow below.
        const tryResetSoftDeleted = async () => {
          const { data: reset } = await supabase
            .from("profiles")
            .update({
              deleted_at: null,
              display_name: null,
              username: null,
              avatar_url: null,
              bio: null,
              instagram_url: null,
              tiktok_url: null,
              telegram_url: null,
              selected_tags: [],
              referral_source: null,
              onboarding_completed: false,
              onboarding_step: 0,
              is_private: false,
              social_media_public: false,
              xp: 0,
            })
            .eq("user_id", uid)
            .not("deleted_at", "is", null)
            .select(
              "id, display_name, username, member_no, onboarding_completed, onboarding_step"
            )
            .maybeSingle();
          return reset;
        };

        const clearResetCaches = (profileId: string, userId: string) => {
          clearAuthCache();
          invalidateProfileByUserIdCache(userId);
          clearCachedFollowCounts(profileId);
          try {
            localStorage.removeItem("my_profile_id");
          } catch (_) {}
        };

        // Step 1: Try reset soft-deleted profile first (treat returning user as new)
        let resolvedProfile = await tryResetSoftDeleted();
        if (resolvedProfile) {
          clearResetCaches(resolvedProfile.id, uid);
          // Reset always sets display_name/username null → needsProfile = true
          setOnboardingCheck({
            needsProfile: true,
            needsOnboarding:
              !resolvedProfile.onboarding_completed && !SKIP_WELCOME_ONBOARDING,
            memberNo: resolvedProfile.member_no || 0,
            profileId: resolvedProfile.id,
          });
          setShowProfileCreation(true);
          setShowOnboarding(false);
          lastCheckedUserIdRef.current = uid;
          setLoading(false);
          return;
        }

        // Step 2: No soft-deleted row - create new profile (truly new user)
        try {
          const { data: newProfile, error: createError } = await supabase
            .from("profiles")
            .insert({
              user_id: uid,
              display_name: null,
              username: null,
              onboarding_completed: false,
              onboarding_step: 0,
            })
            .select(
              "id, display_name, username, member_no, onboarding_completed, onboarding_step"
            )
            .single();

          if (createError) {
            // [POST-DELETE FIX] Duplicate key = soft-deleted row exists, reset it
            const isDuplicateKey =
              createError.code === "23505" ||
              String(createError.message || "").includes("duplicate key") ||
              String(createError.message || "").includes(
                "profiles_user_id_key"
              );
            if (isDuplicateKey) {
              resolvedProfile = await tryResetSoftDeleted();
              if (resolvedProfile) {
                clearResetCaches(resolvedProfile.id, uid);
                setOnboardingCheck({
                  needsProfile: true,
                  needsOnboarding:
                    !resolvedProfile.onboarding_completed &&
                    !SKIP_WELCOME_ONBOARDING,
                  memberNo: resolvedProfile.member_no || 0,
                  profileId: resolvedProfile.id,
                });
                setShowProfileCreation(true);
                setShowOnboarding(false);
                lastCheckedUserIdRef.current = uid;
                setLoading(false);
                return;
              }
            }
            console.error("Failed to create profile:", createError);
            setLoading(false);
            return;
          }

          const needsProfile = !newProfile.display_name || !newProfile.username;
          const needsOnboarding =
            !newProfile.onboarding_completed && !SKIP_WELCOME_ONBOARDING;
          setOnboardingCheck({
            needsProfile,
            needsOnboarding,
            memberNo: newProfile.member_no || 0,
            profileId: newProfile.id,
          });
          setShowProfileCreation(false);
          setShowOnboarding(false);
          if (needsProfile) setShowProfileCreation(true);
          else if (needsOnboarding) setShowOnboarding(true);
          lastCheckedUserIdRef.current = uid;
        } catch (createErr) {
          console.error("Error creating profile:", createErr);
          setLoading(false);
        }
        setLoading(false);
        return;
      }

      const needsProfile = !profile.display_name || !profile.username;
      const needsOnboarding =
        !profile.onboarding_completed && !SKIP_WELCOME_ONBOARDING;

      setOnboardingCheck({
        needsProfile,
        needsOnboarding,
        memberNo: profile.member_no || 0,
        profileId: profile.id,
      });

      setShowProfileCreation(false);
      setShowOnboarding(false);

      if (needsProfile) {
        setShowProfileCreation(true);
      } else if (needsOnboarding) {
        setShowOnboarding(true);
      }

      lastCheckedUserIdRef.current = uid;
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.id) {
      lastCheckedUserIdRef.current = null;
      setLoading(false);
      return;
    }

    if (lastCheckedUserIdRef.current === user.id) {
      setLoading(false);
      return;
    }

    // Add timeout protection to prevent getting stuck
    const timeoutId = setTimeout(() => {
      console.warn("Onboarding check timed out after 10 seconds");
      setLoading(false);
    }, 10000);

    checkOnboardingStatus().finally(() => {
      clearTimeout(timeoutId);
    });
  }, [user?.id, authLoading, checkOnboardingStatus]);

  /** After native Apple: profile row + localStorage cache may update; re-fetch before gating UX. */
  useEffect(() => {
    const onNativeApple = (ev: Event) => {
      const e = ev as CustomEvent<{ userId: string }>;
      const id = e.detail?.userId;
      if (!id || id !== user?.id) return;
      invalidateProfileByUserIdCache(id);
      lastCheckedUserIdRef.current = null;
      /** Background re-check: avoid global `loading` so FullScreenProfileCreation is not replaced by the spinner. */
      void checkOnboardingStatus();
    };
    window.addEventListener(
      NATIVE_APPLE_SIGNIN_COMPLETE_EVENT,
      onNativeApple as EventListener
    );
    return () =>
      window.removeEventListener(
        NATIVE_APPLE_SIGNIN_COMPLETE_EVENT,
        onNativeApple as EventListener
      );
  }, [user?.id, checkOnboardingStatus]);

  const clearProfileDefaultsSyncTimeout = useCallback(() => {
    if (profileDefaultsSyncTimeoutRef.current) {
      clearTimeout(profileDefaultsSyncTimeoutRef.current);
      profileDefaultsSyncTimeoutRef.current = null;
    }
  }, []);

  const clearProfileDefaultsOverlayDebounce = useCallback(() => {
    if (profileDefaultsOverlayDebounceRef.current) {
      clearTimeout(profileDefaultsOverlayDebounceRef.current);
      profileDefaultsOverlayDebounceRef.current = null;
    }
  }, []);

  const finishProfileDefaultsSync = useCallback(
    (userId: string) => {
      clearProfileDefaultsSyncTimeout();
      clearProfileDefaultsOverlayDebounce();
      setShowProfileDefaultsOverlay(false);
      setProfileDefaultsSyncing(false);
      invalidateProfileByUserIdCache(userId);
      lastCheckedUserIdRef.current = null;
      void checkOnboardingStatus();
    },
    [
      clearProfileDefaultsSyncTimeout,
      clearProfileDefaultsOverlayDebounce,
      checkOnboardingStatus,
    ],
  );

  /** Post-sign-in profile defaults: block Create Profile until persist finishes. */
  useEffect(() => {
    const onStarted = (ev: Event) => {
      const id = (ev as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!id || id !== user?.id) return;
      setShowProfileCreation(false);
      setProfileDefaultsSyncing(true);
      setShowProfileDefaultsOverlay(false);
      clearProfileDefaultsOverlayDebounce();
      clearProfileDefaultsSyncTimeout();
      profileDefaultsOverlayDebounceRef.current = setTimeout(() => {
        setShowProfileDefaultsOverlay(true);
      }, PROFILE_DEFAULTS_OVERLAY_DEBOUNCE_MS);
      profileDefaultsSyncTimeoutRef.current = setTimeout(() => {
        console.warn(
          "[OnboardingWrapper] profile defaults sync timed out; continuing",
        );
        finishProfileDefaultsSync(id);
      }, PROFILE_DEFAULTS_SYNC_TIMEOUT_MS);
    };

    const onFinished = (ev: Event) => {
      const id = (ev as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!id || id !== user?.id) return;
      finishProfileDefaultsSync(id);
    };

    window.addEventListener(
      PROFILE_DEFAULTS_STARTED_EVENT,
      onStarted as EventListener,
    );
    window.addEventListener(
      PROFILE_DEFAULTS_FINISHED_EVENT,
      onFinished as EventListener,
    );
    return () => {
      clearProfileDefaultsSyncTimeout();
      clearProfileDefaultsOverlayDebounce();
      window.removeEventListener(
        PROFILE_DEFAULTS_STARTED_EVENT,
        onStarted as EventListener,
      );
      window.removeEventListener(
        PROFILE_DEFAULTS_FINISHED_EVENT,
        onFinished as EventListener,
      );
    };
  }, [
    user?.id,
    clearProfileDefaultsSyncTimeout,
    clearProfileDefaultsOverlayDebounce,
    finishProfileDefaultsSync,
  ]);

  useEffect(() => {
    if (!user?.id) {
      setProfileDefaultsSyncing(false);
      setShowProfileDefaultsOverlay(false);
      clearProfileDefaultsSyncTimeout();
      clearProfileDefaultsOverlayDebounce();
    }
  }, [
    user?.id,
    clearProfileDefaultsSyncTimeout,
    clearProfileDefaultsOverlayDebounce,
  ]);

  const handleProfileComplete = async () => {
    setShowProfileCreation(false);
    // Re-check onboarding status after profile creation
    await checkOnboardingStatus();
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Refresh the onboarding check
    checkOnboardingStatus();
  };

  if (showProfileDefaultsOverlay) {
    return (
      <FrostedCenterModal
        open
        zTier="blocking"
        aria-labelledby="profile-defaults-setup-title"
      >
        <div
          className={`${frostedModalPanelClassName} text-center`}
          style={frostedModalPanelStyle}
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand)] border-t-transparent" />
          <div
            id="profile-defaults-setup-title"
            className="text-sm font-semibold text-[var(--text)]"
          >
            Setting up your profile…
          </div>
          <p className="mt-1 text-xs text-[var(--text)]/70">
            Choosing your Echo avatar and getting things ready.
          </p>
        </div>
      </FrostedCenterModal>
    );
  }

  if (profileDefaultsSyncing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand)] border-t-transparent" />
      </div>
    );
  }

  // Show loading while checking auth or onboarding status
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--text)]/70">Loading...</p>
        </div>
      </div>
    );
  }

  // Show profile creation if needed
  if (showProfileCreation && onboardingCheck && !profileDefaultsSyncing) {
    return (
      <FullScreenProfileCreation
        open={showProfileCreation}
        onClose={handleProfileComplete}
        profileId={onboardingCheck.profileId}
        isFirstTime={true}
      />
    );
  }

  // Show onboarding flow if needed
  if (showOnboarding && onboardingCheck) {
    return (
      <OnboardingFlow
        userId={onboardingCheck.profileId}
        memberNo={onboardingCheck.memberNo}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // Show normal app content
  return <>{children}</>;
}
