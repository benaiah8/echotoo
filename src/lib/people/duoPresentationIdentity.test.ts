import { describe, expect, it } from "vitest";
import {
  filterDiscoverPresentationPhotos,
  isGoogleOAuthProviderPhotoUrl,
} from "./discoverProfilePhotoSelection";
import { adaptDuoPresentationIdentity } from "./duoPresentationIdentity";
import { resolveProfileIdentityMedia } from "../profileIdentityMedia";

const GOOGLE =
  "https://lh3.googleusercontent.com/a/acg8example=s96-c";
const UID = "6bcbe537-d9bd-4a23-939a-6829fe90e76e";
const MANAGED = `${UID}/avatar/11111111-1111-4111-8111-111111111111.webp`;

describe("adaptDuoPresentationIdentity", () => {
  it("reuses Discover photo filtering for Duo only", () => {
    const source = {
      user_id: UID,
      profile_id: "p1",
      profile_photos: [GOOGLE, MANAGED],
      avatar_url: GOOGLE,
      echo_preset: "preset:echo-owl-1",
    };
    const adapted = adaptDuoPresentationIdentity(source);
    expect(adapted.profile_photos).toEqual(
      filterDiscoverPresentationPhotos(source.profile_photos, UID)
    );
    expect(isGoogleOAuthProviderPhotoUrl(adapted.avatar_url)).toBe(false);
  });

  it("Google-only profile resolves to Echo via identity media", () => {
    const adapted = adaptDuoPresentationIdentity({
      user_id: UID,
      profile_id: "p1",
      profile_photos: [GOOGLE],
      avatar_url: GOOGLE,
      echo_preset: "preset:echo-owl-1",
    });
    const resolved = resolveProfileIdentityMedia(adapted);
    expect(resolved.kind).toBe("echo");
    expect(resolved.echoPreset).toBe("preset:echo-owl-1");
  });

  it("keeps managed upload when mixed with Google", () => {
    const adapted = adaptDuoPresentationIdentity({
      user_id: UID,
      profile_id: "p1",
      profile_photos: [GOOGLE, MANAGED],
      avatar_url: null,
      echo_preset: null,
    });
    expect(adapted.profile_photos).toEqual([MANAGED]);
    const resolved = resolveProfileIdentityMedia(adapted);
    expect(resolved.kind).toBe("photos");
    expect(resolved.photos[0]).toBe(MANAGED);
  });
});
