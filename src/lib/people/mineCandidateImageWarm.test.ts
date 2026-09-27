import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMineFrontImageWarmState,
  duoStackFrontLoadingAttrs,
  getMineFrontImageWarmInFlightCount,
  getMineFrontImageWarmPendingCount,
  getMineFrontImageWarmPendingUrls,
  isMineFrontImageWarmDone,
  matchDeckPhotoMountRadius,
  MINE_IMAGE_WARM_AHEAD,
  MINE_IMAGE_WARM_BEHIND,
  MINE_IMAGE_WARM_CONCURRENCY,
  MINE_PHOTO_MOUNT_RADIUS,
  MATCH_DECK_DEFAULT_PHOTO_RADIUS,
  mineImageWarmOffsets,
  mineStackImageLoadingAttrs,
  warmMineFrontImage,
  warmMineFrontImages,
} from "./mineCandidateImageWarm";

vi.mock("../imageOptimization", () => ({
  preloadImage: vi.fn((src: string) => {
    if (src.includes("fail")) return Promise.reject(new Error("load failed"));
    if (src.includes("slow")) {
      return new Promise<void>(() => {
        /* never settles — holds concurrency slot */
      });
    }
    return Promise.resolve();
  }),
}));

import { preloadImage } from "../imageOptimization";

afterEach(() => {
  clearMineFrontImageWarmState();
  vi.mocked(preloadImage).mockClear();
});

describe("matchDeckPhotoMountRadius", () => {
  it("keeps Mine mount at ±2 (warm window is separate)", () => {
    expect(matchDeckPhotoMountRadius(true)).toBe(MINE_PHOTO_MOUNT_RADIUS);
    expect(matchDeckPhotoMountRadius(false)).toBe(
      MATCH_DECK_DEFAULT_PHOTO_RADIUS
    );
    expect(MINE_PHOTO_MOUNT_RADIUS).toBe(2);
    expect(MATCH_DECK_DEFAULT_PHOTO_RADIUS).toBe(1);
  });
});

describe("mineStackImageLoadingAttrs", () => {
  it("marks current front eager/high", () => {
    expect(
      mineStackImageLoadingAttrs({
        isCurrent: true,
        photoIndex: 0,
        displayedIndex: 0,
      })
    ).toEqual({ loading: "eager", fetchPriority: "high" });
  });

  it("marks neighbor front eager/auto (not lazy)", () => {
    expect(
      mineStackImageLoadingAttrs({
        isCurrent: false,
        photoIndex: 1,
        displayedIndex: 1,
      })
    ).toEqual({ loading: "eager", fetchPriority: "auto" });
  });

  it("keeps rear stack photos lazy", () => {
    expect(
      mineStackImageLoadingAttrs({
        isCurrent: true,
        photoIndex: 2,
        displayedIndex: 0,
      })
    ).toEqual({ loading: "lazy", fetchPriority: "auto" });
  });
});

describe("duoStackFrontLoadingAttrs", () => {
  it("preserves Discover current-only eager behavior", () => {
    expect(duoStackFrontLoadingAttrs(true)).toEqual({
      loading: "eager",
      fetchPriority: "high",
    });
    expect(duoStackFrontLoadingAttrs(false)).toEqual({
      loading: "lazy",
      fetchPriority: "auto",
    });
  });
});

describe("mineImageWarmOffsets", () => {
  it("bounds ~10 slots and prefers forward travel", () => {
    expect(MINE_IMAGE_WARM_AHEAD).toBe(7);
    expect(MINE_IMAGE_WARM_BEHIND).toBe(2);
    const offsets = mineImageWarmOffsets("forward");
    expect(offsets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, -1, -2]);
    expect(offsets).toHaveLength(1 + MINE_IMAGE_WARM_AHEAD + MINE_IMAGE_WARM_BEHIND);
    expect(Math.max(...offsets)).toBe(MINE_IMAGE_WARM_AHEAD);
    expect(Math.min(...offsets)).toBe(-MINE_IMAGE_WARM_BEHIND);
  });

  it("prefers behind when traveling backward", () => {
    expect(mineImageWarmOffsets("backward")).toEqual([
      0, -1, -2, -3, -4, -5, -6, -7, 1, 2,
    ]);
  });
});

