import { describe, expect, it } from "vitest";
import type { PairUpCandidate } from "./types";
import {
  buildDiscoverIdentityByPersonKey,
  discoverPersonPhotoLoadFallbackToCharacter,
  mergeDiscoverPersonIdentity,
  mergeDiscoverProfilePhotos,
} from "./mergeDiscoverPersonIdentity";

function row(
  partial: Partial<PairUpCandidate> & Pick<PairUpCandidate, "opportunity_id">
): PairUpCandidate {
  return {
    source_post_id: "post-1",
    creator_id: "creator-a",
    description: null,
    discoverable_until: "",
    created_at: "",
    display_name: "Carmel",
    username: "carmel",
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

describe("mergeDiscoverPersonIdentity", () => {
  it("prefers profile_photos from any loaded row for the same personKey", () => {
    const uid = "6bcbe537-d9bd-4a23-939a-6829fe90e76e";
    const managedA = `${uid}/avatar/a.webp`;
    const managedB = `${uid}/avatar/b.webp`;
    const deck = [
      row({
        opportunity_id: "o1",
        creator_id: uid,
        profile_photos: [],
        echo_preset: "preset:echo-owl-1",
      }),
      row({
        opportunity_id: "o2",
        creator_id: uid,
        profile_photos: [managedA, managedB],
      }),
    ];
    const merged = mergeDiscoverPersonIdentity("profile-a", deck);
    expect(merged?.profile_photos).toEqual([managedA, managedB]);
  });

  it("unions photos in deck order without duplicating paths", () => {
    const deck = [
      row({ opportunity_id: "o1", profile_photos: ["/a.jpg"] }),
      row({
        opportunity_id: "o2",
        profile_photos: ["/a.jpg", "/b.jpg"],
      }),
    ];
    expect(mergeDiscoverProfilePhotos(deck)).toEqual(["/a.jpg", "/b.jpg"]);
  });

  it("does not merge rows with different person keys (same display name)", () => {
    const one = "11111111-1111-4111-8111-111111111111";
    const two = "22222222-2222-4222-8222-222222222222";
    const deck = [
      row({
        opportunity_id: "o1",
        profile_id: "p1",
        creator_id: one,
        profile_photos: [`${one}/avatar/a.webp`],
      }),
      row({
        opportunity_id: "o2",
        profile_id: "p2",
        creator_id: two,
        display_name: "Carmel",
        profile_photos: [`${two}/avatar/b.webp`],
      }),
    ];
    const m1 = mergeDiscoverPersonIdentity("p1", deck);
    const m2 = mergeDiscoverPersonIdentity("p2", deck);
    expect(m1?.profile_photos).toEqual([`${one}/avatar/a.webp`]);
    expect(m2?.profile_photos).toEqual([`${two}/avatar/b.webp`]);
  });

  it("enriches identity when later deck rows add photos", () => {
    const early = [
      row({ opportunity_id: "o1", profile_photos: [] }),
    ];
    const later = [
      ...early,
      row({ opportunity_id: "o2", profile_photos: ["/new.jpg"] }),
    ];
    expect(mergeDiscoverPersonIdentity("profile-a", early)?.profile_photos).toEqual(
      []
    );
    expect(mergeDiscoverPersonIdentity("profile-a", later)?.profile_photos).toEqual(
      ["/new.jpg"]
    );
  });

  it("photo load fallback requires all merged photos to fail", () => {
    const source = {
      profile_photos: ["/a.jpg", "/b.jpg"],
    };
    expect(
      discoverPersonPhotoLoadFallbackToCharacter(source, new Set(["/a.jpg"]))
    ).toBe(false);
    expect(
      discoverPersonPhotoLoadFallbackToCharacter(
        source,
        new Set(["/a.jpg", "/b.jpg"])
      )
    ).toBe(true);
  });

  it("buildDiscoverIdentityByPersonKey covers each person once", () => {
    const deck = [
      row({ opportunity_id: "o1", profile_photos: ["/x.jpg"] }),
      row({ opportunity_id: "o2", profile_photos: [] }),
    ];
    const map = buildDiscoverIdentityByPersonKey(deck);
    expect(map.size).toBe(1);
    expect(map.get("profile-a")?.profile_photos).toEqual(["/x.jpg"]);
  });
});
