import { describe, expect, it } from "vitest";
import {
  buildMissingEchoIdentityPatch,
  deterministicEchoPresetForIdentity,
} from "./echoPresetAssignment";

/**
 * Apple native helper now persists deterministic echo_preset (not random
 * avatar_url). These pure checks cover the assignment policy; AuthModal
 * wiring stays integration-light.
 */
describe("Apple native Echo assignment policy", () => {
  const userId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("B. missing Echo → deterministic Echo", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
    });
    expect(patch.echo_preset).toBe(
      deterministicEchoPresetForIdentity(userId),
    );
    expect(patch.echo_preset).toBe("preset:owl_15");
  });

  it("C. existing Echo preserved", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: "preset:owl_07",
      profile_photos: [],
    });
    expect(patch.echo_preset).toBeUndefined();
  });

  it("D. no random preset avatar required merely for Echo", () => {
    const patch = buildMissingEchoIdentityPatch({
      userId,
      echo_preset: null,
      profile_photos: [],
      providerHttpsAvatar: null,
    });
    expect(patch).toEqual({ echo_preset: "preset:owl_15" });
  });
});
