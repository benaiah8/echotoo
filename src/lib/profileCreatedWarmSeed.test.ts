import { describe, expect, it, beforeEach } from "vitest";
import type { FeedItem } from "../api/queries/getPublicFeed";
import { dataCache } from "./dataCache";
import {
  clearPersistedProfilePosts,
} from "./profilePostListCache";
import {
  filterProfileCreatedWarmItems,
  guardProfileCreatedCacheWrite,
  noteProfileCreatedExclusion,
  readProfileCreatedWarmInitialItems,
} from "./profileCreatedWarmSeed";

function item(id: string, authorId = "author-a"): FeedItem {
  return {
    id,
    author_id: authorId,
    caption: id,
    created_at: "2026-01-01T00:00:00.000Z",
    type: "post",
  } as unknown as FeedItem;
}

describe("profileCreatedWarmSeed", () => {
  const userId = "user-created-warm";
  const cacheKey = `profile_created_${userId}`;

  beforeEach(() => {
    dataCache.delete(cacheKey);
    clearPersistedProfilePosts("created", userId);
  });

  it("filters excluded posts from warm snapshots", () => {
    const rows = [item("p1"), item("p2"), item("p3")];
    const exclude = new Set(["p2"]);
    expect(filterProfileCreatedWarmItems(rows, exclude)?.map((r) => r.id)).toEqual([
      "p1",
      "p3",
    ]);
    expect(filterProfileCreatedWarmItems(rows, new Set(["p1", "p2", "p3"]))).toBeUndefined();
  });

  it("guards cache writes so stale bootstrap cannot restore excluded posts", () => {
    const exclude = new Set<string>();
    noteProfileCreatedExclusion(exclude, "owned-away");
    const written = guardProfileCreatedCacheWrite(
      [item("owned-away"), item("kept")],
      exclude
    );
    expect(written.map((r) => r.id)).toEqual(["kept"]);
  });

  it("ownership invalidation: fresh cache read after epoch-style re-read omits transferred post", () => {
    dataCache.set(cacheKey, [item("transfer-me"), item("stay")], 60_000);
    const exclude = new Set<string>();

    // Stale warm seed as it existed before transfer.
    const staleWarm = readProfileCreatedWarmInitialItems({
      dataCacheKey: cacheKey,
      userId,
      excludePostIds: exclude,
    });
    expect(staleWarm?.map((r) => r.id)).toEqual(["transfer-me", "stay"]);

    // Admin invalidation + local remove (same order as transfer handlers).
    dataCache.delete(cacheKey);
    clearPersistedProfilePosts("created", userId);
    noteProfileCreatedExclusion(exclude, "transfer-me");
    // Remount epoch would bump here; warm seed must re-read (not reuse staleWarm).
    const remountWarm = readProfileCreatedWarmInitialItems({
      dataCacheKey: cacheKey,
      userId,
      excludePostIds: exclude,
    });
    expect(remountWarm).toBeUndefined();

    // Even if ProgressiveFeed tried to write the stale snapshot back:
    const guarded = guardProfileCreatedCacheWrite(staleWarm!, exclude);
    expect(guarded.map((r) => r.id)).toEqual(["stay"]);
    dataCache.set(cacheKey, guarded, 60_000);
    expect(
      readProfileCreatedWarmInitialItems({
        dataCacheKey: cacheKey,
        userId,
        excludePostIds: exclude,
      })?.map((r) => r.id)
    ).toEqual(["stay"]);
  });

  it("delete: excluded post cannot return from Created warm seed / cache write", () => {
    const rows = [item("delete-me"), item("keep-me")];
    dataCache.set(cacheKey, rows, 60_000);

    const exclude = new Set<string>();
    noteProfileCreatedExclusion(exclude, "delete-me");
    dataCache.delete(cacheKey);
    clearPersistedProfilePosts("created", userId);

    expect(
      readProfileCreatedWarmInitialItems({
        dataCacheKey: cacheKey,
        userId,
        excludePostIds: exclude,
      })
    ).toBeUndefined();

    // Stale in-memory snapshot from before delete cannot re-enter cache.
    const guarded = guardProfileCreatedCacheWrite(rows, exclude);
    expect(guarded.map((r) => r.id)).toEqual(["keep-me"]);
  });

  it("re-reads memory cache after invalidation (warm seed freshness)", () => {
    dataCache.set(cacheKey, [item("a"), item("b")], 60_000);
    expect(
      readProfileCreatedWarmInitialItems({
        dataCacheKey: cacheKey,
        userId,
      })?.map((r) => r.id)
    ).toEqual(["a", "b"]);

    dataCache.delete(cacheKey);
    expect(
      readProfileCreatedWarmInitialItems({
        dataCacheKey: cacheKey,
        userId,
      })
    ).toBeUndefined();

    dataCache.set(cacheKey, [item("fresh")], 60_000);
    expect(
      readProfileCreatedWarmInitialItems({
        dataCacheKey: cacheKey,
        userId,
      })?.map((r) => r.id)
    ).toEqual(["fresh"]);
  });
});
