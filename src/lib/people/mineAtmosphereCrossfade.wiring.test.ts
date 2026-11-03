import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overlaySrc = readFileSync(
  new URL("../../pages/people/MatchDeckOverlay.tsx", import.meta.url),
  "utf8"
);

describe("Mine atmosphere crossfade wiring", () => {
  it("mounts MineAtmosphereCrossfade for Duo (my_plans) only", () => {
    expect(overlaySrc).toContain("<MineAtmosphereCrossfade");
    expect(overlaySrc).toContain("isDuoAtmosphereScope");
    expect(overlaySrc).toContain("handleMineAtmosphereChange");
    expect(overlaySrc).toContain("applyMineAtmosphereReady");
    expect(overlaySrc).not.toContain("ProfileHeroAvatarAtmosphere");
    expect(overlaySrc).not.toContain("MineLightAtmosphereBloom");
  });

  it("Discover vertical feed keeps flat canvas (no atmosphere on discover scope)", () => {
    expect(overlaySrc).toContain('bg-[var(--app-canvas)]');
    expect(overlaySrc).toContain('data-people-feed-canvas="true"');
    expect(overlaySrc).toMatch(
      /isDuoAtmosphereScope[\s\S]*contentScope === "my_plans"/
    );
  });

  it("keeps legacy atmosphere module files available (not deleted)", () => {
    const atm = readFileSync(
      new URL("../../components/people/MineAtmosphereCrossfade.tsx", import.meta.url),
      "utf8"
    );
    expect(atm).toContain("MineAtmosphereCrossfade");
  });
});
