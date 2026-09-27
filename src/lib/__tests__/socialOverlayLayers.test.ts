import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SOCIAL_TOAST_BOTTOM,
  SOCIAL_OVERLAY_LAYER,
  SOURCE_GROUPS_SOCIAL_TOAST_BOTTOM,
} from "../socialOverlayLayers";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("SOCIAL_OVERLAY_LAYER", () => {
  it("photo gate sits above Source Groups browse / Pair Up note", () => {
    const browse = Number(
      SOCIAL_OVERLAY_LAYER.browseOrNote.match(/\d+/)?.[0] ?? 0
    );
    const gate = Number(SOCIAL_OVERLAY_LAYER.photoGate.match(/\d+/)?.[0] ?? 0);
    const create = Number(
      SOCIAL_OVERLAY_LAYER.createManage.match(/\d+/)?.[0] ?? 0
    );
    const chat = Number(
      SOCIAL_OVERLAY_LAYER.socialConversation.match(/\d+/)?.[0] ?? 0
    );
    const acquisition = Number(
      SOCIAL_OVERLAY_LAYER.photoGateAcquisition.match(/\d+/)?.[0] ?? 0
    );
    const edit = Number(
      SOCIAL_OVERLAY_LAYER.editProfile.match(/\d+/)?.[0] ?? 0
    );
    const editAcquisition = Number(
      SOCIAL_OVERLAY_LAYER.editProfileAcquisition.match(/\d+/)?.[0] ?? 0
    );

    expect(gate).toBeGreaterThan(browse);
    expect(gate).toBeGreaterThan(create);
    expect(chat).toBeGreaterThan(browse);
    expect(chat).toBeGreaterThan(create);
    expect(gate).toBeGreaterThan(chat);
    expect(acquisition).toBeGreaterThan(gate);
    expect(edit).toBeGreaterThan(acquisition);
    expect(editAcquisition).toBeGreaterThan(edit);
    expect(editAcquisition).toBeLessThan(205);
  });

  it("exposes editProfileAcquisition as a dedicated Edit Profile sheet tier", () => {
    expect(SOCIAL_OVERLAY_LAYER.editProfileAcquisition).toBe("z-[180]");
    expect(SOCIAL_OVERLAY_LAYER.editProfile).toBe("z-[170]");
    expect(SOCIAL_OVERLAY_LAYER.photoGateAcquisition).toBe("z-[160]");
  });

  it("exposes source-groups toast bottom distinct from feed tab default", () => {
    expect(SOURCE_GROUPS_SOCIAL_TOAST_BOTTOM).toContain(
      "safe-area-bottom-layout"
    );
    expect(DEFAULT_SOCIAL_TOAST_BOTTOM).toContain("72px");
    expect(SOURCE_GROUPS_SOCIAL_TOAST_BOTTOM).not.toContain("72px");
  });
});

describe("Edit Profile acquisition layer wiring", () => {
  it("Edit Profile MediaAcquisitionSheet uses editProfileAcquisition only", () => {
    const edit = src("src/components/profile/FullScreenProfileCreation.tsx");
    expect(edit).toContain(
      "portalClassName={SOCIAL_OVERLAY_LAYER.editProfileAcquisition}",
    );
    expect(edit).not.toContain('portalClassName="z-[130]"');
  });

  it("MediaAcquisitionSheet default layer remains unchanged", () => {
    const sheet = src("src/components/create/MediaAcquisitionSheet.tsx");
    expect(sheet).toContain('portalClassName ?? "z-[145]"');
  });

  it("photo gate acquisition layer remains photoGateAcquisition", () => {
    const mount = src("src/components/profile/PairUpPhotoPromptMount.tsx");
    expect(mount).toContain(
      "acquisitionPortalClassName={SOCIAL_OVERLAY_LAYER.photoGateAcquisition}",
    );
  });

  it("Create does not import or use editProfileAcquisition", () => {
    const createPicker = src("src/hooks/useCreatePostMediaPicker.tsx");
    expect(createPicker).not.toContain("editProfileAcquisition");
    expect(createPicker).not.toContain("socialOverlayLayers");
  });
});
