import { describe, expect, it } from "vitest";
import {
  buildMissingEchoIdentityPatch,
  deterministicEchoPresetForIdentity,
} from "./echoPresetAssignment";
import { pickHttpsAvatarFromMeta } from "./persistProviderProfileDefaults";

describe("pickHttpsAvatarFromMeta", () => {
  it("reads avatar_url or picture https values", () => {
    expect(
      pickHttpsAvatarFromMeta({
        picture: "https://example.com/p.png",
      }),
    ).toBe("https://example.com/p.png");
    expect(
      pickHttpsAvatarFromMeta({
        avatar_url: "https://lh3.googleusercontent.com/a/x",
      }),
    ).toBe("https://lh3.googleusercontent.com/a/x");
    expect(pickHttpsAvatarFromMeta({ picture: "preset:owl_01" })).toBeNull();
  });
});

describe("provider defaults Echo policy (pure)", () => {
  it("does not require random avatar_url to establish Echo", () => {
    const userId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
      providerHttpsAvatar: null,
    });
    expect(patch.echo_preset).toBe(
      deterministicEchoPresetForIdentity(userId),
    );
    expect(patch.echo_preset).toBe("preset:owl_12");
  });

  it("Google image seeds profile_photos not avatar_url-only", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const https = "https://lh3.googleusercontent.com/a/gg";
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
      providerHttpsAvatar: https,
    });
    expect(patch.profile_photos).toEqual([https]);
    expect(patch.echo_preset).toBe("preset:owl_02");
  });
});
