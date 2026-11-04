import { describe, expect, it } from "vitest";
import {
  DISCOVER_PHOTO_SWIPE_COMMIT_PX,
  discoverPhotoSwipeNeighborIndices,
  discoverPhotoSwipeTrackTranslatePx,
  resolveDiscoverPhotoSwipeAxis,
  resolveDiscoverPhotoSwipeNextIndex,
  resolveDiscoverPhotoSwipeSnap,
} from "./discoverPhotoSwipeGesture";

describe("discoverPhotoSwipeGesture", () => {
  it("locks horizontal vs vertical after the axis threshold", () => {
    expect(resolveDiscoverPhotoSwipeAxis(4, 3)).toBe("undecided");
    expect(resolveDiscoverPhotoSwipeAxis(20, 4)).toBe("horizontal");
    expect(resolveDiscoverPhotoSwipeAxis(4, 20)).toBe("vertical");
  });

  it("builds wrapped prev/current/next neighbors without blank ends", () => {
    expect(discoverPhotoSwipeNeighborIndices(0, 3)).toEqual({
      prev: 2,
      current: 0,
      next: 1,
    });
    expect(discoverPhotoSwipeNeighborIndices(2, 3)).toEqual({
      prev: 1,
      current: 2,
      next: 0,
    });
    expect(discoverPhotoSwipeNeighborIndices(0, 2)).toEqual({
      prev: 1,
      current: 0,
      next: 1,
    });
  });

  it("centers the current slot and applies finger drag to the track translate", () => {
    expect(
      discoverPhotoSwipeTrackTranslatePx({ slotWidthPx: 100, dragPx: 0 })
    ).toBe(-100);
    expect(
      discoverPhotoSwipeTrackTranslatePx({ slotWidthPx: 100, dragPx: -40 })
    ).toBe(-140);
    expect(
      discoverPhotoSwipeTrackTranslatePx({ slotWidthPx: 100, dragPx: 40 })
    ).toBe(-60);
  });

  it("snaps next/prev on sufficient horizontal drag; short and vertical stay", () => {
    // Threshold is max(commitPx, ceil(28% of width)) → 56px for width 200.
    expect(
      resolveDiscoverPhotoSwipeSnap({
        dragPx: -56,
        dy: 2,
        axis: "horizontal",
        slotWidthPx: 200,
      })
    ).toBe("next");
    expect(
      resolveDiscoverPhotoSwipeSnap({
        dragPx: 56,
        dy: 2,
        axis: "horizontal",
        slotWidthPx: 200,
      })
    ).toBe("prev");
    expect(
      resolveDiscoverPhotoSwipeSnap({
        dragPx: -DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        dy: 2,
        axis: "horizontal",
        slotWidthPx: 200,
      })
    ).toBe("stay");
    expect(
      resolveDiscoverPhotoSwipeSnap({
        dragPx: -80,
        dy: 90,
        axis: "horizontal",
        slotWidthPx: 200,
      })
    ).toBe("stay");
    expect(
      resolveDiscoverPhotoSwipeSnap({
        dragPx: -80,
        dy: 2,
        axis: "vertical",
        slotWidthPx: 200,
      })
    ).toBe("stay");
  });

  it("swipe left advances; swipe right goes previous; wraps", () => {
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: -DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        dy: 2,
        axis: "horizontal",
        photoCount: 3,
        currentIndex: 0,
      })
    ).toBe(1);
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        dy: 2,
        axis: "horizontal",
        photoCount: 3,
        currentIndex: 0,
      })
    ).toBe(2);
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: -DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        dy: 2,
        axis: "horizontal",
        photoCount: 3,
        currentIndex: 2,
      })
    ).toBe(0);
  });

  it("rejects vertical, diagonal, short, and single-photo gestures", () => {
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: 2,
        dy: -DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        axis: "vertical",
        photoCount: 3,
        currentIndex: 0,
      })
    ).toBeNull();
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: -DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        dy: DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        axis: "horizontal",
        photoCount: 3,
        currentIndex: 0,
      })
    ).toBeNull();
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: -20,
        dy: 2,
        axis: "horizontal",
        photoCount: 3,
        currentIndex: 0,
      })
    ).toBeNull();
    expect(
      resolveDiscoverPhotoSwipeNextIndex({
        dx: -DISCOVER_PHOTO_SWIPE_COMMIT_PX,
        dy: 2,
        axis: "horizontal",
        photoCount: 1,
        currentIndex: 0,
      })
    ).toBeNull();
  });
});
