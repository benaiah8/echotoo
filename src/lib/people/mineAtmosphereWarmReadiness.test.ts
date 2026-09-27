import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyMineAtmosphereReady,
  clearMineAtmosphereCrossfade,
  createMineAtmosphereCrossfadeState,
} from "./mineAtmosphereCrossfade";
import {
  canApplyMineAtmosphereFromWarm,
  resolveMineAtmosphereWarmSettlement,
  shouldRunMineAtmosphereWarmWatch,
} from "./mineAtmosphereWarmReadiness";
import {
  clearMineFrontImageWarmState,
  isMineFrontImageWarmDone,
  warmMineFrontImage,
} from "./mineCandidateImageWarm";

vi.mock("../imageOptimization", () => ({
  preloadImage: vi.fn((src: string) => {
    if (src.includes("fail")) return Promise.reject(new Error("load failed"));
    return Promise.resolve();
  }),
}));

import { preloadImage } from "../imageOptimization";

const overlaySrc = readFileSync(
  new URL("../../pages/people/MatchDeckOverlay.tsx", import.meta.url),
  "utf8"
);

afterEach(() => {
  clearMineFrontImageWarmState();
  vi.mocked(preloadImage).mockClear();
});

describe("shouldRunMineAtmosphereWarmWatch", () => {
  it("runs on candidate identity change only", () => {
    expect(
      shouldRunMineAtmosphereWarmWatch({
        previousIdentityKey: "a:a",
        nextIdentityKey: "b:b",
      })
    ).toBe(true);
    expect(
      shouldRunMineAtmosphereWarmWatch({
        previousIdentityKey: "b:b",
        nextIdentityKey: "b:b",
      })
    ).toBe(false);
    expect(
      shouldRunMineAtmosphereWarmWatch({
        previousIdentityKey: "b:b",
        nextIdentityKey: null,
      })
    ).toBe(false);
  });
});

describe("canApplyMineAtmosphereFromWarm", () => {
  it("rejects stale watch generation and identity", () => {
    expect(
      canApplyMineAtmosphereFromWarm({
        watchGeneration: 1,
        currentWatchGeneration: 2,
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: "b:b",
      })
    ).toBe(false);
    expect(
      canApplyMineAtmosphereFromWarm({
        watchGeneration: 2,
        currentWatchGeneration: 2,
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: "c:c",
      })
    ).toBe(false);
    expect(
      canApplyMineAtmosphereFromWarm({
        watchGeneration: 2,
        currentWatchGeneration: 2,
        reportIdentityKey: "c:c",
        authoritativeIdentityKey: "c:c",
      })
    ).toBe(true);
  });
});

describe("resolveMineAtmosphereWarmSettlement", () => {
  it("warm success with path → apply-path", () => {
    expect(
      resolveMineAtmosphereWarmSettlement({
        warmSucceeded: true,
        frontPath: "b.jpg",
      })
    ).toBe("apply-path");
  });

  it("warm failure → noop (never clear)", () => {
    expect(
      resolveMineAtmosphereWarmSettlement({
        warmSucceeded: false,
        frontPath: "b.jpg",
      })
    ).toBe("noop");
    expect(
      resolveMineAtmosphereWarmSettlement({
        warmSucceeded: false,
        frontPath: null,
      })
    ).toBe("noop");
  });
});

describe("warm watch vs photo cycle", () => {
  it("same-person photo cycle does not re-run warm watch", () => {
    expect(
      shouldRunMineAtmosphereWarmWatch({
        previousIdentityKey: "b:b",
        nextIdentityKey: "b:b",
      })
    ).toBe(false);
  });

  it("A → B → C: stale B watch generation cannot apply to C", () => {
    expect(
      canApplyMineAtmosphereFromWarm({
        watchGeneration: 1,
        currentWatchGeneration: 2,
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: "c:c",
      })
    ).toBe(false);
    expect(
      canApplyMineAtmosphereFromWarm({
        watchGeneration: 2,
        currentWatchGeneration: 2,
        reportIdentityKey: "c:c",
        authoritativeIdentityKey: "c:c",
      })
    ).toBe(true);
  });

  it("leaving Mine resets warm watch identity gate", () => {
    expect(
      shouldRunMineAtmosphereWarmWatch({
        previousIdentityKey: "b:b",
        nextIdentityKey: null,
      })
    ).toBe(false);
  });
});

