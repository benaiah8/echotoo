/**
 * Create Media UI PASS — flatten Add media sheet + requirements affordance.
 * Updated for PASS B.1: Library + Photo + Video direct actions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUPPORTS_UNIFIED_NATIVE_CAMERA_CAPTURE,
  VIDEO_REQUIREMENTS_ITEMS,
  VIDEO_REQUIREMENTS_LINES,
  VIDEO_REQUIREMENTS_OPTIMIZATION_LINE,
  VIDEO_REQUIREMENTS_TITLE,
} from "./createDraftVideo/createVideoConstraints";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Create Media UI PASS — Add media sheet", () => {
  const sheet = () => read("src/components/create/MediaAcquisitionSheet.tsx");
  const info = () =>
    read("src/components/create/CreateVideoRequirementsInfo.tsx");
  const acquisition = () => read("src/lib/mediaAcquisition.ts");
  const picker = () => read("src/hooks/useCreatePostMediaPicker.tsx");

  it("A: info icon is next to Add media title", () => {
    const src = sheet();
    const titleIdx = src.indexOf("data-add-media-title");
    const infoIdx = src.indexOf("data-video-requirements-info");
    expect(titleIdx).toBeGreaterThan(-1);
    expect(infoIdx).toBeGreaterThan(titleIdx);
    const headerSlice = src.slice(
      src.indexOf("data-add-media-title") - 200,
      src.indexOf("data-video-requirements-info") + 80,
    );
    expect(headerSlice).toContain("Add media");
    expect(headerSlice).toContain("Video requirements");
  });

  it("B: old inner requirements/info placement removed", () => {
    const src = sheet();
    expect(src).not.toMatch(
      /mb-2 flex items-center justify-end[\s\S]*data-video-requirements-info/,
    );
    expect(src).not.toContain("justify-end px-0.5");
  });

  it("C: only one primary sheet container", () => {
    const src = sheet();
    expect(src).toContain("data-add-media-sheet");
    expect(src.match(/data-add-media-sheet/g)?.length).toBe(1);
    expect(src).toContain("glassPeoplePanelClass");
  });

  it("D: actions live in one flat row (no camera submenu)", () => {
    const src = sheet();
    expect(src).toContain("data-add-media-actions");
    expect(src).not.toContain("data-camera-kind-choice");
    expect(src).not.toContain('setCameraPanel("camera-kind")');
    expect(src).toContain("mediaChooserTileClass");
  });

  it("E: Library row remains", () => {
    const src = sheet();
    expect(src).toContain('data-media-source="library"');
    expect(src).toContain("Library");
    expect(src).toContain("Photos or video");
  });

  it("F: Photo and Video are direct top-level actions", () => {
    const src = sheet();
    expect(src).toContain('data-media-source="photo"');
    expect(src).toContain('data-media-source="video"');
    // Default Create uses Photo+Video; legacy camera-only remains for profile callers.
    expect(src).toContain("hasSeparatePhotoVideo");
    expect(src).toContain("legacyCameraOnly");
  });

  it("G: unified native camera still unsupported", () => {
    expect(SUPPORTS_UNIFIED_NATIVE_CAMERA_CAPTURE).toBe(false);
    const defs = read(
      "node_modules/@capacitor/camera/dist/esm/definitions.d.ts",
    );
    expect(defs).toContain("takePhoto");
    expect(defs).toContain("recordVideo");
  });

  it("H: Photo/Video call existing handlers directly", () => {
    const src = sheet();
    expect(src).toContain("onTakePhoto?.()");
    expect(src).toContain("onRecordVideo?.()");
    const hook = picker();
    expect(hook).toContain("onTakePhoto={() => void handleTakePhoto()}");
    expect(hook).toContain("onRecordVideo={() => void handleRecordVideo()}");
  });

  it("I: requirements show 90 sec / 200 MB / 4K / MP4 or MOV", () => {
    expect(VIDEO_REQUIREMENTS_TITLE).toBe("Video requirements");
    expect([...VIDEO_REQUIREMENTS_LINES]).toEqual([
      "Up to 90 seconds",
      "Up to 200 MB",
      "Up to 4K",
      "MP4 or MOV",
    ]);
    expect(VIDEO_REQUIREMENTS_ITEMS.map((i) => i.emphasis)).toEqual([
      "90 seconds",
      "200 MB",
      "4K",
      "MP4 or MOV",
    ]);
  });

  it("J: emphasized values use accessible theme token", () => {
    const src = info();
    expect(src).toContain("data-video-requirement-emphasis");
    expect(src).toContain("--brand-readable");
    expect(src).toContain("--create-accent-icon-fg");
  });

  it("K: copy says Videos may be optimized before posting.", () => {
    expect(VIDEO_REQUIREMENTS_OPTIMIZATION_LINE).toBe(
      "Videos may be optimized before posting.",
    );
    expect(info()).toContain("VIDEO_REQUIREMENTS_OPTIMIZATION_LINE");
  });

  it("L: no UI promises 20 MB output", () => {
    for (const src of [info(), sheet()]) {
      expect(src).not.toMatch(/compress(?:ed|ion)?\s+(?:below|to|under)\s*20/i);
      expect(src).not.toMatch(/reduced to 20\s*MB/i);
      expect(src).not.toContain("below 20 MB");
    }
  });

  it("M: existing acquisition paths unchanged", () => {
    const acq = acquisition();
    expect(acq).toContain("Camera.takePhoto({");
    expect(acq).toContain("Camera.recordVideo({");
    expect(acq).toContain("MediaTypeSelection.All");
    const hook = picker();
    expect(hook).toContain("MediaAcquisitionSheet");
  });
});
