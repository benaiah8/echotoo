/**
 * Duo portrait wait plate — existing shelf keyframes, portrait-scoped class.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDuoPortraitShimmer", () => {
  const css = read("index.css");
  const media = read("components/people/PeopleCandidateMedia.tsx");
  const overlay = read("pages/people/MatchDeckOverlay.tsx");
  const carousel = read("pages/people/MatchDeckCarousel.tsx");
  const row = read("components/people/PeopleDuoBottomActionRow.tsx");
  const nav = read("pages/people/PeopleFeedTopNav.tsx");
  const pres = read("lib/people/peopleCandidateMediaPresentation.ts");

  it("does not pin position:relative (that collapses the absolute Echo overlay)", () => {
    const block = css.slice(
      css.indexOf(".people-duo-portrait-shimmer {"),
      css.indexOf("html.theme-light .people-duo-portrait-shimmer")
    );
    expect(block).not.toContain("position: relative");
    expect(block).not.toContain("position: absolute");
    const loader = media.slice(
      media.indexOf("function DuoFrontPaintLoader"),
      media.indexOf("export default function PeopleCandidateMedia")
    );
    expect(loader).toContain("absolute inset-0");
    expect(loader).toContain("people-duo-portrait-shimmer");
  });

  it("reuses shelf keyframes without binding the shelf selector to portraits", () => {
    expect(css).toContain("@keyframes social-shelf-resolving-shimmer");
    expect(css).toContain(".people-duo-portrait-shimmer");
    expect(css).not.toContain(".people-duo-info-shimmer");
    expect(css).toContain("var(--surface-2)");
    expect(css).toContain("var(--bg)");
    expect(css).toContain("html.theme-light .people-duo-portrait-shimmer");
    expect(css).not.toMatch(
      /\.social-action-contrast-shelf\[data-social-shelf-resolving[\s\S]{0,80}people-duo-portrait-shimmer/
    );
    const shelf = css.slice(
      css.indexOf(".social-action-contrast-shelf[data-social-shelf-resolving"),
      css.indexOf(".people-duo-portrait-shimmer")
    );
    expect(shelf).toContain("var(--bg)");
  });

  it("does not add JS animation loops or extra readiness refs", () => {
    const start = media.indexOf("function DuoFrontPaintLoader");
    const end = media.indexOf("export default function PeopleCandidateMedia");
    const loader = media.slice(start, end);
    expect(loader).not.toContain("setInterval");
    expect(loader).not.toContain("requestAnimationFrame");
    expect(loader).not.toContain("useState");
    expect(media).toContain("imgBinderByIndexRef");
    expect(media).toContain("applyMineStackImgNode");
    expect(overlay).toContain("const showLoading =");
    expect(overlay).toContain("isTrueCaughtUpState");
    expect(carousel).toContain("const deckReady = isDuoLayout");
    expect(pres).toContain("PEOPLE_DUO_MODERN_SCENE_BLUR_PX = 9.6");
    expect(row).toContain("var(--bg)_90%");
    expect(nav).toContain("frostedScrollThrough");
  });
});
