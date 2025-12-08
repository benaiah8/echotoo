import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import OnboardingWelcome from "./OnboardingWelcome";
import OnboardingInterests from "./OnboardingInterests";
import OnboardingReferral from "./OnboardingReferral";

interface OnboardingFlowProps {
  userId: string;
  userNumber: number;
  onComplete: () => void;
}

type OnboardingStep = "interests" | "complete";

export default function OnboardingFlow({
  userId,
  userNumber,
  onComplete,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("interests");
  const navigate = useNavigate();

  const handleStepComplete = (step: OnboardingStep) => {
    if (step === "interests") {
      // Complete onboarding after interests
      markOnboardingComplete();
    }
  };

  const markOnboardingComplete = async () => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          onboarding_step: 3, // Complete
        })
        .eq("id", userId);

      if (error) {
        console.error("Error completing onboarding:", error);
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }

    // Close onboarding and redirect to home
    setTimeout(() => {
      handleOnboardingComplete();
    }, 1000);
  };

  const handleOnboardingComplete = () => {
    onComplete();
    navigate("/");
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "interests":
        return (
          <OnboardingInterests
            userId={userId}
            userNumber={userNumber}
            onNext={() => handleStepComplete("interests")}
            onBack={() => {}} // No back button needed
          />
        );
      case "complete":
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg)] text-[var(--text)] p-6">
            <div className="text-center">
              <div className="text-6xl mb-6">🎉</div>
              <h1 className="text-3xl font-bold mb-4">Welcome to Echotoo!</h1>
              <p className="text-lg text-[var(--text)]/70 mb-8">
                You're all set! Let's start exploring amazing experiences and
                hangouts.
              </p>
              <div className="w-8 h-8 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return <div className="onboarding-flow">{renderCurrentStep()}</div>;
}
