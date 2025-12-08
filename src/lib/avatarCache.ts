// Avatar cache to reduce egress
const AVATAR_CACHE_KEY = "avatar_cache";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CachedAvatar {
  url: string;
  timestamp: number;
}

interface AvatarCache {
  [userId: string]: CachedAvatar;
}

// Helper functions for avatar caching
export function getCachedAvatar(userId: string): string | null {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!cached) return null;

    const parsed: AvatarCache = JSON.parse(cached);
    const avatarData = parsed[userId];

    if (!avatarData) return null;

    const now = Date.now();
    if (now - avatarData.timestamp < CACHE_DURATION) {
      return avatarData.url;
    }

    // Cache expired, remove it
    delete parsed[userId];
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(parsed));
    return null;
  } catch (error) {
    console.error("Error reading cached avatar:", error);
    return null;
  }
}

export function setCachedAvatar(userId: string, url: string): void {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    const parsed: AvatarCache = cached ? JSON.parse(cached) : {};

    parsed[userId] = {
      url,
      timestamp: Date.now(),
    };

    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error("Error caching avatar:", error);
  }
}

export function preloadAvatar(url: string): void {
  if (!url) return;

  const img = new Image();
  img.src = url;
}
