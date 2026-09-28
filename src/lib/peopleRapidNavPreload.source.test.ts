/**
 * People rapid-nav preload + Group pending-vs-empty media (focused).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DECK_PREFETCH_REMAINING,
} from "./people/matchDeckNavigation";
import { planMineButtonStep, createMineButtonFlightLatch } from "./people/mineEdgeNavGesture";
import {
  lookupGroupPublishedMedia,
} from "./groupUpPublishedMedia";
import type { PublishedMediaItem } from "./publishedMedia";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const sampleImage: PublishedMediaItem = {
  kind: "image",
  key: "image:1",
  url: "https://cdn.example/a.jpg",
};

describe("People rapid-nav preload + Group media pending", () => {
  it("1: next-page prefetch starts at remaining <= 8", () => {
    expect(PEOPLE_DECK_PREFETCH_REMAINING).toBe(8);
    for (const rel of [
      "pages/people/MatchDeckOverlay.tsx",
      "pages/people/OpenPlanDeckBody.tsx",
      "pages/people/GroupUpDeckBody.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("PEOPLE_DECK_PREFETCH_REMAINING");
      expect(src).toContain(
        "remaining > PEOPLE_DECK_PREFETCH_REMAINING"
      );
      expect(src).not.toMatch(/PREFETCH_REMAINING\s*=\s*3/);
    }
  });

  it("2: page size remains 20", () => {
    expect(read("hooks/usePairUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useOpenPlanCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useGroupUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
  });

  it("3: rapid navigation cannot select an unloaded row", () => {
    const latch = createMineButtonFlightLatch();
    const planned = planMineButtonStep(latch, 99, 0, 3, true);
    expect(planned.clamped).toBe(2);
    expect(planned.clamped).toBeLessThan(3);

    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("planMineButtonStep");
    expect(overlay).toContain("Math.min(carouselItems.length - 1");
  });

  it("4: Group pending media is NOT treated as authoritative no-media", () => {
    const pending = lookupGroupPublishedMedia({}, "post-1", false);
    expect(pending.status).toBe("pending");
    expect(pending.items).toEqual([]);

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx"
    );
    expect(surface).toContain("mediaPending");
    expect(surface).toContain("data-people-group-media-loading");
    expect(surface).toContain("showPendingLoading");
  });

  it("5: selected Group pending media shows loading affordance", () => {
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx"
    );
    expect(surface).toContain("VideoPlaybackLoadingSpinner");
    expect(surface).toContain('data-people-group-media-loading="true"');

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("mediaPending={mediaLookup.status === \"pending\"}");
  });

  it("6: settled empty Group does not show loading", () => {
    const empty = lookupGroupPublishedMedia({ "post-1": [] }, "post-1", false);
    expect(empty.status).toBe("settled");
    expect(empty.items).toEqual([]);

    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx"
    );
    expect(surface).toContain("data-people-group-no-media");
    expect(surface).toContain(
      "showPendingLoading = mediaPending && !url && !videoItem"
    );
  });

  it("7: settled media removes loading state", () => {
    const settled = lookupGroupPublishedMedia(
      { "post-1": [sampleImage] },
      "post-1",
      false
    );
    expect(settled.status).toBe("settled");
    expect(settled.items).toHaveLength(1);
    const first = settled.items[0];
    expect(first?.kind).toBe("image");
    if (first?.kind === "image") {
      expect(first.url).toContain("a.jpg");
    }
  });

  it("8–9: published-media batching/cache remains; no per-card Group requests", () => {
    const hook = read("hooks/useGroupUpCandidates.ts");
    expect(hook).toContain("ensureGroupUpPublishedMediaMap");
    expect(hook).toContain("readFreshGroupUpPublishedMediaMap");
    expect(hook).toContain("collectGroupUpSourcePostIds");
    expect(hook).not.toMatch(/getOrFetchPublishedMedia\(/);

    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).not.toContain("getOrFetchPublishedMedia(");
    expect(body).not.toContain("ensureGroupUpPublishedMediaMap");
  });

  it("10: existing Duo/Discover/Plans warm behavior is unchanged", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("mineImageWarmOffsets");
    expect(overlay).toContain("resolveMineProxyImageUrl");
    expect(overlay).toContain("collectMineWarmFrontUrls");

    const warm = read("lib/people/mineCandidateImageWarm.ts");
    expect(warm).toContain("mineImageWarmOffsets");
    expect(warm).toContain("matchDeckPhotoMountRadius");

    // Plans deck body still uses duo presentation + carousel (no warm rewrite).
    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    expect(plans).toContain('duoPresentation="mine"');
    expect(plans).toContain("MatchDeckCarousel");
  });

  it("11: Group poster-only video behavior is unchanged", () => {
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx"
    );
    expect(surface).toContain('data-people-group-video-playback="poster-only"');
    expect(surface).not.toContain("PublishedVideoPlayer");
    expect(surface).toContain("PiPlayFill");
  });

  it("12: exhausted deck never shows an indefinite loading indicator", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("isTrueCaughtUpState");
    expect(body).toContain("trueCaughtUp");
    // Loading spinner is media-plate only via mediaPending — not deck-empty path.
    expect(body).not.toContain("VideoPlaybackLoadingSpinner");
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx"
    );
    expect(surface).toContain("VideoPlaybackLoadingSpinner");
  });

  it("lookup: unavailable / missing source are not pending", () => {
    expect(
      lookupGroupPublishedMedia({}, "post-1", true).status
    ).toBe("unavailable");
    expect(lookupGroupPublishedMedia({}, "", false).status).toBe("settled");
    expect(lookupGroupPublishedMedia({}, null, false).status).toBe("settled");
  });
});
