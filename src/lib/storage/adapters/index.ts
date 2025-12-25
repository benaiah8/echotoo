/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 *
 * Storage Adapters
 *
 * Exports all storage adapters for easy importing.
 */

export { MemoryAdapter } from "./MemoryAdapter";
export { LocalStorageAdapter } from "./LocalStorageAdapter";
export { IndexedDBAdapter } from "./IndexedDBAdapter";
export { CapacitorPreferencesAdapter } from "./CapacitorPreferencesAdapter";
export { CapacitorFilesystemAdapter } from "./CapacitorFilesystemAdapter";
export { initializeCapacitorStorage } from "./initializeCapacitorStorage";
