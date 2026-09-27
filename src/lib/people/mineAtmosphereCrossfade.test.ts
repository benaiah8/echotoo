import { describe, expect, it } from "vitest";
import {
  applyMineAtmosphereReady,
  clearMineAtmosphereCrossfade,
  completeMineAtmosphereCrossfade,
  createMineAtmosphereCrossfadeState,
  MINE_ATMOSPHERE_CROSSFADE_MS,
} from "./mineAtmosphereCrossfade";

describe("mineAtmosphereCrossfade", () => {
  it("exposes ~280ms duration token", () => {
    expect(MINE_ATMOSPHERE_CROSSFADE_MS).toBe(280);
  });

  it("A → B keeps A until B is applied, then fades", () => {
    let s = createMineAtmosphereCrossfadeState();
    s = applyMineAtmosphereReady(s, "a");
    expect(s).toMatchObject({
      fromPath: "a",
      toPath: null,
      fading: false,
    });

    s = applyMineAtmosphereReady(s, "b");
    expect(s).toMatchObject({
      fromPath: "a",
      toPath: "b",
      fading: true,
    });

    const gen = s.generation;
    s = completeMineAtmosphereCrossfade(s, gen);
    expect(s).toMatchObject({
      fromPath: "b",
      toPath: null,
      fading: false,
    });
  });

  it("completed fade leaves one layer", () => {
    let s = applyMineAtmosphereReady(
      applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a"),
      "b"
    );
    s = completeMineAtmosphereCrossfade(s, s.generation);
    expect(s.fromPath).toBe("b");
    expect(s.toPath).toBeNull();
    expect(s.fading).toBe(false);
  });

  it("rapid A → B → C ends on C (retarget keeps from, replaces to)", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a");
    s = applyMineAtmosphereReady(s, "b");
    const genB = s.generation;
    s = applyMineAtmosphereReady(s, "c");
    expect(s).toMatchObject({
      fromPath: "a",
      toPath: "c",
      fading: true,
    });
    expect(s.generation).toBeGreaterThan(genB);

    // Stale B completion must not win.
    s = completeMineAtmosphereCrossfade(s, genB);
    expect(s.toPath).toBe("c");
    expect(s.fading).toBe(true);

    s = completeMineAtmosphereCrossfade(s, s.generation);
    expect(s).toMatchObject({ fromPath: "c", toPath: null, fading: false });
  });

  it("ignores duplicate ready for the same target while fading", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a");
    s = applyMineAtmosphereReady(s, "b");
    const gen = s.generation;
    s = applyMineAtmosphereReady(s, "b");
    expect(s.generation).toBe(gen);
  });

  it("same-person photo cycling crossfades path changes", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "p0");
    s = applyMineAtmosphereReady(s, "p1");
    expect(s).toMatchObject({ fromPath: "p0", toPath: "p1", fading: true });
    s = completeMineAtmosphereCrossfade(s, s.generation);
    expect(s.fromPath).toBe("p1");
  });

  it("candidate without usable image fades to empty", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a");
    s = applyMineAtmosphereReady(s, null);
    expect(s).toMatchObject({
      fromPath: "a",
      toPath: null,
      fading: true,
    });
    s = completeMineAtmosphereCrossfade(s, s.generation);
    expect(s).toMatchObject({
      fromPath: null,
      toPath: null,
      fading: false,
    });
  });

  it("reduced-motion snaps without fading", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a");
    s = applyMineAtmosphereReady(s, "b", { reduceMotion: true });
    expect(s).toMatchObject({
      fromPath: "b",
      toPath: null,
      fading: false,
    });

    s = applyMineAtmosphereReady(s, null, { reduceMotion: true });
    expect(s).toMatchObject({
      fromPath: null,
      toPath: null,
      fading: false,
    });
  });

  it("leaving Mine clears both layers", () => {
    let s = applyMineAtmosphereReady(
      applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a"),
      "b"
    );
    s = clearMineAtmosphereCrossfade(s);
    expect(s).toMatchObject({
      fromPath: null,
      toPath: null,
      fading: false,
    });
  });

  it("stale completion after clear is ignored", () => {
    let s = applyMineAtmosphereReady(createMineAtmosphereCrossfadeState(), "a");
    s = applyMineAtmosphereReady(s, "b");
    const gen = s.generation;
    s = clearMineAtmosphereCrossfade(s);
    s = completeMineAtmosphereCrossfade(s, gen);
    expect(s.fromPath).toBeNull();
    expect(s.fading).toBe(false);
  });

  it("first ready with no prior wash shows immediately (one layer)", () => {
    const s = applyMineAtmosphereReady(
      createMineAtmosphereCrossfadeState(),
      "a"
    );
    expect(s).toMatchObject({
      fromPath: "a",
      toPath: null,
      fading: false,
    });
  });
});
