import React from "react";
import { Profile } from "../../contexts/ProfileContext";

interface SocialMediaLinksProps {
  profile: Profile | null;
  isOwn?: boolean;
  loading?: boolean;
}

const SocialMediaLinks: React.FC<SocialMediaLinksProps> = ({
  profile,
  isOwn = false,
  loading = false,
}) => {
  const socialLinks = [
    {
      platform: "Instagram",
      url: profile?.instagram_url,
      icon: "/instagram-icon.svg",
      color: "border border-[var(--text)]",
    },
    {
      platform: "TikTok",
      url: profile?.tiktok_url,
      icon: "/Tiktok-icon.svg",
      color: "border border-[var(--text)]",
    },
    {
      platform: "Telegram",
      url: profile?.telegram_url,
      icon: "/Telegram-icon.svg",
      color: "border border-[var(--text)]",
    },
  ].filter((link) => link.url); // Only show links that have URLs

  // Show skeleton loading
  if (loading) {
    return (
      <div className="mt-3">
        {/* Top divider line */}
        <div className="h-px bg-[var(--border)] mb-3" />

        {/* Skeleton social media logos */}
        <div className="flex justify-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
          <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
          <div className="w-6 h-6 rounded bg-[var(--text)]/10 animate-pulse" />
        </div>

        {/* Bottom divider line */}
        <div className="h-px bg-[var(--border)] mt-3" />
      </div>
    );
  }

  if (socialLinks.length === 0) {
    return null;
  }

  const handleLinkClick = (url: string, platform: string) => {
    // Handle different URL formats
    let finalUrl = url;

    if (platform === "Telegram" && !url.startsWith("http")) {
      // If it's just a username, make it a telegram link
      finalUrl = `https://t.me/${url.replace("@", "")}`;
    }

    // Open in new tab
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mt-3">
      {/* Top divider line */}
      <div className="h-px bg-[var(--border)] mb-3" />

      {/* Centered social media logos */}
      <div className="flex justify-center gap-2">
        {socialLinks.map((link) => (
          <button
            key={link.platform}
            onClick={() => handleLinkClick(link.url!, link.platform)}
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

      {/* Bottom divider line */}
      <div className="h-px bg-[var(--border)] mt-3" />
    </div>
  );
};

export default SocialMediaLinks;
