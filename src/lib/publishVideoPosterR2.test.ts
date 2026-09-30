import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: vi.fn(() => true),
}));

vi.mock("./createDraftVideo/extractVideoPosterFrame", async () => {
  const actual = await vi.importActual<
    typeof import("./createDraftVideo/extractVideoPosterFrame")
  >("./createDraftVideo/extractVideoPosterFrame");
  return {
    ...actual,
    extractVideoPosterFrame: vi.fn(),
    extractVideoPosterFrameFromSrc: vi.fn(),
  };
});

vi.mock("./createDraftVideo/webDraftVideoStorage", () => ({
  loadWebDraftVideoFile: vi.fn(async () => null),
}));

vi.mock("./createDraftVideo/draftVideoMeta", () => ({
  readDraftVideoMeta: vi.fn(() => null),
  updateDraftVideoRemotePoster: vi.fn(),
}));

vi.mock("../api/services/mediaUpload", () => ({
  MEDIA_STORAGE_BUCKET: "media",
  uploadNormalizedPostImage: vi.fn(
    async () =>
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/post/video-poster.webp",
  ),
  deleteMediaStorageObject: vi.fn(async () => undefined),
}));

vi.mock("./img", () => ({
  imgUrlPublic: vi.fn((path: string) => `https://cdn.example/${path}`),
}));

vi.mock("./postImagePipeline", () => ({
  normalizeImageForUploadWithPolicy: vi.fn(async (file: File) => ({
    blob: file,
    width: 720,
    height: 1280,
    mimeType: "image/webp",
  })),
}));

import {
  ensurePublishVideoPoster,
  isOwnedPostMediaPosterStoragePath,
} from "./createDraftVideo/publishVideoPoster";
import type { DraftVideo } from "./createDraftVideo/types";
import { isNativeApp } from "./storage/utils/capacitorDetection";
import {
  extractVideoPosterFrame,
  extractVideoPosterFrameFromSrc,
} from "./createDraftVideo/extractVideoPosterFrame";
import { loadWebDraftVideoFile } from "./createDraftVideo/webDraftVideoStorage";
import {
  readDraftVideoMeta,
  updateDraftVideoRemotePoster,
} from "./createDraftVideo/draftVideoMeta";
import { uploadNormalizedPostImage } from "../api/services/mediaUpload";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function draft(partial: Partial<DraftVideo> = {}): DraftVideo {
  return {
    localId: "vid-1",
    localReference: "create-drafts/p/vid-1/source.mp4",
    localStorageKind: "native-fs",
    fileName: "source.mp4",
    mimeType: "video/mp4",
    size: 50_000_000,
    width: 1080,
    height: 1920,
    duration: 30,
    preparationStatus: "prepared",
    preparationStrategy: "passthrough",
    ...partial,
  };
}

