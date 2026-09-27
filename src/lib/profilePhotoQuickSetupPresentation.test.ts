import { describe, expect, it } from "vitest";
import {
  clampPhotoCount,
  deriveAddAffordanceForFront,
  deriveAddAffordanceMode,
  deriveEmptyCardButtonLabel,
  deriveEmptyCardCopyLines,
  deriveFloatingPlusAriaLabel,
  deriveInitialCycleIndex,
  deriveCycleIndexAfterPhotoAdd,
  deriveNavigationDotOffsetY,
  derivePlusRingRatio,
  deriveQuickSetupPresentation,
  deriveSlotDotPresentation,
  quickSetupSlotAriaLabel,
} from "./profilePhotoQuickSetupPresentation";
import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

describe("deriveInitialCycleIndex", () => {
  it("opens on the next empty slot when room remains", () => {
    expect(deriveInitialCycleIndex(0)).toBe(0);
    expect(deriveInitialCycleIndex(1)).toBe(1);
    expect(deriveInitialCycleIndex(2)).toBe(2);
  });

  it("opens on primary when already complete", () => {
    expect(deriveInitialCycleIndex(3)).toBe(0);
  });
});

describe("deriveCycleIndexAfterPhotoAdd", () => {
  it("matches initial slot derivation after each add", () => {
    expect(deriveCycleIndexAfterPhotoAdd(1)).toBe(1);
    expect(deriveCycleIndexAfterPhotoAdd(2)).toBe(2);
    expect(deriveCycleIndexAfterPhotoAdd(3)).toBe(0);
  });
});

describe("deriveNavigationDotOffsetY", () => {
  it("lowers center indicator for shallow V", () => {
    expect(deriveNavigationDotOffsetY(0)).toBe(0);
    expect(deriveNavigationDotOffsetY(1)).toBe(4);
    expect(deriveNavigationDotOffsetY(2)).toBe(0);
  });
});

describe("derivePlusRingRatio", () => {
  it("maps photo count to ring completion fraction", () => {
    expect(derivePlusRingRatio(0)).toBe(0);
    expect(derivePlusRingRatio(1)).toBeCloseTo(1 / 3);
    expect(derivePlusRingRatio(2)).toBeCloseTo(2 / 3);
    expect(derivePlusRingRatio(3)).toBe(1);
  });
});

describe("deriveEmptyCardCopyLines", () => {
  it("0 → Add / photo, 1+ → Add another / photo", () => {
    expect(deriveEmptyCardCopyLines(0)).toEqual(["Add", "photo"]);
    expect(deriveEmptyCardCopyLines(1)).toEqual(["Add another", "photo"]);
    expect(deriveEmptyCardCopyLines(2)).toEqual(["Add another", "photo"]);
  });
});

describe("deriveEmptyCardButtonLabel", () => {
  it("joins copy lines for aria fallbacks", () => {
    expect(deriveEmptyCardButtonLabel(0)).toBe("Add photo");
    expect(deriveEmptyCardButtonLabel(1)).toBe("Add another photo");
  });
});

describe("deriveAddAffordanceForFront", () => {
  it("empty front → empty-card affordance", () => {
    expect(deriveAddAffordanceForFront(0, false)).toBe("empty-card");
    expect(deriveAddAffordanceForFront(1, false)).toBe("empty-card");
  });

  it("photo front with room → plus-ring", () => {
    expect(deriveAddAffordanceForFront(1, true)).toBe("plus-ring");
    expect(deriveAddAffordanceForFront(2, true)).toBe("plus-ring");
  });

  it("3 photos → none", () => {
    expect(deriveAddAffordanceForFront(3, true)).toBe("none");
  });
});

describe("deriveAddAffordanceMode", () => {
  it("0 → empty-card, 1–2 → plus-ring, 3 → none", () => {
    expect(deriveAddAffordanceMode(0)).toBe("empty-card");
    expect(deriveAddAffordanceMode(1)).toBe("plus-ring");
    expect(deriveAddAffordanceMode(2)).toBe("plus-ring");
    expect(deriveAddAffordanceMode(3)).toBe("none");
  });
});

describe("deriveQuickSetupPresentation", () => {
  it("0 photos — empty card, no floating plus by default", () => {
    const p = deriveQuickSetupPresentation(0);
    expect(p.addAffordance).toBe("empty-card");
    expect(p.emptyCardLabel).toBe("Add photo");
    expect(p.addAriaLabel).toBe("Add profile photo");
    expect(p.plusRingRatio).toBe(0);
    expect(p.canAdd).toBe(true);
    expect(p.isComplete).toBe(false);
  });

  it("1 photo — plus ring ~1/3", () => {
    const p = deriveQuickSetupPresentation(1);
    expect(p.addAffordance).toBe("plus-ring");
    expect(p.emptyCardLabel).toBe("Add another photo");
    expect(p.plusRingRatio).toBeCloseTo(1 / 3);
    expect(p.addAriaLabel).toContain("1 of 3");
  });

  it("2 photos — plus ring ~2/3", () => {
    const p = deriveQuickSetupPresentation(2);
    expect(p.addAffordance).toBe("plus-ring");
    expect(p.plusRingRatio).toBeCloseTo(2 / 3);
    expect(p.addAriaLabel).toContain("2 of 3");
  });

  it("3 photos — no add control", () => {
    const p = deriveQuickSetupPresentation(3);
    expect(p.addAffordance).toBe("none");
    expect(p.addAriaLabel).toBe("");
    expect(p.canAdd).toBe(false);
    expect(p.isComplete).toBe(true);
  });
});

describe("deriveFloatingPlusAriaLabel", () => {
  it("includes count and add another wording", () => {
    expect(deriveFloatingPlusAriaLabel(2)).toBe(
      "2 of 3 profile photos added. Add another profile photo.",
    );
  });
});

describe("deriveSlotDotPresentation", () => {
  it("slot 0 is always primary", () => {
    const dot = deriveSlotDotPresentation(0, 1, true);
    expect(dot.isPrimary).toBe(true);
    expect(dot.isCurrent).toBe(false);
  });

  it("marks current viewed slot", () => {
    const dot = deriveSlotDotPresentation(2, 2, false);
    expect(dot.isCurrent).toBe(true);
    expect(dot.isPrimary).toBe(false);
  });
});

describe("quickSetupSlotAriaLabel", () => {
  it("empty slot describes cycling, not upload", () => {
    expect(
      quickSetupSlotAriaLabel({ kind: "add", slot: 1 }, 1),
    ).toBe("Empty photo slot 2, swipe to view other slots");
  });

  it("primary photo label", () => {
    expect(
      quickSetupSlotAriaLabel(
        { kind: "photo", path: "x.jpg", slot: 0 },
        2,
      ),
    ).toBe("Photo 1, primary");
  });
});

describe("clampPhotoCount", () => {
  it("clamps to PROFILE_PHOTOS_MAX", () => {
    expect(clampPhotoCount(-1)).toBe(0);
    expect(clampPhotoCount(PROFILE_PHOTOS_MAX)).toBe(PROFILE_PHOTOS_MAX);
    expect(clampPhotoCount(99)).toBe(PROFILE_PHOTOS_MAX);
  });
});
