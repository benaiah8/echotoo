import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREATE_ENTRY_POST_TYPE,
  buildCreateFinalizeUrl,
} from "./draftEntryGate";

const root = resolve(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("Create Step 1 — direct Post/Place entry", () => {
  it("defaults new create entry to experience (Place)", () => {
    expect(DEFAULT_CREATE_ENTRY_POST_TYPE).toBe("experience");
    expect(buildCreateFinalizeUrl(DEFAULT_CREATE_ENTRY_POST_TYPE)).toContain(
      "type=experience"
    );
  });

  it("exposes enterCreateAsDefaultPost on the draft entry gate", () => {
    const src = readSrc("hooks/useCreateDraftEntryGate.ts");
    expect(src).toContain("enterCreateAsDefaultPost");
    expect(src).toContain("DEFAULT_CREATE_ENTRY_POST_TYPE");
    expect(src).toContain('onPickerContinue(DEFAULT_CREATE_ENTRY_POST_TYPE)');
    expect(src).toContain("shouldOfferCreateDraftEntryDialog");
    expect(src).toContain("cleanupEmptyFreshCreateDraftIfNeeded");
  });

  it("main + button enters create directly (no chooser open)", () => {
    const src = readSrc("components/BottomTab.tsx");
    expect(src).toContain("enterCreateAsDefaultPost()");
    expect(src).not.toMatch(/openChooser\(\)/);
  });

  it("/create uses the same direct entry helper", () => {
    const src = readSrc("pages/CreatePage.tsx");
    expect(src).toContain("enterCreateAsDefaultPost");
    expect(src).not.toContain("CreateChooserPanel");
  });

  it("keeps CreateChooserOverlay / Panel modules available", () => {
    expect(readSrc("components/create/CreateChooserOverlay.tsx").length).toBeGreaterThan(
      0
    );
    expect(readSrc("components/create/CreateChooserPanel.tsx").length).toBeGreaterThan(
      0
    );
  });
});
