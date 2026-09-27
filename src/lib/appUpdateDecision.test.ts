import { describe, expect, it } from "vitest";
import {
  decideAppUpdatePrompt,
  softDismissSignature,
  type AppUpdateDecisionConfig,
} from "./appUpdateDecision";
import {
  isBuildLessThan,
  isInstallBelowTarget,
  parseBuildNumber,
} from "./appUpdateVersionCompare";

function baseConfig(
  overrides: Partial<AppUpdateDecisionConfig> = {}
): AppUpdateDecisionConfig {
  return {
    is_active: true,
    update_mode: "soft",
    latest_version: "2.0",
    minimum_supported_version: "1.0",
    latest_build: "20",
    minimum_supported_build: "10",
    store_release_ready: true,
    store_url: "https://play.google.com/store/apps/details?id=com.echotoo.app",
    ...overrides,
  };
}

function decide(
  overrides: {
    config?: AppUpdateDecisionConfig | null;
    installedVersion?: string | null;
    installedBuild?: string | null;
    softDismissed?: boolean;
    isNative?: boolean;
  } = {}
) {
  return decideAppUpdatePrompt({
    isNative: overrides.isNative ?? true,
    config: "config" in overrides ? overrides.config! : baseConfig(),
    installedVersion:
      "installedVersion" in overrides ? overrides.installedVersion! : "2.0",
    installedBuild:
      "installedBuild" in overrides ? overrides.installedBuild! : "20",
    softDismissed: overrides.softDismissed ?? false,
  });
}

describe("parseBuildNumber / isBuildLessThan", () => {
  it("parses integer builds", () => {
    expect(parseBuildNumber("11")).toBe(11);
    expect(parseBuildNumber(" 42 ")).toBe(42);
  });

  it("rejects malformed builds", () => {
    expect(parseBuildNumber("")).toBeNull();
    expect(parseBuildNumber(null)).toBeNull();
    expect(parseBuildNumber("1.0")).toBeNull();
    expect(parseBuildNumber("12a")).toBeNull();
    expect(parseBuildNumber("-1")).toBeNull();
  });

  it("compares builds numerically", () => {
    expect(isBuildLessThan("10", "11")).toBe(true);
    expect(isBuildLessThan("11", "11")).toBe(false);
    expect(isBuildLessThan("12", "11")).toBe(false);
  });
});

describe("isInstallBelowTarget", () => {
  it("prefers build when target build is set", () => {
    expect(
      isInstallBelowTarget({
        installedVersion: "2.0",
        installedBuild: "10",
        targetVersion: "2.0",
        targetBuild: "11",
      })
    ).toBe(true);
  });

  it("same marketing version but older build → below", () => {
    expect(
      isInstallBelowTarget({
        installedVersion: "2.0",
        installedBuild: "10",
        targetVersion: "2.0",
        targetBuild: "12",
      })
    ).toBe(true);
  });

  it("fail open when target build set but install build missing", () => {
    expect(
      isInstallBelowTarget({
        installedVersion: "1.0",
        installedBuild: null,
        targetVersion: "9.0",
        targetBuild: "99",
      })
    ).toBe(false);
  });

  it("falls back to version when target build empty", () => {
    expect(
      isInstallBelowTarget({
        installedVersion: "1.0.0",
        installedBuild: "99",
        targetVersion: "1.0.1",
        targetBuild: "",
      })
    ).toBe(true);
  });
});

