// src/lib/profileCache.ts
// Cache for profile data and avatars to improve performance
// [OPTIMIZATION: Phase 3.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";
import {
  normalizeEchoPreset,
  normalizeProfilePhotos,
} from "./profilePhotos";

/** Serve from cache with no network while younger than this (connection-scaled). */
export const PROFILE_CACHE_FRESH_MS = 30 * 60 * 1000; // 30 minutes

/** Soft-expire: return immediately + background revalidate while younger than this. */
export const PROFILE_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ProfileCacheEntry {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  // [OPTIMIZATION: Phase 1 - Cache] Privacy settings cached in profile cache
  // Why: Instant display of privacy status without flicker, prevents "Sign in" message
  is_private?: boolean | null;
  social_media_public?: boolean | null;
  /** Own-profile only. Do not display for other users. */
  p2p_discover_enabled?: boolean | null;
  // [PHASE 2.3 - OPTIMIZATION] Add onboarding fields so getProfileByUserId() can be reused everywhere
  // Why: Allows OnboardingWrapper to use getProfileByUserId(), reducing 5 requests to 1
  user_number?: number | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
  timestamp: number;
}

/** Public shape returned from cache getters (no timestamp). */
export type CachedProfileData = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
  p2p_discover_enabled?: boolean | null;
  user_number?: number | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
};

export type SetCachedProfileInput = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_photos?: string[] | null;
  echo_preset?: string | null;
  bio: string | null;
  xp: number | null;
  /**
   * Omit when unknown (thin Feed/list primes). Explicit `null` from a full
   * profile response is authoritative and overwrites a cached number.
   */
  member_no?: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
  p2p_discover_enabled?: boolean | null;
  user_number?: number | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
};

/** True when cache holds a known member number (not thin / unknown). */
export function profileCacheHasUsableMemberNo(data: {
  member_no?: number | null;
}): boolean {
  return data.member_no != null;
}

function resolveCachedMemberNo(
  profileData: SetCachedProfileInput,
  existing: CachedProfileData | null | undefined,
): number | null {
  if (Object.prototype.hasOwnProperty.call(profileData, "member_no")) {
    return profileData.member_no ?? null;
  }
  return existing?.member_no ?? null;
}

export type ProfileCacheHit = {
  data: CachedProfileData;
  ageMs: number;
  /** Younger than fresh TTL — no network needed. */
  fresh: boolean;
  /** Older than max-stale — only use as offline fallback. */
  expired: boolean;
};

const CACHE_KEY = "profile_cache";
const USERNAME_CACHE_KEY = "profile_username_cache";
const STORAGE_PREFIX = "profile:"; // [OPTIMIZATION: Phase 3.2] StorageManager prefix

interface ProfileCache {
  [key: string]: ProfileCacheEntry; // key is profile ID
}

interface UsernameCache {
  [username: string]: string; // username -> profile ID mapping
}

function cacheLog(
  event: "fresh_hit" | "stale_hit" | "revalidate" | "miss" | "expired_fallback",
  extra?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return;
  if (extra) {
    console.debug("[profile-cache]", event, extra);
  } else {
    console.debug("[profile-cache]", event);
  }
}

/** Connection-aware fresh window (slow networks keep cache longer). */
export function getProfileCacheFreshMs(): number {
  try {
    return PROFILE_CACHE_FRESH_MS * getCacheDurationMultiplier();
  } catch {
    return PROFILE_CACHE_FRESH_MS;
  }
}

/** Connection-aware max soft-stale window. */
export function getProfileCacheMaxStaleMs(): number {
  try {
    return PROFILE_CACHE_MAX_STALE_MS * getCacheDurationMultiplier();
  } catch {
    return PROFILE_CACHE_MAX_STALE_MS;
  }
}

function toCachedProfileData(entry: ProfileCacheEntry): CachedProfileData {
  return {
    id: entry.id,
    user_id: entry.user_id,
    username: entry.username,
    display_name: entry.display_name,
    avatar_url: entry.avatar_url,
    profile_photos: normalizeProfilePhotos(entry.profile_photos),
    echo_preset: normalizeEchoPreset(entry.echo_preset),
    bio: entry.bio,
    xp: entry.xp,
    member_no: entry.member_no,
    instagram_url: entry.instagram_url,
    tiktok_url: entry.tiktok_url,
    telegram_url: entry.telegram_url,
    is_private: entry.is_private,
    social_media_public: entry.social_media_public,
    p2p_discover_enabled: entry.p2p_discover_enabled,
    user_number: entry.user_number,
    onboarding_completed: entry.onboarding_completed,
    onboarding_step: entry.onboarding_step,
  };
}

