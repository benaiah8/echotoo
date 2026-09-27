/**
 * PASS 3A — video-only Detail spacing (no double sticky-header clearance).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS 3A — video-only Detail main-column spacing", () => {
  it("main column skips sticky clearance when finalizeHeroActive", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    // Sticky calc only when there is no hero above the author column.
    expect(body).toContain(
      "gallery.length === 0 && !finalizeHeroActive",
    );
    expect(body).toContain(
      "`calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap})`",
    );
    // Compact image-post spacing remains the default when a hero is present.
    expect(body).toMatch(
      /gallery\.length === 0 && !finalizeHeroActive[\s\S]*?composeFinalizeShell[\s\S]*\? "0\.9rem"[\s\S]*: "1rem"/,
    );
  });

  it("published media shell still owns sticky-header top clearance", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("data-published-detail-media-shell");
    expect(body).toContain(
      "paddingTop: `calc(${topOffset} + var(--safe-area-top-layout) + ${heroBelowBarGap} + ${finalizeHeroBreathing})`",
    );
  });

  it("does not alter video frame / aspect helpers", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("publishedMediaFrameStyle");
    expect(carousel).toContain("isPublishedVideoOnly");
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("object-contain");
  });
});
