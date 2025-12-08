// src/components/ui/CachedAvatar.tsx
import { useState, useEffect } from "react";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
} from "../../lib/avatarCache";

interface CachedAvatarProps {
  profileId: string;
  avatarUrl: string | null;
  className?: string;
  alt?: string;
}

export default function CachedAvatar({
  profileId,
  avatarUrl,
  className = "w-9 h-9 rounded-full object-cover",
  alt = "Profile picture",
}: CachedAvatarProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!avatarUrl) {
      setDisplayUrl(null);
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cachedUrl = getCachedAvatar(profileId);
    if (cachedUrl) {
      setDisplayUrl(cachedUrl);
      setIsLoading(false);
      return;
    }

    // If not cached, show the URL and preload for next time
    setDisplayUrl(avatarUrl);
    setIsLoading(false);

    // Preload and cache for next time
    preloadAvatar(avatarUrl);
    setCachedAvatar(profileId, avatarUrl);
  }, [profileId, avatarUrl]);

  if (!displayUrl) {
    return <div className={`${className} bg-white/15`} />;
  }

  return (
    <img
      src={displayUrl}
      className={className}
      alt={alt}
      onLoad={() => {
        // Cache the URL when it loads successfully
        setCachedAvatar(profileId, displayUrl);
      }}
      onError={() => {
        // Don't show broken images
        setDisplayUrl(null);
      }}
    />
  );
}
