/**
 * Duo-only pulse skeleton — reuses ui/Skeleton; Discover/Plans/Groups stay text loading.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDuoCardSkeleton", () => {
  const skeleton = read("components/skeletons/PeopleDuoCardSkeleton.tsx");
  const overlay = read("pages/people/MatchDeckOverlay.tsx");
  const carousel = read("pages/people/MatchDeckCarousel.tsx");
  const media = read("components/people/PeopleCandidateMedia.tsx");
  const plans = read("pages/people/OpenPlanDeckBody.tsx");
  const groups = read("pages/people/GroupUpDeckBody.tsx");
  const copy = read("pages/people/peopleUiCopy.ts");
  const primitives = read("components/ui/Skeleton.tsx");

  it("reuses Skeleton primitives plus Duo portrait shimmer language", () => {
    expect(skeleton).toContain("SkeletonLine");
    expect(skeleton).toContain("SkeletonPill");
    expect(skeleton).toContain("SkeletonCircle");
    expect(skeleton).toContain('from "../ui/Skeleton"');
    expect(skeleton).toContain("people-duo-portrait-shimmer");
    expect(skeleton).not.toContain("people-duo-info-shimmer");
    expect(skeleton).not.toContain("@keyframes");
    expect(skeleton).not.toContain("setInterval");
    expect(skeleton).not.toContain("useState");
    expect(skeleton).not.toContain("useEffect");
    expect(skeleton).not.toContain("useLayoutEffect");
    expect(primitives).toContain("animate-pulse");
  });

  it("matches Duo-modern portrait + info geometry", () => {
    expect(skeleton).toContain("PEOPLE_CANDIDATE_MEDIA_ASPECT");
    expect(skeleton).toContain("PEOPLE_DUO_MODERN_FRAME_RADIUS");
    expect(skeleton).toContain("PEOPLE_DUO_MODERN_FRONT_WIDTH_RATIO");
    expect(skeleton).toContain("--people-mine-frame-w");
    expect(skeleton).toContain("--people-mine-frame-h");
    expect(skeleton).toContain("--people-mine-portrait-w");
    expect(skeleton).toContain("aspectRatio");
    expect(skeleton).toContain("FRAME_FALLBACK_PCT");
    expect(skeleton).toContain("data-people-duo-portrait");
    expect(skeleton).toContain("data-people-duo-info-column");
    expect(skeleton).toContain("data-people-duo-opportunity-info");
    expect(skeleton).toContain("data-people-duo-card-skeleton-pills");
    expect(skeleton).toContain("data-people-duo-card-skeleton-caption");
    expect(skeleton).toContain("data-people-duo-card-skeleton-identity");
    expect(skeleton).toContain("peopleDuoModernScrollTopInset");
    expect(skeleton).not.toContain("peopleFeedContentTopPad");
    expect(skeleton).toContain("overflow-hidden");
  });

  it("only Duo overlay showLoading mounts the card skeleton", () => {
    expect(overlay).toContain("PeopleDuoCardSkeleton");
    expect(overlay).toContain("showLoading");
    const loadingBranch = overlay.slice(overlay.indexOf(") : showLoading ? ("));
    const discoverKeep = loadingBranch.slice(
      0,
      loadingBranch.indexOf(") : showError ?")
    );
    expect(discoverKeep).toContain("isDiscoverScope");
    expect(discoverKeep).toContain("PeopleDiscoverFeedSkeleton");
    expect(discoverKeep).toContain('variant="initial"');
    expect(discoverKeep).toContain("<PeopleDuoCardSkeleton />");
    expect(overlay).toContain("isTrueCaughtUpState");
    expect(overlay).toContain("<PeopleDeckEmptyCard");
    expect(copy).toContain('deckEmpty: "No Duos yet"');
    expect(copy).toContain('deckLoadError: "Couldn\'t load people."');
    expect(overlay).toContain("peopleUiCopy.deckLoadError");
    expect(overlay).toContain("peopleUiCopy.deckRetryLoad");
  });

  it("carousel metrics-pending uses the same skeleton without extra scroll", () => {
    expect(carousel).toContain("data-people-duo-deck-pending");
    expect(carousel).toContain("PeopleDuoCardSkeleton");
    const pending = carousel.slice(
      carousel.indexOf("data-people-duo-deck-pending")
    );
    expect(pending.slice(0, 500)).toContain("overflow-hidden");
    expect(pending.slice(0, 400)).not.toContain("Loading…");
    expect(carousel).toContain("const deckReady = isDuoLayout");
    expect(carousel).toContain("isPeopleDiscoverMetricsReady");
  });

  it("Discover/Plans/Groups loading copy stays text Loading…", () => {
    expect(plans).toContain("Loading…");
    expect(plans).not.toContain("PeopleDuoCardSkeleton");
    expect(groups).toContain("Loading…");
    expect(groups).not.toContain("PeopleDuoCardSkeleton");
    expect(overlay).toMatch(/openPlans \? \([\s\S]*Loading…/);
    expect(overlay).toMatch(/groupUps \? \([\s\S]*Loading…/);
  });

  it("media wait uses the same portrait shimmer without new ref loops", () => {
    const css = read("index.css");
    const start = media.indexOf("function DuoFrontPaintLoader");
    const end = media.indexOf("export default function PeopleCandidateMedia");
    const loader = media.slice(start, end);
    expect(loader).toContain("data-people-duo-front-paint-pulse");
    expect(loader).toContain("people-duo-portrait-shimmer");
    expect(loader).not.toContain("animate-spin");
    expect(loader).not.toContain("h-6 w-6 rounded-full border-2");
    expect(css).toContain("@keyframes social-shelf-resolving-shimmer");
    expect(css).toContain(".people-duo-portrait-shimmer");
    expect(css).not.toContain(
      ".social-action-contrast-shelf.people-duo-portrait-shimmer"
    );
    expect(media).toContain("showDuoFrontPaintLoader");
    expect(media).toContain("bindImgNode");
    expect(media).toContain("applyMineStackImgNode");
    expect(media).toContain("reduceMineSlotPaintReady");
    expect(media).not.toContain("isMineFrontUrlWarmed");
    expect(media).toContain('slotReady ? "" : "opacity-0"');
    expect(media).toContain("<DuoFrontPaintLoader");
    expect(media).toContain("FeedEchoCompact");
  });
});
