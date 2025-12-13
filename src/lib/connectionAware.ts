/**
 * [OPTIMIZATION FILE: Phase 6]
 * 
 * Connection-aware utilities for adaptive performance
 * 
 * Optimizations included:
 * - Connection Detection: Detects network speed using navigator.connection API
 * - Adaptive Prefetching: Reduces prefetching on slow connections
 * - Image Quality Control: Adjusts image quality based on connection
 * - Cache Strategy: More aggressive caching on slow connections
 * 
 * Related optimizations:
 * - See: ProgressiveImage.tsx for connection-aware image loading
 * - See: Post.tsx, HomePage.tsx for connection-aware prefetching
 */

// [OPTIMIZATION: Phase 6 - Connection] Connection type definitions
// Why: Type-safe connection detection, better code clarity
export type ConnectionType = "slow-2g" | "2g" | "3g" | "4g" | "unknown";

export interface ConnectionInfo {
  effectiveType: ConnectionType;
  downlink: number; // Mbps
  rtt: number; // Round-trip time in ms
  saveData: boolean; // Data saver mode enabled
}

// [OPTIMIZATION: Phase 6 - Connection] Get connection information with fallback
// Why: Works across all browsers, graceful degradation for unsupported browsers
export function getConnectionInfo(): ConnectionInfo {
  // Check if navigator.connection is available
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!connection) {
    // Fallback: assume unknown connection (conservative approach)
    return {
      effectiveType: "unknown",
      downlink: 0,
      rtt: 0,
      saveData: false,
    };
  }

  // Map effectiveType to our ConnectionType
  const effectiveType = (connection.effectiveType || "unknown") as ConnectionType;
  const downlink = connection.downlink || 0;
  const rtt = connection.rtt || 0;
  const saveData = connection.saveData || false;

  return {
    effectiveType,
    downlink,
    rtt,
    saveData,
  };
}

// [OPTIMIZATION: Phase 6 - Connection] Check if connection is slow
// Why: Simple boolean check for slow connections, used throughout app
export function isSlowConnection(): boolean {
  const info = getConnectionInfo();
  
  // Consider slow-2g, 2g, and 3g as slow connections
  // Also consider data saver mode as slow
  return (
    info.effectiveType === "slow-2g" ||
    info.effectiveType === "2g" ||
    info.effectiveType === "3g" ||
    info.saveData ||
    (info.downlink > 0 && info.downlink < 1.5) // Less than 1.5 Mbps
  );
}

// [OPTIMIZATION: Phase 6 - Connection] Get connection type
// Why: More granular control for different connection speeds
export function getConnectionType(): ConnectionType {
  return getConnectionInfo().effectiveType;
}

// [OPTIMIZATION: Phase 6 - Connection] Should reduce prefetching
// Why: Determines if prefetching should be reduced or skipped
export function shouldReducePrefetching(): boolean {
  return isSlowConnection();
}

// [OPTIMIZATION: Phase 6 - Connection] Should skip prefetching entirely
// Why: On very slow connections, skip prefetching to save bandwidth
export function shouldSkipPrefetching(): boolean {
  const info = getConnectionInfo();
  return (
    info.effectiveType === "slow-2g" ||
    info.effectiveType === "2g" ||
    info.saveData
  );
}

// [OPTIMIZATION: Phase 6 - Connection] Get appropriate image quality
// Why: Returns quality level based on connection speed
export function getImageQuality(): "low" | "medium" | "high" {
  const info = getConnectionInfo();
  
  if (info.effectiveType === "slow-2g" || info.effectiveType === "2g" || info.saveData) {
    return "low";
  }
  
  if (info.effectiveType === "3g" || (info.downlink > 0 && info.downlink < 2)) {
    return "medium";
  }
  
  return "high";
}

// [OPTIMIZATION: Phase 6 - Connection] Get cache duration multiplier
// Why: Longer cache duration on slow connections to reduce network requests
export function getCacheDurationMultiplier(): number {
  if (isSlowConnection()) {
    // On slow connections, cache 3x longer
    return 3;
  }
  return 1;
}

// [OPTIMIZATION: Phase 6 - Connection] Connection change listener
// Why: React to connection changes in real-time
export function onConnectionChange(callback: (info: ConnectionInfo) => void): () => void {
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!connection) {
    // No connection API, return no-op cleanup
    return () => {};
  }

  const handleChange = () => {
    callback(getConnectionInfo());
  };

  // Listen for connection changes
  connection.addEventListener("change", handleChange);

  // Return cleanup function
  return () => {
    connection.removeEventListener("change", handleChange);
  };
}


