import { describe, expect, it } from "vitest";
import {
  PROFILE_OVERVIEW_IDENTITY_CLASS,
  PROFILE_OVERVIEW_NAME_CLASS,
  PROFILE_OVERVIEW_OTHER_POSTS_FEED_CLASS,
  PROFILE_OVERVIEW_OTHER_STATS_ROW_CLASS,
  PROFILE_OVERVIEW_POSTS_FEED_CLASS,
  PROFILE_OVERVIEW_USERNAME_CLASS,
  hasProfileOverviewBio,
} from "./profileOverviewPresentation";

describe("hasProfileOverviewBio", () => {
  it("hides empty and whitespace-only bios", () => {
    expect(hasProfileOverviewBio(null)).toBe(false);
    expect(hasProfileOverviewBio("")).toBe(false);
    expect(hasProfileOverviewBio("   ")).toBe(false);
  });

  it("shows a real bio", () => {
    expect(hasProfileOverviewBio("Hello")).toBe(true);
  });
});

describe("profile overview identity classes", () => {
  it("keeps the identity row wrapping without overflow", () => {
    expect(PROFILE_OVERVIEW_IDENTITY_CLASS).toContain("flex-wrap");
    expect(PROFILE_OVERVIEW_IDENTITY_CLASS).toContain("min-w-0");
    expect(PROFILE_OVERVIEW_NAME_CLASS).toContain("truncate");
    expect(PROFILE_OVERVIEW_USERNAME_CLASS).toContain("truncate");
  });
});

describe("Other Profile social stats row", () => {
  it("uses a dedicated other-stats class so Own Profile squares stay unchanged", () => {
    expect(PROFILE_OVERVIEW_OTHER_STATS_ROW_CLASS).toContain(
      "profile-overview-other-stats",
    );
    expect(PROFILE_OVERVIEW_OTHER_STATS_ROW_CLASS).not.toContain(
      "profile-overview-stats ",
    );
  });
});

const FIRST_FEED_ITEM_ARTICLE_BORDER =
  "[&_.feed-item-container>.feed-item:first-child_article]:border-t-0";

describe("profile post list divider classes", () => {
  it("suppresses only the first ProgressiveFeed Post card border", () => {
    expect(PROFILE_OVERVIEW_POSTS_FEED_CLASS).toContain(
      FIRST_FEED_ITEM_ARTICLE_BORDER,
    );
    expect(PROFILE_OVERVIEW_OTHER_POSTS_FEED_CLASS).toContain(
      FIRST_FEED_ITEM_ARTICLE_BORDER,
    );
    expect(PROFILE_OVERVIEW_POSTS_FEED_CLASS).not.toContain(
      "[&_article:first-child]:border-t-0",
    );
    expect(PROFILE_OVERVIEW_OTHER_POSTS_FEED_CLASS).not.toContain(
      "[&_article:first-child]:border-t-0",
    );
  });
});
