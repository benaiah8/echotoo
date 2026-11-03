import { describe, expect, it } from "vitest";
import {
  clampDiscoverPhotoIndex,
  filterDiscoverPresentationPhotos,
  isGoogleOAuthProviderPhotoUrl,
  resolveDiscoverMergedAvatarUrl,
} from "./discoverProfilePhotoSelection";
import { mergeDiscoverPersonIdentity } from "./mergeDiscoverPersonIdentity";
import type { PairUpCandidate } from "./types";
import { discoverPersonUsesCharacterCard } from "./peopleFeedLayout";
import { resolveProfileIdentityMedia } from "../profileIdentityMedia";

const GOOGLE =
  "https://lh3.googleusercontent.com/a/acg8example=s96-c";
const UID = "6bcbe537-d9bd-4a23-939a-6829fe90e76e";
const MANAGED = `${UID}/avatar/11111111-1111-4111-8111-111111111111.webp`;
const MANAGED2 = `${UID}/avatar/22222222-2222-4222-8222-222222222222.webp`;
const MANAGED3 = `${UID}/avatar/33333333-3333-4333-8333-333333333333.webp`;

function row(
  partial: Partial<PairUpCandidate> & Pick<PairUpCandidate, "opportunity_id">
): PairUpCandidate {
  return {
    source_post_id: "post-1",
    creator_id: UID,
    description: null,
    discoverable_until: "",
    created_at: "",
    display_name: "Someone",
    username: "someone",
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    expressed_by_me: false,
    profile_id: "profile-a",
    bio: null,
    source_caption: null,
    source_type: "hangout",
    source_created_at: null,
    source_selected_dates: null,
    source_is_recurring: null,
    source_recurrence_days: null,
    ...partial,
  };
}

describe("isGoogleOAuthProviderPhotoUrl", () => {
  it("matches googleusercontent host via URL parser", () => {
    expect(isGoogleOAuthProviderPhotoUrl(GOOGLE)).toBe(true);
    expect(
      isGoogleOAuthProviderPhotoUrl("https://sub.googleusercontent.com/x")
    ).toBe(true);
  });

  it("does not match managed storage keys or presets", () => {
    expect(isGoogleOAuthProviderPhotoUrl(MANAGED)).toBe(false);
    expect(isGoogleOAuthProviderPhotoUrl("preset:owl_01")).toBe(false);
  });
});

describe("filterDiscoverPresentationPhotos", () => {
  it("removes Google and keeps managed uploads in order", () => {
    expect(
      filterDiscoverPresentationPhotos(
        [GOOGLE, MANAGED, MANAGED2],
        UID
      )
    ).toEqual([MANAGED, MANAGED2]);
  });

  it("keeps three managed uploads", () => {
    expect(
      filterDiscoverPresentationPhotos([MANAGED, MANAGED2, MANAGED3], UID)
    ).toEqual([MANAGED, MANAGED2, MANAGED3]);
  });
});

describe("mergeDiscoverPersonIdentity + Discover frame selection", () => {
  it("Google-only + Echo -> character (no photos, no Google avatar)", () => {
    const merged = mergeDiscoverPersonIdentity("profile-a", [
      row({
        opportunity_id: "o1",
        profile_photos: [GOOGLE],
        echo_preset: "preset:owl_04",
        avatar_url: GOOGLE,
      }),
    ]);
    expect(merged?.profile_photos).toEqual([]);
    expect(merged?.avatar_url).toBeNull();
    expect(discoverPersonUsesCharacterCard(merged!)).toBe(true);
  });

  it("Google + one managed upload -> managed photo only", () => {
    const merged = mergeDiscoverPersonIdentity("profile-a", [
      row({
        opportunity_id: "o1",
        profile_photos: [GOOGLE, MANAGED],
        avatar_url: GOOGLE,
      }),
    ]);
    expect(merged?.profile_photos).toEqual([MANAGED]);
    expect(resolveProfileIdentityMedia(merged!).kind).toBe("photos");
  });

  it("Google + two managed -> two-photo carousel", () => {
    const merged = mergeDiscoverPersonIdentity("profile-a", [
      row({
        opportunity_id: "o1",
        profile_photos: [GOOGLE, MANAGED, MANAGED2],
        avatar_url: GOOGLE,
      }),
    ]);
    expect(merged?.profile_photos).toEqual([MANAGED, MANAGED2]);
    expect(resolveProfileIdentityMedia(merged!).kind).toBe("photos");
  });

  it("same person across opportunities -> same filtered media", () => {
    const deck = [
      row({
        opportunity_id: "o1",
        profile_photos: [GOOGLE],
        echo_preset: "preset:owl_01",
      }),
      row({
        opportunity_id: "o2",
        profile_photos: [GOOGLE, MANAGED],
        avatar_url: GOOGLE,
      }),
    ];
    const a = mergeDiscoverPersonIdentity("profile-a", deck);
    expect(a?.profile_photos).toEqual([MANAGED]);
  });

  it("different person keys are not merged", () => {
    const deck = [
      row({
        opportunity_id: "o1",
        profile_id: "p1",
        creator_id: "u1",
        profile_photos: [MANAGED],
      }),
      row({
        opportunity_id: "o2",
        profile_id: "p2",
        creator_id: "u2",
        display_name: "Someone",
        profile_photos: [GOOGLE],
        echo_preset: "preset:owl_02",
      }),
    ];
    expect(mergeDiscoverPersonIdentity("p1", deck)?.profile_photos).toEqual([
      MANAGED,
    ]);
    expect(mergeDiscoverPersonIdentity("p2", deck)?.profile_photos).toEqual(
      []
    );
  });

  it("does not reintroduce Google through avatar_url", () => {
    const merged = mergeDiscoverPersonIdentity("profile-a", [
      row({
        opportunity_id: "o1",
        profile_photos: [GOOGLE],
        echo_preset: "preset:owl_03",
        avatar_url: GOOGLE,
      }),
    ]);
    expect(merged?.avatar_url).toBeNull();
    expect(isGoogleOAuthProviderPhotoUrl(merged?.avatar_url)).toBe(false);
    expect(resolveProfileIdentityMedia(merged!).kind).toBe("echo");
  });

  it("empty photos + Echo -> character", () => {
    const merged = mergeDiscoverPersonIdentity("profile-a", [
      row({
        opportunity_id: "o1",
        profile_photos: [],
        echo_preset: "preset:owl_05",
      }),
    ]);
    expect(discoverPersonUsesCharacterCard(merged!)).toBe(true);
  });
});

describe("clampDiscoverPhotoIndex", () => {
  it("clamps when filtered collection shrinks", () => {
    expect(clampDiscoverPhotoIndex(2, 2)).toBe(1);
    expect(clampDiscoverPhotoIndex(0, 0)).toBe(0);
  });
});

describe("resolveDiscoverMergedAvatarUrl", () => {
  it("prefers managed compat over Google candidates", () => {
    expect(
      resolveDiscoverMergedAvatarUrl(
        [{ avatar_url: GOOGLE }, { avatar_url: MANAGED }],
        UID,
        [MANAGED]
      )
    ).toBe(MANAGED);
  });
});
