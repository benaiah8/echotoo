/**
 * Source/contract tests: legacy /create/preview redirects to Finalize
 * before PreviewPage can mount or publish.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCreateFlowPath, Paths } from "./Paths";

const root = resolve(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("legacy /create/preview → Finalize redirect", () => {
  it("AppRouter redirects preview to finalize with replace and query preservation", () => {
    const src = readSrc("router/AppRouter.tsx");
    expect(src).toContain("RedirectCreatePreviewToFinalize");
    expect(src).toContain('path="preview"');
    expect(src).toContain("Paths.createFinalize");
    expect(src).toContain("location.search");
    expect(src).toContain("location.hash");
    expect(src).toContain("state={location.state}");
    expect(src).toMatch(/replace\b/);
    expect(src).not.toMatch(/element=\{<PreviewPage/);
    expect(src).not.toMatch(/from ["'].*PreviewPage["']/);
  });

  it("PreviewPage is not mounted from the router (file may remain)", () => {
    const router = readSrc("router/AppRouter.tsx");
    expect(router).not.toContain("PreviewPage");
    // File kept on purpose; must not be the create preview route element.
    const previewPage = readSrc("pages/PreviewPage.tsx");
    expect(previewPage).toContain("executeCreateFlowPublish");
  });

  it("preview remains under RequireAuth create parent", () => {
    const src = readSrc("router/AppRouter.tsx");
    const createBlockStart = src.indexOf("path={Paths.create}");
    const previewIdx = src.indexOf('path="preview"');
    expect(createBlockStart).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(createBlockStart);
    expect(src.slice(createBlockStart, previewIdx)).toContain(
      "RequireAuthRoute",
    );
  });

  it("isCreateFlowPath still treats preview as create tree", () => {
    expect(isCreateFlowPath(Paths.preview)).toBe(true);
    expect(isCreateFlowPath(Paths.createFinalize)).toBe(true);
  });

  it("Finalize retains published conversion gate; Preview publish is unreachable via router", () => {
    const finalize = readSrc("pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("resolvePublishedEditScheduleSaveDecision");
    expect(finalize).toContain("confirmedOwnerTypeConversion");
    expect(finalize).toContain('action === "request_conversion"');

    const router = readSrc("router/AppRouter.tsx");
    expect(router).toContain("RedirectCreatePreviewToFinalize");
    expect(router).not.toContain("<PreviewPage");
  });

  it("normal create routes remain mounted", () => {
    const src = readSrc("router/AppRouter.tsx");
    expect(src).toContain('path="finalize" element={<CreateFinalizePage />}');
    expect(src).toContain('path="activities" element={<CreateActivitiesPage />}');
    expect(src).toContain('path="categories" element={<CreateCategoryPage />}');
    expect(src).toContain('path="title" element={<CreateTitlePage />}');
  });
});
