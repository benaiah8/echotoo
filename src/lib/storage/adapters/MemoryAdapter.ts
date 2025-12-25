/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Memory Storage Adapter
 * 
 * Fastest storage tier using in-memory Map.
 * Data is cleared on page refresh.
 * 
 * Best for:
 * - Hot data (frequently accessed)
 * - Small to medium data (< 100KB)
 * - Temporary cache
 */

import {
  type StorageAdapter,
  type StorageEntry,
  StorageError,
  StorageErrorCode,
  isExpired,
} from '../StorageAdapter';

export class MemoryAdapter implements StorageAdapter {
  private cache = new Map<string, StorageEntry<any>>();
  private readonly maxSize: number;

  constructor(maxSize: number = 50 * 1024 * 1024) {
    // 50MB default max size
    this.maxSize = maxSize;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'Memory'
      );
    }

    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'Memory'
      );
    }

    // If value is already a StorageEntry, use it directly
    // Otherwise, wrap it in a StorageEntry
    let entry: StorageEntry<T>;
    if (
      value &&
      typeof value === 'object' &&
      'data' in value &&
      'timestamp' in value
    ) {
      // Already a StorageEntry
      entry = value as StorageEntry<T>;
    } else {
      // Wrap in StorageEntry
      entry = {
        data: value,
        timestamp: Date.now(),
        ttl: ttlMs !== undefined ? ttlMs : undefined,
      };
    }

    // Check size limit (rough estimate)
    const estimatedSize = this.estimateSize(entry);
    const currentUsage = await this.getUsage();
    
    if (currentUsage !== null && currentUsage + estimatedSize > this.maxSize) {
      // Try to free up space by removing expired entries
      this.cleanupExpired();

      // Check again after cleanup
      const newUsage = await this.getUsage();
      if (newUsage !== null && newUsage + estimatedSize > this.maxSize) {
        // Still too large, remove oldest entries (LRU)
        this.evictOldest(estimatedSize);
      }
    }

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      return; // Silently ignore invalid keys
    }

    this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());

    if (!prefix) {
      return allKeys;
    }

    return allKeys.filter((key) => key.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  getType(): string {
    return 'Memory';
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  async getUsage(): Promise<number | null> {
    // Estimate total size
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      // Rough estimate: key size + entry size
      totalSize += this.estimateKeySize(key);
      totalSize += this.estimateSize(entry);
    }

    return totalSize;
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Evict oldest entries to make room
   */
  private evictOldest(neededSpace: number): void {
    // Convert to array and sort by timestamp
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        entry,
        timestamp: entry.timestamp,
      }))
      .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

    let freedSpace = 0;
    const keysToDelete: string[] = [];

    for (const { key, entry } of entries) {
      if (freedSpace >= neededSpace) {
        break;
      }

      const entrySize = this.estimateKeySize(key) + this.estimateSize(entry);
      freedSpace += entrySize;
      keysToDelete.push(key);
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Estimate the size of a storage entry (rough estimate)
   */
  private estimateSize(entry: StorageEntry<any>): number {
    try {
      const json = JSON.stringify(entry);
      return new Blob([json]).size;
    } catch {
      // Fallback: rough estimate
      return 1024; // 1KB default
    }
  }

  /**
   * Estimate the size of a key
   */
  private estimateKeySize(key: string): number {
    // Rough estimate: 2 bytes per character (UTF-16)
    return key.length * 2;
  }
}

