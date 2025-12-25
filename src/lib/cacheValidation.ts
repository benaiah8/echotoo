/**
 * [PHASE 2.2] Cache Validation Utility
 * 
 * Provides unified cache validation logic for consistent cache management
 * across the application.
 * 
 * Features:
 * - Cache entry validation (expiration, schema version)
 * - Stale-while-revalidate detection
 * - TTL management (connection-aware)
 * - New post detection (Twitter-style)
 * - Cache versioning for schema changes
 */

import type { ConnectionInfo } from './connectionAware';
import { getConnectionInfo, isSlowConnection } from './connectionAware';

/**
 * Cache entry structure
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  version?: string; // Schema version for cache invalidation
}

/**
 * Cache validation result
 */
export interface CacheValidationResult {
  isValid: boolean;
  shouldRevalidate: boolean; // Stale but usable
  reason?: string; // Reason for invalidation
}

/**
 * TTL configuration by data type
 */
const TTL_CONFIG: Record<string, number> = {
  feed: 10 * 60 * 1000, // 10 minutes
  profile: 15 * 60 * 1000, // 15 minutes
  follow: 30 * 60 * 1000, // 30 minutes
  rsvp: 5 * 60 * 1000, // 5 minutes
  image: 7 * 24 * 60 * 60 * 1000, // 7 days
  static: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Current cache schema version
 * Bump this when FeedItem structure or API response format changes
 */
export const CACHE_SCHEMA_VERSION = 'v1';

/**
 * Smart Cache Validator
 * 
 * Provides unified cache validation logic
 */
export class SmartCacheValidator {
  /**
   * Check if cache entry is valid
   */
  isValid<T>(key: string, entry: CacheEntry<T> | null): boolean {
    if (!entry) {
      return false;
    }

    // Check expiration
    const now = Date.now();
    const isExpired = entry.ttl > 0 && (now - entry.timestamp > entry.ttl);
    if (isExpired) {
      return false;
    }

    // Check schema version (if versioned)
    if (entry.version && entry.version !== CACHE_SCHEMA_VERSION) {
      return false;
    }

    return true;
  }

  /**
   * Check if should revalidate (stale but usable)
   * Returns true if cache is stale but still usable (for stale-while-revalidate pattern)
   */
  shouldRevalidate<T>(key: string, entry: CacheEntry<T> | null): boolean {
    if (!entry) {
      return false;
    }

    // If expired, don't revalidate (should be invalid)
    if (!this.isValid(key, entry)) {
      return false;
    }

    // Check if stale (within revalidation window)
    const now = Date.now();
    const age = now - entry.timestamp;
    const staleThreshold = entry.ttl * 0.8; // Revalidate when 80% of TTL has passed

    return age > staleThreshold;
  }

  /**
   * Get TTL for data type
   * Returns connection-aware TTL
   */
  getTTL(dataType: string, connectionInfo?: ConnectionInfo): number {
    const baseTtl = TTL_CONFIG[dataType] || TTL_CONFIG.feed;
    
    // Adjust for connection speed
    if (!connectionInfo) {
      connectionInfo = getConnectionInfo();
    }

    if (isSlowConnection()) {
      // 3x longer on slow connections
      return baseTtl * 3;
    }

    return baseTtl;
  }

  /**
   * Detect new posts (Twitter-style)
   * Compares first post ID from cache vs fresh data
   * Returns array of new posts (posts not in cache)
   */
  detectNewPosts<T extends { id: string }>(
    cached: T[],
    fresh: T[]
  ): T[] {
    if (!cached || cached.length === 0) {
      return fresh; // All posts are new if no cache
    }

    if (!fresh || fresh.length === 0) {
      return []; // No new posts if fresh is empty
    }

    // Twitter-style: Compare first post ID
    // If first post ID is different, there are new posts
    const cachedFirstId = cached[0]?.id;
    const freshFirstId = fresh[0]?.id;

    if (cachedFirstId !== freshFirstId) {
      // First post is different, find all new posts
      const cachedIds = new Set(cached.map((post) => post.id));
      return fresh.filter((post) => !cachedIds.has(post.id));
    }

    // First post is same, no new posts
    return [];
  }

  /**
   * Validate cache entry with detailed result
   */
  validate<T>(key: string, entry: CacheEntry<T> | null): CacheValidationResult {
    if (!entry) {
      return {
        isValid: false,
        shouldRevalidate: false,
        reason: 'Entry not found',
      };
    }

    // Check expiration
    const now = Date.now();
    const isExpired = entry.ttl > 0 && (now - entry.timestamp > entry.ttl);
    if (isExpired) {
      return {
        isValid: false,
        shouldRevalidate: false,
        reason: 'Entry expired',
      };
    }

    // Check schema version
    if (entry.version && entry.version !== CACHE_SCHEMA_VERSION) {
      return {
        isValid: false,
        shouldRevalidate: false,
        reason: `Schema version mismatch: ${entry.version} !== ${CACHE_SCHEMA_VERSION}`,
      };
    }

    // Check if stale (for revalidation)
    const age = now - entry.timestamp;
    const staleThreshold = entry.ttl * 0.8;
    const shouldRevalidate = age > staleThreshold;

    return {
      isValid: true,
      shouldRevalidate,
      reason: shouldRevalidate ? 'Stale but usable' : 'Valid',
    };
  }

  /**
   * Create cache entry with proper metadata
   */
  createEntry<T>(
    data: T,
    ttl: number,
    version?: string
  ): CacheEntry<T> {
    return {
      data,
      timestamp: Date.now(),
      ttl,
      version: version || CACHE_SCHEMA_VERSION,
    };
  }
}

// Export singleton instance
export const cacheValidator = new SmartCacheValidator();

/**
 * Helper function to check if cache entry is valid
 */
export function isValid<T>(entry: CacheEntry<T> | null): boolean {
  return cacheValidator.isValid('', entry);
}

/**
 * Helper function to check if should revalidate
 */
export function shouldRevalidate<T>(entry: CacheEntry<T> | null): boolean {
  return cacheValidator.shouldRevalidate('', entry);
}

/**
 * Helper function to get TTL for data type
 */
export function getTTL(dataType: string, connectionInfo?: ConnectionInfo): number {
  return cacheValidator.getTTL(dataType, connectionInfo);
}

/**
 * Helper function to detect new posts
 */
export function detectNewPosts<T extends { id: string }>(
  cached: T[],
  fresh: T[]
): T[] {
  return cacheValidator.detectNewPosts(cached, fresh);
}

