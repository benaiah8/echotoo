/**
 * Native-only: fetch update policy via RPC (network cooldown), show soft/hard modals.
 * Cached config is evaluated immediately; cold mount always revalidates once;
 * resume/visibility revalidate only when the ~10 min cooldown is due.
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
import {
  decideAppUpdatePrompt,
  logAppUpdateDecision,
  type AppUpdateDecisionLogSource,
} from "../lib/appUpdateDecision";
import {
  clearCachedConfig,
  isCooldownExpired,
  readCachedConfig,
  writeCachedConfig,
  writeLastCheckAtNow,
  isSoftDismissedFor,
  writeSoftDismissSignature,
} from "../lib/appUpdateRuntimeStorage";
import { resolveAppUpdateStoreUrl } from "../lib/appUpdateStoreUrl";
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
    latest_build: c.latest_build,
    minimum_supported_version: c.minimum_supported_version,
    minimum_supported_build: c.minimum_supported_build,
    update_mode: c.update_mode,
    title: c.title,
    message: c.message,
    android_store_url: platform === "android" ? c.store_url : "",
    ios_store_url: platform === "ios" ? c.store_url : "",
    is_active: c.is_active,
    store_release_ready: c.store_release_ready ?? true,
    updated_at: "",
    updated_by_user_id: null,
  };
}

function withResolvedStoreUrl(
  platform: "android" | "ios",
  config: AppUpdateRuntimeConfig
): AppUpdateRuntimeConfig {
  const { url } = resolveAppUpdateStoreUrl(platform, config.store_url);
  if (url === (config.store_url ?? "").trim()) return config;
  return { ...config, store_url: url };
}

async function getNativeAppIdentity(): Promise<{
  version: string | null;
  build: string | null;
}> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return {
      version: info.version?.trim() || null,
      build: info.build?.trim() || null,
    };
  } catch {
    return { version: null, build: null };
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
    async (
      config: AppUpdateRuntimeConfig | null,
      platform: "android" | "ios",
      source: AppUpdateDecisionLogSource
    ) => {
      setSoftOpen(false);
      setHardOpen(false);
      setActiveConfig(null);
      setActivePlatform(null);

      const identity = await getNativeAppIdentity();
      const resolvedConfig = config
        ? withResolvedStoreUrl(platform, config)
        : null;

      const softDismissed = resolvedConfig
        ? isSoftDismissedFor(
            platform,
            resolvedConfig.latest_version,
            resolvedConfig.latest_build
          )
        : false;

      const decisionConfig = resolvedConfig
        ? {
            is_active: resolvedConfig.is_active,
            update_mode: resolvedConfig.update_mode,
            latest_version: resolvedConfig.latest_version,
            latest_build: resolvedConfig.latest_build,
            minimum_supported_version: resolvedConfig.minimum_supported_version,
            minimum_supported_build: resolvedConfig.minimum_supported_build,
            store_release_ready: resolvedConfig.store_release_ready,
            store_url: resolvedConfig.store_url,
          }
        : null;

      const decision = decideAppUpdatePrompt({
        isNative: true,
        config: decisionConfig,
        installedVersion: identity.version,
        installedBuild: identity.build,
        softDismissed,
      });

      logAppUpdateDecision({
        platform,
        installedVersion: identity.version,
        installedBuild: identity.build,
        source,
        config: decisionConfig,
        decision,
      });

      if (decision.prompt === "none" || !resolvedConfig) {
        return;
      }

      setActivePlatform(platform);
      setActiveConfig(resolvedConfig);
      if (decision.prompt === "soft") {
        setSoftOpen(true);
      } else if (decision.prompt === "hard") {
        setHardOpen(true);
      }
    },
    []
  );

  const runCheck = useCallback(async (options?: { forceNetwork?: boolean }) => {
    if (!isNativeApp()) return;
    const plat = getPlatform();
    if (plat !== "android" && plat !== "ios") return;
    const platform = plat as "android" | "ios";

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const now = Date.now();
      const forceNetwork = options?.forceNetwork === true;
      const cached = readCachedConfig();
      // Fast path: evaluate cache immediately (hard can show without waiting on network).
      await applyDecision(cached, platform, "cache");

      // Cold launch always revalidates; resume/visibility keep the 10-minute cooldown.
      if (!forceNetwork && !isCooldownExpired(now)) {
        return;
      }

      const online =
        typeof navigator !== "undefined" ? navigator.onLine !== false : true;

      if (!online) {
        return;
      }

      try {
        const fresh = await fetchAppUpdateRuntimeConfig(platform);
        writeLastCheckAtNow();
        if (fresh) {
          writeCachedConfig(fresh);
          await applyDecision(fresh, platform, "network");
        } else {
          // Admin disabled / no active row — do not keep a stale hard cache.
          clearCachedConfig();
          await applyDecision(null, platform, "network");
        }
      } catch {
        // Keep previously applied cache decision; last_check stays unset so retry stays due.
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [applyDecision]);

  const scheduleCheck = useCallback(
    (options?: { forceNetwork?: boolean }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void runCheck(options);
      }, 400);
    },
    [runCheck]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Native cold mount after splash: always one fresh RPC (ignore persisted cooldown).
  useEffect(() => {
    if (!isNativeApp()) return;
    scheduleCheck({ forceNetwork: true });
  }, [scheduleCheck]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let removeResume: (() => void) | undefined;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("resume", () => {
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
    if (platform && config) {
      writeSoftDismissSignature(
        platform,
        config.latest_version,
        config.latest_build
      );
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
