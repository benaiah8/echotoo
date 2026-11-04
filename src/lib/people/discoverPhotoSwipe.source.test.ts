/**
 * Discover finger-following photo track — isolation from Duo Embla / tap-cycle.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("discoverPhotoSwipe isolation", () => {
  const media = read("components/people/PeopleCandidateMedia.tsx");
  const track = read("components/people/DiscoverFeedPhotoTrack.tsx");
  const row = read("components/people/PeopleDiscoverPersonRow.tsx");
  const canonical = read(
    "components/people/PeopleCanonicalCandidatePresentation.tsx"
  );
  const carousel = read("pages/people/MatchDeckCarousel.tsx");
  const overlay = read("pages/people/MatchDeckOverlay.tsx");

  it("Discover row opts into swipe and disables tap-cycle", () => {
    expect(row).toContain("enableHorizontalPhotoSwipe");
    expect(row).toContain("enableTapCycle={false}");
    expect(row).toContain("feedLayout");
  });

  it("shared media mounts DiscoverFeedPhotoTrack only for feed swipe nav", () => {
    expect(media).toContain("enableHorizontalPhotoSwipe");
    expect(media).toContain("feedSwipeNav");
    expect(media).toContain("DiscoverFeedPhotoTrack");
    expect(media).toContain(
      "usesMinePhotoStack && feedSwipeNav && onActiveIndexChange"
    );
    expect(media).not.toMatch(
      /DiscoverFeedPhotoTrack[\s\S]{0,80}presentation="mine"/
    );
  });

  it("track follows the finger, shows neighbors, and snaps without Swiper", () => {
    expect(track).toContain('data-people-discover-photo-track="true"');
    expect(track).toContain('data-people-discover-photo-strip="true"');
    expect(track).toContain("data-people-discover-photo-slot");
    expect(track).toContain('"prev"');
    expect(track).toContain('"current"');
    expect(track).toContain('"next"');
    expect(track).toContain("discoverPhotoSwipeTrackTranslatePx");
    expect(track).toContain("applyTrackTransform");
    expect(track).toContain("resolveDiscoverPhotoSwipeSnap");
    expect(track).toContain("settleTo");
    expect(track).toContain('touchAction: "pan-y"');
    expect(track).not.toContain("<Swiper");
    // Gallery close swallow uses preventDefault; gesture path must not blanket it.
    expect(track).not.toMatch(/onPointerMove[\s\S]{0,200}preventDefault\(\)/);
  });

  it("keeps dots, fullscreen, and identity hits outside the moving strip", () => {
    expect(track).toContain('data-people-photo-indicators="true"');
    expect(track).toContain("[data-people-mine-identity-hit]");
    expect(track).toContain("[data-people-mine-fullscreen-hit]");
    expect(track).toContain("MediaGalleryLightbox");
    const stripAt = track.indexOf('data-people-discover-photo-strip="true"');
    const plateAt = track.indexOf('data-people-mine-identity-plate="true"');
    const dotsAt = track.indexOf('data-people-photo-indicators="true"');
    expect(stripAt).toBeGreaterThan(-1);
    expect(plateAt).toBeGreaterThan(stripAt);
    expect(dotsAt).toBeGreaterThan(plateAt);
  });

  it("Duo canonical presentation keeps tap-cycle and never enables photo swipe", () => {
    expect(canonical).toContain("enableTapCycle={isCurrent}");
    expect(canonical).not.toContain("enableHorizontalPhotoSwipe");
    expect(canonical).not.toContain("DiscoverFeedPhotoTrack");
    expect(canonical).not.toContain("feedLayout");
  });

  it("does not alter Embla carousel or Discover PTR scroll contracts", () => {
    expect(carousel).toContain("useEmblaCarousel");
    expect(carousel).toContain('touchAction: "pan-y pinch-zoom"');
    expect(carousel).not.toContain("enableHorizontalPhotoSwipe");
    expect(carousel).not.toContain("DiscoverFeedPhotoTrack");
    expect(overlay).toContain('querySelector("[data-people-feed-list]")');
    expect(overlay).toContain("list.scrollTop = 0");
    expect(overlay).toContain("getScrollTop:");
  });
});
