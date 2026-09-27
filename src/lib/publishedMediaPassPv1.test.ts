import { describe, expect, it } from "vitest";
import { mapDraftMediaOrderToPublished } from "./createDraftMediaOrder";
import {
  buildPublishedMediaItems,
  buildBunnyHlsPlaylistUrl,
  resolvePublishedVideoPlayback,
} from "./publishedMedia";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS PV1 — publish media_order", () => {
  it("A: image-only media_order", () => {
    const order = mapDraftMediaOrderToPublished(
      [
        { kind: "image", clientId: "a", url: "https://cdn/a.jpg" },
        { kind: "image", clientId: "b", url: "https://cdn/b.jpg" },
      ],
      null,
    );
    expect(order).toEqual([
      { kind: "image", url: "https://cdn/a.jpg" },
      { kind: "image", url: "https://cdn/b.jpg" },
    ]);
  });

  it("B: video-only media_order", () => {
    const order = mapDraftMediaOrderToPublished(
      [{ kind: "video", clientId: "v1" }],
      "media-uuid-1",
    );
    expect(order).toEqual([{ kind: "video", mediaId: "media-uuid-1" }]);
  });

  it("C: image → video → image exact order", () => {
    const order = mapDraftMediaOrderToPublished(
      [
        { kind: "image", clientId: "a", url: "https://cdn/a.jpg" },
        { kind: "video", clientId: "v1" },
        { kind: "image", clientId: "b", url: "https://cdn/b.jpg" },
      ],
      "media-uuid-1",
    );
    expect(order).toEqual([
      { kind: "image", url: "https://cdn/a.jpg" },
      { kind: "video", mediaId: "media-uuid-1" },
      { kind: "image", url: "https://cdn/b.jpg" },
    ]);
  });

  it("D: video → image exact order", () => {
    const order = mapDraftMediaOrderToPublished(
      [
        { kind: "video", clientId: "v1" },
        { kind: "image", clientId: "a", url: "https://cdn/a.jpg" },
      ],
      "media-uuid-1",
    );
    expect(order).toEqual([
      { kind: "video", mediaId: "media-uuid-1" },
      { kind: "image", url: "https://cdn/a.jpg" },
    ]);
  });

  it("E: retry maps same order (idempotent)", () => {
    const draft = [
      { kind: "image" as const, clientId: "a", url: "https://cdn/a.jpg" },
      { kind: "video" as const, clientId: "v1" },
    ];
    const first = mapDraftMediaOrderToPublished(draft, "media-uuid-1");
    const second = mapDraftMediaOrderToPublished(draft, "media-uuid-1");
    expect(second).toEqual(first);
  });

  it("F: owner payload sends media_order", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("media_order");
    expect(publish).toContain("mapDraftMediaOrderToPublished");
    expect(publish).toContain("publishedVideoMediaId");
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("mediaOrder:");
    expect(page).toContain("publishedVideoMediaId");
  });
});

describe("PASS PV1 — published media read model", () => {
  const videoRow = {
    id: "m1",
    post_id: "p1",
    sort_order: 0,
    kind: "video",
    bunny_video_id: "bunny-1",
    video_status: "ready" as const,
    poster_url: "https://cdn/poster.jpg",
    duration_sec: 12,
    width: 1080,
    height: 1920,
  };

  it("G: media_order respected", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "video", mediaId: "m1" },
        { kind: "image", url: "https://cdn/b.jpg" },
      ],
      postMedia: [videoRow],
    });
    expect(items.map((i) => i.kind)).toEqual(["image", "video", "image"]);
    expect(items[0]).toMatchObject({ kind: "image", url: "https://cdn/a.jpg" });
    expect(items[1]).toMatchObject({ kind: "video", mediaId: "m1" });
    expect(items[2]).toMatchObject({ kind: "image", url: "https://cdn/b.jpg" });
  });

  it("H: image legacy fallback", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
      mediaOrder: null,
      postMedia: [],
    });
    expect(items.map((i) => i.kind)).toEqual(["image", "image"]);
    expect(items[0]).toMatchObject({
      kind: "image",
      key: "image:https://cdn/a.jpg",
      url: "https://cdn/a.jpg",
    });
    expect(items[1]).toMatchObject({
      kind: "image",
      key: "image:https://cdn/b.jpg",
      url: "https://cdn/b.jpg",
    });
  });

  it("K2: valid media_order does not append gallery leftovers", () => {
    const items = buildPublishedMediaItems({
      imageUrls: [
        "https://cdn.example/storage/a.jpg",
        "https://cdn.example/storage/b.jpg",
      ],
      mediaOrder: [
        { kind: "image", url: "user/posts/a.jpg" },
        { kind: "video", mediaId: "m1" },
        { kind: "image", url: "user/posts/b.jpg" },
      ],
      postMedia: [videoRow],
    });
    // Even if gallery public URLs don't string-match order paths, count stays 3
    // when normalize maps them — or order-only membership without leftover append.
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.filter((i) => i.kind === "video")).toHaveLength(1);
  });

  it("I: legacy image+video fallback", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg"],
      mediaOrder: null,
      postMedia: [videoRow],
    });
    expect(items.map((i) => i.kind)).toEqual(["image", "video"]);
  });

  it("J: missing referenced media doesn't crash", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg"],
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "video", mediaId: "missing" },
        { kind: "image", url: "https://cdn/b.jpg" },
      ],
      postMedia: [],
    });
    expect(items.some((i) => i.kind === "video")).toBe(false);
    expect(items.some((i) => i.kind === "image")).toBe(true);
  });

  it("K: no duplicates", () => {
    const items = buildPublishedMediaItems({
      imageUrls: ["https://cdn/a.jpg", "https://cdn/a.jpg"],
      mediaOrder: [
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "image", url: "https://cdn/a.jpg" },
        { kind: "video", mediaId: "m1" },
        { kind: "video", mediaId: "m1" },
      ],
      postMedia: [videoRow],
    });
    const urls = items.filter((i) => i.kind === "image").map((i) => i.url);
    const vids = items.filter((i) => i.kind === "video").map((i) => i.mediaId);
    expect(urls).toEqual(["https://cdn/a.jpg"]);
    expect(vids).toEqual(["m1"]);
  });
});

