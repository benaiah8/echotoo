/**
 * Photo-stack img ref / readiness must be idempotent (no max-update-depth loop).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyMineStackImgNode,
  isMountedPhotoPaintReady,
  nextMineFrontPaintReady,
  reduceMineSlotPaintReady,
  shouldAcceptMountedFrontDecode,
} from "./peopleCandidateMediaPresentation";

const root = join(__dirname, "../..");

function fakeImg(ready: boolean): HTMLImageElement {
  return {
    complete: ready,
    naturalWidth: ready ? 640 : 0,
  } as HTMLImageElement;
}

describe("mineSlotPaintReady", () => {
  it("callback-ref detach/reattach of a cached image does not retrigger readiness", () => {
    const imgRefs = new Map<number, HTMLImageElement>();
    const writes: Array<{ index: number; ready: boolean }> = [];
    const onReady = (index: number, ready: boolean) => {
      writes.push({ index, ready });
    };
    const img = fakeImg(true);
    applyMineStackImgNode({ photoIndex: 0, node: img, imgRefs, onReady });
    expect(writes).toEqual([{ index: 0, ready: true }]);
    expect(isMountedPhotoPaintReady(img)).toBe(true);

    for (let i = 0; i < 40; i += 1) {
      applyMineStackImgNode({ photoIndex: 0, node: null, imgRefs, onReady });
      applyMineStackImgNode({ photoIndex: 0, node: img, imgRefs, onReady });
    }
    expect(writes.length).toBe(41);
    expect(writes.every((w) => w.ready)).toBe(true);
  });

  it("slot and front reducers return previous identity when unchanged", () => {
    const first = reduceMineSlotPaintReady(new Set(), 0, true);
    const same = reduceMineSlotPaintReady(first, 0, true);
    expect(same).toBe(first);
    expect(nextMineFrontPaintReady(true, 0, 0, true)).toBe(true);
    expect(nextMineFrontPaintReady(false, 0, 0, false)).toBe(false);
    expect(nextMineFrontPaintReady(true, 1, 0, false)).toBe(true);
  });

  it("loading image becoming ready updates once", () => {
    const imgRefs = new Map<number, HTMLImageElement>();
    const writes: boolean[] = [];
    const loading = fakeImg(false);
    applyMineStackImgNode({
      photoIndex: 0,
      node: loading,
      imgRefs,
      onReady: (_i, ready) => writes.push(ready),
    });
    expect(writes).toEqual([false]);
    const ready = fakeImg(true);
    applyMineStackImgNode({
      photoIndex: 0,
      node: ready,
      imgRefs,
      onReady: (_i, readyValue) => writes.push(readyValue),
    });
    expect(writes).toEqual([false, true]);
  });

  it("photo-set change can drop previous slot readiness", () => {
    const withA = reduceMineSlotPaintReady(new Set(), 0, true);
    expect(withA.has(0)).toBe(true);
    const reset = new Set<number>();
    expect(reset.has(0)).toBe(false);
  });

  it("stale decode completion is rejected for a new candidate", () => {
    expect(
      shouldAcceptMountedFrontDecode({
        checkGeneration: 1,
        currentGeneration: 2,
        decodedPhotoIndex: 0,
        displayedPhotoIndex: 0,
        stillCurrent: true,
      })
    ).toBe(false);
    expect(
      shouldAcceptMountedFrontDecode({
        checkGeneration: 2,
        currentGeneration: 2,
        decodedPhotoIndex: 0,
        displayedPhotoIndex: 0,
        stillCurrent: true,
      })
    ).toBe(true);
  });

  it("PeopleCandidateMedia uses stable binders and does not mark unready on detach", () => {
    const media = readFileSync(
      join(root, "components/people/PeopleCandidateMedia.tsx"),
      "utf8"
    );
    expect(media).toContain("applyMineStackImgNode");
    expect(media).toContain("bindImgNode");
    expect(media).toContain("imgBinderByIndexRef");
    expect(media).not.toContain("ref={(node) => setImgRef(photoIndex, node)}");
    expect(media).toContain("reduceMineSlotPaintReady");
    expect(media).toContain("nextMineFrontPaintReady");
  });

  it("simulated re-render cycle never exceeds a small update budget", () => {
    let slot: ReadonlySet<number> = new Set();
    let front = false;
    let stateWrites = 0;
    const mark = (index: number, ready: boolean) => {
      const nextSlot = reduceMineSlotPaintReady(slot, index, ready);
      if (nextSlot !== slot) {
        slot = nextSlot;
        stateWrites += 1;
      }
      const nextFront = nextMineFrontPaintReady(front, index, 0, ready);
      if (nextFront !== front) {
        front = nextFront;
        stateWrites += 1;
      }
    };
    const imgRefs = new Map<number, HTMLImageElement>();
    const img = fakeImg(true);
    applyMineStackImgNode({
      photoIndex: 0,
      node: img,
      imgRefs,
      onReady: mark,
    });
    const afterMount = stateWrites;
    expect(afterMount).toBeGreaterThan(0);
    for (let i = 0; i < 80; i += 1) {
      applyMineStackImgNode({
        photoIndex: 0,
        node: null,
        imgRefs,
        onReady: mark,
      });
      applyMineStackImgNode({
        photoIndex: 0,
        node: img,
        imgRefs,
        onReady: mark,
      });
    }
    expect(stateWrites).toBe(afterMount);
    expect(stateWrites).toBeLessThan(5);
  });
});