/**
 * Simulate Overlay apply ordering: child report vs warm settlement.
 * Mirrors MatchDeckOverlay gates (identity + generation).
 */
function simulateWarmChildRace(args: {
  fromPath: string;
  toPath: string;
  childReadyFirst: boolean;
  warmSucceeds: boolean;
  leaveMineBeforeWarm?: boolean;
  navigateToC?: boolean;
}): {
  finalFrom: string | null;
  finalTo: string | null;
  fading: boolean;
} {
  let atm = applyMineAtmosphereReady(
    createMineAtmosphereCrossfadeState(),
    args.fromPath
  );
  let watchGen = 1;
  let identity: string | null = "b:b";

  const applyFromWarm = (path: string | null, succeeded: boolean) => {
    if (args.leaveMineBeforeWarm) {
      watchGen += 1;
      identity = null;
      atm = clearMineAtmosphereCrossfade(atm);
      return;
    }
    if (args.navigateToC) {
      watchGen += 1;
      identity = "c:c";
      return;
    }
    if (
      !canApplyMineAtmosphereFromWarm({
        watchGeneration: 1,
        currentWatchGeneration: watchGen,
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: identity,
      })
    ) {
      return;
    }
    if (
      resolveMineAtmosphereWarmSettlement({
        warmSucceeded: succeeded,
        frontPath: path,
      }) !== "apply-path"
    ) {
      return;
    }
    if (path) atm = applyMineAtmosphereReady(atm, path);
  };

  const applyFromChild = () => {
    if (identity !== "b:b") return;
    atm = applyMineAtmosphereReady(atm, args.toPath);
  };

  if (args.childReadyFirst) {
    applyFromChild();
    applyFromWarm(args.toPath, args.warmSucceeds);
  } else {
    applyFromWarm(args.toPath, args.warmSucceeds);
    if (!args.leaveMineBeforeWarm && !args.navigateToC) {
      applyFromChild();
    }
  }

  return {
    finalFrom: atm.fromPath,
    finalTo: atm.toPath,
    fading: atm.fading,
  };
}

describe("warm-failure vs child-ready race", () => {
  it("child succeeds then warm fails: atmosphere stays on B", () => {
    const r = simulateWarmChildRace({
      fromPath: "a",
      toPath: "b",
      childReadyFirst: true,
      warmSucceeds: false,
    });
    expect(r.finalFrom).toBe("a");
    expect(r.finalTo).toBe("b");
    expect(r.fading).toBe(true);
  });

  it("warm fails while child pending: prior A retained until child applies", () => {
    let atm = applyMineAtmosphereReady(
      createMineAtmosphereCrossfadeState(),
      "a"
    );
    // Warm fails → noop
    expect(
      resolveMineAtmosphereWarmSettlement({
        warmSucceeded: false,
        frontPath: "b",
      })
    ).toBe("noop");
    expect(atm.fromPath).toBe("a");
    expect(atm.toPath).toBeNull();

    // Child later succeeds
    atm = applyMineAtmosphereReady(atm, "b");
    expect(atm).toMatchObject({ fromPath: "a", toPath: "b", fading: true });
  });

  it("warm succeeds first: fades to B", () => {
    const r = simulateWarmChildRace({
      fromPath: "a",
      toPath: "b",
      childReadyFirst: false,
      warmSucceeds: true,
    });
    // Warm applied B, child re-applied B (dedupe mid-fade)
    expect(r.finalFrom).toBe("a");
    expect(r.finalTo).toBe("b");
    expect(r.fading).toBe(true);
  });

  it("both succeed: no unnecessary second fade target", () => {
    let atm = applyMineAtmosphereReady(
      createMineAtmosphereCrossfadeState(),
      "a"
    );
    atm = applyMineAtmosphereReady(atm, "b");
    const gen = atm.generation;
    atm = applyMineAtmosphereReady(atm, "b");
    expect(atm.generation).toBe(gen);
    expect(atm.toPath).toBe("b");
  });

  it("rapid A → B → C: late B warm cannot overwrite C", () => {
    const r = simulateWarmChildRace({
      fromPath: "a",
      toPath: "b",
      childReadyFirst: false,
      warmSucceeds: true,
      navigateToC: true,
    });
    // Stale warm for B ignored; atmosphere still A (C not applied in this sim)
    expect(r.finalFrom).toBe("a");
    expect(r.finalTo).toBeNull();
  });

  it("leave Mine during in-flight warm: completion cannot restore", () => {
    const r = simulateWarmChildRace({
      fromPath: "a",
      toPath: "b",
      childReadyFirst: false,
      warmSucceeds: true,
      leaveMineBeforeWarm: true,
    });
    expect(r.finalFrom).toBeNull();
    expect(r.finalTo).toBeNull();
    expect(r.fading).toBe(false);
  });

  it("genuine missing path still clears via explicit null apply", () => {
    let atm = applyMineAtmosphereReady(
      createMineAtmosphereCrossfadeState(),
      "a"
    );
    atm = applyMineAtmosphereReady(atm, null);
    expect(atm.fromPath).toBe("a");
    expect(atm.toPath).toBeNull();
    expect(atm.fading).toBe(true);
  });
});

