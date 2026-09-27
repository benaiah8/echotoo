/**
 * PASS LI1B — Create-only local-first images (no Storage upload on pick).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webMocks = vi.hoisted(() => ({
  saveWebDraftImageBlob: vi.fn(),
  loadWebDraftImageBlob: vi.fn(),
  hasWebDraftImageBlob: vi.fn(),
  deleteWebDraftImageBlob: vi.fn(),
  deleteWebDraftImagesForPost: vi.fn(),
}));

vi.mock("./createDraftImage/webDraftImageStorage", async () => {
  const actual = await vi.importActual<
    typeof import("./createDraftImage/webDraftImageStorage")
  >("./createDraftImage/webDraftImageStorage");
  return {
    ...actual,
    saveWebDraftImageBlob: webMocks.saveWebDraftImageBlob,
    loadWebDraftImageBlob: webMocks.loadWebDraftImageBlob,
    hasWebDraftImageBlob: webMocks.hasWebDraftImageBlob,
    deleteWebDraftImageBlob: webMocks.deleteWebDraftImageBlob,
    deleteWebDraftImagesForPost: webMocks.deleteWebDraftImagesForPost,
  };
});

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => false,
}));

import {
  CREATE_LOCAL_FIRST_IMAGES_ENABLED,
  CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE,
  buildLocalDraftImageUrl,
  clearDraftImagesMeta,
  deleteDraftImage,
  draftImageLocalIdAsMediaOrderClientId,
  hasUnpublishedLocalDraftImages,
  isLocalDraftImageUrl,
  persistDraftImage,
  readDraftImagesMeta,
  reconcileDraftImages,
  resolveDraftImagePreview,
  upsertDraftImageMeta,
  writeDraftImagesMeta,
  __resetDraftImagePreviewCacheForTests,
  type DraftImage,
} from "./createDraftImage";
import {
  bootstrapMediaOrder,
  ensureDraftMediaOrderPersisted,
  imageOrderItem,
  reconcileMediaOrder,
  reorderMediaOrderByClientIds,
  videoOrderItem,
  writeDraftMediaOrderState,
} from "./createDraftMediaOrder";
import { cleanImagesForActivity } from "./createFlowPublish";
import { MAX_TOTAL_POST_MEDIA } from "./createPostMediaSlots";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseDraftImage(overrides: Partial<DraftImage> = {}): DraftImage {
  return {
    localId: "img-local-1",
    fileName: "shot.webp",
    mimeType: "image/webp",
    size: 12_345,
    width: 1200,
    height: 900,
    localStorageKind: "idb-blob",
    localReference: "pub-1/img-local-1",
    remoteUrl: null,
    remoteStoragePath: null,
    ...overrides,
  };
}

describe("PASS LI1B — Create local-first images", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    webMocks.saveWebDraftImageBlob.mockReset();
    webMocks.loadWebDraftImageBlob.mockReset();
    webMocks.hasWebDraftImageBlob.mockReset();
    webMocks.deleteWebDraftImageBlob.mockReset();
    webMocks.deleteWebDraftImagesForPost.mockReset();
    webMocks.saveWebDraftImageBlob.mockImplementation(
      async (publishPostId: string, localId: string) =>
        `${publishPostId}/${localId}`,
    );
    webMocks.hasWebDraftImageBlob.mockResolvedValue(true);
    webMocks.loadWebDraftImageBlob.mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
    );
    webMocks.deleteWebDraftImageBlob.mockResolvedValue(undefined);
    webMocks.deleteWebDraftImagesForPost.mockResolvedValue(undefined);
    __resetDraftImagePreviewCacheForTests();

    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      clear: () => storage.clear(),
    });
  });

  afterEach(() => {
    try {
      clearDraftImagesMeta();
    } catch {
      /* localStorage may already be unstubbed */
    }
    __resetDraftImagePreviewCacheForTests();
    vi.unstubAllGlobals();
  });

  it("A/B/C: Create selection path does not call Storage upload; Edit still can", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("CREATE_LOCAL_FIRST_IMAGES_ENABLED");
    expect(provider).toContain("persistDraftImage");
    expect(provider).toContain("isCreateEditModeActive");
    expect(provider).toContain("uploadNormalizedPostImage");

    const createStart = provider.indexOf("// NEW Create (LI1B)");
    expect(createStart).toBeGreaterThan(0);
    const createBranch = provider.slice(createStart, createStart + 1800);
    expect(createBranch).toContain("persistDraftImage");
    expect(createBranch).not.toContain("uploadNormalizedPostImage");

    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("startPostImageUploads");
    expect(picker).not.toContain("uploadNormalizedPostImage");
  });

  it("D/E: persistDraftImage + localId === mediaOrder clientId", async () => {
    expect(CREATE_LOCAL_FIRST_IMAGES_ENABLED).toBe(true);
    const blob = new Blob([new Uint8Array([9, 9])], { type: "image/webp" });
    const draft = await persistDraftImage({
      publishPostId: "pub-1",
      localId: "stable-img-1",
      blob,
      fileName: "a.webp",
      mimeType: "image/webp",
    });
    expect(draft.localId).toBe("stable-img-1");
    expect(draft.remoteUrl).toBeNull();
    expect(draft.remoteStoragePath).toBeNull();
    expect(webMocks.saveWebDraftImageBlob).toHaveBeenCalled();
    expect(readDraftImagesMeta()).toHaveLength(1);

    const url = buildLocalDraftImageUrl(draft.localId);
    expect(isLocalDraftImageUrl(url)).toBe(true);
    const item = imageOrderItem(url, draftImageLocalIdAsMediaOrderClientId(draft.localId));
    expect(item.clientId).toBe(draft.localId);
  });

  it("F/G: tray + hero use preview adapter (not persisted blob URLs)", () => {
    const strip = read("src/components/create/CreateFinalizeImageManagerStrip.tsx");
    expect(strip).toContain("useCreateImagePreviewSrc");
    expect(strip).toContain("removeDraftImageFromDraftMeta");
    expect(strip).toContain("cleanupDraftImageAsset");
    expect(strip).not.toContain("deleteMediaStorageObject");

    const carousel = read(
      "src/components/create/CreateFinalizeMixedMediaCarousel.tsx",
    );
    expect(carousel).toContain("useCreateImagePreviewSrc");

    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("isLocalDraftImageUrl");
  });

  it("H/I: remove deletes local IDB only — no Storage delete APIs in Create strip", async () => {
    const img = baseDraftImage();
    upsertDraftImageMeta(img);
    await deleteDraftImage(img.localId, {
      publishPostId: "pub-1",
      draftImage: img,
    });
    expect(webMocks.deleteWebDraftImageBlob).toHaveBeenCalledWith(
      "pub-1",
      "img-local-1",
    );
    expect(readDraftImagesMeta()).toEqual([]);

    const strip = read("src/components/create/CreateFinalizeImageManagerStrip.tsx");
    expect(strip).not.toContain("deleteMediaStorageObject");
    expect(strip).not.toContain("supabase.storage");
  });

  it("J/K: reorder preserves localId and does not rewrite bytes", () => {
    const a = imageOrderItem(buildLocalDraftImageUrl("a"), "a");
    const b = imageOrderItem(buildLocalDraftImageUrl("b"), "b");
    const v = videoOrderItem("vid-1");
    const next = reorderMediaOrderByClientIds([a, v, b], "b", "a");
    expect(next?.map((i) => i.clientId)).toEqual(["b", "a", "vid-1"]);
    expect(webMocks.saveWebDraftImageBlob).not.toHaveBeenCalled();
  });

  it("L: mixed local image-video-image preserves exact order", () => {
    const images = [
      buildLocalDraftImageUrl("img-a"),
      buildLocalDraftImageUrl("img-b"),
    ];
    const { order } = bootstrapMediaOrder({
      images,
      videoLocalId: "vid-local",
      clientIdMap: {},
    });
    // bootstrap: video first then images (legacy bootstrap)
    expect(order.map((i) => i.clientId)).toEqual([
      "vid-local",
      "img-a",
      "img-b",
    ]);

    const rec = reconcileMediaOrder({
      currentOrder: [
        imageOrderItem(images[0], "img-a"),
        videoOrderItem("vid-local"),
        imageOrderItem(images[1], "img-b"),
      ],
      images,
      videoLocalId: "vid-local",
      clientIdMap: {
        [images[0]]: "img-a",
        [images[1]]: "img-b",
      },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual([
      "img-a",
      "vid-local",
      "img-b",
    ]);
  });

  it("M: media max 10 preserved", () => {
    expect(MAX_TOTAL_POST_MEDIA).toBe(10);
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("MAX_TOTAL_POST_MEDIA");
  });

  it("N/O: resume rebuilds from durable meta; missing assets pruned", async () => {
    writeDraftImagesMeta([
      baseDraftImage({ localId: "keep" }),
      baseDraftImage({
        localId: "gone",
        localReference: "pub-1/gone",
      }),
    ]);
    webMocks.hasWebDraftImageBlob.mockImplementation(
      async (_p: string, localId: string) => localId === "keep",
    );
    const result = await reconcileDraftImages({ publishPostId: "pub-1" });
    expect(result.kept.map((i) => i.localId)).toEqual(["keep"]);
    expect(result.removed.map((i) => i.localId)).toEqual(["gone"]);
    expect(readDraftImagesMeta().map((i) => i.localId)).toEqual(["keep"]);
  });

  it("P: no blob URL persisted in draftMeta / mediaOrder helpers", async () => {
    const draft = await persistDraftImage({
      publishPostId: "pub-1",
      localId: "x1",
      blob: new Blob([new Uint8Array([1])], { type: "image/webp" }),
      fileName: "x.webp",
    });
    const raw = storage.get("draftMeta") || "";
    expect(raw).not.toContain("blob:");
    expect(buildLocalDraftImageUrl(draft.localId)).not.toMatch(/^blob:/);

    writeDraftMediaOrderState({
      mediaOrder: [
        imageOrderItem(buildLocalDraftImageUrl(draft.localId), draft.localId),
      ],
      imageMediaClientIds: {
        [buildLocalDraftImageUrl(draft.localId)]: draft.localId,
      },
    });
    expect(storage.get("draftMeta") || "").not.toContain("blob:");
  });

  it("Q: object URL reused from session cache", async () => {
    let seq = 0;
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => `blob:test-${++seq}-${blob.size}`,
      revokeObjectURL: vi.fn(),
    });
    upsertDraftImageMeta(baseDraftImage());
    webMocks.loadWebDraftImageBlob.mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }),
    );
    const first = await resolveDraftImagePreview(baseDraftImage());
    const second = await resolveDraftImagePreview(baseDraftImage());
    expect(first.url).toBe(second.url);
    expect(first.source).toBe("idb-blob");
    expect(second.source).toBe("session-cache");
    expect(seq).toBe(1);
  });

  it("R/S: discard cleanup schedules local FS/IDB wipe (LI1C may also clean draft remotes)", () => {
    const drafts = read("src/lib/drafts.ts");
    expect(drafts).toContain("scheduleDraftImageDiscardCleanup");
    const discard = read("src/lib/createDraftImage/discardCleanup.ts");
    expect(discard).toContain("deleteWebDraftImagesForPost");
    expect(discard).toContain("deleteNativeDraftImagesForPost");
    expect(discard).toContain("isDraftOwnedPostStoragePath");
  });

  it("T/U: legacy remote + new local order coexist", () => {
    const remote = "user/post/abc.webp";
    const local = buildLocalDraftImageUrl("local-new");
    upsertDraftImageMeta(
      baseDraftImage({
        localId: "local-new",
        localReference: "pub-1/local-new",
      }),
    );
    storage.set(
      "draftActivities",
      JSON.stringify([{ images: [remote, local] }]),
    );
    writeDraftMediaOrderState({
      mediaOrder: [
        imageOrderItem(remote, "remote-cid"),
        imageOrderItem(local, "local-new"),
      ],
      imageMediaClientIds: {
        [remote]: "remote-cid",
        [local]: "local-new",
      },
    });
    const order = ensureDraftMediaOrderPersisted({
      images: [remote, local],
    });
    expect(order).toHaveLength(2);
    expect(order[0]).toMatchObject({
      kind: "image",
      url: remote,
      clientId: "remote-cid",
    });
    expect(order[1]).toMatchObject({
      kind: "image",
      url: local,
      clientId: "local-new",
    });
  });

  it("V/W/X/Y: Edit / Profile / Video / Feed untouched by LI1B preview wiring", () => {
    const profile = read("src/hooks/useProfilePhotoAddPipeline.ts");
    expect(profile).toContain("uploadPreparedProfilePhoto");
    expect(profile).not.toContain("persistDraftImage");

    const video = read("src/lib/createDraftVideo/types.ts");
    expect(video).toContain("DraftVideo");
    expect(video).not.toContain("DraftImage");

    const feed = read("src/components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("persistDraftImage");
    expect(feed).not.toContain("useCreateImagePreviewSrc");
  });

  it("Z: Publish no longer hard-blocks; LI1C uploads instead", () => {
    expect(hasUnpublishedLocalDraftImages()).toBe(false);
    upsertDraftImageMeta(baseDraftImage());
    expect(hasUnpublishedLocalDraftImages()).toBe(true);

    expect(cleanImagesForActivity(["draft-image/x.webp", "user/post/a.webp"])).toEqual([
      "user/post/a.webp",
    ]);
    expect(cleanImagesForActivity(["blob:http://x/1"])).toEqual([]);

    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("uploadSurvivingDraftImagesForPublish");
    expect(page).not.toContain("CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE");

    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("assertPublishImagePayloadHasNoLocalLeak");
    expect(publish).not.toContain("CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE");
    expect(CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE.length).toBeGreaterThan(20);
  });

  it("AA source: provider Create branch never uploads", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const idx = provider.indexOf("persistDraftImage({");
    expect(idx).toBeGreaterThan(0);
    const window = provider.slice(Math.max(0, idx - 400), idx + 500);
    expect(window).not.toContain("uploadNormalizedPostImage");
  });
});
