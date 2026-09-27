import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldShowFinalizeHeroUploadOverlayPill } from "./createFinalizeUploadOverlay";
import {
  MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR,
  MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR,
  VIDEO_HERO_MAX_HEIGHT_EXPR,
  computeMixedMediaHeroHeightAtWidth,
  resolveFinalizeComposeHeroFrame,
} from "./createFinalizeVideoHeroFrame";
import {
  formatCreateMediaStatusLabel,
  formatCreateMediaUploadLabel,
} from "./createPostMediaUploadLabel";

const CONTAINER_W = 608;

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS C3.2 — local video adding indicator", () => {
  it("A/B: selecting video sets local-ingest pending before persist", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("setLocalVideoIngestPending(true)");
    const pendingIdx = provider.indexOf("setLocalVideoIngestPending(true)");
    const persistIdx = provider.indexOf("await persistDraftVideo");
    expect(pendingIdx).toBeGreaterThan(0);
    expect(persistIdx).toBeGreaterThan(pendingIdx);
  });

  it("C: indicator clears on success via finally", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("setLocalVideoIngestPending(false)");
    expect(provider).toContain("finally {");
  });

  it("D: indicator clears on failure and toasts", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("ADD_VIDEO_FAILED_USER_MESSAGE");
    expect(provider).toContain("setLocalVideoIngestPending(false)");
  });

  it("E: no wording says Uploading video for local add", () => {
    expect(
      formatCreateMediaStatusLabel({
        imageUploadingCount: 0,
        videoAddingCount: 1,
      }),
    ).toBe("Adding video…");
    expect(
      formatCreateMediaStatusLabel({
        imageUploadingCount: 2,
        videoAddingCount: 1,
      }),
    ).toBe("2 images uploading · Adding video…");
    const label = formatCreateMediaStatusLabel({
      imageUploadingCount: 0,
      videoAddingCount: 1,
    });
    expect(label).not.toMatch(/Uploading video/i);
    expect(formatCreateMediaUploadLabel(0, 1)).toBe("1 video uploading");
  });

  it("F: no Bunny request caused by local ingest", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const startFn = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(startFn).toContain("persistDraftVideo");
    expect(startFn).not.toContain("invokeBunnyUploadInit");
    expect(startFn).not.toContain("uploadVideoForPublish");
    expect(startFn).not.toContain("bunny-upload-init");
  });

  it("pill shows for video adding; Bunny videoUploading alone does not", () => {
    expect(
      shouldShowFinalizeHeroUploadOverlayPill({
        imageUploadingCount: 0,
        videoAddingCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldShowFinalizeHeroUploadOverlayPill({
        imageUploadingCount: 0,
        videoUploadingCount: 1,
      }),
    ).toBe(false);
  });
});

describe("PASS C3.2 — shared mixed hero height", () => {
  it("G: square/landscape video gives square shared mixed frame", () => {
    const landscape = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      videoWidth: 1920,
      videoHeight: 1080,
    });
    expect(landscape.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
    expect(computeMixedMediaHeroHeightAtWidth(1920, 1080, CONTAINER_W, 900)).toBe(
      CONTAINER_W,
    );

    const square = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      videoWidth: 1000,
      videoHeight: 1000,
    });
    expect(square.aspectRatio).toBe("1000/1000");
  });

  it("H: portrait video gives taller shared frame", () => {
    const h = computeMixedMediaHeroHeightAtWidth(1080, 1920, CONTAINER_W, 2000);
    expect(h).toBeGreaterThan(CONTAINER_W);
  });

  it("I: portrait frame capped around 70dvh", () => {
    expect(VIDEO_HERO_MAX_HEIGHT_EXPR).toContain("70dvh");
    expect(MIXED_MEDIA_HERO_MAX_HEIGHT_EXPR).toContain("70dvh");
    expect(VIDEO_HERO_MAX_HEIGHT_EXPR).not.toContain("80dvh");
  });

  it("J/K/L: IMAGE ↔ VIDEO keep identical outer height", () => {
    const dims = { videoWidth: 1080, videoHeight: 1920 };
    const onVideo = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: true,
      ...dims,
    });
    const onImage = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
      activeVideoHero: false,
      ...dims,
    });
    expect(onVideo).toEqual(onImage);
    expect(onVideo.aspectRatio).toBe("1080/1920");
    // Repeated swaps stay identical.
    expect(
      resolveFinalizeComposeHeroFrame({
        hasActiveVideo: true,
        activeVideoHero: true,
        ...dims,
      }),
    ).toEqual(onImage);
  });

  it("O: image-only sizing unchanged", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: false,
      activeVideoHero: false,
    });
    expect(frame.aspectRatio).toBe("4/5");
    expect(frame.maxHeight).toBe("50vh");
    expect(frame.minHeight).toBeUndefined();
  });

  it("square fallback while video metadata missing", () => {
    const frame = resolveFinalizeComposeHeroFrame({
      hasActiveVideo: true,
    });
    expect(frame.aspectRatio).toBe("1/1");
    expect(frame.minHeight).toBe(MIXED_MEDIA_HERO_MIN_HEIGHT_EXPR);
  });
});

describe("PASS C3.2 — preserve slider / dots / gestures / android", () => {
  it("M/N: pagination + dock placement unchanged", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(body).toContain("data-create-hero-pagination-slot");
    expect(page).toContain("CreateFinalizeHeroPaginationDots");
    expect(page).toContain("composeFinalizeHeroBottomOverlayCta");
  });

  it("P: video gestures unchanged", () => {
    const player = read("src/components/create/CreateFinalizeVideoPlayer.tsx");
    expect(player).toContain("resolveVideoPointerUp");
    expect(player).not.toContain("onPointerLeave");
  });

  it("Q: Android diagnostics retained + no Filesystem.then helper", () => {
    const storage = read("src/lib/createDraftVideo/nativeDraftVideoStorage.ts");
    const diag = read("src/lib/devAndroidVideoDiagnostics.ts");
    expect(diag).toContain("ANDROID_VIDEO_DIAG_PREFIX");
    expect(storage).toContain("withFilesystem");
    expect(storage).not.toMatch(/async function getFilesystem/);
    expect(storage).toContain("logAndroidVideoDiagnostic");
  });
});
