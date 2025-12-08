import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { supabase } from "../../lib/supabaseClient";
import OnboardingFlow from "./OnboardingFlow";
import FullScreenProfileCreation from "../profile/FullScreenProfileCreation";

interface OnboardingCheck {
  needsProfile: boolean;
  needsOnboarding: boolean;
  userNumber: number;
  profileId: string;
}

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

  useEffect(() => {
    if (!authLoading) {
      // Add timeout protection to prevent getting stuck
      const timeoutId = setTimeout(() => {
        console.warn("Onboarding check timed out after 10 seconds");
        setLoading(false);
      }, 10000);

      checkOnboardingStatus().finally(() => {
        clearTimeout(timeoutId);
      });
    }
  }, [user, authLoading]);

  const checkOnboardingStatus = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Get user profile to check onboarding status
      const { data: profile, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, username, user_number, onboarding_completed, onboarding_step, user_id"
        )
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error checking onboarding status:", error);

        // If no profile exists, try to create one automatically
        if (error.code === "PGRST116") {
          // No rows found
          console.log(
            "No profile found, attempting to create one for user:",
            user.id
          );
          try {
            const { data: newProfile, error: createError } = await supabase
              .from("profiles")
              .insert({
                user_id: user.id,
                display_name: null,
                username: null,
                onboarding_completed: false,
                onboarding_step: 0,
              })
              .select(
                "id, display_name, username, user_number, onboarding_completed, onboarding_step"
              )
              .single();

            if (createError) {
              console.error("Failed to create profile:", createError);
              setLoading(false);
              return;
            }

            // Use the newly created profile
            const needsProfile =
              !newProfile.display_name || !newProfile.username;
            const needsOnboarding = !newProfile.onboarding_completed;

            setOnboardingCheck({
              needsProfile,
              needsOnboarding,
              userNumber: newProfile.user_number || 0,
              profileId: newProfile.id,
            });

            setShowProfileCreation(false);
            setShowOnboarding(false);

            if (needsProfile) {
              setShowProfileCreation(true);
            } else if (needsOnboarding) {
              setShowOnboarding(true);
            }

            setLoading(false);
            return;
          } catch (createErr) {
            console.error("Error creating profile:", createErr);
            setLoading(false);
            return;
          }
        } else {
          setLoading(false);
          return;
        }
      }

      const needsProfile = !profile.display_name || !profile.username;
      const needsOnboarding = !profile.onboarding_completed;

      setOnboardingCheck({
        needsProfile,
        needsOnboarding,
        userNumber: profile.user_number || 0,
        profileId: profile.id,
      });

      setShowProfileCreation(false);
      setShowOnboarding(false);

      if (needsProfile) {
        setShowProfileCreation(true);
      } else if (needsOnboarding) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    } finally {
      setLoading(false);
    }
  };

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
  if (showProfileCreation && onboardingCheck) {
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
        userNumber={onboardingCheck.userNumber}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // Show normal app content
  return <>{children}</>;
}
