/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * LocalStorage Storage Adapter
 * 
 * Persistent storage using browser localStorage.
 * Data persists across page refreshes.
 * 
 * Best for:
 * - Medium data (< 5MB)
 * - Frequently accessed data
 * - User preferences
 * - Feed cache
 * 
 * Limitations:
 * - ~5-10MB browser limit
 * - Synchronous API (wrapped in Promise for consistency)
 * - PWA compatibility issues (handled with retry logic)
 */

import {
  type StorageAdapter,
  type StorageEntry,
  StorageError,
  StorageErrorCode,
  isExpired,
} from '../StorageAdapter';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly prefix: string;
  private readonly maxSize: number;
  private readonly retryDelay: number = 100; // 100ms retry delay for PWA

  constructor(prefix: string = 'storage:', maxSize: number = 5 * 1024 * 1024) {
    // 5MB default max size
    this.prefix = prefix;
    this.maxSize = maxSize;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'LocalStorage'
      );
    }

    if (!this.isAvailable()) {
      return null;
    }

    const fullKey = this.getFullKey(key);

    try {
      const stored = this.getItemWithRetry(fullKey);
      if (!stored) {
        return null;
      }

      const entry: StorageEntry<T> = JSON.parse(stored);

      // Check if expired
      if (isExpired(entry)) {
        await this.delete(key); // Clean up expired entry
        return null;
      }

      return entry.data;
    } catch (error) {
      // If parsing fails, the entry is corrupted - delete it
      try {
        localStorage.removeItem(fullKey);
      } catch {
        // Ignore delete errors
      }

      console.warn('[LocalStorageAdapter] Failed to parse stored value:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'LocalStorage'
      );
    }

    if (!this.isAvailable()) {
      throw new StorageError(
        'LocalStorage is not available',
        StorageErrorCode.NOT_SUPPORTED,
        'LocalStorage'
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

    const fullKey = this.getFullKey(key);
    const serialized = JSON.stringify(entry);

    // Check size limit
    const estimatedSize = new Blob([serialized]).size;
    const currentUsage = await this.getUsage();

    if (currentUsage !== null && currentUsage + estimatedSize > this.maxSize) {
      // Try to free up space by removing expired entries
      await this.cleanupExpired();

      // Check again after cleanup
      const newUsage = await this.getUsage();
      if (newUsage !== null && newUsage + estimatedSize > this.maxSize) {
        // Still too large, remove oldest entries
        await this.evictOldest(estimatedSize);
      }
    }

    try {
      this.setItemWithRetry(fullKey, serialized);
    } catch (error: any) {
      // Handle quota exceeded errors
      if (
        error?.name === 'QuotaExceededError' ||
        error?.code === 22 ||
        error?.code === 1014
      ) {
        // Try to free up space
        await this.cleanupExpired();
        await this.evictOldest(estimatedSize);

        // Retry once
        try {
          this.setItemWithRetry(fullKey, serialized);
        } catch (retryError: any) {
          throw new StorageError(
            'LocalStorage quota exceeded',
            StorageErrorCode.QUOTA_EXCEEDED,
            'LocalStorage'
          );
        }
      } else {
        throw new StorageError(
          `Failed to store value: ${error?.message || String(error)}`,
          StorageErrorCode.ADAPTER_ERROR,
          'LocalStorage'
        );
      }
    }
  }

  async delete(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      return; // Silently ignore invalid keys
    }

    if (!this.isAvailable()) {
      return;
    }

    const fullKey = this.getFullKey(key);

    try {
      localStorage.removeItem(fullKey);
    } catch (error) {
      // Ignore errors (localStorage might be disabled)
      console.warn('[LocalStorageAdapter] Failed to delete key:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }

    if (!this.isAvailable()) {
      return false;
    }

    const fullKey = this.getFullKey(key);

    try {
      const stored = this.getItemWithRetry(fullKey);
      if (!stored) {
        return false;
      }

      const entry: StorageEntry<any> = JSON.parse(stored);

      // Check if expired
      if (isExpired(entry)) {
        await this.delete(key); // Clean up expired entry
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const allKeys: string[] = [];
    const searchPrefix = prefix ? this.getFullKey(prefix) : this.prefix;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(searchPrefix)) {
          // Remove prefix to get the original key
          const originalKey = key.substring(this.prefix.length);
          allKeys.push(originalKey);
        }
      }
    } catch (error) {
      console.warn('[LocalStorageAdapter] Failed to get keys:', error);
    }

    return allKeys;
  }

  async clear(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      const keysToDelete: string[] = [];

      // Collect all keys with our prefix
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToDelete.push(key);
        }
      }

      // Delete all collected keys
      keysToDelete.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore individual delete errors
        }
      });
    } catch (error) {
      console.warn('[LocalStorageAdapter] Failed to clear storage:', error);
    }
  }

  getType(): string {
    return 'LocalStorage';
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  async getUsage(): Promise<number | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      let totalSize = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          const value = localStorage.getItem(key);
          if (value) {
            // Rough estimate: key size + value size
            totalSize += new Blob([key]).size;
            totalSize += new Blob([value]).size;
          }
        }
      }

      return totalSize;
    } catch {
      return null;
    }
  }

  /**
   * Check if localStorage is available
   */
  private isAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get item with retry logic (for PWA compatibility)
   */
  private getItemWithRetry(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      // PWA compatibility: localStorage might not be ready immediately
      // Return null and let the caller handle retry at a higher level
      console.warn('[LocalStorageAdapter] Failed to get item, will retry:', error);
      return null;
    }
  }

  /**
   * Set item with retry logic (for PWA compatibility)
   */
  private setItemWithRetry(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // If it's a quota error, throw it so caller can handle
      if (
        (error as any)?.name === 'QuotaExceededError' ||
        (error as any)?.code === 22 ||
        (error as any)?.code === 1014
      ) {
        throw error;
      }
      // For other errors, try once more after delay (PWA compatibility)
      try {
        setTimeout(() => {
          localStorage.setItem(key, value);
        }, this.retryDelay);
      } catch (retryError) {
        throw retryError;
      }
    }
  }

  /**
   * Clean up expired entries
   */
  private async cleanupExpired(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const keysToDelete: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          const stored = this.getItemWithRetry(key);
          if (stored) {
            try {
              const entry: StorageEntry<any> = JSON.parse(stored);
              if (isExpired(entry)) {
                keysToDelete.push(key);
              }
            } catch {
              // Corrupted entry, delete it
              keysToDelete.push(key);
            }
          }
        }
      }
    } catch (error) {
      console.warn('[LocalStorageAdapter] Failed to cleanup expired entries:', error);
    }

    // Delete expired entries
    keysToDelete.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore individual delete errors
      }
    });
  }

  /**
   * Evict oldest entries to make room
   */
  private async evictOldest(neededSpace: number): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const entries: Array<{ key: string; timestamp: number; size: number }> = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          const stored = this.getItemWithRetry(key);
          if (stored) {
            try {
              const entry: StorageEntry<any> = JSON.parse(stored);
              const size = new Blob([stored]).size;
              entries.push({
                key,
                timestamp: entry.timestamp,
                size,
              });
            } catch {
              // Corrupted entry, skip it
            }
          }
        }
      }
    } catch (error) {
      console.warn('[LocalStorageAdapter] Failed to evict oldest entries:', error);
      return;
    }

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Delete oldest entries until we have enough space
    let freedSpace = 0;
    const keysToDelete: string[] = [];

    for (const entry of entries) {
      if (freedSpace >= neededSpace) {
        break;
      }

      freedSpace += entry.size;
      keysToDelete.push(entry.key);
    }

    // Delete selected keys
    keysToDelete.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore individual delete errors
      }
    });
  }
}

