/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Mobile Network Detection hook
 *
 * Detects mobile network type (WiFi vs cellular) and provides network information.
 * Useful for adaptive behavior (larger buffers on WiFi, smaller on cellular).
 *
 * Use Cases:
 * - Adaptive buffer sizing
 * - Prefetching decisions
 * - Image quality adjustments
 * - Data saver mode respect
 */

import { useState, useEffect, useCallback } from "react";
import {
  getConnectionInfo,
  type ConnectionInfo,
  type ConnectionType,
} from "../lib/connectionAware";

export type NetworkType = "wifi" | "cellular" | "unknown";

export interface MobileNetworkInfo {
  type: NetworkType;
  isDataSaver: boolean;
  isSlowConnection: boolean;
  connectionInfo: ConnectionInfo;
  batteryLevel?: number; // 0-1, if available
}

export interface UseMobileNetworkDetectionOptions {
  // Callbacks
  onNetworkChange?: (info: MobileNetworkInfo) => void;
  onDataSaverChange?: (enabled: boolean) => void;
  onBatteryLow?: () => void;

  // Options
  checkBattery?: boolean; // Whether to check battery level (if available)
  batteryLowThreshold?: number; // Battery level to consider "low" (0-1, default: 0.2)
}

export interface UseMobileNetworkDetectionResult {
  networkInfo: MobileNetworkInfo;
  isWiFi: boolean;
  isCellular: boolean;
  isDataSaver: boolean;
  isSlowConnection: boolean;
  batteryLevel?: number;
}

/**
 * Detect network type (WiFi vs cellular)
 * Uses heuristics since navigator.connection doesn't directly provide network type
 */
function detectNetworkType(connectionInfo: ConnectionInfo): NetworkType {
  // If data saver is enabled, assume cellular
  if (connectionInfo.saveData) {
    return "cellular";
  }

  // Heuristic: High downlink (> 10 Mbps) usually means WiFi
  if (connectionInfo.downlink > 10) {
    return "wifi";
  }

  // Heuristic: Low downlink (< 1 Mbps) usually means cellular
  if (connectionInfo.downlink > 0 && connectionInfo.downlink < 1) {
    return "cellular";
  }

  // Heuristic: 4g with high downlink likely WiFi
  if (connectionInfo.effectiveType === "4g" && connectionInfo.downlink > 5) {
    return "wifi";
  }

  // Default to unknown if we can't determine
  return "unknown";
}

/**
 * Get battery level (if available)
 */
function getBatteryLevel(): number | undefined {
  // Check if Battery API is available
  const battery = (navigator as any).getBattery
    ? (navigator as any).battery
    : (navigator as any).webkitBattery;

  if (battery && typeof battery.level === "number") {
    return battery.level;
  }

  // Try BatteryManager API
  if ((navigator as any).getBattery) {
    (navigator as any)
      .getBattery()
      .then((battery: any) => {
        return battery.level;
      })
      .catch(() => undefined);
  }

  return undefined;
}

/**
 * Mobile Network Detection hook
 *
 * @example
 * ```tsx
 * const { isWiFi, isCellular, isDataSaver } = useMobileNetworkDetection({
 *   onNetworkChange: (info) => {
 *     console.log("Network changed:", info.type);
 *     adjustBufferSize(info.type === "wifi" ? 3 : 1);
 *   },
 * });
 * ```
 */
export function useMobileNetworkDetection(
  options: UseMobileNetworkDetectionOptions = {}
): UseMobileNetworkDetectionResult {
  const {
    onNetworkChange,
    onDataSaverChange,
    onBatteryLow,
    checkBattery = false,
    batteryLowThreshold = 0.2,
  } = options;

  // Get initial connection info
  const connectionInfo = getConnectionInfo();
  const networkType = detectNetworkType(connectionInfo);

  // State
  const [networkInfo, setNetworkInfo] = useState<MobileNetworkInfo>(() => {
    const info: MobileNetworkInfo = {
      type: networkType,
      isDataSaver: connectionInfo.saveData,
      isSlowConnection:
        connectionInfo.effectiveType === "slow-2g" ||
        connectionInfo.effectiveType === "2g" ||
        connectionInfo.effectiveType === "3g" ||
        connectionInfo.saveData ||
        (connectionInfo.downlink > 0 && connectionInfo.downlink < 1.5),
      connectionInfo,
    };

    if (checkBattery) {
      info.batteryLevel = getBatteryLevel();
    }

    return info;
  });

  // Update network info
  const updateNetworkInfo = useCallback(() => {
    const connectionInfo = getConnectionInfo();
    const networkType = detectNetworkType(connectionInfo);
    const batteryLevel = checkBattery ? getBatteryLevel() : undefined;

    const newInfo: MobileNetworkInfo = {
      type: networkType,
      isDataSaver: connectionInfo.saveData,
      isSlowConnection:
        connectionInfo.effectiveType === "slow-2g" ||
        connectionInfo.effectiveType === "2g" ||
        connectionInfo.effectiveType === "3g" ||
        connectionInfo.saveData ||
        (connectionInfo.downlink > 0 && connectionInfo.downlink < 1.5),
      connectionInfo,
      batteryLevel,
    };

    setNetworkInfo((prevInfo) => {
      // Check if network type changed
      if (prevInfo.type !== newInfo.type) {
        onNetworkChange?.(newInfo);
      }

      // Check if data saver changed
      if (prevInfo.isDataSaver !== newInfo.isDataSaver) {
        onDataSaverChange?.(newInfo.isDataSaver);
      }

      // Check if battery is low
      if (
        checkBattery &&
        newInfo.batteryLevel !== undefined &&
        newInfo.batteryLevel < batteryLowThreshold &&
        (prevInfo.batteryLevel === undefined ||
          prevInfo.batteryLevel >= batteryLowThreshold)
      ) {
        onBatteryLow?.();
      }

      return newInfo;
    });
  }, [
    checkBattery,
    batteryLowThreshold,
    onNetworkChange,
    onDataSaverChange,
    onBatteryLow,
  ]);

  // Listen for connection changes
  useEffect(() => {
    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    if (!connection) {
      // No connection API, update periodically
      const interval = setInterval(updateNetworkInfo, 5000);
      return () => clearInterval(interval);
    }

    // Listen for connection changes
    connection.addEventListener("change", updateNetworkInfo);

    return () => {
      connection.removeEventListener("change", updateNetworkInfo);
    };
  }, [updateNetworkInfo]);

  // Listen for battery changes (if checking battery)
  useEffect(() => {
    if (!checkBattery) return;

    const battery = (navigator as any).getBattery
      ? (navigator as any).battery
      : (navigator as any).webkitBattery;

    if (battery) {
      const handleBatteryChange = () => {
        updateNetworkInfo();
      };

      battery.addEventListener("levelchange", handleBatteryChange);
      battery.addEventListener("chargingchange", handleBatteryChange);

      return () => {
        battery.removeEventListener("levelchange", handleBatteryChange);
        battery.removeEventListener("chargingchange", handleBatteryChange);
      };
    }
  }, [checkBattery, updateNetworkInfo]);

  return {
    networkInfo,
    isWiFi: networkInfo.type === "wifi",
    isCellular: networkInfo.type === "cellular",
    isDataSaver: networkInfo.isDataSaver,
    isSlowConnection: networkInfo.isSlowConnection,
    batteryLevel: networkInfo.batteryLevel,
  };
}