describe("decideAppUpdatePrompt", () => {
  it("installed == latest → no prompt", () => {
    expect(
      decide({ installedVersion: "2.0", installedBuild: "20" }).prompt
    ).toBe("none");
  });

  it("installed > latest → no prompt", () => {
    expect(
      decide({ installedVersion: "2.0", installedBuild: "25" }).prompt
    ).toBe("none");
  });

  it("installed < latest + soft → soft", () => {
    const d = decide({
      installedVersion: "2.0",
      installedBuild: "15",
      config: baseConfig({ update_mode: "soft" }),
    });
    expect(d.prompt).toBe("soft");
  });

  it("installed < latest + hard → hard", () => {
    const d = decide({
      installedVersion: "2.0",
      installedBuild: "15",
      config: baseConfig({ update_mode: "hard" }),
    });
    expect(d.prompt).toBe("hard");
  });

  it("installed < minimum + soft → hard", () => {
    const d = decide({
      installedVersion: "2.0",
      installedBuild: "5",
      config: baseConfig({ update_mode: "soft" }),
    });
    expect(d.prompt).toBe("hard");
    expect(d.reason).toBe("below_minimum");
  });

  it("mode off → no prompt even below min", () => {
    const d = decide({
      installedBuild: "1",
      config: baseConfig({ update_mode: "off" }),
    });
    expect(d.prompt).toBe("none");
    expect(d.reason).toBe("mode_off");
  });

  it("inactive → no prompt", () => {
    expect(
      decide({ config: baseConfig({ is_active: false }) }).prompt
    ).toBe("none");
  });

  it("store_release_ready false → no prompt", () => {
    const d = decide({
      installedBuild: "5",
      config: baseConfig({ store_release_ready: false }),
    });
    expect(d.prompt).toBe("none");
    expect(d.reason).toBe("store_not_ready");
  });

  it("hard + missing store URL → never lock user out", () => {
    const d = decide({
      installedBuild: "5",
      config: baseConfig({
        update_mode: "hard",
        store_url: "",
      }),
    });
    expect(d.prompt).toBe("none");
    expect(d.reason).toBe("below_min_but_hard_unsafe");
  });

  it("hard below latest + missing store URL → fail open", () => {
    const d = decide({
      installedBuild: "15",
      config: baseConfig({
        update_mode: "hard",
        store_url: "   ",
      }),
    });
    expect(d.prompt).toBe("none");
    expect(d.reason).toBe("below_latest_hard_unsafe");
  });

  it("Android/iOS independent configs (different latest builds)", () => {
    const android = decide({
      installedBuild: "10",
      config: baseConfig({
        latest_build: "11",
        update_mode: "soft",
        store_url: "https://play.google.com/...",
      }),
    });
    const ios = decide({
      installedBuild: "50",
      config: baseConfig({
        latest_build: "50",
        minimum_supported_build: "40",
        update_mode: "soft",
        store_url: "https://apps.apple.com/...",
      }),
    });
    expect(android.prompt).toBe("soft");
    expect(ios.prompt).toBe("none");
  });

  it("same marketing version but older build → update still appears", () => {
    const d = decide({
      installedVersion: "2.0",
      installedBuild: "10",
      config: baseConfig({
        latest_version: "2.0",
        latest_build: "11",
        update_mode: "soft",
      }),
    });
    expect(d.prompt).toBe("soft");
  });

  it("upgrading the build removes the update prompt", () => {
    const before = decide({ installedBuild: "10" });
    const after = decide({ installedBuild: "20" });
    expect(before.prompt).toBe("soft");
    expect(after.prompt).toBe("none");
  });

  it("null legacy build fields → version fallback still works", () => {
    const d = decide({
      installedVersion: "1.0.0",
      installedBuild: null,
      config: baseConfig({
        latest_version: "1.0.1",
        latest_build: "",
        minimum_supported_version: "1.0.0",
        minimum_supported_build: "",
        update_mode: "soft",
      }),
    });
    expect(d.prompt).toBe("soft");
  });

  it("undefined store_release_ready (pre-migration) → treated as ready", () => {
    const d = decide({
      installedBuild: "15",
      config: baseConfig({
        store_release_ready: undefined,
        update_mode: "soft",
      }),
    });
    expect(d.prompt).toBe("soft");
  });

  it("null build fields do not force hard lockout", () => {
    const d = decide({
      installedVersion: "0.0.1",
      installedBuild: null,
      config: baseConfig({
        latest_version: "",
        latest_build: "99",
        minimum_supported_version: "",
        minimum_supported_build: "50",
        update_mode: "hard",
      }),
    });
    // Cannot compare builds without install build → fail open
    expect(d.prompt).toBe("none");
  });

  it("soft dismissal suppresses soft for current target", () => {
    const d = decide({
      installedBuild: "15",
      softDismissed: true,
      config: baseConfig({ update_mode: "soft" }),
    });
    expect(d.prompt).toBe("none");
    expect(d.reason).toBe("soft_dismissed");
  });

  it("soft dismiss signature changes when latest build changes", () => {
    expect(softDismissSignature("android", "2.0", "10")).toBe(
      "android:2.0:10"
    );
    expect(softDismissSignature("android", "2.0", "11")).toBe(
      "android:2.0:11"
    );
    expect(softDismissSignature("android", "2.0", "")).toBe("android:2.0");
  });

  it("non-native → no prompt", () => {
    expect(decide({ isNative: false, installedBuild: "1" }).prompt).toBe(
      "none"
    );
  });

  it("no config → no prompt", () => {
    expect(decide({ config: null }).prompt).toBe("none");
  });
});
