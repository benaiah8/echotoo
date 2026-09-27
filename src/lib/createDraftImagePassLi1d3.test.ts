/**
 * PASS LI1D.3 — one-tap media remove reliability on Create finalize tray.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  beginFinalizeMediaRemoveOnce,
  claimFinalizeMediaRemoveMouseDown,
  claimFinalizeMediaRemovePointerDown,
  claimFinalizeMediaRemoveTouchStart,
  FINALIZE_MEDIA_NO_DND_ATTR,
  isFinalizeMediaRemoveTarget,
} from "./createFinalizeMediaRemoveGesture";
import { remapHeroIndexAfterMediaRemove } from "./createFinalizeHeroMedia";
import {
  imageOrderItem,
  removeMediaOrderItemByClientId,
  videoOrderItem,
} from "./createDraftMediaOrder";
import { buildLocalDraftImageUrl } from "./createDraftImage/localDraftImageUrl";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function pointerEvent(partial: {
  pointerType: string;
  button?: number;
}): {
  stopPropagation: ReturnType<typeof vi.fn>;
  preventDefault: ReturnType<typeof vi.fn>;
  pointerType: string;
  button: number;
} {
  return {
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    pointerType: partial.pointerType,
    button: partial.button ?? 0,
  };
}

describe("PASS LI1D.3 — one-tap media remove", () => {
  it("A/B: touch pointerdown claims gesture and is ready for immediate remove", () => {
    const e = pointerEvent({ pointerType: "touch" });
    expect(claimFinalizeMediaRemovePointerDown(e)).toBe(true);
    expect(e.stopPropagation).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it("mouse pointerdown claims without preventDefault (click removes)", () => {
    const e = pointerEvent({ pointerType: "mouse" });
    expect(claimFinalizeMediaRemovePointerDown(e)).toBe(true);
    expect(e.stopPropagation).toHaveBeenCalledOnce();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("F: touchstart / mousedown stopPropagation for DnD exclusion", () => {
    const touch = { stopPropagation: vi.fn() };
    claimFinalizeMediaRemoveTouchStart(touch);
    expect(touch.stopPropagation).toHaveBeenCalledOnce();

    const mouse = { stopPropagation: vi.fn(), button: 0 };
    claimFinalizeMediaRemoveMouseDown(mouse);
    expect(mouse.stopPropagation).toHaveBeenCalledOnce();
  });

  it("J: beginFinalizeMediaRemoveOnce prevents double fire", () => {
    const guard = { current: false };
    expect(beginFinalizeMediaRemoveOnce(guard)).toBe(true);
    expect(beginFinalizeMediaRemoveOnce(guard)).toBe(false);
    expect(guard.current).toBe(true);
  });

  it("C/D/E: remove by identity; inactive keeps active; active picks nearest", () => {
    // Active 0, remove index 2 → stay 0
    expect(remapHeroIndexAfterMediaRemove(0, 2, 2)).toBe(0);
    // Active 2, remove index 0 → active shifts to 1
    expect(remapHeroIndexAfterMediaRemove(2, 0, 2)).toBe(1);
    // Active 1, remove index 1 → occupy same index (now former 2) → min(1, 1)=1
    expect(remapHeroIndexAfterMediaRemove(1, 1, 2)).toBe(1);
    // Active 2 of 3, remove 2 → previous (1)
    expect(remapHeroIndexAfterMediaRemove(2, 2, 2)).toBe(1);
  });

  it("C/K: removeMediaOrderItemByClientId removes exact id; keeps order", () => {
    const a = buildLocalDraftImageUrl("a");
    const b = buildLocalDraftImageUrl("b");
    const order = [
      imageOrderItem(a, "a"),
      videoOrderItem("v1"),
      imageOrderItem(b, "b"),
    ];
    const next = removeMediaOrderItemByClientId(order, "a");
    expect(next.map((i) => i.clientId)).toEqual(["v1", "b"]);
    const next2 = removeMediaOrderItemByClientId(order, "b");
    expect(next2.map((i) => i.clientId)).toEqual(["a", "v1"]);
  });

  it("no-dnd marker constant + target helper exported for strip/video", () => {
    expect(FINALIZE_MEDIA_NO_DND_ATTR).toBe("data-finalize-media-no-dnd");
    expect(isFinalizeMediaRemoveTarget(null)).toBe(false);
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).toContain(FINALIZE_MEDIA_NO_DND_ATTR);
  });

  it("strip removes by clientId; shared FinalizeMediaRemoveButton owns gesture", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("removeSlot0MediaByClientId");
    expect(strip).toContain("FinalizeMediaRemoveButton");
    expect(strip).toContain("isFinalizeMediaRemoveTarget");
    expect(strip).not.toContain("removeSlot0MediaAt(");

    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).toContain("FinalizeMediaRemoveButton");
    expect(tile).toContain("claimFinalizeMediaRemovePointerDown");
    expect(tile).toContain("data-finalize-media-no-dnd");
    expect(tile).toContain("beginFinalizeMediaRemoveOnce");
  });

  it("G/H: drag handle + select path still present", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("FinalizeMediaDragHandle");
    expect(strip).toContain("onSelectPreviewIndex(mediaIndex)");
    expect(strip).toContain("reorderMediaOrderByClientIds");
  });

  it("I/L: local cleanup + video remove still wired once", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("cleanupDraftImageAsset");
    expect(strip).toContain("removeDraftImageFromDraftMeta");
    expect(strip).toContain("removePostVideo");
    expect(strip).toContain("removingClientIdsRef");
  });

  it("O: no global touchmove / body scroll locks introduced", () => {
    const gesture = read("src/lib/createFinalizeMediaRemoveGesture.ts");
    expect(gesture).not.toContain("touchmove");
    expect(gesture).not.toContain("document.body");
    expect(gesture).not.toContain("overflow");
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).not.toContain("touchmove");
  });

  it("Q: LI1C publish file unchanged by this pass (still present)", () => {
    expect(
      existsSync(
        join(process.cwd(), "src/lib/createDraftImage/publishDraftImages.ts"),
      ),
    ).toBe(true);
    const pub = read("src/lib/createDraftImage/publishDraftImages.ts");
    expect(pub).toContain("mapActivityImagesToRemotePaths");
  });
});
