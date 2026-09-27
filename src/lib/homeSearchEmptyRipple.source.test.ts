import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Home search empty + users ripple wiring", () => {
  it("reports settled posts-search empty only from the search HomePostsSection", () => {
    const page = read("src/pages/HomePage.tsx");
    expect(page).toContain(
      "onSearchPostsEmptyActiveChange={handleSearchPostsEmptyActiveChange}"
    );
    expect(page).toContain("hintUsersSearch={hintUsersSearch}");
    expect(page).toContain("searchQuery={search}");
    // Exactly one empty-reporter wiring (search feed), not browse.
    expect(page.match(/onSearchPostsEmptyActiveChange=/g)?.length).toBe(1);
    expect(page.match(/searchQuery=\{search\}/g)?.length).toBe(1);
  });

  it("ripples the existing Search users dock control once", () => {
    const dock = read("src/components/home/HomeSearchDock.tsx");
    expect(dock).toContain("hintUsersSearch");
    expect(dock).toContain("home-search-users-hint");
    expect(dock).toContain("Search users");
    expect(dock).not.toContain("Search for people");
    expect(dock).toContain("pointer-events-none");
  });

  it("uses ProgressiveFeed emptySurface mount as the empty signal (no extra RPC)", () => {
    const section = read("src/sections/home/HomePostsSection.tsx");
    expect(section).toContain("HomeSearchPostsEmptyReporter");
    expect(section).toContain("getHomeSearchPostsEmptyHeading");
    expect(section).toContain("searchActive: searchQueryActive");
    expect(section).not.toContain("listMyConversations");
  });

  it("defines reduced-motion static hint CSS", () => {
    const css = read("src/index.css");
    expect(css).toContain("home-search-users-pulse");
    expect(css).toContain("home-search-users-ripple");
    expect(css).toContain(
      ".home-search-users-hint.home-search-users-hint--play"
    );
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*home-search-users-hint/
    );
  });
});
