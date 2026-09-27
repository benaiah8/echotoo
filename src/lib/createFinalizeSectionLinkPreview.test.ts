/**
 * Source/contract tests: section compose uses caption-style inline URL overlay.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { composeTextHasLinkPreview } from "../components/ui/ComposeLinkPreviewOverlay";
import { tokenizeSafeHttpUrlsInText } from "./safeHttpUrlText";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("CreateFinalize section inline link preview", () => {
  const sections = () =>
    readRepo("src/components/create/CreateFinalizeSectionsBlock.tsx");
  const overlay = () =>
    readRepo("src/components/ui/ComposeLinkPreviewOverlay.tsx");
  const css = () => readRepo("src/index.css");

  it("no URL → composeTextHasLinkPreview false; URL mid-sentence still tokens", () => {
    expect(composeTextHasLinkPreview("plain details")).toBe(false);
    expect(
      composeTextHasLinkPreview("Meet at https://maps.example/x tonight"),
    ).toBe(true);
    const segs = tokenizeSafeHttpUrlsInText(
      "See www.echotoo.com and more",
    );
    expect(segs.some((s) => s.kind === "url" && s.value === "www.echotoo.com")).toBe(
      true,
    );
    expect(segs.some((s) => s.kind === "text" && s.value.includes("See"))).toBe(
      true,
    );
  });

  it("section editor mounts ComposeLinkPreviewOverlay and removes compose pills", () => {
    const src = sections();
    expect(src).toContain("ComposeLinkPreviewOverlay");
    expect(src).toContain("composeTextHasLinkPreview");
    expect(src).toContain("COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS");
    expect(src).toContain("create-finalize-caption-canvas--link-preview");
    expect(src).toContain("data-create-section-link-preview");
    expect(src).not.toContain("SectionLinkPills");
    expect(src).not.toContain("ExternalLinkPill");
    expect(src).not.toContain("extractSectionBodyUrls");
  });

  it("overlay supports section typeClassName; caption default unchanged", () => {
    const src = overlay();
    expect(src).toContain("typeClassName = COMPOSE_LINK_PREVIEW_TYPE_CLASS");
    expect(src).toContain("COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS");
    expect(src).toContain("tokenizeSafeHttpUrlsInText");
  });

  it("section compose type CSS matches caption metrics with py-0", () => {
    const src = css();
    expect(src).toContain(".create-finalize-section-compose-type");
    expect(src).toContain(".create-finalize-caption-compose-type");
    expect(src).toMatch(
      /\.create-finalize-section-compose-type\s*\{[^}]*padding:\s*0;/s,
    );
    expect(src).toContain("font-size: 16px");
    expect(src).toContain("line-height: 1.375");
  });

  it("published section links and caption compose path remain intact", () => {
    const published = readRepo(
      "src/components/detail/PostV4SectionsReadOnly.tsx",
    );
    expect(published).toContain("PostCaptionText");
    const captionBody = readRepo("src/components/detail/PostDetailBody.tsx");
    expect(captionBody).toContain("ComposeLinkPreviewOverlay");
    expect(captionBody).toContain("composeTextHasLinkPreview");
    expect(captionBody).toContain("COMPOSE_LINK_PREVIEW_TYPE_CLASS");
  });
});
