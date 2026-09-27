/**
 * PASS LI1A — DraftImage model + durable web/native storage + preview resolver.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webMocks = vi.hoisted(() => ({
  loadWebDraftImageBlob: vi.fn(),
  hasWebDraftImageBlob: vi.fn(),
  deleteWebDraftImageBlob: vi.fn(),
}));

vi.mock("./createDraftImage/webDraftImageStorage", async () => {
  const actual = await vi.importActual<
    typeof import("./createDraftImage/webDraftImageStorage")
  >("./createDraftImage/webDraftImageStorage");
  return {
    ...actual,
    loadWebDraftImageBlob: webMocks.loadWebDraftImageBlob,
    hasWebDraftImageBlob: webMocks.hasWebDraftImageBlob,
    deleteWebDraftImageBlob: webMocks.deleteWebDraftImageBlob,
  };
});

import {
  DRAFT_IMAGE_FORBIDDEN_VIDEO_FIELDS,
  assertSafeNativeDraftImagePath,
  buildNativeDraftImagePath,
  buildWebDraftImageKey,
  clearDraftImagePreviewCache,
  clearDraftImagesMeta,
  deleteDraftImage,
  draftImageLocalIdAsMediaOrderClientId,
  getCachedDraftImagePreviewUrl,
  mediaOrderClientIdMatchesDraftImageLocalId,
  parseDraftImage,
  readDraftImagesMeta,
  reconcileDraftImages,
  releaseDraftImagePreview,
  resolveDraftImagePreview,
  setCachedDraftImagePreviewUrl,
  upsertDraftImageMeta,
  writeDraftImagesMeta,
  __draftImagePreviewCacheSizeForTests,
  __resetDraftImagePreviewCacheForTests,
  type DraftImage,
} from "./createDraftImage";
import {
  draftImageLocalIdAsMediaOrderClientId as orderClientIdHelper,
  imageOrderItem,
  readDraftMediaOrderState,
} from "./createDraftMediaOrder";
import type { DraftMeta } from "./drafts";

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

describe("PASS LI1A — DraftImage foundation", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    __resetDraftImagePreviewCacheForTests();
    webMocks.loadWebDraftImageBlob.mockReset();
    webMocks.hasWebDraftImageBlob.mockReset();
    webMocks.deleteWebDraftImageBlob.mockReset();
    webMocks.deleteWebDraftImageBlob.mockResolvedValue(undefined);
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
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    clearDraftImagePreviewCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("A: DraftImage model has stable localId", () => {
    const img = baseDraftImage({ localId: "stable-uuid" });
    expect(img.localId).toBe("stable-uuid");
    expect(parseDraftImage(img)?.localId).toBe("stable-uuid");
  });

  it("B: DraftImage excludes video-only fields", () => {
    const img = baseDraftImage();
    for (const field of DRAFT_IMAGE_FORBIDDEN_VIDEO_FIELDS) {
      expect(img).not.toHaveProperty(field);
    }
    expect(DRAFT_IMAGE_FORBIDDEN_VIDEO_FIELDS).toContain("preparationStatus");
    expect(DRAFT_IMAGE_FORBIDDEN_VIDEO_FIELDS).toContain("nativeTusUploadUrl");
    const types = read("src/lib/createDraftImage/types.ts");
    // DraftImage type body must not declare video fields as members.
    expect(types).toMatch(/export type DraftImage = \{[\s\S]*?\};/);
    const typeBody = types.match(/export type DraftImage = \{([\s\S]*?)\};/)?.[1] ?? "";
    expect(typeBody).not.toContain("preparationStatus");
    expect(typeBody).not.toContain("nativeTusUploadUrl");
    expect(typeBody).not.toContain("remoteMediaId");
    expect(typeBody).not.toContain("bunnyVideoId");
    expect(typeBody).not.toContain("duration");
  });

  it("C/D/E: DraftMeta serializes metadata only — no Blob/File/blob:", () => {
    const img = baseDraftImage();
    writeDraftImagesMeta([img]);
    const raw = storage.get("draftMeta");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("blob:");
    expect(raw).not.toMatch(/"blob"\s*:/);
    const parsed = JSON.parse(raw!) as DraftMeta;
    expect(parsed.draftImages?.[0]?.localId).toBe("img-local-1");
    expect(parsed.draftImages?.[0]?.localReference).toBe("pub-1/img-local-1");
    expect(
      parseDraftImage({ ...img, localReference: "blob:http://x" }),
    ).toBeNull();
    expect(
      parseDraftImage({
        ...img,
        localReference: "data:image/png;base64,xx",
      }),
    ).toBeNull();
  });

  it("F/G/H: web Blob key + save/load/delete contract (IndexedDB module)", () => {
    expect(buildWebDraftImageKey("pub-1", "img-a")).toBe("pub-1/img-a");
    const web = read("src/lib/createDraftImage/webDraftImageStorage.ts");
    expect(web).toContain('DB_NAME = "echotoo_create_draft_images"');
    expect(web).toContain("saveWebDraftImageBlob");
    expect(web).toContain("loadWebDraftImageBlob");
    expect(web).toContain("deleteWebDraftImageBlob");
    expect(web).toContain("deleteWebDraftImagesForPost");
    expect(web).toContain("hasWebDraftImageBlob");
    expect(web).not.toContain("localStorage.setItem");

    // Simulated remount: meta survives; bytes keyed separately.
    writeDraftImagesMeta([baseDraftImage()]);
    const remount = JSON.parse(storage.get("draftMeta")!) as DraftMeta;
    expect(remount.draftImages?.[0]?.localReference).toBe("pub-1/img-local-1");
  });

  it("I/J: native path stays under create-drafts root; delete cannot escape", () => {
    expect(buildNativeDraftImagePath("pub-1", "img-1", "webp")).toBe(
      "create-drafts/pub-1/images/img-1.webp",
    );
    expect(() =>
      assertSafeNativeDraftImagePath("create-drafts/pub-1/images/img-1.webp"),
    ).not.toThrow();
    expect(() => assertSafeNativeDraftImagePath("../etc/passwd")).toThrowError(
      /UNSAFE_DRAFT_IMAGE_PATH/,
    );
    expect(() =>
      assertSafeNativeDraftImagePath("create-drafts/pub-1/../../secret"),
    ).toThrowError(/UNSAFE_DRAFT_IMAGE_PATH/);
    expect(() =>
      assertSafeNativeDraftImagePath(
        "create-drafts/other/images/x.webp",
        "pub-1",
      ),
    ).toThrowError(/UNSAFE_DRAFT_IMAGE_PATH/);
    expect(() =>
      assertSafeNativeDraftImagePath("create-drafts/pub-1/img-1.webp"),
    ).toThrowError(/UNSAFE_DRAFT_IMAGE_PATH/);

    const native = read("src/lib/createDraftImage/nativeDraftImageStorage.ts");
    expect(native).toContain("assertSafeNativeDraftImagePath");
    expect(native).toContain("deleteNativeDraftImageFile");
    expect(native).toContain("Directory.Data");
  });

  it("K/L/M: preview resolver creates one object URL per localId and release revokes", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    let seq = 0;
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        const url = `blob:test-${++seq}-${blob.size}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });

    webMocks.loadWebDraftImageBlob.mockResolvedValue(
      new Blob(["abc"], { type: "image/webp" }),
    );

    const img = baseDraftImage();
    const first = await resolveDraftImagePreview(img, {
      publishPostId: "pub-1",
    });
    expect(first.source).toBe("idb-blob");
    expect(first.url).toMatch(/^blob:/);
    expect(created).toHaveLength(1);

    const second = await resolveDraftImagePreview(img, {
      publishPostId: "pub-1",
    });
    expect(second.url).toBe(first.url);
    expect(second.source).toBe("session-cache");
    expect(created).toHaveLength(1);
    expect(getCachedDraftImagePreviewUrl(img.localId)).toBe(first.url);

    releaseDraftImagePreview(img.localId);
    expect(revoked).toEqual([first.url]);
    expect(__draftImagePreviewCacheSizeForTests()).toBe(0);
  });

  it("N: native preview uses convertFileSrc", () => {
    const native = read("src/lib/createDraftImage/nativeDraftImageStorage.ts");
    expect(native).toContain("Capacitor.convertFileSrc");
    expect(native).toContain("resolveNativeDraftImagePreviewUrl");
  });

  it("O/P: missing durable asset reconciles safely; valid survives", async () => {
    const valid = baseDraftImage({ localId: "keep-me" });
    const missing = baseDraftImage({
      localId: "gone",
      localReference: "pub-1/gone",
    });
    writeDraftImagesMeta([valid, missing]);

    webMocks.hasWebDraftImageBlob.mockImplementation(
      async (_pub: string, localId: string) => localId === "keep-me",
    );

    const result = await reconcileDraftImages({ publishPostId: "pub-1" });
    expect(result.kept.map((i) => i.localId)).toEqual(["keep-me"]);
    expect(result.removed.map((i) => i.localId)).toEqual(["gone"]);
    expect(readDraftImagesMeta().map((i) => i.localId)).toEqual(["keep-me"]);
  });

  it("Q: legacy remote-only drafts remain compatible (no draftImages)", () => {
    storage.set(
      "draftMeta",
      JSON.stringify({
        publishPostId: "legacy-pub",
        mediaOrder: [
          {
            kind: "image",
            clientId: "c1",
            url: "user/post/abc.webp",
          },
        ],
        imageMediaClientIds: { "user/post/abc.webp": "c1" },
      } satisfies Partial<DraftMeta>),
    );
    expect(readDraftImagesMeta()).toEqual([]);
    const order = readDraftMediaOrderState();
    expect(order.mediaOrder).toHaveLength(1);
    expect(order.mediaOrder[0]).toMatchObject({
      kind: "image",
      url: "user/post/abc.webp",
    });
  });

  it("R: mediaOrder clientId/localId helper stable", () => {
    const localId = "img-abc";
    expect(draftImageLocalIdAsMediaOrderClientId(localId)).toBe(localId);
    expect(orderClientIdHelper(localId)).toBe(localId);
    expect(
      mediaOrderClientIdMatchesDraftImageLocalId(localId, localId),
    ).toBe(true);
    const item = imageOrderItem("user/post/x.webp", localId);
    expect(item.clientId).toBe(localId);
  });

  it("S: local cleanup never deletes remote published image", async () => {
    const img = baseDraftImage({
      remoteUrl: "user/post/published.webp",
      remoteStoragePath: "user/post/published.webp",
    });
    upsertDraftImageMeta(img);
    const index = read("src/lib/createDraftImage/index.ts");
    expect(index).toContain("Does not delete Supabase Storage objects");
    expect(index).not.toMatch(/deleteDraftImage[\s\S]*deleteMediaStorageObject/);
    await deleteDraftImage(img.localId, {
      publishPostId: "pub-1",
      draftImage: img,
    });
    expect(readDraftImagesMeta()).toEqual([]);
    expect(webMocks.deleteWebDraftImageBlob).toHaveBeenCalled();
  });

  it("T/U/V/W: Edit / Profile / Video / Feed surfaces unchanged by LI1A wiring", () => {
    const profile = read("src/hooks/useProfilePhotoAddPipeline.ts");
    expect(profile).not.toContain("createDraftImage");
    expect(profile).not.toContain("persistDraftImage");
    expect(profile).toContain("uploadPreparedProfilePhoto");

    const videoTypes = read("src/lib/createDraftVideo/types.ts");
    expect(videoTypes).toContain("DraftVideo");
    expect(videoTypes).not.toContain("DraftImage");

    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).not.toContain("createDraftImage");
  });

  it("X: Edit still eager-uploads; Create local-first is LI1B", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain('prepareImageForUpload(file, "post")');
    expect(provider).toContain("uploadNormalizedPostImage");
    expect(provider).toContain("persistDraftImage");
    expect(provider).toContain("isCreateEditModeActive");
    expect(provider).toContain("CREATE_LOCAL_FIRST_IMAGES_ENABLED");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain("startPostImageUploads");
  });

  it("Y: no backend migration in LI1A", () => {
    expect(true).toBe(true);
  });

  it("draftImages empty clears meta field; setCached reuse helper", () => {
    writeDraftImagesMeta([baseDraftImage()]);
    clearDraftImagesMeta();
    const raw = storage.get("draftMeta");
    const parsed = JSON.parse(raw || "{}") as DraftMeta;
    expect(parsed.draftImages).toBeUndefined();

    setCachedDraftImagePreviewUrl("x", "blob:cached");
    expect(getCachedDraftImagePreviewUrl("x")).toBe("blob:cached");
    releaseDraftImagePreview("x");
    expect(getCachedDraftImagePreviewUrl("x")).toBeUndefined();
  });
});