function isValidEntry(entry: unknown): entry is ProfileCacheEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as ProfileCacheEntry;
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    typeof e.user_id === "string" &&
    e.user_id.length > 0 &&
    typeof e.timestamp === "number" &&
    Number.isFinite(e.timestamp)
  );
}

function classifyAge(ageMs: number): { fresh: boolean; expired: boolean } {
  const freshMs = getProfileCacheFreshMs();
  const maxStaleMs = getProfileCacheMaxStaleMs();
  return {
    fresh: ageMs <= freshMs,
    expired: ageMs > maxStaleMs,
  };
}

function hitFromEntry(entry: ProfileCacheEntry): ProfileCacheHit {
  const ageMs = Math.max(0, Date.now() - entry.timestamp);
  const { fresh, expired } = classifyAge(ageMs);
  return {
    data: toCachedProfileData(entry),
    ageMs,
    fresh,
    expired,
  };
}

// [OPTIMIZATION: Phase 3.2] Get StorageManager instance (with fallback)
function getStorage(): {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
} | null {
  try {
    return getStorageManager();
  } catch {
    return null;
  }
}

// [OPTIMIZATION: Phase 3.2] Legacy localStorage fallback for backward compatibility
function getFromLocalStorageLegacy<T>(key: string): T | null {
  try {
    const cacheStr = localStorage.getItem(key);
    return cacheStr ? (JSON.parse(cacheStr) as T) : null;
  } catch {
    return null;
  }
}

