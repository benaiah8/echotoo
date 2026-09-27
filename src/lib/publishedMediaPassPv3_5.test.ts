/**
 * PASS PV3.5 — shared sound-on preference + first-paint geometry + single-image natural size.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetPublishedVideoMutePreferenceForTests,
  buildPublishedMediaItems,
  clearPublishedMediaCache,
  getPublishedMediaCache,
  getPublishedVideoPreferredMuted,
  getPublishedVideoSoundPreference,
  isPublishedSingleImage,
  isPublishedVideoOnly,
  mergePublishedVideoDimensions,
  patchPublishedMediaRow,
  publishedMediaFrameStyle,
  publishedMediaViewerKey,
  seedPublishedMediaFromList,
  setPublishedVideoSoundPreferenceMuted,
} from "./publishedMedia";
import {
  getCreateVideoMutedPreference,
  resetCreateVideoMutedPreference,
  setCreateVideoMutedPreference,
} from "./createFinalizeVideoMutePreference";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV3.5 — shared sound preference", () => {
  beforeEach(() => {
    __resetPublishedVideoMutePreferenceForTests();
    resetCreateVideoMutedPreference();
  });

  it("A: default prefers sound ON", () => {
    const pref = getPublishedVideoSoundPreference();
    expect(pref.muted).toBe(false);
    expect(pref.userHasChosen).toBe(false);
    expect(getPublishedVideoPreferredMuted()).toBe(false);
  });

  it("B/C: mute and unmute persist across remounts (session)", () => {
    setPublishedVideoSoundPreferenceMuted(true);
    expect(getPublishedVideoPreferredMuted()).toBe(true);
    expect(getPublishedVideoSoundPreference().userHasChosen).toBe(true);

    setPublishedVideoSoundPreferenceMuted(false);
    expect(getPublishedVideoPreferredMuted()).toBe(false);
    expect(getPublishedVideoSoundPreference().userHasChosen).toBe(true);
  });

  it("D/E/F: Feed/Profile/Detail/fullscreen share PublishedVideoPlayer preference APIs", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("getPublishedVideoPreferredMuted");
    expect(player).toContain("setPublishedVideoSoundPreferenceMuted");
    expect(player).not.toContain("publishedAutoplayMustMute");
    expect(player).not.toContain("setPublishedVideoSessionUnmuted");

    const surface = read("src/components/PublishedMediaSurface.tsx");
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    const fullscreen = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(surface).toContain("PublishedVideoPlayer");
    expect(carousel).toContain("PublishedVideoPlayer");
    expect(fullscreen).toContain("PublishedVideoPlayer");
  });

  it("G: Create preference remains separate", () => {
    setCreateVideoMutedPreference(true);
    setPublishedVideoSoundPreferenceMuted(false);
    expect(getCreateVideoMutedPreference()).toBe(true);
    expect(getPublishedVideoPreferredMuted()).toBe(false);
    const create = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(create).toContain("getCreateVideoMutedPreference");
    expect(create).not.toContain("getPublishedVideoPreferredMuted");
  });

  it("H/I/J/K: tryPlayIfWanted prefers sound, muted retry once, no preference poison", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("isAutoplaySoundBlockedError");
    expect(player).toContain("NotAllowedError");
    expect(player).toContain("video.muted = preferredMuted");
    expect(player).toContain("video.muted = true");
    expect(player).toContain("Do not retry autoplay in a loop");
    // Muted retry must not call preference setter.
    const tryBlock = player.slice(
      player.indexOf("const tryPlayIfWanted"),
      player.indexOf("const ensureHlsLoaded"),
    );
    expect(tryBlock).not.toContain("setPublishedVideoSoundPreferenceMuted");
    expect(tryBlock).toContain("await video.play()");
    expect((tryBlock.match(/await video\.play\(\)/g) || []).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("L/M: active ownership still exclusive (PV3.1)", () => {
    const coord = read(
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    );
    expect(coord).toContain("At most one ACTIVE");
    expect(coord).toContain("requestPublishedListVideoOwnership");
  });
});

describe("PASS PV3.5 — first-paint geometry", () => {
  beforeEach(() => {
    clearPublishedMediaCache();
  });

  it("N/O/P: sync publish seed before prepend; 1080x1920 is already 9:16", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("seedPublishedMediaFromList({");
    expect(publish).not.toMatch(
      /void import\("\.\/publishedMedia"\)\.then\(\(\{ seedPublishedMediaFromList \}/,
    );
    expect(publish).toContain(
      "// PV3.5: seed publishedMediaCache synchronously BEFORE prepend",
    );

    const finalize = read("src/pages/CreateFinalizePage.tsx");
    expect(finalize).toContain("preparedWidth");
    expect(finalize).toContain("preparedHeight");

    const items = buildPublishedMediaItems({
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "p1",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "processing",
          poster_url: "https://cdn/poster.jpg",
          duration_sec: 8,
          width: 1080,
          height: 1920,
        },
      ],
      imageUrls: [],
    });
    const style = publishedMediaFrameStyle(items, "40vh");
    expect(style.aspectRatio).toBe("1080 / 1920");
    expect(style.height).toBe("auto");
    expect(style.maxHeight).toBeUndefined();
  });

  it("Q: positive dims survive null Feed/Profile reseed", () => {
    const viewer = "user-1";
    seedPublishedMediaFromList({
      postId: "post-1",
      viewerUserId: viewer,
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "post-1",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "processing",
          poster_url: "https://cdn/p.jpg",
          duration_sec: 3,
          width: 1080,
          height: 1920,
        },
      ],
      source: "publish",
    });

    seedPublishedMediaFromList({
      postId: "post-1",
      viewerUserId: viewer,
      mediaOrder: [{ kind: "video", mediaId: "m1" }],
      postMedia: [
        {
          id: "m1",
          post_id: "post-1",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b1",
          video_status: "processing",
          poster_url: "https://cdn/p.jpg",
          duration_sec: 3,
          width: null,
          height: null,
        },
      ],
      source: "profile",
    });

    const entry = getPublishedMediaCache(
      "post-1",
      publishedMediaViewerKey(viewer),
    );
    const video = entry?.items.find((i) => i.kind === "video");
    expect(video && video.kind === "video" ? video.width : null).toBe(1080);
    expect(video && video.kind === "video" ? video.height : null).toBe(1920);
  });

  it("R/S: ready/patch preserves positive geometry", () => {
    const viewer = "user-2";
    seedPublishedMediaFromList({
      postId: "post-2",
      viewerUserId: viewer,
      mediaOrder: [{ kind: "video", mediaId: "m2" }],
      postMedia: [
        {
          id: "m2",
          post_id: "post-2",
          sort_order: 0,
          kind: "video",
          bunny_video_id: "b2",
          video_status: "processing",
          poster_url: "https://cdn/old.jpg",
          duration_sec: 4,
          width: 1920,
          height: 1080,
        },
      ],
      source: "publish",
    });

    patchPublishedMediaRow({
      postId: "post-2",
      viewerKey: publishedMediaViewerKey(viewer),
      row: {
        id: "m2",
        post_id: "post-2",
        sort_order: 0,
        kind: "video",
        bunny_video_id: "b2",
        video_status: "ready",
        poster_url: "https://cdn/bunny-thumb.jpg",
        duration_sec: 4,
        width: null,
        height: null,
      },
    });

    const entry = getPublishedMediaCache(
      "post-2",
      publishedMediaViewerKey(viewer),
    );
    const video = entry?.items[0];
    expect(video?.kind).toBe("video");
    if (video?.kind === "video") {
      expect(video.status).toBe("ready");
      expect(video.posterUrl).toBe("https://cdn/bunny-thumb.jpg");
      expect(video.width).toBe(1920);
      expect(video.height).toBe(1080);
    }

    expect(
      mergePublishedVideoDimensions({
        existingWidth: 1080,
        existingHeight: 1920,
        incomingWidth: 1080,
        incomingHeight: 1920,
      }),
    ).toEqual({ width: 1080, height: 1920 });
  });

  it("Own Profile sync-seeds prepend into publishedMediaCache", () => {
    const own = read("src/sections/profile/OwnProfilePostsSection.tsx");
    expect(own).toContain("buildLocalPrependedFeedItem");
    expect(own).toContain('source: "publish"');
    expect(own).toMatch(
      /buildLocalPrependedFeedItem[\s\S]{0,400}seedPublishedMediaFromFeedItems/,
    );
  });
});

describe("PASS PV3.5 — single image / multi frame", () => {
  it("T–V: single video still uncapped", () => {
    for (const [w, h] of [
      [1080, 1920],
      [1920, 1080],
      [1080, 1080],
    ] as const) {
      const items = buildPublishedMediaItems({
        mediaOrder: [{ kind: "video", mediaId: "v" }],
        postMedia: [
          {
            id: "v",
            post_id: "p",
            sort_order: 0,
            kind: "video",
            bunny_video_id: "b",
            video_status: "ready",
            poster_url: null,
            duration_sec: 1,
            width: w,
            height: h,
          },
        ],
        imageUrls: [],
      });
      const style = publishedMediaFrameStyle(items, "40vh");
      expect(style.maxHeight).toBeUndefined();
      expect(style.height).toBe("auto");
      expect(style.aspectRatio).toBe(`${w} / ${h}`);
    }
  });

  it("W–Z: single image natural height, no fixed cap / crop", () => {
    const items = buildPublishedMediaItems({
      mediaOrder: [{ kind: "image", url: "https://cdn/a.jpg" }],
      postMedia: [],
      imageUrls: ["https://cdn/a.jpg"],
    });
    expect(isPublishedSingleImage(items)).toBe(true);
    expect(isPublishedVideoOnly(items)).toBe(false);
    expect(publishedMediaFrameStyle(items, "40vh")).toEqual({
      width: "100%",
      height: "auto",
    });
    expect(publishedMediaFrameStyle(items, "50vh")).toEqual({
      width: "100%",
      height: "auto",
    });

    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).toContain("isPublishedSingleImage");
    expect(surface).toContain('layout={singleImage ? "natural" : "fill"}');
    expect(surface).toContain('fit={singleImage ? "contain" : "cover"}');
    expect(surface).toContain('data-published-single-image');

    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("isPublishedSingleImage");
    expect(carousel).toContain("naturalHeight");
    expect(carousel).toContain('layout={naturalHeight ? "natural" : "fill"}');
    expect(carousel).toContain('fit={naturalHeight ? "contain" : "cover"}');
  });

  it("AA–AD: multi-media uses canonical shared ratio (not 40vh/50vh identity)", () => {
    const twoImages = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "image", url: "https://cdn/b.jpg" },
      ],
      postMedia: [],
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
    });
    expect(publishedMediaFrameStyle(twoImages, "40vh")).toEqual({
      width: "100%",
      aspectRatio: "1",
      height: "auto",
      minHeight: "12rem",
    });

    const mixed = buildPublishedMediaItems({
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "video", mediaId: "v1" },
      ],
      postMedia: [
        {
          id: "v1",
          post_id: "p",
          sort_order: 1,
          kind: "video",
          bunny_video_id: "b",
          video_status: "ready",
          poster_url: null,
          duration_sec: 1,
          width: 1920,
          height: 1080,
        },
      ],
      imageUrls: ["https://cdn/a.jpg"],
    });
    const feed = publishedMediaFrameStyle(mixed, "40vh", {
      multiAspectRatio: 1920 / 1080,
    });
    const detail = publishedMediaFrameStyle(mixed, "50vh", {
      multiAspectRatio: 1920 / 1080,
    });
    expect(feed.maxHeight).toBeUndefined();
    expect(detail.maxHeight).toBeUndefined();
    expect(feed.aspectRatio).toBe(detail.aspectRatio);
    expect(feed.minHeight).toBe("12rem");
  });

  it("AE–AH: surfaces use publishedMediaFrameStyle", () => {
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      "publishedMediaFrameStyle",
    );
    expect(read("src/components/detail/PublishedMediaCarousel.tsx")).toContain(
      "publishedMediaFrameStyle",
    );
    expect(read("src/components/Post.tsx")).toContain("PublishedMediaSurface");
    expect(read("src/components/detail/PostDetailBody.tsx")).toContain(
      "PublishedMediaCarousel",
    );
  });

  it("legacy MediaCarousel single image is natural", () => {
    const legacy = read("src/components/MediaCarousel.tsx");
    expect(legacy).toContain("singleImageNatural");
    expect(legacy).toContain('h-auto object-contain');
  });

  it("AI: tall visibility helper retained", () => {
    expect(read("src/lib/publishedMedia/listVideoVisibility.ts")).toContain(
      "computeEffectiveIntersectionRatio",
    );
    expect(read("src/components/PublishedMediaSurface.tsx")).toContain(
      "computeEffectiveIntersectionRatio",
    );
  });
});
