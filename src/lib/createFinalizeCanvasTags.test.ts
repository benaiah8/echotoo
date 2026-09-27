/**
 * Source/contract tests for Create Finalize canvas saved-hashtag row.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("CreateFinalize canvas tags row", () => {
  const row = () =>
    readRepo("src/components/create/CreateFinalizeCanvasTagsRow.tsx");
  const page = () => readRepo("src/pages/CreateFinalizePage.tsx");

  it("renders nothing when tags empty; uses formatHashtagForDisplay", () => {
    const src = row();
    expect(src).toContain("if (tags.length === 0) return null");
    expect(src).toContain("formatHashtagForDisplay");
    expect(src).toContain('aria-label="Edit hashtags"');
    expect(src).toContain("data-create-finalize-canvas-tags");
    expect(src).toContain("flex-wrap");
    expect(src).not.toContain("×");
    expect(src).not.toContain("Remove");
  });

  it("page places canvas tags after structured meta and before Add section", () => {
    const src = page();
    const metaIdx = src.indexOf("<CreateFinalizeStructuredMetaBlocks");
    const tagsIdx = src.indexOf("<CreateFinalizeCanvasTagsRow");
    const addIdx = src.indexOf("<CreateFinalizeAddSectionTrigger");
    expect(metaIdx).toBeGreaterThan(-1);
    expect(tagsIdx).toBeGreaterThan(metaIdx);
    expect(addIdx).toBeGreaterThan(tagsIdx);
    expect(src).toContain("tags={tags}");
    expect(src).toContain("onClick={openTagsSheet}");
  });

  it("canvas and footer share openTagsSheet; single Tags sheet", () => {
    const src = page();
    expect(src).toContain("const openTagsSheet = useCallback");
    expect(src).toContain("onTagsClick={openTagsSheet}");
    expect(src).toContain("<CreateFinalizeTagsSheet");
    expect(src.match(/<CreateFinalizeTagsSheet/g)?.length).toBe(1);
    expect(src).toContain("composeFinalizeStripPreviewMeta");
    expect(src).toContain("setTags(next)");
  });

  it("does not change PostDetailBody published hashtag strip gate", () => {
    const body = readRepo("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("!composeFinalizeStripPreviewMeta");
    expect(body).toContain("data-hashtag-row");
  });
});
