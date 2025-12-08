// src/lib/dataCache.ts
// Simple in-memory cache with TTL for API responses

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly LOCAL_STORAGE_KEY = "echotoo_cache";
  private readonly MAX_CACHE_SIZE = 15; // Maximum number of cached post sets

  constructor() {
    this.loadFromLocalStorage();
  }

  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    const entry = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };

    this.cache.set(key, entry);

    // Also save to localStorage for persistence
    if (key.startsWith("feed:")) {
      this.saveToLocalStorage(key, entry);
    }
  }

  get<T>(key: string): T | null {
    // First check in-memory cache
    const entry = this.cache.get(key);
    if (entry) {
      const isExpired = Date.now() - entry.timestamp > entry.ttl;
      if (isExpired) {
        this.cache.delete(key);
        return null;
      }
      return entry.data as T;
    }

    // If not in memory, try localStorage for feed data
    if (key.startsWith("feed:")) {
      const stored = this.getFromLocalStorage(key);
      if (stored) {
        const isExpired = Date.now() - stored.timestamp > stored.ttl;
        if (isExpired) {
          this.removeFromLocalStorage(key);
          return null;
        }
        // Load back into memory cache
        this.cache.set(key, stored);
        return stored.data as T;
      }
    }

    return null;
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        Object.entries(cacheData).forEach(([key, value]: [string, any]) => {
          if (key.startsWith("feed:")) {
            // Only load feed data, and only if it's not expired
            const isExpired = Date.now() - value.timestamp > value.ttl;
            if (!isExpired) {
              this.cache.set(key, value);
            }
          }
        });
      }
    } catch (error) {
      console.warn("Failed to load cache from localStorage:", error);
    }
  }

  private saveToLocalStorage(key: string, entry: CacheEntry<any>): void {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      const cacheData = stored ? JSON.parse(stored) : {};

      // Remove oldest entries if we exceed max size
      const feedKeys = Object.keys(cacheData).filter((k) =>
        k.startsWith("feed:")
      );
      if (feedKeys.length >= this.MAX_CACHE_SIZE) {
        // Sort by timestamp and remove oldest
        feedKeys.sort(
          (a, b) => cacheData[a].timestamp - cacheData[b].timestamp
        );
        const oldestKey = feedKeys[0];
        delete cacheData[oldestKey];
      }

      cacheData[key] = entry;
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn("Failed to save cache to localStorage:", error);
    }
  }

  private getFromLocalStorage(key: string): CacheEntry<any> | null {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        return cacheData[key] || null;
      }
    } catch (error) {
      console.warn("Failed to get cache from localStorage:", error);
    }
    return null;
  }

  private removeFromLocalStorage(key: string): void {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        delete cacheData[key];
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
      }
    } catch (error) {
      console.warn("Failed to remove cache from localStorage:", error);
    }
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Generate cache key from feed options
  generateFeedKey(opts: {
    type?: string;
    q?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): string {
    const { type, q, tags, limit, offset } = opts;
    return `feed:${type || "all"}:${q || ""}:${tags?.join(",") || ""}:${
      limit || 12
    }:${offset || 0}`;
  }

  // Enhanced cache update that includes related data (follow status, RSVP, profiles)
  async updateFeedCache(newPosts: any[], currentOpts: any): Promise<any[]> {
    const currentKey = this.generateFeedKey(currentOpts);
    const cachedData = this.get<any[]>(currentKey);

    // Always prefetch and cache related data for new posts
    if (newPosts.length > 0) {
      await this.prefetchRelatedData(newPosts);
    }

    if (!cachedData || cachedData.length === 0) {
      // No cached data, just cache the new data
      this.set(currentKey, newPosts, 10 * 60 * 1000); // 10 minutes TTL
      return newPosts;
    }

    // Check if there are new posts at the beginning
    const cachedPostIds = new Set(cachedData.map((post) => post.id));
    const newPostIds = new Set(newPosts.map((post) => post.id));

    // Find truly new posts (not in cache)
    const trulyNewPosts = newPosts.filter(
      (post) => !cachedPostIds.has(post.id)
    );

    if (trulyNewPosts.length > 0) {
      console.log(
        `[DataCache] Found ${trulyNewPosts.length} new posts, updating cache`
      );

      // Remove oldest posts to make room for new ones, keeping total around limit
      const limit = currentOpts.limit || 15;
      const updatedCache = [...trulyNewPosts, ...cachedData].slice(0, limit);

      this.set(currentKey, updatedCache, 10 * 60 * 1000);
      return updatedCache;
    }

    // No new posts, return cached data for faster loading
    console.log("[DataCache] Using cached data, no new posts found");
    return cachedData;
  }

  // Prefetch related data for posts (follow status, RSVP, profiles)
  async prefetchRelatedData(posts: any[]): Promise<void> {
    try {
      // Import cache functions dynamically to avoid circular dependencies
      const { getCachedFollowStatus, setCachedFollowStatus } = await import(
        "./followCache"
      );
      const { getCachedRSVPData, setCachedRSVPData } = await import(
        "./rsvpCache"
      );
      const { getCachedProfile, setCachedProfile } = await import(
        "./profileCache"
      );
      const { supabase } = await import("../lib/supabaseClient");

      // Get current user for follow status checks
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      if (!currentUserId) return;

      // Test RSVP table access first
      try {
        const { data: testData, error: testError } = await supabase
          .from("rsvp_responses")
          .select("id")
          .limit(1);

        if (testError) {
          console.error(
            "[DataCache] RSVP table access test failed:",
            testError
          );
          // Skip RSVP prefetching if table is not accessible
          return;
        }
      } catch (testErr) {
        console.error("[DataCache] RSVP table access test exception:", testErr);
        return;
      }

      // Get profile ID for current user
      const { data: currentUserProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", currentUserId)
        .single();

      if (!currentUserProfile) return;

      // Prefetch follow statuses for all post authors
      const authorIds = [...new Set(posts.map((post) => post.author_id))];

      for (const authorId of authorIds) {
        if (authorId !== currentUserProfile.id) {
          const cachedFollowStatus = getCachedFollowStatus(
            currentUserProfile.id,
            authorId
          );
          if (!cachedFollowStatus) {
            try {
              const { count, error: followError } = await supabase
                .from("follows")
                .select("*", { count: "exact", head: true })
                .eq("follower_id", currentUserProfile.id)
                .eq("following_id", authorId);

              if (followError) {
                console.error(
                  `[DataCache] Follow query error for author ${authorId}:`,
                  followError
                );
                continue; // Skip this author if follow query fails
              }

              const status = (count ?? 0) > 0 ? "following" : "none";
              setCachedFollowStatus(currentUserProfile.id, authorId, status);
            } catch (error) {
              console.error(
                `[DataCache] Follow prefetch error for author ${authorId}:`,
                error
              );
            }
          }
        }
      }

      // Prefetch RSVP data for hangout posts
      const hangoutPosts = posts.filter((post) => post.type === "hangout");

      for (const post of hangoutPosts) {
        const cachedRSVP = getCachedRSVPData(post.id);
        if (!cachedRSVP) {
          try {
            // Get RSVP responses
            const { data: rsvpData, error: rsvpDataError } = await supabase
              .from("rsvp_responses")
              .select("id, user_id, status")
              .eq("post_id", post.id)
              .eq("status", "going")
              .order("created_at", { ascending: false })
              .limit(10);

            if (rsvpDataError) {
              console.error(
                `[DataCache] RSVP data query error for post ${post.id}:`,
                rsvpDataError
              );
              continue; // Skip this post if RSVP query fails
            }

            if (rsvpData && rsvpData.length > 0) {
              // Get user profiles for RSVP users
              const authUserIds = rsvpData.map((item) => item.user_id);
              const { data: profilesData, error: profilesError } =
                await supabase
                  .from("profiles")
                  .select("id, user_id, username, display_name, avatar_url")
                  .in("user_id", authUserIds);

              if (profilesError) {
                console.error(
                  `[DataCache] Profiles query error for RSVP users:`,
                  profilesError
                );
                continue; // Skip this post if profiles query fails
              }

              const users = rsvpData.map((item) => {
                const profile = profilesData?.find(
                  (p) => p.user_id === item.user_id
                );
                return {
                  id: profile?.id || item.user_id,
                  username: profile?.username || null,
                  display_name: profile?.display_name || null,
                  avatar_url: profile?.avatar_url || null,
                  status: item.status,
                  created_at: new Date().toISOString(), // Use current time as fallback
                };
              });

              // Get current user's RSVP status
              const { data: currentUserRsvpData, error: rsvpError } =
                await supabase
                  .from("rsvp_responses")
                  .select("status")
                  .eq("post_id", post.id)
                  .eq("user_id", currentUserId)
                  .maybeSingle(); // Use maybeSingle instead of single to avoid errors when no data exists

              if (rsvpError) {
                console.error(
                  `[DataCache] RSVP query error for post ${post.id}:`,
                  rsvpError
                );
                // Continue without RSVP data rather than failing
              }

              setCachedRSVPData(
                post.id,
                users,
                currentUserRsvpData?.status || null
              );
            }
          } catch (error) {
            console.warn("Failed to prefetch RSVP data:", error);
          }
        }
      }

      // Prefetch profile data for all authors
      const profileIds = [
        ...new Set(posts.map((post) => post.author?.id).filter(Boolean)),
      ];

      for (const profileId of profileIds) {
        const cachedProfile = getCachedProfile(profileId);
        if (!cachedProfile) {
          try {
            const { data: profileData } = await supabase
              .from("profiles")
              .select(
                "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
              )
              .eq("id", profileId)
              .single();

            if (profileData) {
              setCachedProfile(profileData);
            }
          } catch (error) {
            console.warn("Failed to prefetch profile data:", error);
          }
        }
      }

      console.log(
        "[DataCache] Successfully prefetched related data for",
        posts.length,
        "posts"
      );
    } catch (error) {
      console.warn("[DataCache] Failed to prefetch related data:", error);
    }
  }

  // Prefetch related data
  async prefetchFeedData(currentOpts: any): Promise<void> {
    // Prefetch next page
    const nextPageOpts = {
      ...currentOpts,
      offset: (currentOpts.offset || 0) + (currentOpts.limit || 12),
    };

    const nextPageKey = this.generateFeedKey(nextPageOpts);

    // Only prefetch if not already cached
    if (!this.cache.has(nextPageKey)) {
      console.log("[DataCache] Prefetching next page:", nextPageOpts);

      // Import getPublicFeed dynamically to avoid circular dependency
      try {
        const { getPublicFeed } = await import("../api/queries/getPublicFeed");
        const nextPageData = await getPublicFeed(nextPageOpts);

        // Cache the prefetched data
        this.set(nextPageKey, nextPageData, 2 * 60 * 1000); // 2 minutes TTL
        console.log("[DataCache] Successfully prefetched and cached next page");
      } catch (error) {
        console.log("[DataCache] Failed to prefetch next page:", error);
      }
    }
  }

  // Prefetch user profiles for posts being displayed
  async prefetchUserProfiles(userIds: string[]): Promise<void> {
    // This would integrate with your user profile fetching system
    console.log("[DataCache] Prefetching user profiles for:", userIds);
    // Implementation would depend on your profile fetching endpoint
  }
}

// Export singleton instance
export const dataCache = new DataCache();

// Helper function to cache feed results
export function cacheFeedResult(
  key: string,
  data: any[],
  ttlMs: number = 2 * 60 * 1000
): void {
  dataCache.set(key, data, ttlMs);
}

// Helper function to get cached feed result
export function getCachedFeedResult<T>(key: string): T[] | null {
  return dataCache.get<T[]>(key);
}
