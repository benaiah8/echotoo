/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Capacitor Filesystem Storage Adapter
 * 
 * Uses @capacitor/filesystem for large file storage in native apps.
 * Best for large datasets that exceed Preferences API limits.
 * 
 * Best for:
 * - Large feed data (> 1MB)
 * - Saved posts history
 * - Image metadata
 * - Backup data
 * 
 * Limitations:
 * - Slower than Preferences API
 * - Requires @capacitor/filesystem plugin
 * - File I/O overhead
 * 
 * Installation:
 * ```bash
 * npm install @capacitor/filesystem
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

const STORAGE_DIR = 'storage';
const STORAGE_INDEX_KEY = 'storage_index';

export class CapacitorFilesystemAdapter implements StorageAdapter {
  private filesystem: any = null;
  private directory: string;
  private readonly maxSize: number;
  private initialized: boolean = false;
  private index: Set<string> = new Set();

  constructor(directory: string = STORAGE_DIR, maxSize: number = 100 * 1024 * 1024) {
    // 100MB default max size
    this.directory = directory;
    this.maxSize = maxSize;
    this.initialize();
  }

  /**
   * Initialize Capacitor Filesystem plugin
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

    if (!isCapacitorPluginAvailable('Filesystem')) {
      // Filesystem plugin not available
      this.initialized = true;
      return;
    }

    try {
      // Dynamically import to avoid errors if Capacitor is not installed
      // Use type assertion to avoid TypeScript errors when Capacitor is not installed
      const FilesystemModule = await import('@capacitor/filesystem' as any).catch(() => null);
      if (!FilesystemModule) {
        this.initialized = true;
        return;
      }
      const { Filesystem } = FilesystemModule;
      const Directory = (FilesystemModule as any).Directory || (FilesystemModule as any).DirectoryEnum;
      this.filesystem = Filesystem;

      // Ensure storage directory exists
      try {
        await this.filesystem.mkdir({
          path: this.directory,
          directory: Directory?.Data || 'DATA',
          recursive: true,
        });
      } catch (error: any) {
        // Directory might already exist, that's okay
        if (error?.message && !error.message.includes('already exists')) {
          console.warn(
            '[CapacitorFilesystemAdapter] Failed to create directory:',
            error
          );
        }
      }

      // Load index
      await this.loadIndex();

      this.initialized = true;
    } catch (error) {
      // Capacitor Filesystem not installed or not available
      console.warn(
        '[CapacitorFilesystemAdapter] Filesystem plugin not available:',
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
      this.filesystem !== null &&
      this.initialized
    );
  }

  /**
   * Get file path for a key
   */
  private getFilePath(key: string): string {
    // Sanitize key for filesystem (replace invalid characters)
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${this.directory}/${sanitized}.json`;
  }

  /**
   * Get Directory enum value
   */
  private async getDirectory(): Promise<string> {
    try {
      // Use type assertion to avoid TypeScript errors when Capacitor is not installed
      const FilesystemModule = await import('@capacitor/filesystem' as any).catch(() => null);
      if (!FilesystemModule) return 'DATA';
      const Directory = (FilesystemModule as any).Directory || (FilesystemModule as any).DirectoryEnum;
      return Directory?.Data || 'DATA';
    } catch {
      return 'DATA'; // Fallback
    }
  }

  /**
   * Load index from storage
   */
  private async loadIndex(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      // Use type assertion to avoid TypeScript errors when Capacitor is not installed
      const PreferencesModule = await import('@capacitor/preferences' as any).catch(() => null);
      if (!PreferencesModule) return;
      const { Preferences } = PreferencesModule;
      const { value } = await Preferences.get({ key: STORAGE_INDEX_KEY });

      if (value) {
        const keys = JSON.parse(value) as string[];
        this.index = new Set(keys);
      }
    } catch (error) {
      // Index doesn't exist yet, that's okay
      this.index = new Set();
    }
  }

  /**
   * Save index to storage
   */
  private async saveIndex(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      // Use type assertion to avoid TypeScript errors when Capacitor is not installed
      const PreferencesModule = await import('@capacitor/preferences' as any).catch(() => null);
      if (!PreferencesModule) return;
      const { Preferences } = PreferencesModule;
      await Preferences.set({
        key: STORAGE_INDEX_KEY,
        value: JSON.stringify(Array.from(this.index)),
      });
    } catch (error) {
      console.warn('[CapacitorFilesystemAdapter] Failed to save index:', error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new StorageError(
        'Invalid key: key must be a non-empty string',
        StorageErrorCode.INVALID_KEY,
        'CapacitorFilesystem'
      );
    }

    await this.initialize();

    if (!this.isAvailable()) {
      return null; // Not available, return null (will try next adapter)
    }

    const filePath = this.getFilePath(key);

    try {
      const Directory = await this.getDirectory();
      const { data } = await this.filesystem.readFile({
        path: filePath,
        directory: Directory,
        encoding: 'utf8',
      });

      if (!data) {
        return null;
      }

      const entry: StorageEntry<T> = JSON.parse(data);

      // Check if expired
      if (isExpired(entry)) {
        await this.delete(key); // Clean up expired entry
        return null;
      }

      return entry.data;
    } catch (error: any) {
      // File doesn't exist or read failed
      if (error?.message && error.message.includes('does not exist')) {
        return null;
      }

      console.warn(
        '[CapacitorFilesystemAdapter] Failed to read file:',
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
        'CapacitorFilesystem'
      );
    }

    await this.initialize();

    if (!this.isAvailable()) {
      throw new StorageError(
        'Capacitor Filesystem is not available',
        StorageErrorCode.NOT_SUPPORTED,
        'CapacitorFilesystem'
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
        'CapacitorFilesystem'
      );
    }

    const filePath = this.getFilePath(key);

    try {
      const Directory = await this.getDirectory();
      await this.filesystem.writeFile({
        path: filePath,
        data: serialized,
        directory: Directory,
        encoding: 'utf8',
      });

      // Update index
      this.index.add(key);
      await this.saveIndex();
    } catch (error: any) {
      throw new StorageError(
        `Failed to store value: ${error?.message || String(error)}`,
        StorageErrorCode.ADAPTER_ERROR,
        'CapacitorFilesystem'
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

    const filePath = this.getFilePath(key);

    try {
      const Directory = await this.getDirectory();
      await this.filesystem.deleteFile({
        path: filePath,
        directory: Directory,
      });

      // Update index
      this.index.delete(key);
      await this.saveIndex();
    } catch (error: any) {
      // File might not exist, that's okay
      if (error?.message && !error.message.includes('does not exist')) {
        console.warn('[CapacitorFilesystemAdapter] Failed to delete file:', error);
      }

      // Update index anyway
      this.index.delete(key);
      await this.saveIndex();
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

    // Check index first (faster)
    if (!this.index.has(key)) {
      return false;
    }

    // Verify file exists and is not expired
    const data = await this.get(key);
    return data !== null;
  }

  async keys(prefix?: string): Promise<string[]> {
    await this.initialize();

    if (!this.isAvailable()) {
      return [];
    }

    const allKeys = Array.from(this.index);

    if (!prefix) {
      return allKeys;
    }

    return allKeys.filter((key) => key.startsWith(prefix));
  }

  async clear(): Promise<void> {
    await this.initialize();

    if (!this.isAvailable()) {
      return;
    }

    try {
      // Delete all files in directory
      const keys = Array.from(this.index);
      await Promise.all(keys.map((key) => this.delete(key)));

      // Clear index
      this.index.clear();
      await this.saveIndex();
    } catch (error) {
      console.warn('[CapacitorFilesystemAdapter] Failed to clear storage:', error);
    }
  }

  getType(): string {
    return 'CapacitorFilesystem';
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  async getUsage(): Promise<number | null> {
    // Capacitor Filesystem doesn't provide usage information easily
    // We would need to iterate through all files and sum their sizes
    // For now, return null (could be implemented if needed)
    return null;
  }
}

