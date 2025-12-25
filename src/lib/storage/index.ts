/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 *
 * Storage Abstraction Layer
 *
 * Unified API for all storage operations across multiple tiers:
 * - Memory (fastest, cleared on refresh)
 * - LocalStorage (persistent, limited size)
 * - IndexedDB (large datasets, persistent)
 * - Capacitor Preferences API (native apps)
 * - Capacitor Filesystem API (native apps, large data)
 *
 * Usage:
 * ```typescript
 * import { getStorageManager, initializeStorageManager } from './lib/storage';
 *
 * // Initialize (once during app startup)
 * const storage = initializeStorageManager({
 *   defaultTtl: 10 * 60 * 1000, // 10 minutes
 *   connectionAware: true,
 * });
 *
 * // Use throughout app
 * await storage.set('feed:home', posts);
 * const posts = await storage.get<Post[]>('feed:home');
 * ```
 */

// Core interfaces and types
export {
  type StorageAdapter,
  type StorageOptions,
  type StorageResult,
  type StorageEntry,
  StorageError,
  StorageErrorCode,
  isExpired,
  createStorageEntry,
  adjustTtlForConnection,
  getConnectionAwareTtlMultiplier,
} from "./StorageAdapter";

// Storage manager
export {
  StorageManager,
  initializeStorageManager,
  getStorageManager,
  defaultStorageManager,
} from "./StorageManager";

// Storage adapters
export {
  MemoryAdapter,
  LocalStorageAdapter,
  IndexedDBAdapter,
  CapacitorPreferencesAdapter,
  CapacitorFilesystemAdapter,
  initializeCapacitorStorage,
} from "./adapters";

// Utilities
export {
  isCapacitor,
  isIOS,
  isAndroid,
  isWeb,
  getPlatform,
  isCapacitorPluginAvailable,
} from "./utils/capacitorDetection";
