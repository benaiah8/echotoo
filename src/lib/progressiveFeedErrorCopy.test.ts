import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getProgressiveFeedErrorCopy,
} from "./progressiveFeedErrorCopy";

describe("getProgressiveFeedErrorCopy", () => {
  it("empty feed error uses existing hard-fail copy", () => {
    expect(getProgressiveFeedErrorCopy({ hasItems: false })).toEqual({
      title: "We couldn't load posts right now",
      body: "Check your connection and try again.",
    });
  });

  it("feed with items + error uses refresh/saved-posts copy", () => {
    expect(getProgressiveFeedErrorCopy({ hasItems: true })).toEqual({
      title: "Couldn't refresh posts",
      body: "You're seeing saved posts. Check your connection and try again.",
    });
  });

  it("offline + items uses offline saved-posts copy", () => {
    expect(
      getProgressiveFeedErrorCopy({ hasItems: true, isOffline: true }),
    ).toEqual({
      title: "You're offline",
      body: "Showing saved posts. Check your connection when you're back online.",
    });
  });

  it("offline is ignored when there are no items", () => {
    expect(
      getProgressiveFeedErrorCopy({ hasItems: false, isOffline: true }),
    ).toEqual({
      title: "We couldn't load posts right now",
      body: "Check your connection and try again.",
    });
  });
});

describe("ProgressiveFeed error UI wiring", () => {
  it("uses getProgressiveFeedErrorCopy and keeps retry as setError + loadMore", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/ProgressiveFeed.tsx"),
      "utf8",
    );
    expect(src).toContain("getProgressiveFeedErrorCopy");
    expect(src).toContain("isBrowserOffline");
    expect(src).toMatch(
      /onRetry=\{\(\) => \{\s*setError\(null\);\s*loadMore\(\);/,
    );
  });

  it("does not change FeedLoadErrorState defaults", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/ui/FeedLoadErrorState.tsx"),
      "utf8",
    );
    expect(src).toContain(
      'title = "We couldn\'t load posts right now"',
    );
    expect(src).toContain(
      'body = "Check your connection and try again."',
    );
  });
});