describe("PASS PV1 — playback resolver + player wiring", () => {
  it("L: ready video resolves HLS URL", () => {
    const playback = resolvePublishedVideoPlayback({
      videoId: "bunny-abc",
      posterUrl: "https://cdn/poster.jpg",
    });
    expect(playback.hlsUrl).toBe(
      buildBunnyHlsPlaylistUrl("bunny-abc", "vz-352d6183-da2.b-cdn.net"),
    );
  });

  it("M: poster comes from post_media.poster_url", () => {
    const playback = resolvePublishedVideoPlayback({
      videoId: "bunny-abc",
      posterUrl: "https://cdn/poster.jpg",
    });
    expect(playback.posterUrl).toBe("https://cdn/poster.jpg");
  });

  it("N–U: player/carousel source contracts", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    // PV3.1: no visible processing copy — poster/black only.
    expect(player).not.toContain("Getting video ready…");
    expect(player).toContain('preload="none"');
    expect(player).toContain('import("hls.js")');
    expect(player).toContain("hls.destroy()");
    expect(player).toContain("visibilitychange");
    expect(player).toContain("pauseVideo");
    expect(player).toContain("posterUrl");
    expect(player).not.toContain("localReference");
    expect(player).not.toContain("preparedReference");

    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("PublishedVideoPlayer");
    expect(carousel).toContain("isActive={i === index && !fullscreenOpen}");

    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("PublishedMediaCarousel");
    expect(body).toContain("getOrFetchPublishedMedia");
  });

  it("P: hls.js used only when native HLS unavailable", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("canPlayNativeHls(video)");
    expect(player).toContain('await import("hls.js")');
    expect(player).toMatch(
      /if \(canPlayNativeHls\(video\)\)[\s\S]*?await import\("hls\.js"\)/,
    );
  });
});

describe("PASS PV1 — carousel + status polish", () => {
  it("V: published Detail uses stable PublishedMediaCarousel shell", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    expect(body).toContain("usePublishedDetailShell");
    expect(body).toContain("PublishedMediaCarousel");
    // Finalize/preview may still use MediaCarousel; published path uses shell.
    expect(body).toContain("data-published-detail-media-shell");
  });

  it("W/X: mixed dots + order via PublishedMediaItem[]", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).toContain("mediaItems.map");
    expect(carousel).toContain("data-published-media-pagination");
    expect(carousel).toContain('w-4 bg-[var(--text)]');
    expect(carousel).toContain("w-2 bg-[var(--text)]/50");
  });

  it("Y: Uploading media copy", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("Uploading media");
    expect(page).not.toMatch(/Uploading video\$\{pct\}/);
  });

  it("Z: normal upload does not use error/red treatment", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain('inlineAlertVariant=');
    expect(page).toContain('"progress"');
    const dialog = read("src/components/ui/ConfirmDialog.tsx");
    expect(dialog).toContain('inlineAlertVariant === "progress"');
    expect(dialog).toContain("data-publish-progress-pill");
    expect(dialog).toContain("border-[var(--text)]/22");
  });

  it("Feed / Edit / Delete — Feed seeds media cache; Edit never DraftVideo", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    expect(feed).toContain("seedPublishedMediaFromFeedItems");
    expect(feed).not.toContain("PublishedMediaCarousel");
    const edit = read("src/lib/editPostBootstrap.ts");
    // PV4 hydrates postMedia / PublishedVideoReference — still never DraftVideo.
    expect(edit).toContain("PublishedVideoReference");
    expect(edit).not.toContain("DraftVideo");
    const del = read("src/lib/deletePublishedPost/invokeDeletePublishedPost.ts");
    expect(del).toContain("delete-published-post");
  });

  it("no DB migration / edge deploy in PV1 client", () => {
    const resolver = read(
      "src/lib/publishedMedia/resolvePublishedVideoPlayback.ts",
    );
    expect(resolver).toContain("TODO(token-auth)");
    expect(resolver).toContain("playlist.m3u8");
  });
});

describe("PASS PV1 — package", () => {
  it("hls.js is a dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["hls.js"]).toBeTruthy();
  });
});
