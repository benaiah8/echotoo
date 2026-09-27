/**
 * Source/contract tests for Create Finalize Ratings star indicator.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("CreateFinalize Ratings star indicator", () => {
  const caption = () =>
    readRepo("src/components/create/CreateFinalizeCaptionMetaActions.tsx");
  const settings = () =>
    readRepo("src/components/create/CreateFinalizeSettingsSheet.tsx");
  const page = () => readRepo("src/pages/CreateFinalizePage.tsx");

  it("star always renders with ON/OFF icons and a11y labels", () => {
    const src = caption();
    expect(src).toContain("data-create-ratings-indicator");
    expect(src).toContain("PiStar");
    expect(src).toContain("PiStarFill");
    expect(src).toContain("Ratings on. Open settings");
    expect(src).toContain("Ratings off. Open settings");
    expect(src).toContain("ratingEnabled");
    expect(src).toContain("onRatingsClick");
  });

  it("star click opens settings path and does not toggle ratings", () => {
    const src = caption();
    expect(src).toContain("onRatingsClick()");
    expect(src).not.toMatch(/setRatingEnabled/);
    expect(src).not.toMatch(/onRatingToggle/);
  });

  it("OFF/ON styling uses fixed icon-only pill size", () => {
    const src = caption();
    expect(src).toContain("h-9 min-h-9 w-9 min-w-9");
    expect(src).toContain("ratingsPillOffClass");
    expect(src).toContain("ratingsPillOnClass");
    expect(src).toContain("motion-reduce:transition-none");
    expect(src).toContain("duration-200");
  });

  it("Settings supports Ratings spotlight, dim siblings, and scrollIntoView", () => {
    const src = settings();
    expect(src).toContain("highlightRatings");
    expect(src).toContain("spotlightActive");
    expect(src).toContain("data-create-settings-ratings");
    expect(src).toContain("data-create-settings-spotlight-dim");
    expect(src).toContain("opacity-[0.35]");
    expect(src).toContain("SETTINGS_RATINGS_SPOTLIGHT_CLASS");
    expect(src).toContain("dismissSpotlight");
    expect(src).toContain("onPointerDownCapture={dismissSpotlight}");
    expect(src).toContain("scrollIntoView");
    expect(src).toContain("motion-reduce:transition-none");
    expect(src).not.toContain("CREATE_FLOW_ADVISORY_FIELD_HIGHLIGHT_CLASS");
    expect(src).not.toMatch(/pointer-events-none/);
  });

  it("page wires shared openSettingsSheet; star highlights, footer does not", () => {
    const src = page();
    expect(src).toContain("openSettingsSheet({ highlightRatings: true })");
    expect(src).toContain("onSettingsClick={() => {\n                  openSettingsSheet();\n                }}");
    expect(src).toContain("highlightRatings={settingsHighlightRatings}");
    expect(src).toContain("clearSettingsRatingsHighlight");
    expect(src).toContain("CREATE_FLOW_ADVISORY_HIGHLIGHT_MS");
  });

  it("existing conversion paths still force ratings OFF", () => {
    const src = page();
    expect(src).toContain("applyPlaceToEventConversion");
    expect(src).toMatch(
      /applyPlaceToEventConversion[\s\S]*?setRatingEnabled\(false\)/,
    );
    expect(src).toMatch(
      /experience_to_hangout[\s\S]*?setRatingEnabled\(false\)/,
    );
  });
});
