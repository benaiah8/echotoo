/**
 * Duo-modern vertical scroll reset — activation only, not Embla events.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldResetPeopleDuoSlideScroll } from "./peopleDuoSlideScroll";
import {
  PEOPLE_DUO_MODERN_SCENE_BLUR_PX,
  PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE,
} from "./peopleCandidateMediaPresentation";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("shouldResetPeopleDuoSlideScroll", () => {
  it("resets when a slide becomes current (including a return visit)", () => {
    expect(
      shouldResetPeopleDuoSlideScroll({
        isCurrent: true,
        wasCurrent: false,
        identityKey: "opp-1",
        prevIdentityKey: "opp-1",
      })
    ).toBe(true);
  });

  it("does not reset while the same candidate stays current", () => {
    expect(
      shouldResetPeopleDuoSlideScroll({
        isCurrent: true,
        wasCurrent: true,
        identityKey: "opp-1",
        prevIdentityKey: "opp-1",
      })
    ).toBe(false);
  });

  it("resets when opportunity identity changes while current", () => {
    expect(
      shouldResetPeopleDuoSlideScroll({
        isCurrent: true,
        wasCurrent: true,
        identityKey: "opp-2",
        prevIdentityKey: "opp-1",
      })
    ).toBe(true);
  });

  it("does not reset on a canceled swipe (never became non-current)", () => {
    expect(
      shouldResetPeopleDuoSlideScroll({
        isCurrent: true,
        wasCurrent: true,
        identityKey: "opp-1",
        prevIdentityKey: "opp-1",
      })
    ).toBe(false);
    expect(
      shouldResetPeopleDuoSlideScroll({
        isCurrent: false,
        wasCurrent: false,
        identityKey: "opp-2",
        prevIdentityKey: "opp-1",
      })
    ).toBe(false);
  });
});

describe("PeopleCanonicalCandidatePresentation Duo scroll wiring", () => {
  const canonical = read(
    "components/people/PeopleCanonicalCandidatePresentation.tsx"
  );
  const carousel = read("pages/people/MatchDeckCarousel.tsx");
  const overlay = read("pages/people/MatchDeckOverlay.tsx");

  it("resets the existing scroller immediately without React scroll state", () => {
    expect(canonical).toContain("duoSlideScrollRef");
    expect(canonical).toContain('data-people-duo-slide-scroll="true"');
    expect(canonical).toContain("useLayoutEffect");
    expect(canonical).toContain("shouldResetPeopleDuoSlideScroll");
    expect(canonical).toContain("scroller.scrollTop = 0");
    expect(canonical).not.toContain("behavior: \"smooth\"");
    expect(canonical).not.toContain("scrollTo({");
    expect(canonical).not.toContain("setDuoSlideScroll");
    expect(canonical).not.toContain("useState");
    expect(canonical).not.toContain("requestAnimationFrame");
    expect(canonical).not.toContain("setInterval");
    expect(canonical.indexOf("ref={duoSlideScrollRef}")).toBeLessThan(
      canonical.indexOf('data-people-duo-slide-scroll="true"')
    );
  });

  it("does not reset from Embla carousel or Overlay; swipe tokens stay", () => {
    expect(carousel).not.toContain("shouldResetPeopleDuoSlideScroll");
    expect(carousel).not.toContain("data-people-duo-slide-scroll");
    expect(carousel).not.toContain(".scrollTop = 0");
    expect(overlay).not.toContain("shouldResetPeopleDuoSlideScroll");
    expect(overlay).not.toContain(".scrollTop = 0");
    expect(carousel).toContain('emblaApi.on("scroll"');
    expect(carousel).toContain('emblaApi.on("select"');
    expect(carousel).toContain('emblaApi.on("settle"');
    expect(PEOPLE_DUO_MODERN_SCENE_BLUR_PX).toBe(9.6);
    expect(PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE).toBe(0.52);
  });
});
