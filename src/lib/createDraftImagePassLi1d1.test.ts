/**
 * PASS LI1D.1 — Create hero local DraftImage preview URL handling.
 * Root cause: ProgressiveImage → imgUrlPublic mangled blob:/capacitor: into Storage URLs.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { isLocalPreviewUrl } from "./localPreviewUrl";
import { imgUrlPublic } from "./img";
import { getBestImageUrl } from "./imageOptimization";
import ProgressiveImage from "../components/ui/ProgressiveImage";
import {
  buildLocalDraftImageUrl,
  isLocalDraftImageUrl,
} from "./createDraftImage/localDraftImageUrl";
import {
  __resetDraftImagePreviewCacheForTests,
  getCachedDraftImagePreviewUrl,
  releaseDraftImagePreview,
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

describe("PASS LI1D.1 — local preview URL handling", () => {
  beforeEach(() => {
    __resetDraftImagePreviewCacheForTests();
  });
  afterEach(() => {
    __resetDraftImagePreviewCacheForTests();
  });

  it("A–C: isLocalPreviewUrl + imgUrlPublic pass-through", () => {
    const blob = "blob:http://localhost:5173/abc-def";
    const cap = "capacitor://localhost/_capacitor_file_/var/mobile/x.webp";
    const fileCap =
      "https://localhost/_capacitor_file_/data/user/0/app/files/create-drafts/p/images/a.webp";
    const httpCap =
      "http://localhost/_capacitor_file_/data/user/0/app/files/x.webp";
    const content =
      "https://localhost/_capacitor_content_/data/user/0/app/cache/y.webp";
    const fileScheme = "file:///var/mobile/Containers/Data/x.webp";

    expect(isLocalPreviewUrl(blob)).toBe(true);
    expect(isLocalPreviewUrl(cap)).toBe(true);
    expect(isLocalPreviewUrl(fileCap)).toBe(true);
    expect(isLocalPreviewUrl(httpCap)).toBe(true);
    expect(isLocalPreviewUrl(content)).toBe(true);
    expect(isLocalPreviewUrl(fileScheme)).toBe(true);

    expect(imgUrlPublic(blob)).toBe(blob);
    expect(imgUrlPublic(cap)).toBe(cap);
    expect(imgUrlPublic(fileCap)).toBe(fileCap);
    expect(imgUrlPublic(httpCap)).toBe(httpCap);
    expect(imgUrlPublic(content)).toBe(content);
    expect(imgUrlPublic(fileScheme)).toBe(fileScheme);

    expect(imgUrlPublic(blob)).not.toContain("supabase.co");
    expect(imgUrlPublic(cap)).not.toContain("supabase.co");
  });

  it("F–G: remote Storage path + HTTPS still convert / pass", () => {
    const storagePath = "user/post/img.webp";
    const publicUrl = imgUrlPublic(storagePath);
    expect(publicUrl).toBe(
      `https://example.supabase.co/storage/v1/object/public/media/${storagePath}`,
    );

    const httpsRemote =
      "https://example.supabase.co/storage/v1/object/public/media/user/a.webp";
    expect(isLocalPreviewUrl(httpsRemote)).toBe(false);
    expect(imgUrlPublic(httpsRemote)).toBe(httpsRemote);
  });

  it("draft-image sentinel never becomes a Storage public URL", () => {
    const sentinel = buildLocalDraftImageUrl("local-abc");
    expect(isLocalDraftImageUrl(sentinel)).toBe(true);
    expect(imgUrlPublic(sentinel)).toBeUndefined();
  });

  it("D–E: ProgressiveImage renders local preview src directly", () => {
    const blob = "blob:http://localhost:5173/hero-1";
    const cap = "capacitor://localhost/_capacitor_file_/hero.webp";
    const blobHtml = renderToStaticMarkup(
      React.createElement(ProgressiveImage, { src: blob, priority: true }),
    );
    const capHtml = renderToStaticMarkup(
      React.createElement(ProgressiveImage, { src: cap, priority: true }),
    );
    expect(blobHtml).toContain(`src="${blob}"`);
    expect(capHtml).toContain(`src="${cap}"`);
    expect(blobHtml).not.toContain("supabase.co");
    expect(capHtml).not.toContain("supabase.co");
    expect(blobHtml).not.toContain("width=");
  });

  it("getBestImageUrl does not append transforms to blob/capacitor", () => {
    const blob = "blob:http://localhost:5173/x";
    const cap = "capacitor://localhost/_capacitor_file_/x";
    expect(getBestImageUrl(blob, 800)).toBe(blob);
    expect(getBestImageUrl(cap, 800)).toBe(cap);
  });

  it("H–I: hero MixedImageSlide uses preview hook; never raw sentinel as ProgressiveImage input path", () => {
    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(carousel).toContain("useCreateImagePreviewSrc(url, clientId)");
    expect(carousel).toContain("ProgressiveImage");
    expect(carousel).toContain("src={resolved}");
    // Sentinel only as identity into the hook, not as ProgressiveImage src while unresolved
    expect(carousel).toContain("if (!resolved)");
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("isLocalDraftImageUrl");
    expect(hero).toContain("CreateFinalizeMixedMediaCarousel");
    expect(hero).toContain("LI1D.1");
  });

  it("J: strip + hero share previewCache (no second create path)", () => {
    const id = "shared-local";
    const url = "blob:http://localhost:5173/shared";
    setCachedDraftImagePreviewUrl(id, url);
    expect(getCachedDraftImagePreviewUrl(id)).toBe(url);
    const strip = read("src/components/create/CreateFinalizeImageManagerStrip.tsx");
    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(strip).toContain("useCreateImagePreviewSrc");
    expect(carousel).toContain("useCreateImagePreviewSrc");
    const hook = read("src/lib/createDraftImage/useCreateImagePreviewSrc.ts");
    expect(hook).toContain("resolveDraftImagePreview");
    expect(hook).not.toContain("URL.createObjectURL");
  });

  it("Q: slide changes do not revoke; release still works on remove", () => {
    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(carousel).not.toContain("releaseDraftImagePreview");
    expect(carousel).not.toContain("revokeObjectURL");
    const id = "rev-1";
    setCachedDraftImagePreviewUrl(id, "blob:http://localhost:5173/r");
    releaseDraftImagePreview(id);
    expect(getCachedDraftImagePreviewUrl(id)).toBeUndefined();
  });

  it("T: no blob/capacitor persistence helpers in mediaOrder builders", () => {
    const order = read("src/lib/createDraftMediaOrder.ts");
    expect(order).toContain("buildLocalDraftImageUrl");
    expect(order).not.toMatch(/URL\.createObjectURL/);
    expect(order).not.toContain("blob:http");
  });

  it("U: LI1C publish still rejects blob and maps sentinel → remote", () => {
    const pub = read("src/lib/createDraftImage/publishDraftImages.ts");
    expect(pub).toContain("mapActivityImagesToRemotePaths");
    expect(pub).toContain('url.startsWith("blob:")');
    expect(pub).toContain("PUBLISH_LOCAL_IMAGE_LEAK");
    expect(pub).toContain("isLocalDraftImageUrl");
  });

  it("V–Y: Edit / Profile / Feed / video surfaces untouched by LI1D.1 files", () => {
    for (const rel of [
      "src/components/profile/ProfilePhotosMediaManager.tsx",
      "src/components/Post.tsx",
      "src/components/detail/PublishedVideoPlayer.tsx",
    ]) {
      if (!existsSync(join(process.cwd(), rel))) continue;
      const src = read(rel);
      expect(src).not.toContain("isLocalPreviewUrl");
      expect(src).not.toContain("useCreateImagePreviewSrc");
    }
    const videoPlayer = read(
      "src/components/create/CreateFinalizeVideoPlayer.tsx",
    );
    expect(videoPlayer).not.toContain("isLocalPreviewUrl");
  });

  it("gallery identity: draft-image sentinels are identity (LI1D.2 preserves; not Storage URLs)", () => {
    const carousel = read("src/lib/carouselImages.ts");
    expect(carousel).toContain("draft-image/*");
    expect(carousel).toContain("imgUrlPublic");
    expect(carousel).toContain("isLocalDraftImageUrl");
  });

  it("K–P / R / X structural coverage via Create hero path", () => {
    const mixed = read("src/lib/createFinalizeMixedMedia.ts");
    expect(mixed).toContain("resolveHeroIndexForClientId");
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("mediaOrder");
    expect(hero).toContain("hasActivePostVideo");
    const progressive = read("src/components/ui/ProgressiveImage.tsx");
    expect(progressive).toContain("LocalSessionPreviewImage");
    expect(progressive).toContain("isLocalPreviewUrl");
    expect(progressive).toContain("getBestImageUrl");
  });
});