describe("warmMineFrontImage dedupe", () => {
  it("does not create duplicate preloads for the same URL", async () => {
    await Promise.all([
      warmMineFrontImage("https://example.test/a.jpg"),
      warmMineFrontImage("https://example.test/a.jpg"),
      warmMineFrontImage("https://example.test/a.jpg"),
    ]);
    expect(preloadImage).toHaveBeenCalledTimes(1);
    expect(preloadImage).toHaveBeenCalledWith("https://example.test/a.jpg");

    await warmMineFrontImage("https://example.test/a.jpg");
    expect(preloadImage).toHaveBeenCalledTimes(1);
  });

  it("warms a list and skips empties / duplicates", async () => {
    warmMineFrontImages([
      "https://example.test/b.jpg",
      null,
      "https://example.test/b.jpg",
      "https://example.test/c.jpg",
      undefined,
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(preloadImage).mock.calls.map((c) => c[0]).sort()).toEqual([
      "https://example.test/b.jpg",
      "https://example.test/c.jpg",
    ]);
  });

  it("ignores empty src", async () => {
    await warmMineFrontImage("");
    await warmMineFrontImage(null);
    expect(preloadImage).not.toHaveBeenCalled();
  });

  it("marks successful URLs as done for immediate reuse", async () => {
    expect(isMineFrontImageWarmDone("https://example.test/d.jpg")).toBe(false);
    await warmMineFrontImage("https://example.test/d.jpg");
    expect(isMineFrontImageWarmDone("https://example.test/d.jpg")).toBe(true);
  });

  it("rejects failed preloads without marking done", async () => {
    await expect(
      warmMineFrontImage("https://example.test/fail.jpg")
    ).rejects.toThrow();
    expect(isMineFrontImageWarmDone("https://example.test/fail.jpg")).toBe(
      false
    );
  });
});

describe("bounded concurrency and queue", () => {
  it("limits concurrent new preloads", () => {
    expect(MINE_IMAGE_WARM_CONCURRENCY).toBe(3);
    warmMineFrontImages([
      "https://example.test/slow-0.jpg",
      "https://example.test/slow-1.jpg",
      "https://example.test/slow-2.jpg",
      "https://example.test/slow-3.jpg",
      "https://example.test/slow-4.jpg",
    ]);
    expect(getMineFrontImageWarmInFlightCount()).toBe(3);
    expect(getMineFrontImageWarmPendingCount()).toBe(2);
    expect(preloadImage).toHaveBeenCalledTimes(3);
  });

  it("does not restart in-flight when the window moves", () => {
    warmMineFrontImages([
      "https://example.test/slow-a.jpg",
      "https://example.test/slow-b.jpg",
      "https://example.test/slow-c.jpg",
    ]);
    expect(preloadImage).toHaveBeenCalledTimes(3);
    warmMineFrontImages([
      "https://example.test/slow-a.jpg",
      "https://example.test/slow-b.jpg",
      "https://example.test/slow-c.jpg",
      "https://example.test/slow-d.jpg",
    ]);
    // a/b/c still in flight — not restarted; d queued
    expect(preloadImage).toHaveBeenCalledTimes(3);
    expect(getMineFrontImageWarmPendingCount()).toBe(1);
  });

  it("drops stale pending URLs when the warm window recenters", () => {
    warmMineFrontImages([
      "https://example.test/slow-0.jpg",
      "https://example.test/slow-1.jpg",
      "https://example.test/slow-2.jpg",
      "https://example.test/stale-3.jpg",
      "https://example.test/stale-4.jpg",
    ]);
    expect(getMineFrontImageWarmPendingCount()).toBe(2);
    warmMineFrontImages([
      "https://example.test/slow-0.jpg",
      "https://example.test/slow-1.jpg",
      "https://example.test/slow-2.jpg",
      "https://example.test/new-3.jpg",
    ]);
    expect(getMineFrontImageWarmPendingUrls()).toEqual([
      "https://example.test/new-3.jpg",
    ]);
  });

  it("clearMineFrontImageWarmState empties pending and in-flight tracking", () => {
    warmMineFrontImages([
      "https://example.test/slow-0.jpg",
      "https://example.test/slow-1.jpg",
      "https://example.test/slow-2.jpg",
      "https://example.test/slow-3.jpg",
    ]);
    clearMineFrontImageWarmState();
    expect(getMineFrontImageWarmInFlightCount()).toBe(0);
    expect(getMineFrontImageWarmPendingCount()).toBe(0);
  });
});
