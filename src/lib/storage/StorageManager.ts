/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Storage Manager
 * 
 * Coordinates multiple storage adapters (Memory → LocalStorage → IndexedDB)
 * Provides automatic tier selection, migration, and error handling.
 * 
 * Usage:
 * ```typescript
 * const storage = new StorageManager({
 *   defaultTtl: 10 * 60 * 1000, // 10 minutes
 *   connectionAware: true,
 * });
 * 
 * // Store data (automatically chooses best tier)
 * await storage.set('feed:home', posts, 10 * 60 * 1000);
 * 
 * // Retrieve data (tries tiers in order)
 * const posts = await storage.get<Post[]>('feed:home');
 * ```
 */

import {
  type StorageAdapter,
  type StorageOptions,
  type StorageResult,
  type StorageEntry,
  StorageError,
  StorageErrorCode,
  isExpired,
  createStorageEntry,
  adjustTtlForConnection,
} from './StorageAdapter';

// Re-export StorageOptions for convenience
export type { StorageOptions };

/**
 * Storage Manager
 * 
 * Manages multiple storage tiers and automatically selects the best tier
 * for each operation based on size, frequency, and availability.
 */
export class StorageManager {
  private adapters: StorageAdapter[] = [];
  private options: Required<StorageOptions>;

  constructor(options: StorageOptions = {}) {
    this.options = {
      defaultTtl: options.defaultTtl ?? 5 * 60 * 1000, // 5 minutes default
      connectionAware: options.connectionAware ?? true,
      adapters: options.adapters ?? [],
      autoMigrate: options.autoMigrate ?? true,
      maxMemorySize: options.maxMemorySize ?? 50 * 1024 * 1024, // 50MB
      maxLocalStorageSize: options.maxLocalStorageSize ?? 5 * 1024 * 1024, // 5MB
    };

    // Use provided adapters or empty array (adapters will be added later)
    this.adapters = this.options.adapters;
  }

