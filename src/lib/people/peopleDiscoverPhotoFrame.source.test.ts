/**
 * Discover photo frame is the only clip. Inner Mine stack radii stay in the
 * shared media component and are flattened from this wrapper.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PEOPLE_FEED_MEDIA_RADIUS } from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Discover photo frame clip", () => {
  const row = read("components/people/PeopleDiscoverPersonRow.tsx");
  const clipStart = row.indexOf('data-people-discover-photo-clip="true"');
  const clip = row.slice(Math.max(0, clipStart - 700), clipStart + 900);

  it("uses one 1rem outer clip and keeps the 4:5 frame", () => {
    expect(PEOPLE_FEED_MEDIA_RADIUS).toBe("1rem");
    expect(clip).toContain("overflow-hidden");
    expect(clip).toContain("borderRadius: PEOPLE_FEED_MEDIA_RADIUS");
    expect(row).toContain("4 / 5");
    expect(row).toContain("min(100%, var(--people-discover-photo-max-w, 26rem))");
    expect(row).not.toContain("40vh");
    expect(clip).not.toContain("padding");
    expect(clip).not.toContain("p-1");
  });

  it("flattens inner slide and frame radii so every photo shares the outer edge", () => {
    expect(clip).toContain("[&_[data-people-mine-card]]:!rounded-none");
    expect(clip).toContain("[&_[data-people-feed-single-frame]]:!rounded-none");
    expect(clip).toContain("[&_[data-people-duo-photo-frame]]:!rounded-none");
    expect(clip).toContain("[&_[data-people-mine-identity-plate]]:!rounded-none");
    expect(clip).toContain("[&_[data-people-feed-legacy]]:!rounded-none");
  });

  it("paints the theme ring above the media without blocking controls", () => {
    expect(row).toContain('data-people-discover-photo-border="true"');
    expect(row).toContain("pointer-events-none absolute inset-0 z-20");
    expect(row).toContain("boxShadow: PEOPLE_DISCOVER_MEDIA_INSET_BORDER");
    expect(row).toContain("enableTapCycle");
    expect(row).toContain("onFeedCharacterFallback");
  });

  it("does not change shared Duo radius or Plans/Groups frames", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    const presentation = read("lib/people/peopleCandidateMediaPresentation.ts");
    const feedRow = read("components/people/PeopleFeedRow.tsx");
    expect(presentation).toContain('PEOPLE_DUO_FRONT_RADIUS = "1.65rem"');
    expect(media).toContain("borderRadius: cardRadius");
    expect(media).toContain("mediaRadius={mineStackMediaRadius}");
    expect(feedRow).toContain('aspectRatio: "3 / 4"');
    expect(feedRow).toContain("40vh");
    const card = read("components/people/PeopleDiscoverCharacterCard.tsx");
    expect(card).not.toContain("data-people-discover-photo-clip");
  });
});
