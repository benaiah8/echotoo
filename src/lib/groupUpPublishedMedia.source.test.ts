import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Groups published-media plumbing (source)", () => {
  it("14: GroupUpDeckCard does not fetch media", () => {
    const card = read("pages/people/GroupUpDeckCard.tsx");
    expect(card).not.toContain("getOrFetchPublishedMedia");
    expect(card).not.toContain("getPublishedPostMedia");
    expect(card).not.toContain("publishedMedia");
  });

  it("hook owns enrichment via shared many helper", () => {
    const hook = read("hooks/useGroupUpCandidates.ts");
    expect(hook).toContain("ensureGroupUpPublishedMediaMap");
    expect(hook).toContain("publishedMediaByPostId");
    expect(hook).not.toContain("getOrFetchPublishedMedia(");
  });

  it("does not introduce a second media cache", () => {
    const bridge = read("lib/groupUpPublishedMedia.ts");
    expect(bridge).not.toContain("groupMediaCache");
    expect(bridge).toContain("getOrFetchPublishedMediaMany");
    expect(bridge).toContain("getPublishedMediaCache");
  });
});
