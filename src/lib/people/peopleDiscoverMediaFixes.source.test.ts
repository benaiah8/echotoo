/**
 * Discover photo sync, Echo fallback, and opportunity-box polish contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS,
  PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS,
} from "../../components/people/PeopleDiscoverOpportunityBox";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDiscoverMediaFixes", () => {
  it("feedLayout promote syncs displayedIndex without waiting on unmounted imgs", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("if (feedLayout)");
    expect(media).toContain("setDisplayedIndex(requested)");
    expect(media).toMatch(
      /if \(feedLayout\) \{[\s\S]*?setDisplayedIndex\(requested\)/
    );
    // Duo path still readiness-gates on mounted img.
    expect(media).toContain("isMountedPhotoPaintReady(img)");
    expect(media).toContain("ensureMountedPhotoDecoded");
    expect(media).toContain("beginPromote(from, requested, gen)");
  });

  it("feed indicators track displayedIndex (visible photo), not only safeIndex", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    const feedIndicators = media.slice(
      media.indexOf('data-people-photo-indicators-placement="bottom"')
    );
    expect(feedIndicators).toContain("i === displayedIndex");
    expect(feedIndicators.indexOf("i === displayedIndex")).toBeLessThan(
      feedIndicators.indexOf("isCurrent && photoCount > 1")
    );
  });

  it("feedLayout still mounts only the front card (no hidden rear stack)", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain(
      "if (feedLayout && role !== \"front\") return null"
    );
  });

  it("Discover fullscreen openGallery allows feedLayout without isCurrent", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("if (!isCurrent && !feedLayout) return");
  });

  it("Duo non-feed path retains readiness-gated promotion", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain(
      "// Wait for load/error on the mounted element — no new Image() warming."
    );
    // Within tryPromoteTo: feed early-return, then Duo readiness + beginPromote.
    const tryPromote = media.slice(media.indexOf("const tryPromoteTo"));
    const feedSync = tryPromote.indexOf("if (feedLayout)");
    const feedReturn = tryPromote.indexOf("setDisplayedIndex(requested)");
    const imgReady = tryPromote.indexOf("isMountedPhotoPaintReady(img)");
    const begin = tryPromote.indexOf("beginPromote(from, requested, gen)");
    expect(feedSync).toBeGreaterThan(-1);
    expect(feedReturn).toBeGreaterThan(feedSync);
    expect(imgReady).toBeGreaterThan(feedReturn);
    expect(begin).toBeGreaterThan(imgReady);
  });

  it("feed never uses EmptyFallback when Echo compact is available; legacy errors fall back", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("feedEchoOrEmpty");
    expect(media).toContain("setFeedLegacyFailed(true)");
    expect(media).toContain("FeedEchoCompact");
    expect(media).toContain('kind === "empty"');
    // Must not blanket-coerce all legacy-photo to echo at resolve time.
    expect(media).not.toMatch(
      /feedLayout && resolvedRaw\.kind === "legacy-photo"/
    );
  });

  it("opportunity box uses equal px-3 padding and opportunity-specific actions", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("px-3");
    expect(box).toContain('data-people-discover-opp-pad="px-3"');
    expect(box).toContain("data-people-feed-opportunity={opportunityId}");
    expect(box).toContain("data-people-discover-opp-actions");
    expect(box).toContain("onHeart");
    expect(box).toContain("onMessage");
  });

  it("caption clamp is 2 lines with note and 3 lines without", () => {
    expect(PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS).toContain("line-clamp-2");
    expect(PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS).toContain("line-clamp-3");
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("noteText");
    expect(box).toContain("PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS");
    expect(box).toContain("PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS");
    expect(box).toContain('data-people-discover-opp-caption-lines={noteText ? "2" : "3"}');
    expect(box).toContain("PEOPLE_PERSONAL_NOTE_ACCENT_CLASS");
    expect(box).toContain("data-people-personal-note-accent");
    expect(box).not.toContain("data-people-discover-opp-note-divider");
  });
});