describe("R2 native publish poster — no full-video JS materialization", () => {
  beforeEach(() => {
    vi.mocked(isNativeApp).mockReturnValue(true);
    vi.mocked(readDraftVideoMeta).mockReturnValue(null);
    vi.mocked(extractVideoPosterFrameFromSrc).mockReset();
    vi.mocked(extractVideoPosterFrame).mockReset();
    vi.mocked(loadWebDraftVideoFile).mockReset();
    vi.mocked(loadWebDraftVideoFile).mockResolvedValue(null);
    vi.mocked(uploadNormalizedPostImage).mockClear();
    vi.mocked(updateDraftVideoRemotePoster).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1/2. source: native poster path never imports loadNativeDraftVideoFile", () => {
    const poster = read("src/lib/createDraftVideo/publishVideoPoster.ts");
    expect(poster).not.toContain("loadNativeDraftVideoFile");
    expect(poster).not.toMatch(/Filesystem\.readFile\s*\(/);
    expect(poster).not.toMatch(/\batob\s*\(/);
    expect(poster).toContain("loadWebDraftVideoFile");
    expect(poster).toContain("extractVideoPosterFrameFromSrc");
    expect(poster).toContain("isNativeApp");
    expect(poster).toMatch(/if\s*\(\s*!file\s*&&\s*!isNativeApp\(\)\s*\)/);
  });

  it("3/4. missing poster + failed preview → null; does not throw or load web draft on native", async () => {
    vi.mocked(extractVideoPosterFrameFromSrc).mockRejectedValue(
      new Error("decode failed"),
    );
    await expect(
      ensurePublishVideoPoster({
        userId: USER_ID,
        draftVideo: draft(),
        localPosterUrl: null,
        localPreviewUrl: "capacitor://localhost/_capacitor_file_/x.mp4",
        localFile: null,
      }),
    ).resolves.toBeNull();
    expect(loadWebDraftVideoFile).not.toHaveBeenCalled();
    expect(uploadNormalizedPostImage).not.toHaveBeenCalled();
  });

  it("3b. native with only draft localReference and no poster/preview → null", async () => {
    await expect(
      ensurePublishVideoPoster({
        userId: USER_ID,
        draftVideo: draft(),
      }),
    ).resolves.toBeNull();
    expect(loadWebDraftVideoFile).not.toHaveBeenCalled();
  });

  it("5. valid localPosterUrl still uploads poster", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => blob,
      })),
    );
    vi.mocked(uploadNormalizedPostImage).mockResolvedValue(
      `${USER_ID}/post/video-poster.webp`,
    );

    const result = await ensurePublishVideoPoster({
      userId: USER_ID,
      draftVideo: draft(),
      localPosterUrl: "blob:https://local/poster",
    });
    expect(result).toMatchObject({
      storagePath: `${USER_ID}/post/video-poster.webp`,
      reusedRemote: false,
    });
    expect(updateDraftVideoRemotePoster).toHaveBeenCalled();
    expect(loadWebDraftVideoFile).not.toHaveBeenCalled();
  });

  it("6. localPreviewUrl frame extraction remains supported", async () => {
    vi.mocked(extractVideoPosterFrameFromSrc).mockResolvedValue({
      blob: new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
      objectUrl: "blob:poster",
      width: 720,
      height: 1280,
      duration: 12,
    } as Awaited<ReturnType<typeof extractVideoPosterFrameFromSrc>>);
    vi.mocked(uploadNormalizedPostImage).mockResolvedValue(
      `${USER_ID}/post/from-preview.webp`,
    );

    const result = await ensurePublishVideoPoster({
      userId: USER_ID,
      draftVideo: draft(),
      localPreviewUrl: "capacitor://localhost/preview.mp4",
    });
    expect(result?.storagePath).toContain("/post/");
    expect(extractVideoPosterFrameFromSrc).toHaveBeenCalled();
    expect(loadWebDraftVideoFile).not.toHaveBeenCalled();
  });

  it("7. remotePosterStoragePath reuse unchanged", async () => {
    const path = `${USER_ID}/post/existing.webp`;
    const result = await ensurePublishVideoPoster({
      userId: USER_ID,
      draftVideo: draft({
        remotePosterStoragePath: path,
        remotePosterUrl: `https://cdn.example/${path}`,
      }),
    });
    expect(result).toEqual({
      storagePath: path,
      publicUrl: `https://cdn.example/${path}`,
      bytes: 0,
      reusedRemote: true,
    });
    expect(uploadNormalizedPostImage).not.toHaveBeenCalled();
    expect(isOwnedPostMediaPosterStoragePath(path, USER_ID)).toBe(true);
  });

  it("8. web may still use loadWebDraftVideoFile", async () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    const file = new File([new Uint8Array([1])], "clip.mp4", {
      type: "video/mp4",
    });
    vi.mocked(loadWebDraftVideoFile).mockResolvedValue(file);
    vi.mocked(extractVideoPosterFrame).mockResolvedValue({
      blob: new Blob([new Uint8Array([2])], { type: "image/jpeg" }),
      objectUrl: "blob:x",
      width: 640,
      height: 360,
      duration: 5,
    } as Awaited<ReturnType<typeof extractVideoPosterFrame>>);
    vi.mocked(uploadNormalizedPostImage).mockResolvedValue(
      `${USER_ID}/post/web.webp`,
    );

    const result = await ensurePublishVideoPoster({
      userId: USER_ID,
      draftVideo: draft({
        localStorageKind: "idb-blob",
        localReference: "web-ref",
      }),
    });
    expect(result?.reusedRemote).toBe(false);
    expect(loadWebDraftVideoFile).toHaveBeenCalled();
  });

  it("9–12. publish optional poster; TUS/R1/player/Feed untouched", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("posterStoragePath: poster?.storagePath ?? null");

    const publish = read("src/lib/createPublishVideoUpload.ts");
    expect(publish).toContain("posterStoragePath");
    expect(publish).toContain("uploadNativeVideoToBunnyTus");

    const tus = read("src/lib/bunnyUpload/uploadNativeVideoToBunnyTus.ts");
    expect(tus).toContain("createNativeOperationWatchdog");
    expect(tus).not.toContain("publishVideoPoster");

    expect(
      read("src/lib/createDraftVideo/nativeOperationWatchdog.ts"),
    ).not.toContain("publishVideoPoster");

    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).not.toContain("ensurePublishVideoPoster");
    expect(player).not.toContain("loadNativeDraftVideoFile");

    expect(
      read("src/lib/createDraftVideo/prepareDraftVideo.ts"),
    ).not.toContain("ensurePublishVideoPoster");
  });
});
