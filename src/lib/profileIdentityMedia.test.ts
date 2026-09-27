import { describe, expect, it } from "vitest";
import {
  deterministicEchoPresetForIdentity,
  resolveDisplayEchoPreset,
  resolveProfileIdentityMedia,
  stableIdentityHash,
} from "./profileIdentityMedia";
import { isAvatarPresetValue } from "./avatarPresets";

describe("resolveProfileIdentityMedia", () => {
  it("A. real photos + Echo — carousel is photos only, Echo not appended", () => {
    const result = resolveProfileIdentityMedia({
      profile_photos: ["a.webp", "b.webp", "c.webp"],
      echo_preset: "preset:owl_04",
      avatar_url: "a.webp",
    });
    expect(result.kind).toBe("photos");
    expect(result.photos).toEqual(["a.webp", "b.webp", "c.webp"]);
    expect(result.echoPreset).toBe("preset:owl_04");
    expect(result.photos).not.toContain("preset:owl_04");
    expect(result.primaryPhoto).toBe("a.webp");
  });

  it("B. no photos + Echo — Echo fallback", () => {
    const result = resolveProfileIdentityMedia({
      profile_photos: [],
      echo_preset: "preset:owl_02",
      avatar_url: null,
    });
    expect(result.kind).toBe("echo");
    expect(result.photos).toEqual([]);
    expect(result.echoPreset).toBe("preset:owl_02");
    expect(result.fallbackAvatar).toBe("preset:owl_02");
  });

  it("C. no photos, no Echo, legacy real avatar — legacy-photo", () => {
    const legacy = "user/avatar/photo.webp";
    const result = resolveProfileIdentityMedia({
      profile_photos: [],
      echo_preset: null,
      avatar_url: legacy,
    });
    expect(result.kind).toBe("legacy-photo");
    expect(result.photos).toEqual([]);
    expect(result.primaryPhoto).toBe(legacy);
    expect(result.fallbackAvatar).toBe(legacy);
  });

  it("D. preset avatar_url without echo_preset — Echo fallback", () => {
    const result = resolveProfileIdentityMedia({
      profile_photos: [],
      echo_preset: null,
      avatar_url: "preset:owl_04",
    });
    expect(result.kind).toBe("echo");
    expect(result.echoPreset).toBe("preset:owl_04");
    expect(result.photos).toEqual([]);
  });

  it("E. everything empty — empty kind", () => {
    const result = resolveProfileIdentityMedia({
      profile_photos: [],
      echo_preset: null,
      avatar_url: null,
    });
    expect(result.kind).toBe("empty");
    expect(result.photos).toEqual([]);
    expect(result.primaryPhoto).toBeNull();
    expect(result.echoPreset).toBeNull();
    expect(result.fallbackAvatar).toBeNull();
  });

  it("normalizes missing profile_photos and echo_preset (pre-P1 payloads)", () => {
    const result = resolveProfileIdentityMedia({
      avatar_url: "user/avatar/only.webp",
    });
    expect(result.kind).toBe("legacy-photo");
    expect(result.photos).toEqual([]);
  });
});

describe("resolveDisplayEchoPreset", () => {
  it("A. stored echo_preset → exact stored preset", () => {
    expect(
      resolveDisplayEchoPreset({
        echo_preset: "preset:owl_07",
        avatar_url: "user/avatar/photo.webp",
        user_id: "user-abc",
      }),
    ).toBe("preset:owl_07");
  });

  it("B. legacy preset avatar_url → exact legacy preset", () => {
    expect(
      resolveDisplayEchoPreset({
        echo_preset: null,
        avatar_url: "preset:owl_04",
        user_id: "user-legacy",
      }),
    ).toBe("preset:owl_04");
  });

  it("C. same user_id called repeatedly → same deterministic Echo", () => {
    const source = {
      echo_preset: null,
      avatar_url: "user/avatar/only.webp",
      profile_photos: ["user/avatar/only.webp"],
      user_id: "stable-user-111",
    };
    const first = resolveDisplayEchoPreset(source);
    const second = resolveDisplayEchoPreset(source);
    expect(first).toBeTruthy();
    expect(first).toBe(second);
    expect(isAvatarPresetValue(first)).toBe(true);
  });

  it("D. different IDs → deterministic valid presets", () => {
    const a = resolveDisplayEchoPreset({
      echo_preset: null,
      avatar_url: null,
      user_id: "user-alpha",
    });
    const b = resolveDisplayEchoPreset({
      echo_preset: null,
      avatar_url: null,
      user_id: "user-beta",
    });
    expect(isAvatarPresetValue(a)).toBe(true);
    expect(isAvatarPresetValue(b)).toBe(true);
  });

  it("E. real photo + null Echo → deterministic fallback", () => {
    const result = resolveDisplayEchoPreset({
      profile_photos: ["uid/avatar/face.webp"],
      echo_preset: null,
      avatar_url: "uid/avatar/face.webp",
      user_id: "photo-only-user",
    });
    expect(isAvatarPresetValue(result)).toBe(true);
    expect(result).not.toBe("uid/avatar/face.webp");
  });

  it("F. stored Echo supplied → stored Echo overrides fallback", () => {
    const userId = "photo-only-user";
    const fallback = resolveDisplayEchoPreset({
      echo_preset: null,
      user_id: userId,
    });
    const stored = resolveDisplayEchoPreset({
      echo_preset: "preset:owl_01",
      user_id: userId,
    });
    expect(stored).toBe("preset:owl_01");
    expect(stored).not.toBe(fallback);
  });

  it("G. no user_id but profile id → stable profile-id fallback", () => {
    const source = {
      echo_preset: null,
      avatar_url: null,
      profile_id: "profile-row-999",
    };
    expect(resolveDisplayEchoPreset(source)).toBe(
      resolveDisplayEchoPreset(source),
    );
    expect(
      resolveDisplayEchoPreset({
        ...source,
        user_id: "auth-user-1",
      }),
    ).not.toBe(resolveDisplayEchoPreset(source));
  });
});

describe("stableIdentityHash", () => {
  it("returns the same hash for the same input", () => {
    expect(stableIdentityHash("user-abc")).toBe(stableIdentityHash("user-abc"));
  });
});

describe("deterministicEchoPresetForIdentity", () => {
  it("maps identity to a bundled preset token", () => {
    const preset = deterministicEchoPresetForIdentity("any-user");
    expect(preset?.startsWith("preset:")).toBe(true);
  });
});
