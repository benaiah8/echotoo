import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeNavSrc = readFileSync(
  new URL("../../components/people/MineEdgeNavCards.tsx", import.meta.url),
  "utf8"
);
const carouselSrc = readFileSync(
  new URL("../../pages/people/MatchDeckCarousel.tsx", import.meta.url),
  "utf8"
);

describe("MineEdgeNavCards press + haptic (source)", () => {
  it("uses an inner press visual distinct from outer transform", () => {
    expect(edgeNavSrc).toContain("data-people-mine-edge-nav-press");
    expect(edgeNavSrc).toContain("scale(0.96)");
    // onClick must not activate navigation.
    expect(edgeNavSrc).toMatch(/onClick=\{\(e\) => \{[\s\S]*e\.preventDefault/);
  });

  it("does not call haptics on edge-card buttons", () => {
    expect(edgeNavSrc).not.toContain("hapticImpactLight");
    expect(edgeNavSrc).not.toContain("hapticsLight");
  });

  it("never navigates on pointercancel", () => {
    expect(edgeNavSrc).toContain("NEVER navigate from pointercancel");
    const cancelBlock = edgeNavSrc.slice(
      edgeNavSrc.indexOf("onPointerCancel"),
      edgeNavSrc.indexOf("onClick=")
    );
    expect(cancelBlock).not.toContain("onActivate()");
  });
});

describe("Mine button instant jumps (source)", () => {
  it("scrollTo uses jump and completes programmatic flights without settle-only reliance", () => {
    expect(carouselSrc).toContain("emblaApi.scrollTo(index, jump)");
    expect(carouselSrc).toContain("queueMicrotask");
    expect(carouselSrc).toContain("mineButtonScrollJumpRef");
  });

  it("Overlay always prepares button hops with jump true", () => {
    const overlaySrc = readFileSync(
      new URL("../../pages/people/MatchDeckOverlay.tsx", import.meta.url),
      "utf8"
    );
    expect(overlaySrc).toMatch(
      /mineProxyProgrammaticPrepareRef\.current\?\.\([\s\S]*jump:\s*true/
    );
  });
});
