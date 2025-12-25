/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Unified Storage Adapter Interface
 * 
 * Provides a consistent API for all storage operations across:
 * - Memory (fastest, cleared on refresh)
 * - localStorage (persistent, limited size)
 * - IndexedDB (large datasets, persistent)
 * - Capacitor Preferences API (native apps)
 * - Capacitor Filesystem API (native apps, large data)
 * 
 * Benefits:
 * - Single API for all storage needs
 * - Automatic optimization (fast → slow storage)
 * - Handles size limits gracefully
 * - Easy to test and mock
 * - Capacitor-ready
 */

/**
 * Storage adapter interface
 * 
 * All storage implementations (Memory, LocalStorage, IndexedDB, Capacitor)
 * must implement this interface for consistency.
 */
export interface StorageAdapter {
  /**
   * Get a value from storage
   * @param key Storage key
   * @returns The stored value, or null if not found or expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in storage
   * @param key Storage key
   * @param value Value to store
   * @param ttlMs Optional TTL in milliseconds (0 = no expiration)
   * @returns Promise that resolves when value is stored
   */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Delete a value from storage
   * @param key Storage key
   * @returns Promise that resolves when value is deleted
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists in storage
   * @param key Storage key
   * @returns Promise that resolves to true if key exists, false otherwise
   */
  has(key: string): Promise<boolean>;

  /**
   * Get all keys in storage
   * @param prefix Optional prefix to filter keys
   * @returns Promise that resolves to array of keys
   */
  keys(prefix?: string): Promise<string[]>;

  /**
   * Clear all values from storage
   * @returns Promise that resolves when storage is cleared
   */
  clear(): Promise<void>;

  /**
   * Get the storage type name (for debugging/logging)
   */
  getType(): string;

  /**
   * Get the maximum size this adapter can store (in bytes)
   * Returns null if unlimited or unknown
   */
  getMaxSize(): number | null;

  /**
   * Get the current usage (in bytes)
   * Returns null if not available
   */
  getUsage(): Promise<number | null>;
}

/**
 * Storage entry with metadata
 * Used internally by adapters to store TTL and other metadata
 */
export interface StorageEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number; // TTL in milliseconds (0 = no expiration)
}

/**
 * Storage options for StorageManager
 */
export interface StorageOptions {
  /**
   * Default TTL for all operations (in milliseconds)
   * Can be overridden per operation
   */
  defaultTtl?: number;

  /**
   * Connection-aware TTL multiplier
   * If true, TTL will be multiplied by connection speed factor
   */
  connectionAware?: boolean;

  /**
   * Storage tier priority (order matters)
   * StorageManager will try adapters in this order
   */
  adapters?: StorageAdapter[];

  /**
   * Enable automatic migration between tiers
   * If true, large data will be moved to IndexedDB automatically
   */
  autoMigrate?: boolean;

  /**
   * Maximum size for memory tier (in bytes)
   * Default: 50MB
   */
  maxMemorySize?: number;

  /**
   * Maximum size for localStorage tier (in bytes)
   * Default: 5MB
   */
  maxLocalStorageSize?: number;
}

/**
 * Storage result with metadata
 */
export interface StorageResult<T> {
  value: T | null;
  fromCache: boolean;
  tier: string; // Which storage tier was used
  timestamp?: number; // When the value was stored
}

/**
 * Storage error
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly adapter?: string
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Storage error codes
 */
export enum StorageErrorCode {
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  NOT_FOUND = 'NOT_FOUND',
  EXPIRED = 'EXPIRED',
  INVALID_KEY = 'INVALID_KEY',
  INVALID_VALUE = 'INVALID_VALUE',
  ADAPTER_ERROR = 'ADAPTER_ERROR',
  NOT_SUPPORTED = 'NOT_SUPPORTED',
}

/**
 * Helper function to check if a storage entry is expired
 */
export function isExpired(entry: StorageEntry<any>): boolean {
  if (!entry.ttl || entry.ttl === 0) {
    return false; // No expiration
  }
  return Date.now() - entry.timestamp > entry.ttl;
}

/**
 * Helper function to create a storage entry
 */
export function createStorageEntry<T>(
  data: T,
  ttlMs?: number
): StorageEntry<T> {
  return {
    data,
    timestamp: Date.now(),
    ttl: ttlMs !== undefined ? ttlMs : undefined,
  };
}

/**
 * Helper function to get connection-aware TTL multiplier
 * Returns 3x on slow connections, 1x otherwise
 */
export function getConnectionAwareTtlMultiplier(): number {
  try {
    const { getCacheDurationMultiplier } = require('../connectionAware');
    return getCacheDurationMultiplier();
  } catch {
    // Fallback if connectionAware not available
    return 1;
  }
}

/**
 * Helper function to adjust TTL based on connection speed
 */
export function adjustTtlForConnection(baseTtl: number): number {
  const multiplier = getConnectionAwareTtlMultiplier();
  return baseTtl * multiplier;
}