function setToLocalStorageLegacy(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error setting ${key} to localStorage:`, error);
  }
}

function readRawEntry(profileId: string): ProfileCacheEntry | null {
  try {
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return null;
    const entry = cache[profileId];
    if (!isValidEntry(entry)) {
      if (entry) {
        delete cache[profileId];
        setToLocalStorageLegacy(CACHE_KEY, cache);
      }
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Inspect cache by profile id (includes expired entries for offline fallback).
 */
export function inspectCachedProfile(
  profileId: string,
): ProfileCacheHit | null {
  const entry = readRawEntry(profileId);
  if (!entry) return null;
  return hitFromEntry(entry);
}

/**
 * Inspect cache by auth user_id.
 */
export function inspectCachedProfileByUserId(
  userId: string,
): ProfileCacheHit | null {
  if (!userId) return null;
  try {
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return null;
    for (const entry of Object.values(cache)) {
      if (!isValidEntry(entry)) continue;
      if (entry.user_id === userId) {
        return hitFromEntry(entry);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isCachedProfileFresh(profileId: string): boolean {
  const hit = inspectCachedProfile(profileId);
  return Boolean(hit && hit.fresh && !hit.expired);
}

/**
 * Get cached profile for rendering.
 * Returns fresh + soft-stale entries (age ≤ max-stale).
 * Does NOT delete soft-stale entries (SWR will refresh in the background).
 */
export function getCachedProfile(profileId: string): CachedProfileData | null {
  try {
    const hit = inspectCachedProfile(profileId);
    if (!hit) {
      cacheLog("miss", { profileId });
      return null;
    }
    if (hit.expired) {
      // Drop permanently-expired rows from the sync map
      const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
      if (cache?.[profileId]) {
        delete cache[profileId];
        setToLocalStorageLegacy(CACHE_KEY, cache);
      }
      cacheLog("miss", { profileId, reason: "expired" });
      return null;
    }
    cacheLog(hit.fresh ? "fresh_hit" : "stale_hit", {
      profileId,
      ageMs: hit.ageMs,
    });
    return hit.data;
  } catch (error) {
    console.error("Error reading profile cache:", error);
    return null;
  }
}

/**
 * Last-known profile even if past max-stale (offline / fetch-failure fallback).
 */
export function peekCachedProfileExpired(
  profileId: string,
): CachedProfileData | null {
  const hit = inspectCachedProfile(profileId);
  if (!hit) return null;
  return hit.data;
}

export function peekCachedProfileByUserIdExpired(
  userId: string,
): CachedProfileData | null {
  const hit = inspectCachedProfileByUserId(userId);
  if (!hit) return null;
  return hit.data;
}

// Helper function to get username cache
function getUsernameCache(): UsernameCache {
  try {
    return getFromLocalStorageLegacy<UsernameCache>(USERNAME_CACHE_KEY) || {};
  } catch (error) {
    console.error("Error reading username cache:", error);
    return {};
  }
}

// Helper function to set username cache
function setUsernameCache(usernameCache: UsernameCache): void {
  try {
    setToLocalStorageLegacy(USERNAME_CACHE_KEY, usernameCache);
  } catch (error) {
    console.error("Error setting username cache:", error);
  }
}

// [OPTIMIZATION: Phase 1 - Cache] Set cached profile data including privacy settings
// Why: Caches privacy settings for instant display and prevents flicker
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
export function setCachedProfile(profileData: SetCachedProfileInput): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${profileData.id}`;

    // [FIX] Preserve onboarding fields when incoming data is partial (e.g. from Post prefetch, FollowListDrawer)
    // Prevents OnboardingWrapper from incorrectly showing onboarding after cache overwrite
    const existing = peekCachedProfileExpired(profileData.id);
    const existingEntry = readRawEntry(profileData.id);
    const incomingUserId = profileData.user_id?.trim() ?? "";
    const user_id =
      incomingUserId && /^[0-9a-f-]{36}$/i.test(incomingUserId)
        ? incomingUserId
        : existing?.user_id && /^[0-9a-f-]{36}$/i.test(existing.user_id)
          ? existing.user_id
          : profileData.user_id;
    const entry: ProfileCacheEntry = {
      ...profileData,
      user_id,
      member_no: resolveCachedMemberNo(profileData, existing),
      profile_photos:
        profileData.profile_photos !== undefined
          ? normalizeProfilePhotos(profileData.profile_photos)
          : (existing?.profile_photos ?? []),
      echo_preset:
        profileData.echo_preset !== undefined
          ? normalizeEchoPreset(profileData.echo_preset)
          : (existing?.echo_preset ?? null),
      p2p_discover_enabled:
        profileData.p2p_discover_enabled !== undefined
          ? profileData.p2p_discover_enabled
          : existing?.p2p_discover_enabled,
      // Preserve onboarding_completed/onboarding_step if incoming does not provide them
      onboarding_completed:
        profileData.onboarding_completed !== undefined
          ? profileData.onboarding_completed
          : existing?.onboarding_completed,
      onboarding_step:
        profileData.onboarding_step !== undefined
          ? profileData.onboarding_step
          : existing?.onboarding_step,
      timestamp: Date.now(),
    };
    const ttl = getProfileCacheMaxStaleMs();

    // [OPTIMIZATION: Phase 3.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn(
          "[ProfileCache] StorageManager failed, using localStorage fallback:",
          error,
        );
      });
    }

    // [OPTIMIZATION: Phase 3.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY) || {};
    cache[profileData.id] = entry;
    setToLocalStorageLegacy(CACHE_KEY, cache);

    // Username index — drop previous username mapping when it changes
    const usernameCache = getUsernameCache();
    const prevUsername = existingEntry?.username?.toLowerCase() ?? null;
    const nextUsername = profileData.username?.toLowerCase() ?? null;
    if (prevUsername && prevUsername !== nextUsername) {
      if (usernameCache[prevUsername] === profileData.id) {
        delete usernameCache[prevUsername];
      }
    }
    if (nextUsername) {
      usernameCache[nextUsername] = profileData.id;
    }
    setUsernameCache(usernameCache);
  } catch (error) {
    console.error("Error setting profile cache:", error);
  }
}

