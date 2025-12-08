import React, { useState, useEffect } from "react";

interface OnboardingWelcomeProps {
  userNumber: number;
  onNext: () => void;
}

const taglines = [
  "The only thing you need when you're trying to get out of the house 🏠",
  "Have fun and meet amazing people 🎉",
  "Discover new experiences and adventures 🌟",
  "Connect through shared interests and passions 💫",
  "Learn something new every day 📚",
  "Travel, explore, and make memories 🌍",
  "Find your next adventure waiting for you ⚡",
];

export default function OnboardingWelcome({
  userNumber,
  onNext,
}: OnboardingWelcomeProps) {
  const [currentTaglineIndex, setCurrentTaglineIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentTaglineIndex((prev) => (prev + 1) % taglines.length);
        setIsVisible(true);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-[var(--text)] p-6">
      {/* Header with logo */}
      <div className="text-center pt-8 pb-6">
        <div className="text-4xl font-bold mb-2">Echotoo</div>
        <div className="text-sm text-[var(--text)]/60">
          Your gateway to amazing experiences
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col justify-center items-center text-center px-4">
        {/* Animated tagline */}
        <div className="mb-8 min-h-[60px] flex items-center justify-center">
          <div
            className={`text-lg font-medium text-[var(--text)]/80 transition-all duration-300 ${
              isVisible
                ? "opacity-100 transform translate-y-0"
                : "opacity-0 transform translate-y-4"
            }`}
            style={{
              textShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            {taglines[currentTaglineIndex]}
          </div>
        </div>

        {/* User number celebration */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Congratulations! 🎊</h1>
          <div className="text-xl text-[var(--brand)] font-semibold mb-2">
            You're our #{userNumber.toLocaleString()} user!
          </div>
          <p className="text-[var(--text)]/70 max-w-sm">
            You're joining an amazing community of people who love to explore,
            learn, and have fun together.
          </p>
        </div>

        {/* Features preview */}
        <div className="mb-12 max-w-md">
          <h2 className="text-xl font-semibold mb-6">What you can do here:</h2>
          <div className="space-y-4 text-left">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[var(--brand)]/20 rounded-full flex items-center justify-center flex-shrink-0">
                🗺️
              </div>
              <div>
                <div className="font-medium">Create Experiences</div>
                <div className="text-sm text-[var(--text)]/60">
                  Share your curated itineraries and favorite spots
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[var(--brand)]/20 rounded-full flex items-center justify-center flex-shrink-0">
                👥
              </div>
              <div>
                <div className="font-medium">Host Hangouts</div>
                <div className="text-sm text-[var(--text)]/60">
                  Invite people and have fun together
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[var(--brand)]/20 rounded-full flex items-center justify-center flex-shrink-0">
                ✨
              </div>
              <div>
                <div className="font-medium">Join & Discover</div>
                <div className="text-sm text-[var(--text)]/60">
                  Find amazing experiences and hangouts from others
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Continue button */}
      <div className="pb-8">
        <button
          onClick={onNext}
          className="w-full max-w-sm mx-auto py-4 px-8 bg-[var(--brand)] text-[var(--brand-ink)] font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Let's get started! 🚀
        </button>
      </div>
    </div>
  );
}
