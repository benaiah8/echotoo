/**
 * PASS LI1C — publish-time DraftImage upload + retry + cleanup.
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

const uploadMocks = vi.hoisted(() => ({
  uploadNormalizedPostImage: vi.fn(),
  deleteMediaStorageObject: vi.fn(),
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

vi.mock("../api/services/mediaUpload", async () => {
  const actual = await vi.importActual<
    typeof import("../api/services/mediaUpload")
  >("../api/services/mediaUpload");
  return {
    ...actual,
    uploadNormalizedPostImage: uploadMocks.uploadNormalizedPostImage,
    deleteMediaStorageObject: uploadMocks.deleteMediaStorageObject,
  };
});

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => false,
}));

import {
  PUBLISH_DRAFT_IMAGE_UPLOAD_CONCURRENCY,
  applyCombinedMediaProgress,
  assertPublishImagePayloadHasNoLocalLeak,
  buildLocalDraftImageUrl,
  cleanupDraftImagesAfterSuccessfulPublish,
  createCombinedMediaProgressState,
  draftImageReusableRemotePath,
  isDraftOwnedPostStoragePath,
  mapActivityImagesToRemotePaths,
  mapMediaOrderImagesToRemotePaths,
  readDraftImagesMeta,
  selectSurvivingDraftImagesForPublish,
  snapshotCreatePublishMedia,
  updateDraftImageRemoteFields,
  uploadSurvivingDraftImagesForPublish,
  upsertDraftImageMeta,
  clearDraftImagesMeta,
  type DraftImage,
} from "./createDraftImage";
import {
  imageOrderItem,
  videoOrderItem,
  type DraftMediaOrderItem,
} from "./createDraftMediaOrder";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseDraftImage(overrides: Partial<DraftImage> = {}): DraftImage {
  return {
    localId: "img-a",
    fileName: "a.webp",
    mimeType: "image/webp",
    size: 1000,
    localStorageKind: "idb-blob",
    localReference: "pub-1/img-a",
    remoteUrl: null,
    remoteStoragePath: null,
    ...overrides,
  };
}

describe("PASS LI1C — publish-time DraftImage upload", () => {
  const storage = new Map<string, string>();
  const userId = "user-aaa-bbb-ccc";

  beforeEach(() => {
    storage.clear();
    webMocks.loadWebDraftImageBlob.mockReset();
    webMocks.deleteWebDraftImagesForPost.mockReset();
    webMocks.hasWebDraftImageBlob.mockResolvedValue(true);
    webMocks.loadWebDraftImageBlob.mockResolvedValue(
      new Blob([new Uint8Array(32)], { type: "image/webp" }),
    );
    webMocks.deleteWebDraftImagesForPost.mockResolvedValue(undefined);
    uploadMocks.uploadNormalizedPostImage.mockReset();
    uploadMocks.deleteMediaStorageObject.mockReset();
    uploadMocks.uploadNormalizedPostImage.mockImplementation(
      async () => `${userId}/post/${crypto.randomUUID()}.webp`,
    );
    uploadMocks.deleteMediaStorageObject.mockResolvedValue({ ok: true });

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
      /* ignore */
    }
    vi.unstubAllGlobals();
  });

  it("A: Create selection still does not call Storage upload", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.indexOf("// NEW Create (LI1B)");
    const branch = provider.slice(start, start + 1800);
    expect(branch).toContain("persistDraftImage");
    expect(branch).not.toContain("uploadNormalizedPostImage");
  });

  it("B/C/D/E/G: upload surviving optimized images; concurrency <= 2; persist remote immediately", async () => {
    expect(PUBLISH_DRAFT_IMAGE_UPLOAD_CONCURRENCY).toBe(2);
    const a = baseDraftImage({ localId: "img-a", size: 100 });
    const b = baseDraftImage({
      localId: "img-b",
      size: 200,
      localReference: "pub-1/img-b",
    });
    const removed = baseDraftImage({
      localId: "img-removed",
      localReference: "pub-1/img-removed",
    });
    upsertDraftImageMeta(a);
    upsertDraftImageMeta(b);
    upsertDraftImageMeta(removed);

    const mediaOrder: DraftMediaOrderItem[] = [
      imageOrderItem(buildLocalDraftImageUrl("img-a"), "img-a"),
      imageOrderItem(buildLocalDraftImageUrl("img-b"), "img-b"),
    ];
    const snapshot = snapshotCreatePublishMedia({
      publishPostId: "pub-1",
      mediaOrder,
      draftImages: readDraftImagesMeta(),
    });
    expect(selectSurvivingDraftImagesForPublish(snapshot).map((i) => i.localId)).toEqual([
      "img-a",
      "img-b",
    ]);

    let maxInFlight = 0;
    let inFlight = 0;
    uploadMocks.uploadNormalizedPostImage.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return `${userId}/post/${crypto.randomUUID()}.webp`;
    });

    const result = await uploadSurvivingDraftImagesForPublish({
      snapshot,
      userId,
    });
    expect(result.ok).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(uploadMocks.uploadNormalizedPostImage).toHaveBeenCalledTimes(2);
    const firstCall = uploadMocks.uploadNormalizedPostImage.mock.calls[0]![0];
    expect(firstCall.blob).toBeInstanceOf(Blob);
    expect(webMocks.loadWebDraftImageBlob).toHaveBeenCalled();

    const meta = readDraftImagesMeta();
    expect(meta.find((i) => i.localId === "img-a")?.remoteStoragePath).toMatch(
      new RegExp(`^${userId}/post/`),
    );
    expect(meta.find((i) => i.localId === "img-removed")?.remoteStoragePath).toBeFalsy();
  });

  it("F/K/L: completion order cannot reorder; mixed + legacy mapping", () => {
    const localIdToRemote = {
      "img-a": `${userId}/post/aaa.webp`,
      "img-b": `${userId}/post/bbb.webp`,
    };
    const order: DraftMediaOrderItem[] = [
      imageOrderItem(buildLocalDraftImageUrl("img-a"), "img-a"),
      videoOrderItem("vid-1"),
      imageOrderItem(buildLocalDraftImageUrl("img-b"), "img-b"),
    ];
    const mapped = mapMediaOrderImagesToRemotePaths(order, localIdToRemote);
    expect(mapped.map((i) => (i.kind === "image" ? i.url : i.clientId))).toEqual([
      `${userId}/post/aaa.webp`,
      "vid-1",
      `${userId}/post/bbb.webp`,
    ]);

    const mixed = mapActivityImagesToRemotePaths(
      ["user/post/legacy.webp", buildLocalDraftImageUrl("img-b")],
      localIdToRemote,
    );
    expect(mixed).toEqual([
      "user/post/legacy.webp",
      `${userId}/post/bbb.webp`,
    ]);
  });

  it("H/I: retry skips already-uploaded; failed clears only missing", async () => {
    const a = baseDraftImage({
      localId: "img-a",
      remoteStoragePath: `${userId}/post/already.webp`,
    });
    const b = baseDraftImage({
      localId: "img-b",
      localReference: "pub-1/img-b",
      size: 50,
    });
    upsertDraftImageMeta(a);
    upsertDraftImageMeta(b);
    const snapshot = snapshotCreatePublishMedia({
      publishPostId: "pub-1",
      mediaOrder: [
        imageOrderItem(buildLocalDraftImageUrl("img-a"), "img-a"),
        imageOrderItem(buildLocalDraftImageUrl("img-b"), "img-b"),
      ],
      draftImages: readDraftImagesMeta(),
    });

    uploadMocks.uploadNormalizedPostImage.mockResolvedValueOnce(
      `${userId}/post/new-b.webp`,
    );
    const result = await uploadSurvivingDraftImagesForPublish({
      snapshot,
      userId,
    });
    expect(result.ok).toBe(true);
    expect(uploadMocks.uploadNormalizedPostImage).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.localIdToRemotePath["img-a"]).toBe(
        `${userId}/post/already.webp`,
      );
      expect(result.localIdToRemotePath["img-b"]).toBe(
        `${userId}/post/new-b.webp`,
      );
    }
  });

  it("M/N/O: no sentinel/blob leak; unresolved blocks mapping", () => {
    expect(() =>
      assertPublishImagePayloadHasNoLocalLeak(
        [[buildLocalDraftImageUrl("x")]],
        [],
      ),
    ).toThrow("PUBLISH_LOCAL_IMAGE_LEAK");
    expect(() =>
      assertPublishImagePayloadHasNoLocalLeak([["blob:http://x"]], []),
    ).toThrow("PUBLISH_LOCAL_IMAGE_LEAK");
    expect(() =>
      mapActivityImagesToRemotePaths([buildLocalDraftImageUrl("missing")], {}),
    ).toThrow("UNRESOLVED_LOCAL_DRAFT_IMAGE");
  });

  it("P/Q/R source: Finalize retains remotes on failure paths", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("uploadSurvivingDraftImagesForPublish");
    expect(page).toContain("cleanupDraftImagesAfterSuccessfulPublish");
    expect(page).not.toContain("CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE");
    expect(page).toContain("localIdToRemotePath");
  });

  it("S/T/U: success cleanup deletes local only — not Storage", async () => {
    upsertDraftImageMeta(
      baseDraftImage({
        remoteStoragePath: `${userId}/post/x.webp`,
      }),
    );
    await cleanupDraftImagesAfterSuccessfulPublish("pub-1");
    expect(webMocks.deleteWebDraftImagesForPost).toHaveBeenCalledWith("pub-1");
    expect(uploadMocks.deleteMediaStorageObject).not.toHaveBeenCalled();
    expect(readDraftImagesMeta()).toEqual([]);
  });

  it("V/W/X/Y: draft-owned path guard; never delete published/edit paths", () => {
    expect(isDraftOwnedPostStoragePath(`${userId}/post/abc.webp`, userId)).toBe(
      true,
    );
    expect(
      isDraftOwnedPostStoragePath(`${userId}/avatar/abc.webp`, userId),
    ).toBe(false);
    expect(
      isDraftOwnedPostStoragePath("other-user/post/abc.webp", userId),
    ).toBe(false);
    expect(
      isDraftOwnedPostStoragePath("https://cdn.example/x.webp", userId),
    ).toBe(false);

    const img = baseDraftImage({
      remoteStoragePath: `${userId}/post/abc.webp`,
    });
    expect(draftImageReusableRemotePath(img, userId)).toBe(
      `${userId}/post/abc.webp`,
    );
    expect(draftImageReusableRemotePath(img, "other")).toBeNull();

    const discard = read("src/lib/createDraftImage/discardCleanup.ts");
    expect(discard).toContain("isDraftOwnedPostStoragePath");
    expect(discard).toContain("deleteMediaStorageObject");
  });

  it("Z/AA/AB/AC: combined progress monotonic", () => {
    let state = createCombinedMediaProgressState({
      images: [baseDraftImage({ size: 100 }), baseDraftImage({ size: 100 })],
      videoBytes: 200,
    });
    let r = applyCombinedMediaProgress(state, { imageCompletedBytes: 100 });
    state = r.state;
    expect(r.percent).toBe(25);
    r = applyCombinedMediaProgress(state, { videoPercent: 50 });
    state = r.state;
    expect(r.percent).toBe(50);
    r = applyCombinedMediaProgress(state, { videoPercent: 25 });
    expect(r.percent).toBe(50); // high-water — no backward jump
  });

  it("AD/AE/AF/AG/AH: cancel/edit/profile/feed wiring", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("publishImageAbortRef");
    expect(page).toContain("Cancel upload");

    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("isCreateEditModeActive");
    expect(provider).toContain("uploadNormalizedPostImage");

    const profile = read("src/hooks/useProfilePhotoAddPipeline.ts");
    expect(profile).toContain("uploadPreparedProfilePhoto");
    expect(profile).not.toContain("uploadSurvivingDraftImagesForPublish");

    const feed = read("src/components/PublishedMediaSurface.tsx");
    expect(feed).not.toContain("uploadSurvivingDraftImagesForPublish");
  });

  it("publish block removed from createFlowPublish", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).not.toContain("CREATE_LOCAL_FIRST_IMAGES_PUBLISH_BLOCKED_MESSAGE");
    expect(publish).toContain("assertPublishImagePayloadHasNoLocalLeak");
  });
});
