/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Initialize Default Storage Manager
 * 
 * Helper function to initialize the storage manager with default adapters.
 * Should be called once during app initialization.
 * 
 * Usage:
 * ```typescript
 * import { initializeDefaultStorage } from './lib/storage/initializeDefaultStorage';
 * 
 * // In main.tsx or App.tsx
 * initializeDefaultStorage();
 * ```
 */

import {
  StorageManager,
  type StorageOptions,
  initializeStorageManager,
} from './StorageManager';
import { MemoryAdapter } from './adapters/MemoryAdapter';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { IndexedDBAdapter } from './adapters/IndexedDBAdapter';
// [PHASE 1.2] Import cache version manager for unified version checking
import { checkAndClearAllCaches } from '../cacheVersionManager';

/**
 * Initialize the default storage manager with all web adapters
 * 
 * Adapters are added in priority order:
 * 1. Memory (fastest, cleared on refresh)
 * 2. LocalStorage (persistent, limited size)
 * 3. IndexedDB (large datasets, persistent)
 * 
 * [PHASE 1.2] Also checks cache version and clears all caches if version changed.
 * This ensures stale data from old cache formats is cleared on app startup.
 */
export function initializeDefaultStorage(
  options?: StorageOptions
): StorageManager {
  const storage = initializeStorageManager(options);

  // Add adapters in priority order
  storage.addAdapter(new MemoryAdapter(50 * 1024 * 1024)); // 50MB
  storage.addAdapter(new LocalStorageAdapter('storage:', 5 * 1024 * 1024)); // 5MB
  storage.addAdapter(new IndexedDBAdapter(100 * 1024 * 1024)); // 100MB

  // [PHASE 1.2] Check cache version and clear all caches if version changed
  // This must happen after StorageManager is initialized so we can clear StorageManager caches
  // But we call it asynchronously so it doesn't block app startup
  checkAndClearAllCaches().catch((error) => {
    // Log error but don't throw - we don't want to break app startup
    console.error('[initializeDefaultStorage] Error checking cache version:', error);
  });

  return storage;
}

