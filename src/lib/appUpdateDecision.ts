import type { AppUpdateMode } from "../types/appUpdateConfig";
import { isInstallBelowTarget } from "./appUpdateVersionCompare";

export type AppUpdatePromptKind = "none" | "soft" | "hard";

export type AppUpdateDecisionConfig = {
  is_active: boolean;
  update_mode: AppUpdateMode;
  latest_version: string;
  minimum_supported_version: string;
  /** Empty/null = legacy: use latest_version. */
  latest_build?: string | null;
  /** Empty/null = legacy: use minimum_supported_version. */
  minimum_supported_build?: string | null;
  /**
   * When undefined (pre-migration RPC), treated as true so existing prompts
   * keep working until the column exists. Explicit false suppresses prompts.
   */
  store_release_ready?: boolean | null;
  store_url: string;
};

export type AppUpdateDecisionInput = {
  isNative: boolean;
  config: AppUpdateDecisionConfig | null;
  installedVersion: string | null;
  installedBuild: string | null;
  /** Soft dismiss already recorded for this platform + current latest target. */
  softDismissed: boolean;
};

export type AppUpdateDecision = {
  prompt: AppUpdatePromptKind;
  /** Why no prompt / which gate fired — useful for tests and logging. */
  reason: string;
};

export type AppUpdateDecisionLogSource = "cache" | "network";

export type AppUpdateDecisionLogInput = {
  platform: "android" | "ios";
  installedVersion: string | null;
  installedBuild: string | null;
  source: AppUpdateDecisionLogSource;
  config: AppUpdateDecisionConfig | null;
  decision: AppUpdateDecision;
};

function hasStoreUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim());
}

/**
 * Sparse universal decision diagnostic — one call per evaluation (not per render).
 */
export function logAppUpdateDecision(input: AppUpdateDecisionLogInput): void {
  const config = input.config;
  console.info("[AppUpdateDecision]", {
    platform: input.platform,
    installedVersion: input.installedVersion,
    installedBuild: input.installedBuild,
    source: input.source,
    latestBuild: config?.latest_build ?? null,
    minimumSupportedBuild: config?.minimum_supported_build ?? null,
    updateMode: config?.update_mode ?? null,
    configActive: config?.is_active ?? null,
    storeReleaseReady:
      config == null
        ? null
        : config.store_release_ready === undefined ||
            config.store_release_ready === null
          ? true
          : Boolean(config.store_release_ready),
    storeUrlAvailable: hasStoreUrl(config?.store_url),
    prompt: input.decision.prompt,
    reason: input.decision.reason,
  });
}

/**
 * Explicit App Update decision (native only).
 *
 * Product rules:
 * - off → no enforcement at all
 * - soft → optional latest; minimum threshold can still force hard
 * - hard → latest target itself is mandatory (when below latest)
 * - HARD is never shown without store_release_ready + store URL (fail open)
 * - null/empty build fields → marketing-version fallback (rollout-safe)
 */
export function decideAppUpdatePrompt(
  input: AppUpdateDecisionInput
): AppUpdateDecision {
  if (!input.isNative) {
    return { prompt: "none", reason: "non_native" };
  }

  const config = input.config;
  if (!config) {
    return { prompt: "none", reason: "no_config" };
  }

  if (!config.is_active) {
    return { prompt: "none", reason: "inactive" };
  }

  if (config.update_mode === "off") {
    return { prompt: "none", reason: "mode_off" };
  }

  // Pre-migration clients: missing field → treat as ready (preserve legacy).
  const storeReady =
    config.store_release_ready === undefined ||
    config.store_release_ready === null
      ? true
      : Boolean(config.store_release_ready);

  if (!storeReady) {
    return { prompt: "none", reason: "store_not_ready" };
  }

  const belowMin = isInstallBelowTarget({
    installedVersion: input.installedVersion,
    installedBuild: input.installedBuild,
    targetVersion: config.minimum_supported_version,
    targetBuild: config.minimum_supported_build,
  });

  const belowLatest = isInstallBelowTarget({
    installedVersion: input.installedVersion,
    installedBuild: input.installedBuild,
    targetVersion: config.latest_version,
    targetBuild: config.latest_build,
  });

  const canHard = storeReady && hasStoreUrl(config.store_url);

  if (belowMin) {
    if (!canHard) {
      return { prompt: "none", reason: "below_min_but_hard_unsafe" };
    }
    return { prompt: "hard", reason: "below_minimum" };
  }

  if (!belowLatest) {
    return { prompt: "none", reason: "at_or_above_latest" };
  }

  if (config.update_mode === "soft") {
    if (input.softDismissed) {
      return { prompt: "none", reason: "soft_dismissed" };
    }
    return { prompt: "soft", reason: "below_latest_soft" };
  }

  // update_mode === "hard"
  if (!canHard) {
    return { prompt: "none", reason: "below_latest_hard_unsafe" };
  }
  return { prompt: "hard", reason: "below_latest_hard" };
}

/** Soft-dismiss signature for a given latest target (version + optional build). */
export function softDismissSignature(
  platform: string,
  latestVersion: string,
  latestBuild?: string | null
): string {
  const v = latestVersion.trim();
  const b = (latestBuild ?? "").trim();
  return b ? `${platform}:${v}:${b}` : `${platform}:${v}`;
}
