/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Capacitor Preferences Storage Adapter
 * 
 * Uses @capacitor/preferences for persistent key-value storage in native apps.
 * Best for small to medium data (< 1MB per key).
 * 
 * Best for:
 * - User preferences
 * - Small cache entries
 * - Profile data
 * - Follow status
 * 
 * Limitations:
 * - ~1MB limit per key (platform-dependent)
 * - Not available in web browsers
 * - Requires @capacitor/preferences plugin
 * 
 * Installation:
 * ```bash
 * npm install @capacitor/preferences
 * npx cap sync
 * ```
 */

import {
  type StorageAdapter,
  type StorageEntry,
  StorageError,
  StorageErrorCode,
  isExpired,
} from '../StorageAdapter';
import { isCapacitor, isCapacitorPluginAvailable } from '../utils/capacitorDetection';

export class CapacitorPreferencesAdapter implements StorageAdapter {
  private preferences: any = null;
  private readonly prefix: string;
  private readonly maxSize: number;
  private initialized: boolean = false;

  constructor(prefix: string = 'storage:', maxSize: number = 1024 * 1024) {
    // 1MB default max size per key
    this.prefix = prefix;
    this.maxSize = maxSize;
    this.initialize();
  }

  /**
   * Initialize Capacitor Preferences plugin
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!isCapacitor()) {
      // Not in Capacitor environment, adapter will be skipped
      this.initialized = true;
      return;
    }

    if (!isCapacitorPluginAvailable('Preferences')) {
      // Preferences plugin not available
      this.initialized = true;
      return;
    }

    try {
      // Dynamically import to avoid errors if Capacitor is not installed
      // Use type assertion to avoid TypeScript errors when Capacitor is not installed
      const PreferencesModule = await import('@capacitor/preferences' as any).catch(() => null);
      if (!PreferencesModule) {
        this.initialized = true;
        return;
      }
      const { Preferences } = PreferencesModule;
      this.preferences = Preferences;
      this.initialized = true;
    } catch (error) {
      // Capacitor Preferences not installed or not available
      console.warn(
        '[CapacitorPreferencesAdapter] Preferences plugin not available:',
        error
      );
      this.initialized = true;
    }
  }

  /**
   * Check if adapter is available
   */
  private isAvailable(): boolean {
    return (
      isCapacitor() &&
      this.preferences !== null &&
      this.initialized
    );
  }

  async get<T>(key: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'CapacitorPreferences'
      );
    }

    await this.initialize();

    if (!this.isAvailable()) {
      return null; // Not available, return null (will try next adapter)
    }

    const fullKey = this.getFullKey(key);

    try {
      const { value } = await this.preferences.get({ key: fullKey });

      if (!value) {
        return null;
      }

      const entry: StorageEntry<T> = JSON.parse(value);

      // Check if expired
      if (isExpired(entry)) {
        await this.delete(key); // Clean up expired entry
        return null;
      }

      return entry.data;
    } catch (error) {
      // If parsing fails, the entry is corrupted - delete it
      try {
        await this.delete(key);
      } catch {
        // Ignore delete errors
      }

      console.warn(
        '[CapacitorPreferencesAdapter] Failed to parse stored value:',
        error
      );
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'CapacitorPreferences'
      );
    }

    await this.initialize();

    if (!this.isAvailable()) {
      throw new StorageError(
        'Capacitor Preferences is not available',
        StorageErrorCode.NOT_SUPPORTED,
        'CapacitorPreferences'
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

    const serialized = JSON.stringify(entry);
    const estimatedSize = new Blob([serialized]).size;

    // Check size limit
    if (estimatedSize > this.maxSize) {
      throw new StorageError(
        `Value exceeds maximum size of ${this.maxSize} bytes`,
        StorageErrorCode.QUOTA_EXCEEDED,
        'CapacitorPreferences'
      );
    }

    const fullKey = this.getFullKey(key);

    try {
      await this.preferences.set({
        key: fullKey,
        value: serialized,
      });
    } catch (error: any) {
      throw new StorageError(
        `Failed to store value: ${error?.message || String(error)}`,
        StorageErrorCode.ADAPTER_ERROR,
        'CapacitorPreferences'
      );
    }
  }

  async delete(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      return; // Silently ignore invalid keys
    }

    await this.initialize();

    if (!this.isAvailable()) {
      return;
    }

    const fullKey = this.getFullKey(key);

    try {
      await this.preferences.remove({ key: fullKey });
    } catch (error) {
      // Ignore errors (preferences might not exist)
      console.warn('[CapacitorPreferencesAdapter] Failed to delete key:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      return false;
    }

    await this.initialize();

    if (!this.isAvailable()) {
      return false;
    }

    const fullKey = this.getFullKey(key);

    try {
      const { value } = await this.preferences.get({ key: fullKey });

      if (!value) {
        return false;
      }

      const entry: StorageEntry<any> = JSON.parse(value);

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
    await this.initialize();

    if (!this.isAvailable()) {
      return [];
    }

    try {
      // Capacitor Preferences doesn't have a native keys() method
      // We need to maintain our own index or use a different approach
      // For now, return empty array (this is a limitation of Preferences API)
      // In production, you might want to maintain a separate index key
      console.warn(
        '[CapacitorPreferencesAdapter] keys() not fully supported by Preferences API'
      );
      return [];
    } catch (error) {
      console.warn('[CapacitorPreferencesAdapter] Failed to get keys:', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    await this.initialize();

    if (!this.isAvailable()) {
      return;
    }

    // Capacitor Preferences doesn't have a native clear() method
    // We would need to maintain an index of all keys
    // For now, this is a no-op (limitation of Preferences API)
    console.warn(
      '[CapacitorPreferencesAdapter] clear() not fully supported by Preferences API'
    );
  }

  getType(): string {
    return 'CapacitorPreferences';
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  async getUsage(): Promise<number | null> {
    // Capacitor Preferences doesn't provide usage information
    return null;
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }
}