  /**
   * Add a storage adapter
   * Adapters are tried in the order they are added
   */
  addAdapter(adapter: StorageAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Remove a storage adapter
   */
  removeAdapter(adapter: StorageAdapter): void {
    const index = this.adapters.indexOf(adapter);
    if (index > -1) {
      this.adapters.splice(index, 1);
    }
  }

  /**
   * Get a value from storage
   * Tries adapters in order until a value is found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY
      );
    }

    // Try each adapter in order
    for (const adapter of this.adapters) {
      try {
        const entry = await adapter.get<StorageEntry<T>>(key);
        
        if (entry) {
          // Check if expired
          if (isExpired(entry)) {
            // Delete expired entry
            await adapter.delete(key).catch(() => {
              // Ignore delete errors
            });
            continue; // Try next adapter
          }

          // Return the data
          return entry.data;
        }
      } catch (error) {
        // Log error but continue to next adapter
        console.warn(
          `[StorageManager] Error reading from ${adapter.getType()}:`,
          error
        );
        continue;
      }
    }

    // Not found in any adapter
    return null;
  }

  /**
   * Set a value in storage
   * Automatically selects the best tier based on size and availability
   */
  async set<T>(
    key: string,
    value: T,
    ttlMs?: number
  ): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY
      );
    }

    // Use default TTL if not provided
    const baseTtl = ttlMs ?? this.options.defaultTtl;

    // Adjust TTL for connection speed if enabled
    const adjustedTtl = this.options.connectionAware
      ? adjustTtlForConnection(baseTtl)
      : baseTtl;

    // Create storage entry
    const entry = createStorageEntry(value, adjustedTtl);

    // Estimate size (rough estimate)
    const estimatedSize = this.estimateSize(entry);

    // Select best adapter based on size and availability
    const adapter = await this.selectAdapter(estimatedSize);

    if (!adapter) {
      throw new StorageError(
        'No available storage adapter',
        StorageErrorCode.NOT_SUPPORTED
      );
    }

    try {
      // Store in selected adapter
      await adapter.set(key, entry, 0); // TTL is handled in entry metadata

      // If auto-migration is enabled and data is large, also store in IndexedDB
      if (
        this.options.autoMigrate &&
        estimatedSize > 100 * 1024 && // > 100KB
        adapter.getType() !== 'IndexedDB'
      ) {
        const indexedDBAdapter = this.adapters.find(
          (a) => a.getType() === 'IndexedDB'
        );
        if (indexedDBAdapter) {
          // Store in IndexedDB as backup (don't await, fire and forget)
          indexedDBAdapter.set(key, entry, 0).catch(() => {
            // Ignore errors for backup storage
          });
        }
      }
    } catch (error: any) {
      // Handle quota exceeded errors
      if (error?.code === StorageErrorCode.QUOTA_EXCEEDED) {
        // Try next tier
        const nextAdapter = this.getNextAdapter(adapter);
        if (nextAdapter) {
          return this.set(key, value, ttlMs);
        }
      }

      throw new StorageError(
        `Failed to store value: ${error?.message || String(error)}`,
        StorageErrorCode.ADAPTER_ERROR,
        adapter.getType()
      );
    }
  }

  /**
   * Delete a value from storage
   * Deletes from all adapters
   */
  async delete(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY
      );
    }

    // Delete from all adapters (best effort)
    const promises = this.adapters.map((adapter) =>
      adapter.delete(key).catch((error) => {
        console.warn(
          `[StorageManager] Error deleting from ${adapter.getType()}:`,
          error
        );
      })
    );

    await Promise.all(promises);
  }

  /**
   * Check if a key exists in storage
   */
  async has(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }

    // Check each adapter in order
    for (const adapter of this.adapters) {
      try {
        if (await adapter.has(key)) {
          const entry = await adapter.get<StorageEntry<any>>(key);
          if (entry && !isExpired(entry)) {
            return true;
          }
        }
      } catch (error) {
        // Continue to next adapter
        continue;
      }
    }

    return false;
  }

  /**
   * Get all keys from storage
   * Returns keys from all adapters (deduplicated)
   */
  async keys(prefix?: string): Promise<string[]> {
    const allKeys = new Set<string>();

    // Collect keys from all adapters
    for (const adapter of this.adapters) {
      try {
        const adapterKeys = await adapter.keys(prefix);
        adapterKeys.forEach((key) => allKeys.add(key));
      } catch (error) {
        // Continue to next adapter
        continue;
      }
    }

    return Array.from(allKeys);
  }

  /**
   * Clear all storage
   * Clears all adapters
   */
  async clear(): Promise<void> {
    const promises = this.adapters.map((adapter) =>
      adapter.clear().catch((error) => {
        console.warn(
          `[StorageManager] Error clearing ${adapter.getType()}:`,
          error
        );
      })
    );

    await Promise.all(promises);
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    adapters: Array<{
      type: string;
      usage: number | null;
      maxSize: number | null;
    }>;
    totalKeys: number;
  }> {
    const adapterStats = await Promise.all(
      this.adapters.map(async (adapter) => ({
        type: adapter.getType(),
        usage: await adapter.getUsage(),
        maxSize: adapter.getMaxSize(),
      }))
    );

    const allKeys = await this.keys();
    const totalKeys = allKeys.length;

    return {
      adapters: adapterStats,
      totalKeys,
    };
  }

  /**
   * Select the best adapter for storing data of a given size
   */
  private async selectAdapter(size: number): Promise<StorageAdapter | null> {
    // Priority order: Memory → LocalStorage → IndexedDB

    for (const adapter of this.adapters) {
      const adapterType = adapter.getType();
      const maxSize = adapter.getMaxSize();

      // Check if adapter can handle this size
      if (maxSize !== null && size > maxSize) {
        continue; // Try next adapter
      }

      // Check current usage
      try {
        const usage = await adapter.getUsage();
        if (usage !== null && maxSize !== null) {
          const available = maxSize - usage;
          if (size > available) {
            continue; // Not enough space, try next adapter
          }
        }
      } catch (error) {
        // If we can't check usage, try anyway
      }

      // Prefer Memory for small, frequently accessed data
      if (adapterType === 'Memory' && size < 100 * 1024) {
        return adapter;
      }

      // Prefer LocalStorage for medium data
      if (adapterType === 'LocalStorage' && size < this.options.maxLocalStorageSize) {
        return adapter;
      }

      // Use IndexedDB for large data
      if (adapterType === 'IndexedDB') {
        return adapter;
      }
    }

    // Fallback: use first available adapter
    return this.adapters[0] || null;
  }

  /**
   * Get the next adapter in the tier hierarchy
   */
  private getNextAdapter(currentAdapter: StorageAdapter): StorageAdapter | null {
    const currentIndex = this.adapters.indexOf(currentAdapter);
    if (currentIndex === -1 || currentIndex >= this.adapters.length - 1) {
      return null;
    }
    return this.adapters[currentIndex + 1];
  }

  /**
   * Estimate the size of a storage entry (rough estimate)
   */
  private estimateSize(entry: StorageEntry<any>): number {
    try {
      const json = JSON.stringify(entry);
      return new Blob([json]).size;
    } catch {
      // Fallback: rough estimate based on data type
      return 1024; // 1KB default
    }
  }
}

/**
 * Default storage manager instance
 * Will be initialized with adapters in Step 1.2
 */
export let defaultStorageManager: StorageManager | null = null;

/**
 * Initialize the default storage manager
 * Should be called once during app initialization
 */
export function initializeStorageManager(options?: StorageOptions): StorageManager {
  defaultStorageManager = new StorageManager(options);
  return defaultStorageManager;
}

/**
 * Get the default storage manager
 * Throws if not initialized
 */
export function getStorageManager(): StorageManager {
  if (!defaultStorageManager) {
    throw new StorageError(
      'Storage manager not initialized. Call initializeStorageManager() first.',
      StorageErrorCode.ADAPTER_ERROR
    );
  }
  return defaultStorageManager;
}

