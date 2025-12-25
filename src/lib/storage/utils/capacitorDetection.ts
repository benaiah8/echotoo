/**
 * [OPTIMIZATION: Phase 1 - Storage Abstraction]
 * 
 * Capacitor Environment Detection
 * 
 * Safely detects if the app is running in a Capacitor environment.
 * All functions are safe to call even if Capacitor is not installed.
 */

/**
 * Check if Capacitor is available
 * Returns true if running in a Capacitor app (iOS/Android)
 */
export function isCapacitor(): boolean {
  if (typeof window === 'undefined') {
    return false; // Server-side rendering
  }

  try {
    // Check for Capacitor global object
    const capacitor = (window as any).Capacitor;
    return capacitor !== undefined && capacitor !== null;
  } catch {
    return false;
  }
}

/**
 * Check if running on iOS
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isCapacitor()) {
    try {
      const capacitor = (window as any).Capacitor;
      return capacitor.getPlatform() === 'ios';
    } catch {
      return false;
    }
  }

  // Fallback: check user agent
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Check if running on Android
 */
export function isAndroid(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isCapacitor()) {
    try {
      const capacitor = (window as any).Capacitor;
      return capacitor.getPlatform() === 'android';
    } catch {
      return false;
    }
  }

  // Fallback: check user agent
  return /Android/.test(navigator.userAgent);
}

/**
 * Check if running on web (not Capacitor)
 */
export function isWeb(): boolean {
  return !isCapacitor();
}

/**
 * Get the current platform
 * Returns: 'ios' | 'android' | 'web' | 'unknown'
 */
export function getPlatform(): 'ios' | 'android' | 'web' | 'unknown' {
  if (isIOS()) {
    return 'ios';
  }
  if (isAndroid()) {
    return 'android';
  }
  if (isWeb()) {
    return 'web';
  }
  return 'unknown';
}

/**
 * Check if Capacitor plugins are available
 * Some plugins might not be available even if Capacitor is installed
 */
export function isCapacitorPluginAvailable(pluginName: string): boolean {
  if (!isCapacitor()) {
    return false;
  }

  try {
    const capacitor = (window as any).Capacitor;
    const plugins = capacitor.Plugins;
    return plugins && plugins[pluginName] !== undefined;
  } catch {
    return false;
  }
}

