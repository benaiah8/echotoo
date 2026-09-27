/**
 * PASS LI1D.2 — restore local DraftImage hero/media presence.
 * Identity (draft-image/*) must survive gallery mapping; display resolves at boundary.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildLocalDraftImageUrl,
  isLocalDraftImageUrl,
} from "./createDraftImage/localDraftImageUrl";
import { imgUrlPublic } from "./img";
import {
  buildCarouselImages,
  buildFinalizeComposerGallery,
} from "./carouselImages";
import {
  buildEphemeralMediaOrderFromActivities,
  countCreateFinalizeImages,
  hasCreateFinalizeMedia,
  shouldUseCreateLocalAwareHero,
} from "./createFinalizeMediaPresence";
import { imageOrderItem, videoOrderItem } from "./createDraftMediaOrder";
import {
  __resetDraftImagePreviewCacheForTests,
  getCachedDraftImagePreviewUrl,
  setCachedDraftImagePreviewUrl,
} from "./createDraftImage/previewCache";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

vi.mock("./supabaseClient", () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://example.supabase.co/storage/v1/object/public/media/${path}`,
          },
        }),
      }),
    },
  },
}));

describe("PASS LI1D.2 — local DraftImage identity + display boundary", () => {
  beforeEach(() => {
    __resetDraftImagePreviewCacheForTests();
  });
  afterEach(() => {
    __resetDraftImagePreviewCacheForTests();
  });

  it("J: gallery/identity preserves draft-image sentinel (not pruned by imgUrlPublic)", () => {
    const a = buildLocalDraftImageUrl("img-a");
    const b = buildLocalDraftImageUrl("img-b");
    expect(imgUrlPublic(a)).toBeUndefined();

    const finalize = buildFinalizeComposerGallery(
      [{ images: [a, b] }],
      400,
    ).images;
    expect(finalize).toEqual([a, b]);

    const carousel = buildCarouselImages([{ images: [a] }], 400).images;
    expect(carousel).toContain(a);
  });

  it("K: imgUrlPublic still does NOT convert sentinel to Storage URL", () => {
    const sentinel = buildLocalDraftImageUrl("keep-local");
    expect(isLocalDraftImageUrl(sentinel)).toBe(true);
    expect(imgUrlPublic(sentinel)).toBeUndefined();

    const blob = "blob:http://localhost:5173/x";
    const cap = "capacitor://localhost/_capacitor_file_/x.webp";
    expect(imgUrlPublic(blob)).toBe(blob);
    expect(imgUrlPublic(cap)).toBe(cap);
  });

  it("E–F / 12–13: effective image count unions activities + mediaOrder without double-count", () => {
    const a = buildLocalDraftImageUrl("local-1");
    const b = buildLocalDraftImageUrl("local-2");
    const remote = "user/post/remote.webp";

    expect(
      countCreateFinalizeImages({
        activities: [{ images: [a] }],
        mediaOrder: [],
      }),
    ).toBe(1);

    expect(
      countCreateFinalizeImages({
        activities: [{ images: [a] }],
        mediaOrder: [imageOrderItem(a, "local-1")],
      }),
    ).toBe(1);

    expect(
      countCreateFinalizeImages({
        activities: [{ images: [a] }],
        mediaOrder: [imageOrderItem(b, "local-2")],
      }),
    ).toBe(2);

    expect(
      countCreateFinalizeImages({
        activities: [{ images: [remote] }],
        mediaOrder: [imageOrderItem(a, "local-1")],
      }),
    ).toBe(2);

    expect(
      countCreateFinalizeImages({
        activities: [{ images: [a, b] }],
        mediaOrder: [
          imageOrderItem(a, "local-1"),
          imageOrderItem(b, "local-2"),
        ],
      }),
    ).toBe(2);
  });

  it("G–H: local-aware hero when activities OR mediaOrder hold sentinels", () => {
    const a = buildLocalDraftImageUrl("hero-1");
    expect(
      shouldUseCreateLocalAwareHero({
        hasVideo: false,
        mediaOrder: [],
        activities: [{ images: [a] }],
      }),
    ).toBe(true);

    expect(
      shouldUseCreateLocalAwareHero({
        hasVideo: false,
        mediaOrder: [imageOrderItem(a, "hero-1")],
        activities: [{ images: [] }],
      }),
    ).toBe(true);

    expect(
      shouldUseCreateLocalAwareHero({
        hasVideo: false,
        mediaOrder: [imageOrderItem("user/a.webp", "user/a.webp")],
        activities: [{ images: ["user/a.webp"] }],
      }),
    ).toBe(false);

    expect(
      shouldUseCreateLocalAwareHero({
        hasVideo: true,
        mediaOrder: [],
        activities: [],
      }),
    ).toBe(true);
  });

  it("G: hasCreateFinalizeMedia mounts hero for local images without video", () => {
    expect(hasCreateFinalizeMedia({ imageCount: 1, hasVideo: false })).toBe(
      true,
    );
    expect(hasCreateFinalizeMedia({ imageCount: 0, hasVideo: false })).toBe(
      false,
    );
    expect(hasCreateFinalizeMedia({ imageCount: 0, hasVideo: true })).toBe(
      true,
    );
  });

  it("H / race: ephemeral mediaOrder from activities when mediaOrder empty", () => {
    const a = buildLocalDraftImageUrl("ephem-a");
    const remote = "user/post/r.webp";
    const order = buildEphemeralMediaOrderFromActivities(
      [{ images: [a, remote] }],
      null,
    );
    expect(order).toEqual([
      imageOrderItem(a, "ephem-a"),
      imageOrderItem(remote, remote),
    ]);

    const withVideo = buildEphemeralMediaOrderFromActivities(
      [{ images: [a] }],
      "vid-1",
    );
    expect(withVideo[0]).toEqual(videoOrderItem("vid-1"));
    expect(withVideo[1]).toEqual(imageOrderItem(a, "ephem-a"));
  });

  it("P–R: order preserved for local+local, remote+local, local+video+local", () => {
    const a = buildLocalDraftImageUrl("ord-a");
    const b = buildLocalDraftImageUrl("ord-b");
    const remote = "user/post/x.webp";

    const twoLocal = buildEphemeralMediaOrderFromActivities(
      [{ images: [a, b] }],
      null,
    );
    expect(twoLocal.map((i) => (i.kind === "image" ? i.clientId : i.clientId))).toEqual([
      "ord-a",
      "ord-b",
    ]);

    const remoteLocal = buildEphemeralMediaOrderFromActivities(
      [{ images: [remote, a] }],
      null,
    );
    expect(remoteLocal.map((i) => i.clientId)).toEqual([remote, "ord-a"]);

    const mixed = buildEphemeralMediaOrderFromActivities(
      [{ images: [a, b] }],
      "v1",
    );
    expect(mixed.map((i) => i.clientId)).toEqual(["v1", "ord-a", "ord-b"]);
  });

  it("S: remote-only gallery still maps via imgUrlPublic / optimized", () => {
    const path = "user/post/remote.webp";
    const gallery = buildFinalizeComposerGallery([{ images: [path] }], 400)
      .images;
    expect(gallery.length).toBe(1);
    expect(gallery[0]).toContain("supabase.co");
    expect(gallery[0]).not.toContain("draft-image/");
  });

  it("I: manager strip still uses useCreateImagePreviewSrc (preserved)", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("useCreateImagePreviewSrc");
    expect(strip).toContain("mediaOrder");
  });

  it("L–N / MixedImageSlide: hero resolves via preview hook, not raw sentinel src", () => {
    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(carousel).toContain("useCreateImagePreviewSrc(url, clientId)");
    expect(carousel).toContain("src={resolved}");
    expect(carousel).toContain("if (!resolved)");

    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("shouldUseCreateLocalAwareHero");
    expect(hero).toContain("buildEphemeralMediaOrderFromActivities");
    expect(hero).toContain("CreateFinalizeMixedMediaCarousel");
    expect(hero).toContain("isLocalDraftImageUrl");
  });

  it("CreateFinalizePage wires effective count + hasCreateMedia", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("countCreateFinalizeImages");
    expect(page).toContain("effectiveCreateImageCount");
    expect(page).toContain("hasCreateMedia");
    expect(page).toContain("totalImagesPost: effectiveCreateImageCount");
  });

  it("activities cleanImages keeps local sentinels", () => {
    const hook = read("src/hooks/useCreateDraftActivitiesState.ts");
    expect(hook).toContain("isLocalDraftImageUrl");
    expect(hook).toMatch(/isLocalDraftImageUrl\(u\)/);
  });

  it("V: no blob/capacitor persisted as identity in presence helpers", () => {
    expect(
      countCreateFinalizeImages({
        activities: [{ images: ["blob:http://localhost/x"] }],
        mediaOrder: [],
      }),
    ).toBe(0);
    const presence = read("src/lib/createFinalizeMediaPresence.ts");
    expect(presence).not.toContain("URL.createObjectURL");
  });

  it("W: LI1C publish mapping unchanged (source invariants)", () => {
    const pub = read("src/lib/createDraftImage/publishDraftImages.ts");
    expect(pub).toContain("mapActivityImagesToRemotePaths");
    expect(pub).toContain("mapMediaOrderImagesToRemotePaths");
    expect(pub).toContain("assertPublishImagePayloadHasNoLocalLeak");
    expect(pub).toContain("isLocalDraftImageUrl");
  });

  it("X–AA: Edit / Profile / Feed / video not wired to LI1D.2 presence helpers", () => {
    for (const rel of [
      "src/components/profile/ProfilePhotosMediaManager.tsx",
      "src/components/Post.tsx",
      "src/components/detail/PublishedVideoPlayer.tsx",
      "src/pages/EditPostPage.tsx",
    ]) {
      if (!existsSync(join(process.cwd(), rel))) continue;
      const src = read(rel);
      expect(src).not.toContain("createFinalizeMediaPresence");
      expect(src).not.toContain("countCreateFinalizeImages");
    }
  });

  it("preview cache still shared (display boundary, not persisted identity)", () => {
    setCachedDraftImagePreviewUrl(
      "disp-1",
      "blob:http://localhost:5173/disp",
    );
    expect(getCachedDraftImagePreviewUrl("disp-1")).toBe(
      "blob:http://localhost:5173/disp",
    );
  });

  it("carouselImages comments document identity vs display", () => {
    const carousel = read("src/lib/carouselImages.ts");
    expect(carousel).toContain("LI1D.2");
    expect(carousel).toContain("isLocalDraftImageUrl");
    expect(carousel).toContain("preserve");
  });
});