// Clear cached profile data for a specific profile
// [OPTIMIZATION: Phase 3.2] Now clears from both StorageManager and localStorage
export function clearCachedProfile(profileId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${profileId}`;

    // [OPTIMIZATION: Phase 3.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [OPTIMIZATION: Phase 3.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return;

    const profile = cache[profileId];
    if (profile) {
      delete cache[profileId];
      setToLocalStorageLegacy(CACHE_KEY, cache);

      // Also remove from username cache if it exists
      if (profile.username) {
        const usernameCache = getUsernameCache();
        delete usernameCache[profile.username.toLowerCase()];
        setUsernameCache(usernameCache);
      }
    }
  } catch (error) {
    console.error("Error clearing profile cache:", error);
  }
}

// Clear all profile cache
// [OPTIMIZATION: Phase 3.2] Now clears from both StorageManager and localStorage
export function clearAllProfileCache(): void {
  try {
    const storage = getStorage();

    // [OPTIMIZATION: Phase 3.2] Clear all profile entries from StorageManager
    if (storage && storage.keys) {
      storage
        .keys()
        .then((keys: string[]) => {
          const profileKeys = keys.filter((key: string) =>
            key.startsWith(STORAGE_PREFIX),
          );
          return Promise.all(
            profileKeys.map((key: string) => storage!.delete(key)),
          );
        })
        .catch(() => {
          // Ignore errors
        });
    }

    // [OPTIMIZATION: Phase 3.2] Clear from legacy localStorage
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(USERNAME_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all profile cache:", error);
  }
}

// Get cached profile by username or ID (fresh + soft-stale only)
export function getProfileCached(
  usernameOrId: string,
): CachedProfileData | null {
  try {
    // First, try to get by ID if it looks like a UUID
    const isUuid = /^[0-9a-f-]{36}$/i.test(usernameOrId);
    if (isUuid) {
      return getCachedProfile(usernameOrId);
    }

    // If it's not a UUID, treat it as a username
    const usernameCache = getUsernameCache();
    const profileId = usernameCache[usernameOrId.toLowerCase()];

    if (profileId) {
      return getCachedProfile(profileId);
    }

    // Fallback: search through all cached profiles by username (less efficient but works)
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return null;

    const maxStaleMs = getProfileCacheMaxStaleMs();
    for (const entry of Object.values(cache)) {
      if (!isValidEntry(entry)) continue;
      const ageMs = Date.now() - entry.timestamp;
      if (ageMs > maxStaleMs) continue;

      if (
        entry.username &&
        entry.username.toLowerCase() === usernameOrId.toLowerCase()
      ) {
        return toCachedProfileData({
          ...entry,
          member_no: entry.member_no ?? entry.user_number ?? null,
        });
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting cached profile:", error);
    return null;
  }
}

/** @internal DEV diagnostics helper — re-exported for fetch layer. */
export { cacheLog as profileCacheDevLog };

// [OPTIMIZATION: Phase 1 - Cache] Cache a profile (alias for setCachedProfile for backward compatibility)
// Why: Maintains backward compatibility while supporting privacy settings caching
export function primeProfileCache(profileData: SetCachedProfileInput): void {
  setCachedProfile(profileData);
}

// Invalidate profile cache (alias for clearCachedProfile for backward compatibility)
export function invalidateProfile(profileId: string): void {
  clearCachedProfile(profileId);
}

// [OPTIMIZATION: Phase 1 - Cache] Batch cache multiple profiles including privacy settings
// Why: Efficiently caches multiple profiles at once, including privacy status
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
export function setCachedProfiles(
  profiles: Array<SetCachedProfileInput>,
): void {
  try {
    const storage = getStorage();
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY) || {};
    const usernameCache = getUsernameCache();
    const ttl = getProfileCacheMaxStaleMs();

    profiles.forEach((profile) => {
      const existing = peekCachedProfileExpired(profile.id);
      const existingEntry = readRawEntry(profile.id);
      const entry: ProfileCacheEntry = {
        ...profile,
        member_no: resolveCachedMemberNo(profile, existing),
        profile_photos:
          profile.profile_photos !== undefined
            ? normalizeProfilePhotos(profile.profile_photos)
            : (existing?.profile_photos ?? []),
        echo_preset:
          profile.echo_preset !== undefined
            ? normalizeEchoPreset(profile.echo_preset)
            : (existing?.echo_preset ?? null),
        onboarding_completed:
          profile.onboarding_completed !== undefined
            ? profile.onboarding_completed
            : existing?.onboarding_completed,
        onboarding_step:
          profile.onboarding_step !== undefined
            ? profile.onboarding_step
            : existing?.onboarding_step,
        timestamp: Date.now(),
      };
      const storageKey = `${STORAGE_PREFIX}${profile.id}`;

      // [OPTIMIZATION: Phase 3.2] Store in StorageManager
      if (storage) {
        storage.set(storageKey, entry, ttl).catch(() => {
          // Ignore errors
        });
      }

      // [OPTIMIZATION: Phase 3.2] Also store in legacy localStorage
      cache[profile.id] = entry;

      const prevUsername = existingEntry?.username?.toLowerCase() ?? null;
      const nextUsername = profile.username?.toLowerCase() ?? null;
      if (prevUsername && prevUsername !== nextUsername) {
        if (usernameCache[prevUsername] === profile.id) {
          delete usernameCache[prevUsername];
        }
      }
      if (nextUsername) {
        usernameCache[nextUsername] = profile.id;
      }
    });

    setToLocalStorageLegacy(CACHE_KEY, cache);
    setUsernameCache(usernameCache);
  } catch (error) {
    console.error("Error setting multiple profiles cache:", error);
  }
}
