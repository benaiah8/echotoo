import { describe, expect, it } from "vitest";
import { getAvatarPresets } from "./avatarPresets";
import {
  CANONICAL_ECHO_OWL_IDS,
  CANONICAL_ECHO_PRESET_VALUES,
  buildMissingEchoIdentityPatch,
  deterministicEchoPresetForIdentity,
  echoAssignmentParityForIdentity,
  isCanonicalEchoPreset,
  stableIdentityHash,
} from "./echoPresetAssignment";

/** Documented SQL ↔ TS parity vectors (also in P5A migration comments). */
export const ECHO_FNV_PARITY_VECTORS = [
  {
    uuid: "00000000-0000-4000-8000-000000000001",
    hash: 3480239522,
    index: 2,
    preset: "preset:owl_03",
  },
  {
    uuid: "11111111-1111-4111-8111-111111111111",
    hash: 3508788259,
    index: 1,
    preset: "preset:owl_02",
  },
  {
    uuid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    hash: 1632803234,
    index: 14,
    preset: "preset:owl_15",
  },
  {
    uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    hash: 1533351232,
    index: 10,
    preset: "preset:owl_11",
  },
  {
    uuid: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    hash: 1189721999,
    index: 11,
    preset: "preset:owl_12",
  },
] as const;

describe("canonical Echo registry", () => {
  it("matches bundled owl_01…owl_18 assets", () => {
    const bundled = getAvatarPresets().map((p) => p.id);
    expect(bundled).toEqual([...CANONICAL_ECHO_OWL_IDS]);
    expect(CANONICAL_ECHO_PRESET_VALUES).toHaveLength(18);
  });
});

describe("stableIdentityHash / deterministicEchoPresetForIdentity", () => {
  it("same UUID → same preset", () => {
    const a = deterministicEchoPresetForIdentity(
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    );
    const b = deterministicEchoPresetForIdentity(
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    );
    expect(a).toBe(b);
    expect(isCanonicalEchoPreset(a)).toBe(true);
  });

  it("parity vectors match hash, index, and preset", () => {
    for (const v of ECHO_FNV_PARITY_VECTORS) {
      expect(stableIdentityHash(v.uuid)).toBe(v.hash);
      const parity = echoAssignmentParityForIdentity(v.uuid);
      expect(parity.hash).toBe(v.hash);
      expect(parity.index).toBe(v.index);
      expect(parity.preset).toBe(v.preset);
      expect(deterministicEchoPresetForIdentity(v.uuid)).toBe(v.preset);
    }
  });

  it("result is always a canonical preset", () => {
    for (const v of ECHO_FNV_PARITY_VECTORS) {
      expect(CANONICAL_ECHO_PRESET_VALUES).toContain(
        deterministicEchoPresetForIdentity(v.uuid),
      );
    }
  });
});

describe("buildMissingEchoIdentityPatch", () => {
  const userId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const expectedEcho = "preset:owl_11";

  it("A. Google HTTPS + no photos + no Echo → seed photo + Echo", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
      providerHttpsAvatar: "https://lh3.googleusercontent.com/a/photo",
    });
    expect(patch.echo_preset).toBe(expectedEcho);
    expect(patch.profile_photos).toEqual([
      "https://lh3.googleusercontent.com/a/photo",
    ]);
  });

  it("B. existing photos + no Echo → photos unchanged, Echo assigned", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: ["uid/avatar/a.webp"],
      providerHttpsAvatar: "https://lh3.googleusercontent.com/a/photo",
    });
    expect(patch.echo_preset).toBe(expectedEcho);
    expect(patch.profile_photos).toBeUndefined();
  });

  it("C. existing Echo → Echo unchanged (omitted from patch)", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: "preset:owl_01",
      profile_photos: [],
      providerHttpsAvatar: null,
    });
    expect(patch.echo_preset).toBeUndefined();
  });

  it("D. no provider image + no Echo → deterministic Echo only", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
      providerHttpsAvatar: null,
    });
    expect(patch.echo_preset).toBe(expectedEcho);
    expect(patch.profile_photos).toBeUndefined();
  });

  it("E. existing photos + existing Echo → empty patch", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: "preset:owl_04",
      profile_photos: ["a.webp", "b.webp"],
      providerHttpsAvatar: "https://example.com/x.png",
    });
    expect(patch).toEqual({});
  });

  it("F. later login same state → same deterministic Echo, no rerandomize", () => {
    const first = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
    });
    const second = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
    });
    expect(first.echo_preset).toBe(second.echo_preset);
    expect(first.echo_preset).toBe(expectedEcho);
  });
});
