import { describe, expect, it, vi } from "vitest";
import {
  hasCompletedHomeTour,
  markHomeTourCompleted,
} from "./homeTourStorage";
import { homeTourTargetSelector } from "./homeTourSteps";
import { registerHomeTourDevApi } from "./homeTourDevApi";
import { getPostScheduleLabelTextClass } from "../../lib/postScheduleLabelStyles";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("homeTour progress strip + navigation", () => {
  it("A/B: progress radial fade background; hit areas unchanged", () => {
    const overlay = read("src/components/homeTour/HomeTourOverlay.tsx");
    expect(overlay).toContain('data-home-tour-progress-fade="1"');
    expect(overlay).toContain('data-home-tour-progress-radial="1"');
    expect(overlay).toContain("radial-gradient(ellipse");
    expect(overlay).toContain("transparent 76%");
    expect(overlay).not.toContain("linear-gradient(to bottom");
    expect(overlay).toContain("h-8 w-[26px]");
    expect(overlay).toContain("w-[22px]");
    expect(overlay).toContain("data-home-tour-step-count");
    expect(overlay).toContain("{stepIndex + 1}/{stepCount}");
    const capsuleIdx = overlay.indexOf("data-home-tour-progress-capsule");
    const capsuleBlock = overlay.slice(capsuleIdx, capsuleIdx + 1800);
    expect(capsuleBlock).not.toContain("{stepIndex + 1}/{stepCount}");
    expect(capsuleBlock).not.toContain("border ");
    expect(overlay).toContain("bg-[var(--brand-readable)]");
  });

  it("D/E: reached segments navigate; future segments are not buttons", () => {
    const overlay = read("src/components/homeTour/HomeTourOverlay.tsx");
    expect(overlay).toContain("Go to tutorial step");
    expect(overlay).toContain("onGoToStep");
    expect(overlay).toContain('data-home-tour-progress-segment="future"');
    expect(overlay).toContain("maxReachedIndex");
    expect(overlay).toMatch(
      /progress-segment="future"[\s\S]{0,120}aria-hidden/
    );
    // Future segments are non-interactive divs, not buttons
    expect(overlay).toMatch(
      /if \(!reached\) \{[\s\S]*?<div[\s\S]*?progress-segment="future"/
    );
  });

  it("V: progress navigation does not mark tour complete", () => {
    const tour = read("src/components/homeTour/HomeTour.tsx");
    expect(tour).toContain("const goToStep");
    const start = tour.indexOf("const goToStep");
    const end = tour.indexOf("const goNext");
    const block = tour.slice(start, end);
    expect(block).not.toContain("finishTour");
    expect(block).not.toContain("markHomeTourCompleted");
    expect(block).toContain("allowForward");
    expect(block).toContain("maxReached");
  });
});

describe("homeTour accent contrast", () => {
  it("A/B/C: brand-readable accent — deep gold light, bright yellow dark", () => {
    const text = read("src/components/homeTour/homeTourText.tsx");
    const css = read("src/index.css");
    expect(text).toContain("TOUR_BRAND_TEXT_CLASS");
    expect(text).toContain("text-[var(--brand-readable)]");
    expect(text).not.toMatch(
      /export function tourBrand[\s\S]{0,120}text-\[var\(--brand\)\]/
    );
    // Token wiring in EchoToo theme
    expect(css).toContain("--brand-readable: var(--brand)");
    expect(css).toMatch(
      /\.theme-light[\s\S]*?--brand-readable:\s*var\(--brand-dark\)/
    );
    expect(css).toContain("--brand: #f7d047");
    expect(css).toContain("--brand-dark: #b45309");
  });
});

describe("homeTour viewport clamp + Duo/Group positioning", () => {
  it("C/D: Step 2 spotlight/tooltip clamped to usable top bounds", () => {
    const layout = read("src/components/homeTour/homeTourLayout.ts");
    const overlay = read("src/components/homeTour/HomeTourOverlay.tsx");
    const tour = read("src/components/homeTour/HomeTour.tsx");
    expect(layout).toContain("clampSpotlightTargetRect");
    expect(layout).toContain("clampHoleRect");
    expect(layout).toContain("SPOTLIGHT_TOP_INSET_PX");
    expect(layout).toContain("nearTop");
    expect(overlay).toContain("clampHoleRect");
    expect(tour).toContain("clampSpotlightTargetRect");
  });

  it("E/F/G/H: Duo/Group use BottomTab clearance; shared path for back nav", () => {
    const tour = read("src/components/homeTour/HomeTour.tsx");
    const social = read("src/components/homeTour/homeTourSocialViewport.ts");
    expect(tour).toContain("SOCIAL_BOTTOM_TAB_CLEARANCE_PX");
    expect(tour).toContain("ensureSocialTargetInSafeViewport");
    expect(tour).toContain("scrollDocumentByWhileLocked");
    expect(tour).toContain("scheduleLayoutSettle");
    expect(social).toContain('getElementById("bottom-tab")');
    expect(social).toContain("underTab");
    expect(social).toContain("scrollDocumentByWhileLocked");
    expect(tour).toContain("scrolledSocialStepRef.current = null");
    expect(tour).toMatch(/SOCIAL_BOTTOM_TAB_CLEARANCE_PX/);
  });

  it("Duo/Group: scroll under lock before spotlight measure; cancel stale settle", () => {
    const tour = read("src/components/homeTour/HomeTour.tsx");
    expect(tour).toContain("runSocialPositionThenMeasure");
    expect(tour).toContain("socialTargetNeedsSafeViewportMove");
    expect(tour).toContain("applyRect(null)");
    expect(tour).toContain("cancelAnimationFrame");
    expect(tour).not.toContain("window.scrollBy");
  });

  it("filter cues + scroll lock preserved", () => {
    const overlay = read("src/components/homeTour/HomeTourOverlay.tsx");
    const tour = read("src/components/homeTour/HomeTour.tsx");
    expect(overlay).toContain("HomeTourFilterCues");
    expect(overlay).toContain('step.id === "date-time"');
    expect(tour).toContain("useOverlayBackgroundScrollLock(active)");
    expect(tour).toContain("stepNeedsTourFilters");
  });
});

describe("homeTour copy emphasis", () => {
  it("N: Duo meet-there and make-plans both brand", () => {
    const src = read("src/components/homeTour/homeTourSteps.tsx");
    expect(src).toContain('tourBrand("meet there")');
    expect(src).toContain('tourBrand("make plans")');
  });

  it("O/P: Group Find-or-create + Chat-plan-connect", () => {
    const src = read("src/components/homeTour/homeTourSteps.tsx");
    expect(src).toContain('tourBrand("Find or create")');
    expect(src).toContain('tourStrong("Chat, plan, connect")');
  });

  it("Q: People semantic colors people/Duos/Groups", () => {
    const steps = read("src/components/homeTour/homeTourSteps.tsx");
    const text = read("src/components/homeTour/homeTourText.tsx");
    expect(steps).toContain('tourBrand("people")');
    expect(steps).toContain('tourGreen("Duos")');
    expect(steps).toContain('tourBlue("Groups")');
    expect(text).toContain("tourGreen");
    expect(text).toContain("tourBlue");
    expect(text).toContain("text-green-600");
    expect(text).toContain("var(--blue-text)");
  });

  it("R: Create places/ideas/plans emphasized", () => {
    const src = read("src/components/homeTour/homeTourSteps.tsx");
    expect(src).toContain('tourStrong("places")');
    expect(src).toContain('tourStrong("ideas")');
    expect(src).toContain('tourStrong("plans")');
    expect(src).not.toContain("get discovered");
  });
});

describe("homeTour celebration", () => {
  it("A–G: one-line farewell, viewport-centered, corner-peek owl", () => {
    const cele = read("src/components/homeTour/HomeTourCelebration.tsx");
    expect(cele).toContain('data-home-tour-celebration-hero="1"');
    expect(cele).toContain('data-home-tour-celebration-line="see-you-around"');
    expect(cele).toContain("data-home-tour-celebration-you");
    expect(cele).toContain("data-home-tour-celebration-see");
    expect(cele).toContain("data-home-tour-celebration-around");
    expect(cele).toContain('data-home-tour-celebration-centered-viewport="1"');
    expect(cele).toContain('data-home-tour-celebration-centered="1"');
    expect(cele).toContain('data-home-tour-celebration-app-frame="1"');
    expect(cele).toContain("readUsableAppBounds");
    // True vertical + horizontal center of app frame
    expect(cele).toContain("absolute inset-0");
    expect(cele).toContain("flex items-center justify-center");
    expect(cele).toContain("w-[92%] max-w-[92%]");
    expect(cele).toContain("whitespace-nowrap");
    expect(cele).not.toContain("bottom-[34%]");
    expect(cele).not.toContain('data-home-tour-celebration-lower="1"');
    expect(cele).not.toContain('data-home-tour-celebration-line="see-you"');
    expect(cele).not.toContain('data-home-tour-celebration-line="around"');
    expect(cele).toContain("[data-home-tour-celebration-see]");
    expect(cele).toContain("[data-home-tour-celebration-you]");
    expect(cele).toContain("[data-home-tour-celebration-around]");
    expect(cele).toContain("font-weight: 600");
    expect(cele).toContain("clamp(1.25rem, 5.8cqw, 1.8rem)");
    // No horizontal translate in content enter animation
    expect(cele).not.toMatch(
      /home-tour-cele-content-in[\s\S]*translate\(-50%/
    );
    // Large corner peek — unchanged, no circular badge
    expect(cele).toContain('data-home-tour-celebration-owl-peek="1"');
    expect(cele).toContain(
      'data-home-tour-celebration-owl-corner="lower-left"'
    );
    expect(cele).toContain("bottom-[-10%]");
    expect(cele).toContain("left-[-12%]");
    expect(cele).toContain("w-[min(52%,13.5rem)]");
    expect(cele).toContain('transform: "rotate(-10deg)"');
    expect(cele).toContain('data-home-tour-celebration-owl-mono="1"');
    // Theme via html.theme-light (EchoToo) — not a nonexistent .app-dark class
    expect(cele).toContain("html.theme-light [data-home-tour-celebration-owl] img");
    expect(cele).toContain("grayscale(1)");
    // Dark (default): light/off-white owl, NOT inverted
    expect(cele).toMatch(
      /\[data-home-tour-celebration-owl\] img \{\s*\/\* Dark mode[\s\S]*?brightness\(1\.92\)[\s\S]*?\}/
    );
    expect(cele).toMatch(
      /\[data-home-tour-celebration-owl\] img \{\s*\/\* Dark mode[\s\S]*?filter: grayscale\(1\) brightness\(1\.92\) contrast\(1\.14\);/
    );
    // Light: inverted monochrome so eyes/details stay light on charcoal body
    expect(cele).toContain(
      "filter: grayscale(1) invert(1) contrast(1.08) brightness(0.9);"
    );
    expect(cele).toContain("text-[var(--text)]");
    expect(cele).not.toContain("text-[var(--brand-readable)]");
    expect(cele).not.toContain(".app-dark [data-home-tour-celebration-owl]");
    expect(cele).not.toContain('data-home-tour-celebration-owl-badge="1"');
    expect(cele).not.toContain('data-home-tour-celebration-owl-sideways="1"');
    expect(cele).not.toContain("border-[3px]");
    expect(cele).toContain("Around.");
    expect(cele).toContain("--font-people-display");
    expect(cele).toContain('transform: "rotate(-2deg)"');
  });

  it("H: reduced-motion preserves composition; hides flying particles", () => {
    const cele = read("src/components/homeTour/HomeTourCelebration.tsx");
    expect(cele).toContain("prefers-reduced-motion");
    expect(cele).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*data-home-tour-particle[\s\S]*display:\s*none/
    );
    expect(cele).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*data-home-tour-celebration-owl/
    );
  });

  it("J: Done stores completion before celebration", () => {
    const tour = read("src/components/homeTour/HomeTour.tsx");
    const markIdx = tour.indexOf("markHomeTourCompleted(userId)");
    const celebIdx = tour.indexOf("setCelebrationOpen(true)");
    expect(markIdx).toBeGreaterThan(-1);
    expect(celebIdx).toBeGreaterThan(markIdx);
  });

  it("W: Skip still marks complete", () => {
    const tour = read("src/components/homeTour/HomeTour.tsx");
    expect(tour).toContain("finishTour({ celebrate: false })");
    expect(tour).toContain("const skipTour");
  });
});

describe("homeTour targets + schedule helpers", () => {
  it("maps new filter cue targets", () => {
    expect(homeTourTargetSelector("home-filter-trigger")).toBe(
      '[data-tour-target="home-filter-trigger"]'
    );
    expect(homeTourTargetSelector("home-filter-shortcuts")).toBe(
      '[data-tour-target="home-filter-shortcuts"]'
    );
  });

  it("keeps date semantic colors", () => {
    expect(getPostScheduleLabelTextClass("today")).toContain("text-green");
    expect(getPostScheduleLabelTextClass("tomorrow")).toContain("blue-text");
  });
});

describe("homeTour scroll lock + DEV", () => {
  it("uses existing useOverlayBackgroundScrollLock", () => {
    const tour = read("src/components/homeTour/HomeTour.tsx");
    expect(tour).toContain("useOverlayBackgroundScrollLock(active)");
  });

  it("X: DEV start/reset unchanged", () => {
    const userId = "dev-tour-user";
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal("window", { __echoHomeTour: undefined as unknown });

    const start = vi.fn();
    const cleanup = registerHomeTourDevApi({ userId, start });
    if (import.meta.env.DEV) {
      window.__echoHomeTour?.start();
      expect(start).toHaveBeenCalledTimes(1);
      markHomeTourCompleted(userId);
      window.__echoHomeTour?.reset();
      expect(hasCompletedHomeTour(userId)).toBe(false);
    }
    cleanup();
    vi.unstubAllGlobals();
  });
});

describe("goToStep helper contract", () => {
  it("rejects future indices without allowForward", () => {
    let index = 3;
    let maxReached = 3;
    const goToStep = (next: number, opts?: { allowForward?: boolean }) => {
      if (next < 0 || next >= 7) return;
      if (!opts?.allowForward && next > maxReached) return;
      index = next;
      maxReached = Math.max(maxReached, next);
    };
    goToStep(5);
    expect(index).toBe(3);
    goToStep(1);
    expect(index).toBe(1);
    goToStep(4, { allowForward: true });
    expect(index).toBe(4);
    expect(maxReached).toBe(4);
  });
});
