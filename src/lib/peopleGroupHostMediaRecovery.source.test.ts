/**
 * Groups host-slot width + batch image recovery (source).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Groups host notch slot + media recovery (source)", () => {
  it("1–2: host slot spans inset card width and centers pill", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("inset-x-3 top-3");
    expect(media).toContain("flex justify-center");
    expect(media).toContain("data-people-group-host-slot");
    expect(media).not.toContain("left-1/2 top-3 z-[2] -translate-x-1/2");
  });

  it("3–5: pill uses slot-relative max-width; no flex-1 collapse", () => {
    const notch = read("components/people/PeopleGroupHostNotch.tsx");
    expect(notch).toContain("w-max");
    expect(notch).toContain("max-w-[min(100%,18rem)]");
    expect(notch).not.toContain("flex-1");
    expect(notch).toContain("AVATAR_PX = 28");
    expect(notch).toContain("data-people-group-host-hit");
  });

  it("6: profile-open wiring unchanged", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("createGroupHostProfileOpenContext");
    expect(overlay).toContain("openGroupHostProfile");
  });

  it("7: batch fetch uses posts.media_order + activities; no posts.first_image_url", () => {
    const batch = read(
      "lib/publishedMedia/getPublishedPostMediaForDetail.ts",
    );
    expect(batch).toContain('.select("id, media_order")');
    expect(batch).not.toContain('.select("id, media_order, first_image_url")');
    expect(batch).toContain('from("post_media")');
    expect(batch).toContain('from("activities")');
    expect(batch).toContain("resolvePublishedPostImageUrls");
    expect(batch).toContain("imageUrls");
    expect(batch).toContain("first_image_url: null");
  });

  it("8–12: seed uses detail.imageUrls; stale empty miss; loader rev", () => {
    const cache = read("lib/publishedMedia/publishedMediaCache.ts");
    expect(cache).toContain("PUBLISHED_MEDIA_DETAIL_IMAGE_LOADER_REV");
    expect(cache).toContain("isStaleEmptyDetailImageSeed");
    expect(cache).toContain("detail.imageUrls");
    expect(cache).toContain("detailImageLoaderRev");
  });

  it("13–14: Groups still use many-fetch; no per-card query", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("publishedMediaByPostId");
    expect(body).not.toContain("getOrFetchPublishedMedia(");
    expect(body).not.toContain("GroupMediaDebug");
  });

  it("16: GroupMediaDebug removed", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).not.toContain("[GroupMediaDebug]");
    expect(body).not.toContain("console.info(\"[GroupMediaDebug]\"");
  });

  it("single-media card tap opens source post; multi keeps cycle", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("onOpenSourcePost");
    expect(media).toContain("count > 1");
    expect(media).toContain("data-people-group-host-notch");
  });

  it("Join styling / New|Yours browse / Duo untouched", () => {
    const copy = read("pages/people/peopleUiCopy.ts");
    expect(copy).toMatch(/groupUpShellRequest:\s*"Join"/);
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("groupUpRowMatchesBrowseTab");
    const duo = read("pages/people/PeopleDuoCandidateSlide.tsx");
    expect(duo).not.toContain("PeopleGroupHostNotch");
  });
});
