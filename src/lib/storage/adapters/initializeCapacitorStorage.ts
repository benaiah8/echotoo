/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Initialize Capacitor Storage
 * 
 * Helper function to initialize storage manager with Capacitor adapters.
 * Should be called once during app initialization in Capacitor apps.
 * 
 * Usage:
 * ```typescript
 * import { initializeCapacitorStorage } from './lib/storage/adapters/initializeCapacitorStorage';
 * 
 * // In main.tsx or App.tsx (only in Capacitor apps)
 * if (isCapacitor()) {
 *   initializeCapacitorStorage();
 * }
 * ```
 */

import {
  StorageManager,
  type StorageOptions,
  initializeStorageManager,
} from '../StorageManager';
import { MemoryAdapter } from './MemoryAdapter';
import { CapacitorPreferencesAdapter } from './CapacitorPreferencesAdapter';
import { CapacitorFilesystemAdapter } from './CapacitorFilesystemAdapter';
import { isCapacitor } from '../utils/capacitorDetection';

/**
 * Initialize the storage manager with Capacitor adapters
 * 
 * Adapters are added in priority order:
 * 1. Memory (fastest, cleared on refresh)
 * 2. Capacitor Preferences (small to medium data, persistent)
 * 3. Capacitor Filesystem (large data, persistent)
 * 
 * Note: This should only be called in Capacitor environments.
 * For web, use initializeDefaultStorage instead.
 */
export function initializeCapacitorStorage(
  options?: StorageOptions
): StorageManager {
  if (!isCapacitor()) {
    console.warn(
      '[initializeCapacitorStorage] Not in Capacitor environment, adapters may not work correctly'
    );
  }

  const storage = initializeStorageManager(options);

  // Add adapters in priority order
  storage.addAdapter(new MemoryAdapter(50 * 1024 * 1024)); // 50MB
  storage.addAdapter(new CapacitorPreferencesAdapter('storage:', 1024 * 1024)); // 1MB per key
  storage.addAdapter(new CapacitorFilesystemAdapter('storage', 100 * 1024 * 1024)); // 100MB

  return storage;
}

