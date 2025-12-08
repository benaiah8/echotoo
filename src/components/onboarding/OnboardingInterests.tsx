import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

interface OnboardingInterestsProps {
  userId: string;
  userNumber: number;
  onNext: () => void;
  onBack: () => void;
}

interface InterestTag {
  id: number;
  value: string;
  label: string;
  category: string;
}

const defaultTags = [
  { value: "food", label: "Food", category: "general" },
  { value: "dating", label: "Dating", category: "general" },
  { value: "nightlife", label: "Nightlife", category: "general" },
  { value: "games", label: "Games", category: "general" },
  { value: "travel", label: "Travel", category: "general" },
  { value: "fitness", label: "Fitness", category: "general" },
  { value: "music", label: "Music", category: "general" },
  { value: "art", label: "Art", category: "general" },
];

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

const categoryIcons: Record<string, string> = {
  outdoors: "🏔️",
  food: "🍽️",
  culture: "🎭",
  sports: "⚽",
  learning: "📚",
  social: "🤝",
};

const categoryLabels: Record<string, string> = {
  outdoors: "Outdoors & Adventure",
  food: "Food & Dining",
  culture: "Arts & Culture",
  sports: "Sports & Fitness",
  learning: "Technology & Learning",
  social: "Social & Community",
};

export default function OnboardingInterests({
  userId,
  userNumber,
  onNext,
  onBack,
}: OnboardingInterestsProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<InterestTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [customSource, setCustomSource] = useState<string>("");
  const [showError, setShowError] = useState(false);

  // Rotating text for description
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isTextVisible, setIsTextVisible] = useState(true);

  const rotatingTexts = [
    "entertainment",
    "education",
    "connection",
    "volunteering",
  ];

  useEffect(() => {
    loadAvailableTags();
  }, []);

  // Rotating text effect
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTextVisible(false);
      setTimeout(() => {
        setCurrentTextIndex((prev) => (prev + 1) % rotatingTexts.length);
        setIsTextVisible(true);
      }, 300);
    }, 2000);

    return () => clearInterval(interval);
  }, [rotatingTexts.length]);

  const loadAvailableTags = async () => {
    try {
      // Try to load from database first
      const { data: dbTags, error } = await supabase
        .from("interest_tags")
        .select("*")
        .order("display_order", { ascending: true });

      if (error || !dbTags || dbTags.length === 0) {
        // Fallback to default tags (only first 8)
        setAvailableTags(
          defaultTags.slice(0, 8).map((tag, index) => ({
            id: index + 1,
            ...tag,
          }))
        );
      } else {
        // Use first 8 tags from database or fallback to default
        const tagsToUse =
          dbTags.length >= 8 ? dbTags.slice(0, 8) : defaultTags.slice(0, 8);
        setAvailableTags(
          tagsToUse.map((tag, index) => ({
            id: tag.id || index + 1,
            value: tag.value,
            label: tag.label,
            category: tag.category || "general",
          }))
        );
      }
    } catch (error) {
      console.error("Error loading tags:", error);
      // Fallback to default tags (only first 8)
      setAvailableTags(
        defaultTags.slice(0, 8).map((tag, index) => ({
          id: index + 1,
          ...tag,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tagValue: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tagValue)) {
        return prev.filter((tag) => tag !== tagValue);
      } else {
        return [...prev, tagValue];
      }
    });
  };

  const handleNext = async () => {
    if (!selectedSource) {
      setShowError(true);
      return;
    }

    if (selectedSource === "other" && !customSource.trim()) {
      setShowError(true);
      return;
    }

    setShowError(false);

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
        console.error("Error saving data:", error);
        alert("Error saving your data. Please try again.");
        return;
      }

      onNext();
    } catch (error) {
      console.error("Error saving data:", error);
      alert("Error saving your data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Group tags by category
  const groupedTags = availableTags.reduce((acc, tag) => {
    if (!acc[tag.category]) {
      acc[tag.category] = [];
    }
    acc[tag.category].push(tag);
    return acc;
  }, {} as Record<string, InterestTag[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--text)]/70">Loading interests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-[var(--text)] p-6 justify-center">
      <div className="max-w-sm mx-auto space-y-8">
        {/* Welcome Message */}
        <div className="text-center pb-6 border-b border-[var(--border)]">
          <div className="text-lg text-[var(--text)]/80 mb-1">Welcome</div>
          <div className="text-lg text-[var(--text)]/80 mb-3">user</div>
          <div
            className="text-[40px] font-bold"
            style={{
              color: "var(--brand-dark)",
            }}
          >
            #{userNumber.toLocaleString()}
          </div>
        </div>

        {/* Description with rotating text */}
        <div className="text-center pb-6 border-b border-[var(--border)]">
          <div className="text-lg text-[var(--text)]/80 leading-relaxed">
            The best platform for
          </div>
          <div className="text-lg font-semibold">
            <span
              className={`inline-block transition-all duration-300 ${
                isTextVisible
                  ? "opacity-100 transform translate-y-0"
                  : "opacity-0 transform translate-y-2"
              }`}
              style={{
                color: "var(--brand-dark)",
              }}
            >
              {rotatingTexts[currentTextIndex]}
            </span>
          </div>
        </div>

        {/* Referral section */}
        <div className="space-y-3">
          <div className="text-[14px] font-medium text-center text-[var(--text)]">
            Where did you hear from us? <span className="text-red-500">*</span>
          </div>

          <select
            value={selectedSource}
            onChange={(e) => {
              setSelectedSource(e.target.value);
              setShowError(false);
            }}
            className={`w-full p-3 rounded-lg border ${
              showError && !selectedSource
                ? "border-red-500"
                : "border-[var(--border)]"
            } bg-[var(--surface)] text-[var(--text)] text-[12px] focus:outline-none focus:border-[var(--brand)] appearance-none`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: "right 12px center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "16px",
            }}
          >
            <option value="">Select how you heard about us...</option>
            {referralOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="text-[12px]"
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Custom input for "Other" */}
          {selectedSource === "other" && (
            <input
              type="text"
              value={customSource}
              onChange={(e) => {
                setCustomSource(e.target.value);
                setShowError(false);
              }}
              placeholder="If you heard from other place, if you want to write down where you heard from just write it down"
              className={`w-full p-3 rounded-lg border ${
                showError && selectedSource === "other" && !customSource.trim()
                  ? "border-red-500"
                  : "border-[var(--border)]"
              } bg-[var(--surface-2)] text-[var(--text)] text-[12px] focus:outline-none focus:border-[var(--brand)]`}
              maxLength={100}
            />
          )}

          {/* Error message */}
          {showError && (
            <div className="text-red-500 text-[12px] text-center">
              {!selectedSource
                ? "Please select how you heard about us to continue"
                : selectedSource === "other" && !customSource.trim()
                ? "Please tell us where you heard about us"
                : ""}
            </div>
          )}
        </div>

        {/* Continue button */}
        <div className="pt-8">
          <button
            onClick={handleNext}
            disabled={loading}
            className="w-full py-4 bg-[var(--brand)] text-[var(--brand-ink)] font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity text-[14px]"
          >
            {loading ? "Saving..." : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
