/**
 * [OPTIMIZATION FILE: Phase 8]
 * 
 * Storage metrics and quota measurement utilities
 * 
 * Optimizations included:
 * - localStorage quota measurement
 * - Cache size analysis
 * - Storage usage reporting
 * 
 * Related optimizations:
 * - See: All cache files (profileCache, followStatusCache, etc.)
 */

export interface StorageMetrics {
  used: number; // Bytes used
  available: number; // Bytes available (estimated)
  quota: number; // Total quota (if available)
  usagePercent: number; // Percentage of quota used
  isEstimate: boolean; // Whether quota is an estimate
}

export interface CacheSizeInfo {
  cacheName: string;
  size: number; // Bytes
  itemCount: number; // Number of items cached
  averageItemSize: number; // Average bytes per item
}

/**
 * [OPTIMIZATION: Phase 8.1.1] Get localStorage quota information
 * Why: Monitor storage usage to identify when IndexedDB migration might be needed
 * 
 * @returns Storage metrics including used, available, and quota
 */
export async function getLocalStorageMetrics(): Promise<StorageMetrics> {
  // Check if StorageManager API is available (Chrome/Edge)
  if ("storage" in navigator && "estimate" in (navigator as any).storage) {
    try {
      const estimate = await (navigator as any).storage.estimate();
      if (estimate.quota && estimate.usage) {
        const quota = estimate.quota;
        const used = estimate.usage;
        const available = quota - used;
        return {
          used,
          available,
          quota,
          usagePercent: (used / quota) * 100,
          isEstimate: false,
        };
      }
    } catch (error) {
      console.warn("[StorageMetrics] StorageManager.estimate() failed:", error);
    }
  }

  // Fallback: Estimate based on localStorage
  try {
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || "";
        totalSize += key.length + value.length;
      }
    }

    // Most browsers give ~5-10MB for localStorage
    // Use 5MB as conservative estimate
    const estimatedQuota = 5 * 1024 * 1024; // 5MB
    const used = totalSize * 2; // Rough estimate (UTF-16 encoding doubles size)

    return {
      used,
      available: estimatedQuota - used,
      quota: estimatedQuota,
      usagePercent: (used / estimatedQuota) * 100,
      isEstimate: true,
    };
  } catch (error) {
    console.error("[StorageMetrics] Failed to calculate localStorage size:", error);
    return {
      used: 0,
      available: 0,
      quota: 0,
      usagePercent: 0,
      isEstimate: true,
    };
  }
}

/**
 * [OPTIMIZATION: Phase 8.1.1] Get size of a specific localStorage key
 */
export function getLocalStorageKeySize(key: string): number {
  try {
    const value = localStorage.getItem(key);
    if (!value) return 0;
    // UTF-16 encoding: 2 bytes per character
    return (key.length + value.length) * 2;
  } catch (error) {
    return 0;
  }
}

/**
 * [OPTIMIZATION: Phase 8.1.2] Analyze cache sizes
 * Why: Identify which caches are large and might benefit from IndexedDB
 */
export function analyzeCacheSizes(): CacheSizeInfo[] {
  const cacheKeys = [
    "profile_cache",
    "follow_status_cache",
    "avatar_cache",
    "profile_posts_cache",
    "follow_counts_cache",
    "rsvp_cache",
    "notification_settings_cache",
    "invite_status_cache",
    "data_cache",
    "page_cache",
    "privacy_cache",
  ];

  const results: CacheSizeInfo[] = [];

  for (const cacheKey of cacheKeys) {
    try {
      const value = localStorage.getItem(cacheKey);
      if (!value) continue;

      const size = getLocalStorageKeySize(cacheKey);
      
      // Try to count items in cache (different formats)
      let itemCount = 0;
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          itemCount = parsed.length;
        } else if (typeof parsed === "object") {
          itemCount = Object.keys(parsed).length;
        }
      } catch {
        // Can't parse, skip item count
      }

      results.push({
        cacheName: cacheKey,
        size,
        itemCount,
        averageItemSize: itemCount > 0 ? size / itemCount : 0,
      });
    } catch (error) {
      // Skip this cache if we can't read it
    }
  }

  // Sort by size (largest first)
  return results.sort((a, b) => b.size - a.size);
}

/**
 * [OPTIMIZATION: Phase 8.1.1] Get comprehensive storage report
 * Why: Single function to get all storage metrics and cache analysis
 */
export async function getStorageReport(): Promise<{
  metrics: StorageMetrics;
  cacheSizes: CacheSizeInfo[];
  totalCacheSize: number;
}> {
  const metrics = await getLocalStorageMetrics();
  const cacheSizes = analyzeCacheSizes();
  const totalCacheSize = cacheSizes.reduce((sum, cache) => sum + cache.size, 0);

  return {
    metrics,
    cacheSizes,
    totalCacheSize,
  };
}

/**
 * [OPTIMIZATION: Phase 8.1.1] Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * [OPTIMIZATION: Phase 8.1.1] Log storage report to console (for debugging)
 */
export async function logStorageReport(): Promise<void> {
  const report = await getStorageReport();
  
  console.group("[StorageMetrics] Storage Report");
  console.log("Total Usage:", formatBytes(report.metrics.used));
  console.log("Available:", formatBytes(report.metrics.available));
  console.log("Quota:", formatBytes(report.metrics.quota));
  console.log("Usage:", report.metrics.usagePercent.toFixed(2) + "%");
  console.log("Quota is estimate:", report.metrics.isEstimate);
  console.log("\nCache Sizes:");
  report.cacheSizes.forEach((cache) => {
    console.log(
      `  ${cache.cacheName}: ${formatBytes(cache.size)} (${cache.itemCount} items, avg: ${formatBytes(cache.averageItemSize)}/item)`
    );
  });
  console.log("\nTotal Cache Size:", formatBytes(report.totalCacheSize));
  console.groupEnd();
}

