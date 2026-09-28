/**
 * App update runtime hardening — cooldown, store URL, cache/network semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideAppUpdatePrompt,
  logAppUpdateDecision,
} from "./appUpdateDecision";
import {
  APP_UPDATE_CACHED_CONFIG_KEY,
  APP_UPDATE_LAST_CHECK_KEY,
  APP_UPDATE_NETWORK_COOLDOWN_MS,
  clearCachedConfig,
  getCooldownMs,
  isCooldownExpired,
  readCachedConfig,
  writeCachedConfig,
  writeLastCheckAtNow,
} from "./appUpdateRuntimeStorage";
import {
  ECHOTOO_ANDROID_PACKAGE_ID,
  ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
  resolveAppUpdateStoreUrl,
} from "./appUpdateStoreUrl";
import { isBuildLessThan, parseBuildNumber } from "./appUpdateVersionCompare";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe("app update runtime hardening", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("1: Android/iOS share the same runtime controller", () => {
    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    expect(ctrl).toContain('plat !== "android" && plat !== "ios"');
    expect(ctrl).toContain("decideAppUpdatePrompt");
    expect(ctrl).toContain("fetchAppUpdateRuntimeConfig");
    expect(ctrl).not.toMatch(/if \(platform === "android"\)[\s\S]*fetch/);
  });

  it("2: build comparison remains numeric", () => {
    expect(parseBuildNumber("11")).toBe(11);
    expect(isBuildLessThan("10", "11")).toBe(true);
    expect(isBuildLessThan("9", "10")).toBe(true);
  });

  it("3: cached hard config can decide hard immediately", () => {
    const d = decideAppUpdatePrompt({
      isNative: true,
      installedVersion: "2.0",
      installedBuild: "10",
      softDismissed: false,
      config: {
        is_active: true,
        update_mode: "hard",
        latest_version: "2.0",
        latest_build: "11",
        minimum_supported_version: "1.0",
        minimum_supported_build: "",
        store_release_ready: true,
        store_url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
      },
    });
    expect(d.prompt).toBe("hard");
  });

  it("4–6: network cooldown is ~10 minutes; cold mount forces fresh RPC", () => {
    expect(APP_UPDATE_NETWORK_COOLDOWN_MS).toBe(10 * 60 * 1000);
    expect(getCooldownMs()).toBe(APP_UPDATE_NETWORK_COOLDOWN_MS);
    expect(getCooldownMs()).not.toBe(12 * 60 * 60 * 1000);

    expect(isCooldownExpired(Date.now())).toBe(true);
    writeLastCheckAtNow();
    const last = Date.parse(localStorage.getItem(APP_UPDATE_LAST_CHECK_KEY)!);
    expect(isCooldownExpired(last + APP_UPDATE_NETWORK_COOLDOWN_MS - 1)).toBe(
      false
    );
    expect(isCooldownExpired(last + APP_UPDATE_NETWORK_COOLDOWN_MS)).toBe(true);

    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    // Cache still evaluates first.
    expect(ctrl).toContain('applyDecision(cached, platform, "cache")');
    // Cold mount always refreshes even if cooldown not expired.
    expect(ctrl).toContain("scheduleCheck({ forceNetwork: true })");
    expect(ctrl).toContain("forceNetwork");
    expect(ctrl).toContain(
      "if (!forceNetwork && !isCooldownExpired(now))"
    );
    expect(ctrl).toContain("fetchAppUpdateRuntimeConfig");
    // Resume/visibility still call scheduleCheck() without force.
    expect(ctrl).toMatch(
      /App\.addListener\("resume",\s*\(\)\s*=>\s*\{\s*scheduleCheck\(\);/
    );
    expect(ctrl).toContain("if (!document.hidden) scheduleCheck();");
    expect(ctrl).not.toContain("setInterval");
  });

  it("7: fresh null config clears cache", () => {
    writeCachedConfig({
      update_mode: "hard",
      title: "t",
      message: "m",
      latest_version: "2.0",
      latest_build: "11",
      minimum_supported_version: "1.0",
      minimum_supported_build: "11",
      is_active: true,
      store_release_ready: true,
      store_url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
    });
    expect(readCachedConfig()?.latest_build).toBe("11");
    clearCachedConfig();
    expect(readCachedConfig()).toBeNull();
    expect(localStorage.getItem(APP_UPDATE_CACHED_CONFIG_KEY)).toBeNull();

    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    expect(ctrl).toContain("clearCachedConfig()");
    expect(ctrl).toContain('applyDecision(null, platform, "network")');
  });

  it("8: store_release_ready false suppresses hard", () => {
    const d = decideAppUpdatePrompt({
      isNative: true,
      installedBuild: "5",
      installedVersion: "2.0",
      softDismissed: false,
      config: {
        is_active: true,
        update_mode: "hard",
        latest_version: "2.0",
        latest_build: "11",
        minimum_supported_version: "1.0",
        minimum_supported_build: "11",
        store_release_ready: false,
        store_url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
      },
    });
    expect(d.prompt).toBe("none");
    expect(d.reason).toBe("store_not_ready");
  });

  it("9–11: Android/iOS store URL resolve", () => {
    expect(ECHOTOO_ANDROID_PACKAGE_ID).toBe("com.echotoo.app");
    expect(
      resolveAppUpdateStoreUrl(
        "android",
        "https://play.google.com/store/apps/details?id=custom"
      )
    ).toEqual({
      url: "https://play.google.com/store/apps/details?id=custom",
      usedFallback: false,
    });
    expect(resolveAppUpdateStoreUrl("android", "")).toEqual({
      url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
      usedFallback: true,
    });
    expect(resolveAppUpdateStoreUrl("android", "   ")).toEqual({
      url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
      usedFallback: true,
    });
    expect(resolveAppUpdateStoreUrl("ios", "")).toEqual({
      url: "",
      usedFallback: false,
    });

    const iosHard = decideAppUpdatePrompt({
      isNative: true,
      installedVersion: "2.0",
      installedBuild: "10",
      softDismissed: false,
      config: {
        is_active: true,
        update_mode: "hard",
        latest_version: "2.0",
        latest_build: "11",
        minimum_supported_version: "1.0",
        minimum_supported_build: "",
        store_release_ready: true,
        store_url: "",
      },
    });
    expect(iosHard.prompt).toBe("none");
    expect(iosHard.reason).toBe("below_latest_hard_unsafe");
  });

  it("12: hard still requires store_release_ready", () => {
    expect(
      decideAppUpdatePrompt({
        isNative: true,
        installedBuild: "1",
        installedVersion: "1.0",
        softDismissed: false,
        config: {
          is_active: true,
          update_mode: "hard",
          latest_version: "2.0",
          latest_build: "11",
          minimum_supported_version: "2.0",
          minimum_supported_build: "11",
          store_release_ready: false,
          store_url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
        },
      }).reason
    ).toBe("store_not_ready");
  });

  it("13: web remains no-op", () => {
    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    expect(ctrl).toContain("if (!isNativeApp()) return");
    expect(ctrl).toContain("if (!isNativeApp()) {\n    return null;");
    expect(
      decideAppUpdatePrompt({
        isNative: false,
        installedVersion: "1.0",
        installedBuild: "1",
        softDismissed: false,
        config: {
          is_active: true,
          update_mode: "hard",
          latest_version: "2.0",
          latest_build: "11",
          minimum_supported_version: "1.0",
          minimum_supported_build: "1",
          store_release_ready: true,
          store_url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
        },
      }).reason
    ).toBe("non_native");
  });

  it("14: one decision console.info per evaluation", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAppUpdateDecision({
      platform: "android",
      installedVersion: "2.0",
      installedBuild: "10",
      source: "cache",
      config: {
        is_active: true,
        update_mode: "hard",
        latest_version: "2.0",
        latest_build: "11",
        minimum_supported_version: "1.0",
        minimum_supported_build: "",
        store_release_ready: true,
        store_url: ECHOTOO_ANDROID_PLAY_STORE_FALLBACK_URL,
      },
      decision: { prompt: "hard", reason: "below_latest_hard" },
    });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toBe("[AppUpdateDecision]");
    expect(info.mock.calls[0]?.[1]).toMatchObject({
      platform: "android",
      source: "cache",
      prompt: "hard",
      reason: "below_latest_hard",
      storeUrlAvailable: true,
    });

    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    expect(ctrl).toContain("logAppUpdateDecision");
  });

  it("15: no periodic polling", () => {
    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    expect(ctrl).not.toContain("setInterval");
    expect(ctrl).toContain('App.addListener("resume"');
    expect(ctrl).toContain("visibilitychange");
  });

  it("16: Internal Tools fields unchanged", () => {
    const page = read("pages/internal/AppUpdatesPage.tsx");
    for (const key of [
      "latest_version",
      "latest_build",
      "minimum_supported_version",
      "minimum_supported_build",
      "update_mode",
      "title",
      "message",
      "android_store_url",
      "ios_store_url",
      "is_active",
      "store_release_ready",
    ]) {
      expect(page).toContain(key);
    }
  });

  it("controller applies Android store fallback before decide", () => {
    const ctrl = read("components/AppUpdateRuntimeController.tsx");
    expect(ctrl).toContain("resolveAppUpdateStoreUrl");
    expect(ctrl).toContain("withResolvedStoreUrl");
  });
});
