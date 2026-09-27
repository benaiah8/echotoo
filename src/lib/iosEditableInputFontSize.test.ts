/**
 * Static source checks: editable inputs declare ≥16px (iOS zoom hardening).
 * Does not measure computed CSS in a browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("iOS editable input ≥16px hardening (source)", () => {
  it("preserves coarse-pointer max(16px, 1em) safeguard", () => {
    const css = readRepo("src/index.css");
    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain("font-size: max(16px, 1em) !important;");
    expect(css).toContain('input[type="text"]');
    expect(css).toContain('input[type="email"]');
    expect(css).toContain('input[type="password"]');
    expect(css).toContain('input[type="search"]');
    expect(css).toContain("textarea");
  });

  it("does not disable viewport user-scalable for zoom suppression", () => {
    const html = readRepo("index.html");
    expect(html.toLowerCase()).not.toMatch(/user-scalable\s*=\s*no/);
    expect(html.toLowerCase()).not.toMatch(/maximum-scale\s*=\s*1/);
  });

  it("PrimaryInput declares text-[16px], not text-xs", () => {
    const src = readRepo("src/components/input/PrimaryInput.tsx");
    expect(src).toContain("text-[16px]");
    expect(src).not.toMatch(/sharedStyles[\s\S]*text-xs/);
    expect(src).not.toMatch(/editorChromeStyles[\s\S]*text-xs/);
  });

  it(".ui-input declares font-size 16px", () => {
    const css = readRepo("src/index.css");
    const block = css.slice(css.indexOf(".ui-input {"), css.indexOf(".ui-input::placeholder"));
    expect(block).toContain("font-size: 16px;");
    expect(block).not.toContain("font-size: 13px;");
  });

  it("Create location override is not !text-xs", () => {
    const src = readRepo(
      "src/sections/create/CreateActivityLocationSection.tsx",
    );
    expect(src).toContain("!text-[16px]");
    expect(src).not.toContain("!text-xs");
  });

  it("corrected create/comment/report fields declare text-[16px]", () => {
    const files = [
      "src/sections/create/CreateCategoriesCompactSection.tsx",
      "src/sections/create/CreateActivityAdditionalDetailSection.tsx",
      "src/pages/CreateCategoryPage.tsx",
      "src/components/create/CreateFlowPostTagsField.tsx",
      "src/components/ActivitiesTagsInput.tsx",
      "src/components/input/dropdown/SecondaryDropdown.tsx",
      "src/components/input/dropdown/ActivitiesDropdown.tsx",
      "src/components/ui/CommentInput.tsx",
      "src/components/ui/Comment.tsx",
      "src/components/ui/FloatingCommentInput.tsx",
      "src/components/ui/ReportModal.tsx",
      "src/components/ui/InviteDrawer.tsx",
      "src/components/LocationPicker.tsx",
      "src/components/LocationPickerGoogle.tsx",
      "src/lib/glassActionSheetStyles.ts",
    ];
    for (const rel of files) {
      const src = readRepo(rel);
      expect(src, rel).toContain("text-[16px]");
    }
  });

  it("Finalize caption/section compose types remain 16px", () => {
    const css = readRepo("src/index.css");
    expect(css).toContain(".create-finalize-caption-compose-type");
    expect(css).toContain(".create-finalize-section-compose-type");
    const caption = css.slice(
      css.indexOf(".create-finalize-caption-compose-type"),
      css.indexOf(".create-finalize-section-compose-type"),
    );
    expect(caption).toContain("font-size: 16px;");
    const section = css.slice(
      css.indexOf(".create-finalize-section-compose-type"),
      css.indexOf(".create-finalize-section-compose-type") + 400,
    );
    expect(section).toContain("font-size: 16px;");
  });
});
