/**
 * [PHASE 2.3] Connection-Aware Hook
 * 
 * Provides connection-aware configuration for loading behavior:
 * - Adaptive pageSize based on connection speed
 * - Adaptive buffer size based on connection speed
 * - Pause/resume loading on slow connections
 * 
 * Usage:
 * ```tsx
 * const { pageSize, bufferSize, shouldPause } = useConnectionAware({
 *   basePageSize: 5,
 *   baseBufferSize: 3,
 * });
 * ```
 */

import { useState, useEffect, useMemo } from 'react';
import {
  getConnectionInfo,
  isSlowConnection,
  shouldSkipPrefetching,
  onConnectionChange,
  type ConnectionInfo,
} from '../lib/connectionAware';

export interface UseConnectionAwareOptions {
  basePageSize?: number; // Base page size (default: 5)
  baseBufferSize?: number; // Base buffer size (default: 3)
  enablePauseOnSlow?: boolean; // Pause loading on very slow connections (default: true)
}

export interface UseConnectionAwareResult {
  pageSize: number; // Adaptive page size based on connection
  bufferSize: number; // Adaptive buffer size based on connection
  shouldPause: boolean; // Whether to pause loading (very slow connections)
  connectionInfo: ConnectionInfo; // Current connection info
  isSlow: boolean; // Whether connection is slow
}

/**
 * Connection-aware hook
 * 
 * Adjusts pageSize and bufferSize based on connection speed:
 * - Fast (4g): basePageSize, baseBufferSize
 * - Slow (3g): basePageSize / 2, baseBufferSize / 2
 * - Very slow (2g/slow-2g): basePageSize / 3, bufferSize = 0, pause loading
 */
export function useConnectionAware(
  options: UseConnectionAwareOptions = {}
): UseConnectionAwareResult {
  const {
    basePageSize = 5,
    baseBufferSize = 3,
    enablePauseOnSlow = true,
  } = options;

  // Get initial connection info
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>(() =>
    getConnectionInfo()
  );

  // Update connection info when it changes
  useEffect(() => {
    const cleanup = onConnectionChange((info) => {
      setConnectionInfo(info);
    });
    return cleanup;
  }, []);

  // Calculate adaptive values based on connection
  const { pageSize, bufferSize, shouldPause } = useMemo(() => {
    const isSlow = isSlowConnection();
    const shouldSkip = shouldSkipPrefetching();

    // Very slow connections (slow-2g, 2g, data saver)
    if (shouldSkip && enablePauseOnSlow) {
      return {
        pageSize: Math.max(1, Math.floor(basePageSize / 3)), // At least 1
        bufferSize: 0, // No buffer on very slow
        shouldPause: true, // Pause loading
      };
    }

    // Slow connections (3g)
    if (isSlow) {
      return {
        pageSize: Math.max(2, Math.floor(basePageSize / 2)), // At least 2
        bufferSize: Math.max(1, Math.floor(baseBufferSize / 2)), // At least 1
        shouldPause: false,
      };
    }

    // Fast connections (4g)
    return {
      pageSize: basePageSize,
      bufferSize: baseBufferSize,
      shouldPause: false,
    };
  }, [connectionInfo, basePageSize, baseBufferSize, enablePauseOnSlow]);

  return {
    pageSize,
    bufferSize,
    shouldPause,
    connectionInfo,
    isSlow: isSlowConnection(),
  };
}

