/**
 * Native-only: fetch update policy via RPC (cooldown), show soft/hard modals.
 * Web / non-native: renders nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAppUpdateRuntimeConfig } from "../api/services/appUpdateRuntime";
import type { AppUpdateRuntimeConfig } from "../api/services/appUpdateRuntime";
import SoftUpdateModal from "./ui/SoftUpdateModal";
import HardUpdateModal from "./ui/HardUpdateModal";
import {
  getPlatform,
  isNativeApp,
} from "../lib/storage/utils/capacitorDetection";
import { isVersionLessThan } from "../lib/appUpdateVersionCompare";
import {
  isCooldownExpired,
  readCachedConfig,
  writeCachedConfig,
  writeLastCheckAtNow,
  isSoftDismissedFor,
  writeSoftDismissSignature,
} from "../lib/appUpdateRuntimeStorage";
import {
  previewModalTitle,
  previewModalMessage,
} from "../lib/internalAppUpdatePreview";
import { openExternalUrl } from "../lib/openExternalUrl";
import type { AppUpdateConfigRow } from "../types/appUpdateConfig";

function runtimeToPreviewRow(
  platform: "android" | "ios",
  c: AppUpdateRuntimeConfig
): AppUpdateConfigRow {
  return {
    platform,
    latest_version: c.latest_version,
    minimum_supported_version: c.minimum_supported_version,
    update_mode: c.update_mode,
    title: c.title,
    message: c.message,
    android_store_url: platform === "android" ? c.store_url : "",
    ios_store_url: platform === "ios" ? c.store_url : "",
    is_active: c.is_active,
    updated_at: "",
    updated_by_user_id: null,
  };
}

async function getNativeAppVersionString(): Promise<string | null> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.version?.trim() || null;
  } catch {
    return null;
  }
}

export default function AppUpdateRuntimeController() {
  const [softOpen, setSoftOpen] = useState(false);
  const [hardOpen, setHardOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<AppUpdateRuntimeConfig | null>(
    null
  );
  const [activePlatform, setActivePlatform] = useState<"android" | "ios" | null>(
    null
  );

  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDecision = useCallback(
    async (config: AppUpdateRuntimeConfig | null, platform: "android" | "ios") => {
      setSoftOpen(false);
      setHardOpen(false);
      setActiveConfig(null);
      setActivePlatform(null);

      if (!config || !config.is_active || config.update_mode === "off") {
        return;
      }

      const current = await getNativeAppVersionString();
      if (!current) return;

      const min = config.minimum_supported_version;
      const latest = config.latest_version;

      const belowMin = min ? isVersionLessThan(current, min) : false;
      const belowLatest = latest ? isVersionLessThan(current, latest) : false;

      if (belowMin) {
        setActivePlatform(platform);
        setActiveConfig(config);
        setHardOpen(true);
        return;
      }

      if (!belowLatest) {
        return;
      }

      if (config.update_mode === "soft") {
        if (isSoftDismissedFor(platform, latest)) {
          return;
        }
        setActivePlatform(platform);
        setActiveConfig(config);
        setSoftOpen(true);
        return;
      }

      if (config.update_mode === "hard") {
        setActivePlatform(platform);
        setActiveConfig(config);
        setHardOpen(true);
      }
    },
    []
  );

  const runCheck = useCallback(async () => {
    if (!isNativeApp()) return;
    const plat = getPlatform();
    if (plat !== "android" && plat !== "ios") return;
    const platform = plat as "android" | "ios";

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const now = Date.now();
      const cooldownExpired = isCooldownExpired(now);
      let config: AppUpdateRuntimeConfig | null = null;

      if (!cooldownExpired) {
        config = readCachedConfig();
        await applyDecision(config, platform);
        return;
      }

      const online =
        typeof navigator !== "undefined" ? navigator.onLine !== false : true;

      if (online) {
        try {
          const fresh = await fetchAppUpdateRuntimeConfig(platform);
          writeLastCheckAtNow();
          if (fresh) {
            writeCachedConfig(fresh);
            config = fresh;
          } else {
            config = readCachedConfig();
          }
        } catch {
          config = readCachedConfig();
        }
      } else {
        config = readCachedConfig();
      }

      await applyDecision(config, platform);
    } finally {
      inFlightRef.current = false;
    }
  }, [applyDecision]);

  const scheduleCheck = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void runCheck();
    }, 400);
  }, [runCheck]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    scheduleCheck();
  }, [scheduleCheck]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let removeResume: (() => void) | undefined;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("resume", () => {
          console.log("[DBG:APP] resume", { t: Date.now() });
          scheduleCheck();
        });
        if (!cancelled) {
          removeResume = () => {
            void h.remove();
          };
        } else {
          void h.remove();
        }
      } catch {
        /* noop */
      }
    })();

    const onVis = () => {
      if (!document.hidden) scheduleCheck();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      removeResume?.();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [scheduleCheck]);

  if (!isNativeApp()) {
    return null;
  }

  const platform = activePlatform;
  const config = activeConfig;
  const previewRow =
    platform && config ? runtimeToPreviewRow(platform, config) : null;

  const titleSoft =
    previewRow != null ? previewModalTitle(previewRow, "soft") : "";
  const messageSoft =
    previewRow != null ? previewModalMessage(previewRow, "soft") : "";
  const titleHard =
    previewRow != null ? previewModalTitle(previewRow, "hard") : "";
  const messageHard =
    previewRow != null ? previewModalMessage(previewRow, "hard") : "";

  const storeUrl = config?.store_url?.trim() || undefined;

  const handleOpenStore = () => {
    const url = config?.store_url?.trim();
    if (!url) return;
    void openExternalUrl(url);
  };

  const handleSoftClose = () => {
    setSoftOpen(false);
    if (platform && config?.latest_version) {
      writeSoftDismissSignature(platform, config.latest_version);
    }
  };

  return (
    <>
      <SoftUpdateModal
        open={softOpen}
        onClose={handleSoftClose}
        title={titleSoft}
        message={messageSoft}
        updateUrl={storeUrl}
        onUpdatePress={handleOpenStore}
      />
      <HardUpdateModal
        open={hardOpen}
        title={titleHard}
        message={messageHard}
        updateUrl={storeUrl}
        onUpdatePress={handleOpenStore}
      />
    </>
  );
}
