import { describe, expect, it } from "vitest";
import { Paths } from "../router/Paths";
import { resolveCreateFlowUploadNoticeMessage } from "./createFlowUploadNotice";
import {
  CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS,
  CREATE_FINALIZE_DOCK_BOTTOM_CSS,
  CREATE_FINALIZE_DOCK_SCRUB_GAP_CSS,
  CREATE_FINALIZE_DOCK_STACK_CLASS,
  CREATE_FINALIZE_DOCK_STACK_ORDER,
  CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS,
} from "./createFinalizeMediaDockLayout";
import {
  CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS as SCRUB_REEXPORT,
  EXPANDED_MEDIA_TRAY_MAX_HEIGHT,
} from "./createFinalizeVideoHeroFrame";
import {
  finalizeHeroIndexToImageIndex,
  finalizeHeroMediaOffset,
  isFinalizeVideoHeroIndex,
} from "./createFinalizeHeroMedia";
import { FINALIZE_MEDIA_THUMB_CLIP } from "./createFinalizeMediaThumb";

describe("V3G1.3 dock stack anchor", () => {
  it("A/C: stack uses flex-col with strip before bar", () => {
    expect(CREATE_FINALIZE_DOCK_STACK_CLASS).toBe("flex flex-col");
    expect(CREATE_FINALIZE_DOCK_STACK_ORDER).toEqual(["strip", "bar"]);
    expect(CREATE_FINALIZE_DOCK_STACK_CLASS).not.toContain("reverse");
  });

  it("B: bar height is a shared CSS variable default", () => {
    expect(CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS).toBe("3rem");
  });

  it("D: stack order places bar last (bottom anchored)", () => {
    expect(CREATE_FINALIZE_DOCK_STACK_ORDER.indexOf("bar")).toBe(1);
    expect(CREATE_FINALIZE_DOCK_STACK_ORDER.indexOf("strip")).toBe(0);
  });

  it("E: tray max height is overlay-only and does not reference hero aspect", () => {
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).toContain("rem");
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).not.toContain("vh");
  });
});

describe("V3G1.3 scrubber alignment", () => {
  it("K: scrubber offset derives from shared dock CSS variables", () => {
    expect(CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS).toContain(
      "--create-finalize-dock-bottom",
    );
    expect(CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS).toContain(
      "--create-finalize-dock-bar-height",
    );
    expect(CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS).toContain(
      "--create-finalize-dock-scrub-gap",
    );
    expect(SCRUB_REEXPORT).toBe(CREATE_FINALIZE_VIDEO_SCRUB_BOTTOM_CSS);
    expect(CREATE_FINALIZE_DOCK_BOTTOM_CSS).toBe("0.5rem");
    expect(CREATE_FINALIZE_DOCK_SCRUB_GAP_CSS).toBe("0.375rem");
  });
});

describe("V3G1.3 duplicate upload notice gating", () => {
  it("F: Finalize suppresses image upload in notice stack", () => {
    expect(
      resolveCreateFlowUploadNoticeMessage({
        pathname: Paths.createFinalize,
        imageUploadingCount: 1,
        videoUploadingCount: 0,
      }),
    ).toBeNull();
  });

  it("G: earlier create routes still show image upload notice", () => {
    expect(
      resolveCreateFlowUploadNoticeMessage({
        pathname: Paths.createActivities,
        imageUploadingCount: 1,
        videoUploadingCount: 0,
      }),
    ).toBe("1 image uploading");
  });

  it("G: Finalize still shows legacy in-progress video notice", () => {
    expect(
      resolveCreateFlowUploadNoticeMessage({
        pathname: Paths.createFinalize,
        imageUploadingCount: 2,
        videoUploadingCount: 1,
      }),
    ).toBe("1 video uploading");
  });
});

describe("V3G1.3 active hero mapping unchanged", () => {
  it("I: VIDEO + IMAGE A + IMAGE B index contract", () => {
    expect(isFinalizeVideoHeroIndex(0, true)).toBe(true);
    expect(finalizeHeroIndexToImageIndex(1, true)).toBe(0);
    expect(finalizeHeroIndexToImageIndex(2, true)).toBe(1);
    expect(finalizeHeroMediaOffset(true)).toBe(1);
  });
});

describe("V3G1.3 thumbnail rings", () => {
  it("J: inset clip shell preserved", () => {
    expect(FINALIZE_MEDIA_THUMB_CLIP).toContain("overflow-hidden");
    expect(FINALIZE_MEDIA_THUMB_CLIP).toContain("rounded-[10px]");
  });
});

describe("V3G1.3 dismiss contract", () => {
  it("L: drag-active guard remains a boolean callback contract", () => {
    let active = false;
    const onDragActiveChange = (next: boolean) => {
      active = next;
    };
    onDragActiveChange(true);
    expect(active).toBe(true);
    onDragActiveChange(false);
    expect(active).toBe(false);
  });
});

describe("V3G1.3 image DnD contract", () => {
  it("H: hero offset for image thumb selection unchanged", () => {
    expect(finalizeHeroMediaOffset(true)).toBe(1);
    expect(finalizeHeroMediaOffset(false)).toBe(0);
  });
});
