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

/**
 * Initialize the default storage manager with all web adapters
 * 
 * Adapters are added in priority order:
 * 1. Memory (fastest, cleared on refresh)
 * 2. LocalStorage (persistent, limited size)
 * 3. IndexedDB (large datasets, persistent)
 */
export function initializeDefaultStorage(
  options?: StorageOptions
): StorageManager {
  const storage = initializeStorageManager(options);

  // Add adapters in priority order
  storage.addAdapter(new MemoryAdapter(50 * 1024 * 1024)); // 50MB
  storage.addAdapter(new LocalStorageAdapter('storage:', 5 * 1024 * 1024)); // 5MB
  storage.addAdapter(new IndexedDBAdapter(100 * 1024 * 1024)); // 100MB

  return storage;
}

