/**
 * Compose below-field open icons — contract tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("ComposeLinkOpenIcons", () => {
  it("renders flow chips below text using shared URL extract + dialog", () => {
    const src = readRepo("src/components/ui/ComposeLinkOpenIcons.tsx");
    expect(src).toContain("OpenExternalLinkDialog");
    expect(src).toContain("extractSafeHttpUrlsFromText");
    expect(src).toContain("safeHttpUrlDisplayHost");
    expect(src).toContain("data-compose-link-open-icons");
    expect(src).toContain("flex-wrap");
    expect(src).not.toContain("getClientRects");
    expect(src).not.toContain("absolute inset-0");
    expect(src).not.toContain("containerRef");
  });

  it("caption and section wire open icons below the field", () => {
    const caption = readRepo("src/components/detail/PostDetailBody.tsx");
    expect(caption).toContain("ComposeLinkOpenIcons");
    expect(caption).not.toContain("finalizeCaptionFieldRootRef");
    expect(caption).not.toContain("containerRef=");

    const section = readRepo(
      "src/components/create/CreateFinalizeSectionsBlock.tsx",
    );
    expect(section).toContain("ComposeLinkOpenIcons");
    expect(section).toContain("skipBlurRemoveRef={skipBlurRemoveRef}");
    expect(section).not.toContain("containerRef=");
    expect(section).not.toContain("SectionLinkPills");
  });

  it("overlay stays paint-only without open-icon positioning attrs", () => {
    const src = readRepo("src/components/ui/ComposeLinkPreviewOverlay.tsx");
    expect(src).toContain("create-compose-link-highlight");
    expect(src).not.toContain("COMPOSE_LINK_ANCHOR_ATTR");
    expect(src).not.toContain("data-compose-link-anchor");
  });

  it("published PostCaptionText still uses ExternalLinkPill", () => {
    const src = readRepo("src/components/PostCaptionText.tsx");
    expect(src).toContain("ExternalLinkPill");
  });
});
