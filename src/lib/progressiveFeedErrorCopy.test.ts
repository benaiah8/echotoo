import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyProgressiveFeedError,
  getProgressiveFeedErrorCopy,
  shouldSurfaceFeedLoadError,
} from "./progressiveFeedErrorCopy";

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

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

describe("Home empty-feed classification", () => {
  it("does not reuse the full posts card for an empty events rail", () => {
    const posts = getProgressiveFeedErrorCopy({
      hasItems: false,
      surface: "home",
      error: new Error("boom"),
    });
    const events = getProgressiveFeedErrorCopy({
      hasItems: false,
      surface: "events",
      error: new Error("boom"),
    });
    expect(posts).toEqual({
      title: "We couldn't load posts right now",
      body: "Please try again.",
    });
    expect(events).toEqual({
      title: "Couldn't load events",
      body: "Try again.",
    });
    expect(posts.title).not.toBe(events.title);
  });

  it("uses offline copy when the browser is offline", () => {
    expect(
      getProgressiveFeedErrorCopy({
        hasItems: false,
        surface: "home",
        isOffline: true,
        error: new TypeError("Failed to fetch"),
      }),
    ).toEqual({
      title: "You're offline",
      body: "Reconnect and try again.",
    });
  });

  it("uses connect copy for a genuine network failure", () => {
    expect(
      getProgressiveFeedErrorCopy({
        hasItems: false,
        surface: "home",
        isOffline: false,
        error: new TypeError("Failed to fetch"),
      }),
    ).toEqual({
      title: "We couldn't connect",
      body: "Check your connection and try again.",
    });
  });

  it("does not blame the connection for auth, server, or generic failures", () => {
    const auth = getProgressiveFeedErrorCopy({
      hasItems: false,
      surface: "home",
      error: { status: 401, code: "PGRST301", message: "JWT expired" },
    });
    const server = getProgressiveFeedErrorCopy({
      hasItems: false,
      surface: "home",
      error: { status: 500, message: "Internal Server Error" },
    });
    const generic = getProgressiveFeedErrorCopy({
      hasItems: false,
      surface: "home",
      error: new TypeError("Cannot read properties of undefined (reading 'id')"),
    });
    for (const copy of [auth, server, generic]) {
      expect(copy.body).not.toContain("Check your connection");
      expect(`${copy.title} ${copy.body}`).not.toMatch(
        /401|403|JWT|RPC|Supabase|PostgREST/i,
      );
    }
    expect(auth.body).toBe("Please try again.");
    expect(server.body).toBe("Please try again in a moment.");
    expect(generic.body).toBe("Please try again.");
    expect(classifyProgressiveFeedError({ status: 403, code: "42501" })).toBe(
      "auth",
    );
    expect(classifyProgressiveFeedError({ status: 503 })).toBe("server");
    expect(
      classifyProgressiveFeedError(
        new TypeError("Cannot read properties of undefined"),
      ),
    ).toBe("generic");
  });

  it("keeps saved posts and the refresh banner when items already exist", () => {
    expect(
      getProgressiveFeedErrorCopy({
        hasItems: true,
        surface: "home",
        error: { status: 500 },
      }),
    ).toEqual({
      title: "Couldn't refresh posts",
      body: "You're seeing saved posts. Check your connection and try again.",
    });
  });
});

describe("intentional abort ownership", () => {
  it("does not surface a superseded or cancelled abort", () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    expect(
      shouldSurfaceFeedLoadError(abortError, {
        superseded: true,
        cancelled: false,
      }),
    ).toBe(false);
    expect(
      shouldSurfaceFeedLoadError(new Error("Aborted"), {
        superseded: false,
        cancelled: true,
      }),
    ).toBe(false);
    expect(
      shouldSurfaceFeedLoadError(new Error("Request aborted"), {
        superseded: true,
        cancelled: true,
      }),
    ).toBe(false);
  });

  it("still surfaces a timeout and an abort that still owns the surface", () => {
    expect(
      shouldSurfaceFeedLoadError(new DOMException("timed out", "TimeoutError"), {
        superseded: true,
        cancelled: true,
      }),
    ).toBe(true);
    expect(
      shouldSurfaceFeedLoadError(new Error("Aborted"), {
        superseded: false,
        cancelled: false,
      }),
    ).toBe(true);
  });
});

describe("ProgressiveFeed error UI wiring", () => {
  it("uses getProgressiveFeedErrorCopy and keeps retry as setError + loadMore", () => {
    const src = readSrc("src/components/ProgressiveFeed.tsx");
    expect(src).toContain("getProgressiveFeedErrorCopy");
    expect(src).toContain("isBrowserOffline");
    expect(src).toContain('errorPresentation === "home" ? "home" : "default"');
    expect(src).toContain("shouldSurfaceFeedLoadError");
    expect(src).toMatch(
      /onRetry=\{\(\) => \{\s*setError\(null\);\s*loadMore\(\);/,
    );
    expect(src).toContain("if (attempt < 3)");
    expect(src).toContain("itemsRef.current.length > 0");
  });

  it("keeps the events rail compact and off the posts failure card", () => {
    const rail = readSrc("src/components/ProgressiveHorizontalRail.tsx");
    const homePosts = readSrc("src/sections/home/HomePostsSection.tsx");
    expect(rail).toContain('surface: "events"');
    expect(rail).toContain("compact");
    expect(rail).toContain("shouldSurfaceFeedLoadError");
    expect(rail).toMatch(
      /onRetry=\{\(\) => \{\s*setError\(null\);\s*shouldLoadRef\.current = true;\s*loadMore\(\);/,
    );
    expect(rail).not.toContain("We couldn't load posts right now");
    expect(homePosts).toContain('errorPresentation="home"');
  });

  it("does not change FeedLoadErrorState defaults", () => {
    const src = readSrc("src/components/ui/FeedLoadErrorState.tsx");
    expect(src).toContain(
      'title = "We couldn\'t load posts right now"',
    );
    expect(src).toContain(
      'body = "Check your connection and try again."',
    );
  });

  it("leaves profile, post detail, and network ownership unchanged", () => {
    const ownProfile = readSrc("src/sections/profile/OwnProfilePostsSection.tsx");
    const otherProfile = readSrc(
      "src/sections/profile/OtherProfilePostsSection.tsx",
    );
    const postDetail = readSrc("src/components/PostDetailModal.tsx");
    const requestManager = readSrc("src/lib/requestManager.ts");
    const publicFeed = readSrc("src/api/queries/getPublicFeed.ts");
    expect(ownProfile).not.toContain('errorPresentation="home"');
    expect(otherProfile).not.toContain('errorPresentation="home"');
    expect(postDetail).toContain('title="We couldn\'t load this post"');
    expect(postDetail).toContain(
      'body="Check your connection and try again."',
    );
    expect(requestManager).not.toContain("classifyProgressiveFeedError");
    expect(requestManager).not.toContain("getProgressiveFeedErrorCopy");
    expect(publicFeed).not.toContain("getProgressiveFeedErrorCopy");
    expect(publicFeed).not.toContain("@capacitor/network");
  });
});
