/**
 * Discover unified character card — presentation contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DISCOVER_CHARACTER_FIGURE_MAX_H,
  PEOPLE_DISCOVER_CHARACTER_MAX_H,
  discoverPersonUsesCharacterCard,
  discoverPersonUsesPhotoFrame,
} from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDiscoverCharacterCard", () => {
  it("routes echo and empty to PeopleDiscoverCharacterCard (not nested compact media)", () => {
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).toContain("PeopleDiscoverCharacterCard");
    expect(row).toContain("discoverPersonUsesCharacterCard");
    expect(row).toContain("discoverPersonUsesPhotoFrame");
    expect(row).not.toContain("feedDiscoverCompact");
    expect(row).not.toContain("data-people-discover-echo-frame");
    expect(row).not.toContain("data-people-discover-echo-avatar-slot");
  });

  it("uses unified character card with local atmosphere and large centered art", () => {
    const card = read("components/people/PeopleDiscoverCharacterCard.tsx");
    expect(card).toContain("data-people-discover-character-card");
    expect(card).toContain("ProfileHeroAvatarAtmosphere");
    expect(card).toContain("data-people-discover-character-art");
    expect(card).toContain("object-contain");
    expect(card).not.toContain("PEOPLE_FEED_ECHO_SHELL_CLASS");
    expect(card).not.toContain("rounded-full");
    expect(card).toContain("resolvePeopleFeedEchoPreset");
    expect(card).toContain("PeopleDiscoverEchoIdentity");
  });

  it("keeps 4:5 photo frame and top-left overlay for photos and legacy URLs", () => {
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).toContain("4 / 5");
    expect(row).not.toContain("3 / 4");
    expect(row).not.toContain("40vh");
    expect(row).not.toContain("--people-feed-media-max-h");
    expect(row).toContain("justify-center");
    expect(row).toContain("min(100%, var(--people-discover-photo-max-w, 26rem))");
    expect(row).toContain("PEOPLE_DISCOVER_MEDIA_INSET_BORDER");
    expect(row).toContain("MinePortraitIdentityOverlay");
    expect(
      discoverPersonUsesPhotoFrame({
        profile_photos: ["/a.jpg"],
      })
    ).toBe(true);
    expect(
      discoverPersonUsesPhotoFrame({
        avatar_url: "https://cdn.example/legacy.jpg",
      })
    ).toBe(true);
  });

  it("character resolver excludes genuine photo frames", () => {
    expect(
      discoverPersonUsesCharacterCard({
        echo_preset: "preset:echo-owl-2",
      })
    ).toBe(true);
    expect(
      discoverPersonUsesCharacterCard({
        profile_photos: [],
        user_id: "u1",
      })
    ).toBe(true);
    expect(
      discoverPersonUsesCharacterCard({
        profile_photos: ["/p.jpg"],
      })
    ).toBe(false);
  });

  it("person-scoped photo failures and merged identity in Discover overlay", () => {
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    expect(row).toContain("failedPhotoPaths");
    expect(row).toContain("discoverPersonPhotoLoadFallbackToCharacter");
    expect(row).not.toContain("photoFallbackToCharacter");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("buildDiscoverIdentityByPersonKey");
    expect(overlay).toContain("clampDiscoverPhotoIndex");
    const selection = read("lib/people/discoverProfilePhotoSelection.ts");
    expect(selection).toContain("isGoogleOAuthProviderPhotoUrl");
    expect(selection).toContain("filterDiscoverPresentationPhotos");
    expect(overlay).toContain("discoverIdentityByPersonKey.get(personKey)");
    expect(overlay).toContain("discoverNeutralEchoSeedForPerson");
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("onFeedCharacterFallback");
  });

  it("character cards omit fullscreen; photos retain it", () => {
    const card = read("components/people/PeopleDiscoverCharacterCard.tsx");
    expect(card).not.toContain("fullscreen");
    expect(card).not.toContain("MinePortraitIdentityOverlay");
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("!feedDiscoverCompact");
  });

  it("uses shared Discover character sizing tokens", () => {
    const layout = read("lib/people/peopleFeedLayout.ts");
    expect(layout).toContain("--people-discover-character-max-h");
    expect(layout).toContain("--people-discover-character-figure-max-h");
    expect(PEOPLE_DISCOVER_CHARACTER_MAX_H).toBe("36vh");
    expect(PEOPLE_DISCOVER_CHARACTER_FIGURE_MAX_H).toContain("11rem");
  });

  it("prominent centered name without duplicate chip", () => {
    const identity = read("components/people/PeopleDiscoverEchoIdentity.tsx");
    expect(identity).toContain("discoverCharacterName");
    expect(identity).toContain("clamp(1.125rem,4.8vw,1.25rem)");
    expect(identity).toContain("data-people-discover-echo-identity");
    const card = read("components/people/PeopleDiscoverCharacterCard.tsx");
    expect(card).toContain("blur(28px)");
    expect(card).toContain("opacity-[0.52]");
    expect(card).toContain("app-light:opacity-[0.4]");
    expect(card).toContain("var(--bg)_46%");
    expect(card).toContain("app-dark:bg-[color-mix(in_oklab,var(--bg)_36%,transparent)]");
    expect(card).toContain("PEOPLE_DISCOVER_MEDIA_INSET_BORDER");
    expect(card).not.toContain("rounded-full");
    const feedRow = read("components/people/PeopleFeedRow.tsx");
    expect(feedRow).toContain('aspectRatio: "3 / 4"');
    expect(feedRow).toContain("40vh");
    const layout = read("lib/people/peopleFeedLayout.ts");
    expect(layout).toContain('PEOPLE_FEED_MEDIA_MAX_H = "40vh"');
    expect(layout).toContain('PEOPLE_DISCOVER_PHOTO_ASPECT = "4 / 5"');
    expect(layout).toContain('PEOPLE_DISCOVER_PHOTO_MAX_W = "26rem"');
    expect(layout).toContain("var(--text) 16%");
  });

  it("Discover opportunity actions stay neutral gray", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    const button = read("components/people/PeopleActionStateButton.tsx");
    expect(box).toContain("PeopleActionStateButton");
    expect(box).toContain("size={44}");
    expect(box).not.toContain("var(--brand-ink)");
    expect(button).toContain("bg-[var(--text)]/10");
    expect(button).toContain("app-dark:bg-white/14");
  });
});
