import React from "react";
import { Profile } from "../../contexts/ProfileContext";
import { openExternalUrl } from "../../lib/openExternalUrl";
import { resolveSocialProfileUrl, type SocialPlatform } from "../../lib/socialLinks";
import { PROFILE_OVERVIEW_SOCIAL_LINKS_CLASS } from "../../lib/profileOverviewPresentation";

interface SocialMediaLinksProps {
  profile: Profile | null;
  loading?: boolean;
  showSocialMedia?: boolean; // If false, don't render. If true or undefined, check privacy settings
  /** When false, omit horizontal rules above/below the icon row (own profile). */
  showDividers?: boolean;
}

const SocialMediaLinks: React.FC<SocialMediaLinksProps> = ({
  profile,
  loading = false,
  showSocialMedia = true, // Default to true for backward compatibility
  showDividers = true,
}) => {
  // Determine if social media should be shown
  // Show if: explicitly set to false (don't show), OR
  //         account is public OR (private AND social_media_public is true)
  const shouldShow = showSocialMedia && profile && (
    !profile.is_private || profile.social_media_public
  );

  // If explicitly hidden or no profile, don't render
  if (!showSocialMedia || !profile || !shouldShow) {
    return null;
  }
  const socialLinks = [
    {
      platform: "Instagram" as const,
      key: "instagram" as SocialPlatform,
      url: profile?.instagram_url,
      icon: "/instagram-icon.svg",
      color: "border border-[var(--text)]",
    },
    {
      platform: "TikTok" as const,
      key: "tiktok" as SocialPlatform,
      url: profile?.tiktok_url,
      icon: "/Tiktok-icon.svg",
      color: "border border-[var(--text)]",
    },
    {
      platform: "Telegram" as const,
      key: "telegram" as SocialPlatform,
      url: profile?.telegram_url,
      icon: "/Telegram-icon.svg",
      color: "border border-[var(--text)]",
    },
  ].filter((link) => link.url); // Only show links that have URLs

  // Show skeleton loading
  if (loading) {
    return (
      <div className={PROFILE_OVERVIEW_SOCIAL_LINKS_CLASS}>
        {showDividers ? (
          <div className="h-px bg-[var(--border)] mb-2" />
        ) : null}

        {/* Skeleton social media logos */}
        <div className="flex justify-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
          <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
          <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
        </div>

        {showDividers ? (
          <div className="h-px bg-[var(--border)] mt-2" />
        ) : null}
      </div>
    );
  }

  if (socialLinks.length === 0) {
    return null;
  }

  const handleLinkClick = (url: string, platformKey: SocialPlatform) => {
    const finalUrl = resolveSocialProfileUrl(platformKey, url);
    if (!finalUrl) return;
    void openExternalUrl(finalUrl);
  };

  return (
    <div className={PROFILE_OVERVIEW_SOCIAL_LINKS_CLASS}>
      {showDividers ? (
        <div className="h-px bg-[var(--border)] mb-2" />
      ) : null}

      {/* Centered social media logos */}
      <div className="flex justify-center gap-2">
        {socialLinks.map((link) => (
          <button
            key={link.platform}
            onClick={() => handleLinkClick(link.url!, link.key)}
            className={`
              w-6 h-6 rounded-lg flex items-center justify-center
              transition-all duration-200 hover:scale-110 hover:shadow-lg
              ${link.color}
            `}
            title={link.platform}
          >
            <img src={link.icon} alt={link.platform} className="w-5 h-5" />
          </button>
        ))}
      </div>

      {showDividers ? (
        <div className="h-px bg-[var(--border)] mt-2" />
      ) : null}
    </div>
  );
};

export default SocialMediaLinks;
