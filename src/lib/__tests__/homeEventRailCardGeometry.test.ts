import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_EVENT_RAIL_CAPTION_SLOT_PX,
  HOME_EVENT_RAIL_CARD_BORDER_BOX_PX,
} from "../homeEventRailCardGeometry";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("homeEventRailCardGeometry", () => {
  it("exports 194px card border-box height", () => {
    expect(HOME_EVENT_RAIL_CARD_BORDER_BOX_PX).toBe(194);
  });

  it("exports 60px caption slot", () => {
    expect(HOME_EVENT_RAIL_CAPTION_SLOT_PX).toBe(60);
  });
});

describe("Hangout Home Event rail fixed geometry", () => {
  const hangout = read("src/components/Hangout.tsx");
  const skeleton = read(
    "src/components/skeletons/HangoutRailCardSkeleton.tsx"
  );
  const rail = read("src/components/ProgressiveHorizontalRail.tsx");
  const posts = read("src/sections/home/HomePostsSection.tsx");

  it("Hangout shell uses 194px shared constant", () => {
    expect(hangout).toContain(
      'from "../lib/homeEventRailCardGeometry"'
    );
    expect(hangout).toContain("HOME_EVENT_RAIL_CARD_BORDER_BOX_PX");
    expect(hangout).toContain(
      "style={{ height: HOME_EVENT_RAIL_CARD_BORDER_BOX_PX }}"
    );
    expect(hangout).toContain("data-hangout-rail-card-shell");
  });

  it("Hangout caption slot is exactly 60px min/max with 3-line clamp", () => {
    expect(hangout).toContain("HOME_EVENT_RAIL_CAPTION_SLOT_PX");
    expect(hangout).toContain(
      "minHeight: HOME_EVENT_RAIL_CAPTION_SLOT_PX"
    );
    expect(hangout).toContain(
      "maxHeight: HOME_EVENT_RAIL_CAPTION_SLOT_PX"
    );
    expect(hangout).toContain("WebkitLineClamp: 3");
    expect(hangout).toContain("data-hangout-rail-caption-slot");
    expect(hangout).toContain("leading-5");
    expect(hangout).toContain("overflow: \"hidden\"");
  });

  it("Hangout action wrapper always reserves min-h-9", () => {
    expect(hangout).toContain(
      'className="mt-2.5 flex min-h-9 min-w-0 items-center overflow-visible pr-8"'
    );
    expect(hangout).toContain("data-hangout-rail-social");
    // Cluster remains conditional inside the always-present slot
    expect(hangout).toContain("{showRailSocialActions ? (");
  });

  it("Hangout keeps mb-3 and overflow-visible on shell", () => {
    expect(hangout).toContain("overflow-visible mb-3");
    expect(hangout).not.toContain("ResizeObserver");
    expect(hangout).not.toMatch(/getBoundingClientRect\(\).*height/);
  });

  it("skeleton shell and caption use the same geometry constants", () => {
    expect(skeleton).toContain(
      'from "../../lib/homeEventRailCardGeometry"'
    );
    expect(skeleton).toContain("HOME_EVENT_RAIL_CARD_BORDER_BOX_PX");
    expect(skeleton).toContain(
      "style={{ height: HOME_EVENT_RAIL_CARD_BORDER_BOX_PX }}"
    );
    expect(skeleton).toContain("HOME_EVENT_RAIL_CAPTION_SLOT_PX");
    expect(skeleton).toContain(
      "minHeight: HOME_EVENT_RAIL_CAPTION_SLOT_PX"
    );
    expect(skeleton).toContain(
      "maxHeight: HOME_EVENT_RAIL_CAPTION_SLOT_PX"
    );
  });

  it("skeleton gaps are mt-2.5; action row min-h-9; pills h-7", () => {
    expect(skeleton).toContain("mt-2.5 flex min-w-0 items-center gap-1.5");
    expect(skeleton).toContain("mt-2.5 space-y-2");
    expect(skeleton).toContain(
      "mt-2.5 flex min-h-9 min-w-0 shrink-0 items-center gap-2"
    );
    expect(skeleton).toContain("h-7 w-10");
    expect(skeleton).toContain("h-7 w-11");
    expect(skeleton).not.toMatch(/className="mt-2 /);
    expect(skeleton).not.toContain("min-h-[40px]");
  });

  it("external spacing pb-4 / mt-3 unchanged", () => {
    expect(rail).toContain("pt-2 pb-4");
    expect(posts).toContain("gap-4 mt-3");
  });

  it("does not touch Profile/People/Post/Feed surfaces", () => {
    // Geometry module is only imported by Hangout + skeleton
    const geoConsumers = [
      hangout,
      skeleton,
    ];
    for (const src of geoConsumers) {
      expect(src).toContain("homeEventRailCardGeometry");
    }
    const frozen = [
      "src/components/Post.tsx",
      "src/components/ProgressiveFeed.tsx",
      "src/components/people/PeopleCandidateMedia.tsx",
    ];
    for (const path of frozen) {
      const src = read(path);
      expect(src).not.toContain("homeEventRailCardGeometry");
      expect(src).not.toContain("HOME_EVENT_RAIL_CARD_BORDER_BOX_PX");
    }
  });

  it("does not introduce flex stretch / JS measurement / platform branches", () => {
    expect(hangout).not.toContain("items-stretch");
    expect(hangout).not.toContain("ResizeObserver");
    expect(skeleton).not.toContain("items-stretch");
    expect(skeleton).not.toContain("ResizeObserver");
    expect(hangout).not.toMatch(/Capacitor\.getPlatform|isNativePlatform|Platform\.OS/);
    expect(skeleton).not.toMatch(/Capacitor\.getPlatform|isNativePlatform|Platform\.OS/);
  });
});
