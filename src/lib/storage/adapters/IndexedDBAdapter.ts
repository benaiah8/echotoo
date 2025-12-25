/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * IndexedDB Storage Adapter
 * 
 * Persistent storage using browser IndexedDB.
 * Best for large datasets that exceed localStorage limits.
 * 
 * Best for:
 * - Large data (> 100KB)
 * - Feed history
 * - Saved posts
 * - Image metadata
 * 
 * Limitations:
 * - More complex API (async)
 * - Requires database setup
 * - Not available in all browsers (but widely supported)
 */

import {
  type StorageAdapter,
  type StorageEntry,
  StorageError,
  StorageErrorCode,
  isExpired,
} from '../StorageAdapter';

const DB_NAME = 'echotoo_storage';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

interface IDBRequestWithResult<T> extends IDBRequest {
  result: T;
}

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly maxSize: number;

  constructor(maxSize: number = 100 * 1024 * 1024) {
    // 100MB default max size
    this.maxSize = maxSize;
  }

  /**
   * Initialize the database
   */
  private async init(): Promise<void> {
    if (this.db) {
      return; // Already initialized
    }

    if (this.initPromise) {
      return this.initPromise; // Initialization in progress
    }

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        reject(
          new StorageError(
            'IndexedDB is not available',
            StorageErrorCode.NOT_SUPPORTED,
            'IndexedDB'
          )
        );
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(
          new StorageError(
            `Failed to open IndexedDB: ${request.error?.message}`,
            StorageErrorCode.ADAPTER_ERROR,
            'IndexedDB'
          )
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'IndexedDB'
      );
    }

    await this.init();

    if (!this.db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          resolve(null);
          return;
        }

        try {
          const entry: StorageEntry<T> = result.value;

          // Check if expired
          if (isExpired(entry)) {
            // Delete expired entry (don't await)
            this.delete(key).catch(() => {
              // Ignore delete errors
            });
            resolve(null);
            return;
          }

          resolve(entry.data);
        } catch (error) {
          // Corrupted entry, delete it
          this.delete(key).catch(() => {
            // Ignore delete errors
          });
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(
          new StorageError(
            `Failed to get value: ${request.error?.message}`,
            StorageErrorCode.ADAPTER_ERROR,
            'IndexedDB'
          )
        );
      };
    });
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'IndexedDB'
      );
    }

    await this.init();

    if (!this.db) {
      throw new StorageError(
        'IndexedDB is not available',
        StorageErrorCode.NOT_SUPPORTED,
        'IndexedDB'
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

    // Check size limit
    const estimatedSize = this.estimateSize(entry);
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

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record = {
        key,
        value: entry,
        timestamp: entry.timestamp,
      };

      const request = store.put(record);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(
          new StorageError(
            `Failed to set value: ${request.error?.message}`,
            StorageErrorCode.ADAPTER_ERROR,
            'IndexedDB'
          )
        );
      };
    });
  }

  async delete(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      return; // Silently ignore invalid keys
    }

    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        // Don't reject, just log the error
        console.warn(
          '[IndexedDBAdapter] Failed to delete key:',
          request.error
        );
        resolve();
      };
    });
  }

  async has(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }

    await this.init();

    if (!this.db) {
      return false;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;

        if (!result) {
          resolve(false);
          return;
        }

        try {
          const entry: StorageEntry<any> = result.value;

          // Check if expired
          if (isExpired(entry)) {
            // Delete expired entry (don't await)
            this.delete(key).catch(() => {
              // Ignore delete errors
            });
            resolve(false);
            return;
          }

          resolve(true);
        } catch {
          resolve(false);
        }
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  async keys(prefix?: string): Promise<string[]> {
    await this.init();

    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        const allKeys = results.map((record: any) => record.key);

        if (!prefix) {
          resolve(allKeys);
          return;
        }

        const filteredKeys = allKeys.filter((key: string) =>
          key.startsWith(prefix)
        );
        resolve(filteredKeys);
      };

      request.onerror = () => {
        reject(
          new StorageError(
            `Failed to get keys: ${request.error?.message}`,
            StorageErrorCode.ADAPTER_ERROR,
            'IndexedDB'
          )
        );
      };
    });
  }

  async clear(): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(
          new StorageError(
            `Failed to clear storage: ${request.error?.message}`,
            StorageErrorCode.ADAPTER_ERROR,
            'IndexedDB'
          )
        );
      };
    });
  }

  getType(): string {
    return 'IndexedDB';
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  async getUsage(): Promise<number | null> {
    await this.init();

    if (!this.db) {
      return null;
    }

    // IndexedDB doesn't provide a direct way to get storage usage
    // We'll estimate based on stored entries
    try {
      const allKeys = await this.keys();
      let totalSize = 0;

      // Rough estimate: assume average entry size
      // This is not precise but gives a reasonable estimate
      const avgEntrySize = 10 * 1024; // 10KB average
      totalSize = allKeys.length * avgEntrySize;

      return totalSize;
    } catch {
      return null;
    }
  }

  /**
   * Check if IndexedDB is available
   */
  private isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
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
      return 10 * 1024; // 10KB default
    }
  }

  /**
   * Clean up expired entries
   */
  private async cleanupExpired(): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();

      const keysToDelete: string[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          const record = cursor.value;
          const entry: StorageEntry<any> = record.value;

          if (isExpired(entry)) {
            keysToDelete.push(record.key);
          }

          cursor.continue();
        } else {
          // Delete expired entries
          const deletePromises = keysToDelete.map((key) => this.delete(key));
          Promise.all(deletePromises)
            .then(() => resolve())
            .catch((error) => {
              console.warn(
                '[IndexedDBAdapter] Failed to cleanup expired entries:',
                error
              );
              resolve(); // Don't reject, just log
            });
        }
      };

      request.onerror = () => {
        console.warn(
          '[IndexedDBAdapter] Failed to cleanup expired entries:',
          request.error
        );
        resolve(); // Don't reject, just log
      };
    });
  }

  /**
   * Evict oldest entries to make room
   */
  private async evictOldest(neededSpace: number): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();

      const keysToDelete: string[] = [];
      let freedSpace = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor && freedSpace < neededSpace) {
          const record = cursor.value;
          const entry: StorageEntry<any> = record.value;
          const estimatedSize = this.estimateSize(entry);

          freedSpace += estimatedSize;
          keysToDelete.push(record.key);

          cursor.continue();
        } else {
          // Delete selected keys
          const deletePromises = keysToDelete.map((key) => this.delete(key));
          Promise.all(deletePromises)
            .then(() => resolve())
            .catch((error) => {
              console.warn(
                '[IndexedDBAdapter] Failed to evict oldest entries:',
                error
              );
              resolve(); // Don't reject, just log
            });
        }
      };

      request.onerror = () => {
        console.warn(
          '[IndexedDBAdapter] Failed to evict oldest entries:',
          request.error
        );
        resolve(); // Don't reject, just log
      };
    });
  }
}