describe("warm readiness integration", () => {
  it("B already warmed: applies without a second preload", async () => {
    await warmMineFrontImage("https://example.test/b.jpg");
    expect(isMineFrontImageWarmDone("https://example.test/b.jpg")).toBe(true);
    expect(preloadImage).toHaveBeenCalledTimes(1);

    await warmMineFrontImage("https://example.test/b.jpg");
    expect(preloadImage).toHaveBeenCalledTimes(1);

    let atm = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a");
    atm = applyMineAtmosphereReady(atm, "b");
    expect(atm.toPath).toBe("b");
  });

  it("B warm in progress: resolves when preload completes", async () => {
    const pending = warmMineFrontImage("https://example.test/pending.jpg");
    expect(preloadImage).toHaveBeenCalledTimes(1);
    await pending;
    expect(isMineFrontImageWarmDone("https://example.test/pending.jpg")).toBe(
      true
    );
  });

  it("failed warm rejects and is not marked done", async () => {
    await expect(
      warmMineFrontImage("https://example.test/fail.jpg")
    ).rejects.toThrow();
    expect(isMineFrontImageWarmDone("https://example.test/fail.jpg")).toBe(
      false
    );
  });

  it("duplicate readiness: settled same path is a no-op", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "b");
    const before = s.generation;
    s = applyMineAtmosphereReady(s, "b");
    expect(s.generation).toBe(before);
    expect(s.fading).toBe(false);
  });
});

describe("MatchDeckOverlay warm watch wiring", () => {
  it("reuses warmMineFrontImage and isMineFrontImageWarmDone on identity commit", () => {
    expect(overlaySrc).toContain("isMineFrontImageWarmDone");
    expect(overlaySrc).toContain("warmMineFrontImage");
    expect(overlaySrc).toContain("shouldRunMineAtmosphereWarmWatch");
    expect(overlaySrc).toContain("resolveMineFrontPhotoPath");
    expect(overlaySrc).toContain("mineAtmosphereWarmWatchGenRef");
  });

  it("still applies child reports through shouldApplyMineAtmosphereReport", () => {
    expect(overlaySrc).toContain("shouldApplyMineAtmosphereReport");
    expect(overlaySrc).toContain("applyMineAtmospherePath");
  });

  it("warm catch must not apply null (child-ready race fix)", () => {
    expect(overlaySrc).toContain("tryApplyFromWarmSuccess");
    expect(overlaySrc).toContain("resolveMineAtmosphereWarmSettlement");
    expect(overlaySrc).toContain("Ignore warm rejection");
    expect(overlaySrc).not.toMatch(
      /\.catch\(\s*\(\)\s*=>\s*tryApplyFromWarm\(null\)/
    );
    const warmCatch = overlaySrc.match(
      /warmMineFrontImage\([\s\S]*?\)\s*\.then\([\s\S]*?\)\s*\.catch\(\(\)\s*=>\s*\{([\s\S]*?)\}\)/
    );
    expect(warmCatch?.[1] ?? "").not.toMatch(
      /applyMineAtmospherePath\s*\(/
    );
  });
});
