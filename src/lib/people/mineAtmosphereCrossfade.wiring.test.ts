import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overlaySrc = readFileSync(
  new URL("../../pages/people/MatchDeckOverlay.tsx", import.meta.url),
  "utf8"
);

describe("Mine atmosphere crossfade wiring", () => {
  it("uses MineAtmosphereCrossfade instead of single-path snap clear", () => {
    expect(overlaySrc).toContain("MineAtmosphereCrossfade");
    expect(overlaySrc).toContain("applyMineAtmosphereReady");
    expect(overlaySrc).toContain("clearMineAtmosphereCrossfade");
    expect(overlaySrc).not.toContain("setMineAtmospherePath(null)");
    expect(overlaySrc).not.toContain("ProfileHeroAvatarAtmosphere");
    expect(overlaySrc).not.toContain("MineLightAtmosphereBloom");
  });

  it("keeps prior wash when identity changes (no blank clear)", () => {
    expect(overlaySrc).toContain("Do not blank on A→B alone");
    expect(overlaySrc).toContain("if (!mineAtmosphereIdentityKey)");
  });

  it("syncs identity ref in useLayoutEffect before child atmosphere reports", () => {
    expect(overlaySrc).toContain("useLayoutEffect");
    expect(overlaySrc).toContain("shouldApplyMineAtmosphereReport");
    expect(overlaySrc).toMatch(
      /useLayoutEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?mineAtmosphereIdentityRef\.current\s*=\s*mineAtmosphereIdentityKey/
    );
  });

  it("applies atmosphere from existing warm on identity commit", () => {
    expect(overlaySrc).toContain("isMineFrontImageWarmDone");
    expect(overlaySrc).toContain("shouldRunMineAtmosphereWarmWatch");
    expect(overlaySrc).toContain("mineAtmosphereWarmWatchGenRef");
  });
});
