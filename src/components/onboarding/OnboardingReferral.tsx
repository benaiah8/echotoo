import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

interface OnboardingReferralProps {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

const referralOptions = [
  { value: "social_media", label: "Social Media (Instagram, TikTok, etc.)" },
  { value: "friends", label: "Friends or Family" },
  { value: "search", label: "Google Search" },
  { value: "app_store", label: "App Store Discovery" },
  { value: "blog", label: "Blog or Article" },
  { value: "event", label: "Event or Meetup" },
  { value: "advertisement", label: "Advertisement" },
  { value: "other", label: "Other" },
];

export default function OnboardingReferral({
  userId,
  onNext,
  onBack,
}: OnboardingReferralProps) {
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [customSource, setCustomSource] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!selectedSource) {
      alert("Please select how you heard about us!");
      return;
    }

    if (selectedSource === "other" && !customSource.trim()) {
      alert("Please tell us where you heard about us!");
      return;
    }

    try {
      setLoading(true);
      const finalSource =
        selectedSource === "other" ? customSource.trim() : selectedSource;

      const { error } = await supabase
        .from("profiles")
        .update({
          referral_source: finalSource,
          onboarding_completed: true,
          onboarding_step: 3, // Complete
        })
        .eq("id", userId);

      if (error) {
        console.error("Error saving referral source:", error);
        alert("Error saving your response. Please try again.");
        return;
      }

      onNext();
    } catch (error) {
      console.error("Error saving referral source:", error);
      alert("Error saving your response. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <div className="p-6 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="text-[var(--text)]/70 hover:text-[var(--text)] transition-colors"
          >
            ← Back
          </button>
          <div className="text-sm text-[var(--text)]/60">Step 3 of 3</div>
        </div>
        <h1 className="text-2xl font-bold mb-2">Almost done! 🎉</h1>
        <p className="text-[var(--text)]/70">
          Just one last question - where did you hear about Echotoo?
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Explanation */}
        <div className="mb-8 p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)]">
          <h3 className="font-semibold mb-2 text-[var(--brand)]">
            ✨ What you can do on Echotoo:
          </h3>
          <div className="text-sm text-[var(--text)]/80 space-y-2">
            <p>
              • <strong>Host hangouts</strong> and invite people to join your
              adventures 🎯
            </p>
            <p>
              • <strong>Share experiences</strong> as curated itineraries with
              your favorite spots and activities 📍
            </p>
            <p>
              • <strong>Join other people's hangouts</strong> and meet amazing
              new people 🤝
            </p>
            <p>
              • <strong>Explore experiences</strong> created by the community
              and discover new places 🗺️
            </p>
          </div>
        </div>

        {/* Referral source selection */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold mb-4">
            Where did you hear about us?
          </h2>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full p-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--brand)]"
          >
            <option value="">Select how you heard about us...</option>
            {referralOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom input for "Other" */}
        {selectedSource === "other" && (
          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">
              Please tell us where you heard about us:
            </label>
            <input
              type="text"
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value)}
              placeholder="e.g., Word of mouth, Reddit, Newsletter..."
              className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              maxLength={100}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[var(--border)]">
        <button
          onClick={handleNext}
          disabled={
            !selectedSource ||
            (selectedSource === "other" && !customSource.trim()) ||
            loading
          }
          className="w-full py-4 bg-[var(--brand)] text-[var(--brand-ink)] font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {loading ? "Saving..." : "Complete Setup! 🚀"}
        </button>
      </div>
    </div>
  );
}
