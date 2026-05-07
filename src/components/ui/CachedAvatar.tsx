// src/components/ui/CachedAvatar.tsx
import { useState, useEffect, useMemo } from "react";
import { avatarDisplayUrl } from "../../lib/avatarDisplayUrl";
import {
  getCachedAvatar,
  setCachedAvatar,
  preloadAvatar,
  clearCachedAvatar,
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
  const [imgFailed, setImgFailed] = useState(false);

  /** Non-empty prop always wins over persisted cache (same rule as `Avatar`). */
  const resolvedSource = useMemo(() => {
    const t = avatarUrl != null ? String(avatarUrl).trim() : "";
    if (t !== "") return avatarUrl!;
    return getCachedAvatar(profileId) ?? null;
  }, [profileId, avatarUrl]);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedSource, profileId]);

  useEffect(() => {
    if (resolvedSource == null || String(resolvedSource).trim() === "") return;
    const cached = getCachedAvatar(profileId);
    if (cached !== resolvedSource) {
      setCachedAvatar(profileId, resolvedSource);
      preloadAvatar(resolvedSource);
    }
  }, [profileId, resolvedSource]);

  const resolved = imgFailed ? null : avatarDisplayUrl(resolvedSource);
  if (!resolvedSource || !resolved) {
    return <div className={`${className} bg-white/15`} />;
  }

  return (
    <img
      src={resolved}
      className={className}
      alt={alt}
      onLoad={() => {
        setCachedAvatar(profileId, resolvedSource);
      }}
      onError={() => {
        clearCachedAvatar(profileId);
        setImgFailed(true);
      }}
    />
  );
}
