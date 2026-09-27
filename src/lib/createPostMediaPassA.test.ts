import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MediaResult } from "@capacitor/camera";
import {
  CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS,
  CREATE_FINALIZE_DOCK_BOTTOM_CSS,
  CREATE_FINALIZE_DOCK_STACK_CLASS,
  CREATE_FINALIZE_DOCK_STACK_ORDER,
} from "./createFinalizeMediaDockLayout";
import {
  computeExpandedMediaTrayMaxHeightPx,
  EXPANDED_MEDIA_TRAY_MAX_HEIGHT,
} from "./createFinalizeVideoHeroFrame";
import {
  FINALIZE_MEDIA_THUMB_WIDTH_FRACTION,
  finalizeMediaThumbShellClass,
} from "./createFinalizeMediaThumb";
import {
  nativeVideoPickFromMediaResult,
  resolveNativeVideoPersistStrategy,
  resolveNativeVideoSourceUri,
} from "./mediaAcquisitionVideo";
import { partitionNativePickedMedia, routeWebLibraryFiles } from "./createPostMediaRouting";

const copyMock = vi.hoisted(() => vi.fn());
const writeMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());
const deleteFileMock = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    mkdir: mkdirMock,
    copy: copyMock,
    writeFile: writeMock,
    stat: statMock,
    deleteFile: deleteFileMock,
  },
  Directory: { Data: "DATA" },
}));

import { saveNativeDraftVideoFromUri } from "./createDraftVideo/nativeDraftVideoStorage";

const mp4 = (name = "clip.mp4", size = 1024, lastModified = 1) =>
  new File(["video"], name, { type: "video/mp4", lastModified });

const jpg = (name = "photo.jpg") =>
  new File(["image"], name, { type: "image/jpeg" });

function videoMediaResult(overrides: Partial<MediaResult> = {}): MediaResult {
  return {
    type: 1,
    uri: "content://media/external/video/42",
    path: "/storage/emulated/0/DCIM/clip.mp4",
    webPath: "capacitor://localhost/_capacitor_file_/clip.mp4",
    format: "mp4",
    metadata: { format: "mp4" },
    ...overrides,
  } as MediaResult;
}

describe("PASS A — native gallery video preserves native URI", () => {
  it("A: gallery video pick prefers durable path over content:// uri", async () => {
    const pick = await nativeVideoPickFromMediaResult(
      videoMediaResult(),
      "library",
      {
        isNativePlatform: true,
        statNativeVideoUri: async () => 5_000_000,
      },
    );

    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.pick.nativeSourceUri).toBe(
      "/storage/emulated/0/DCIM/clip.mp4",
    );
    expect(pick.pick.nativeSourceUri).not.toContain("capacitor://");
    expect(pick.pick.nativeSourceUri).not.toContain("content://");
    expect(pick.pick.sizeBytes).toBe(5_000_000);
  });

  it("A2: content:// alone is kept when no filesystem path is present", async () => {
    const pick = await nativeVideoPickFromMediaResult(
      {
        ...videoMediaResult({
          uri: "content://media/external/video/42",
        }),
        path: undefined,
      } as MediaResult,
      "library",
      {
        isNativePlatform: true,
        statNativeVideoUri: async () => 5_000_000,
      },
    );

    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.pick.nativeSourceUri).toBe("content://media/external/video/42");
  });

  it("partitionNativePickedMedia forwards video nativeSourceUri and sizeBytes", () => {
    const partitioned = partitionNativePickedMedia(
      [
        {
          kind: "video",
          file: mp4(),
          nativeSourceUri: "file:///storage/emulated/0/DCIM/clip.mp4",
          sizeBytes: 5_000_000,
        },
      ],
      { hasActiveVideo: false, imageSlotsRemaining: 10 },
    );
    expect(partitioned.video).not.toBeNull();
    expect(partitioned.videoNativeSourceUri).toBe(
      "file:///storage/emulated/0/DCIM/clip.mp4",
    );
    expect(partitioned.videoSizeBytes).toBe(5_000_000);
  });
});

describe("PASS A — recorded video preserves native URI", () => {
  it("B: camera record result prefers uri/path over webPath", async () => {
    const pick = await nativeVideoPickFromMediaResult(
      {
        ...videoMediaResult(),
        uri: "file:///data/user/0/app/cache/recorded.mp4",
        path: "/data/user/0/app/cache/recorded.mp4",
        webPath: "capacitor://localhost/_capacitor_file_/recorded.mp4",
      } as MediaResult,
      "camera",
      {
        isNativePlatform: true,
        statNativeVideoUri: async () => 2_000_000,
      },
    );

    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.pick.nativeSourceUri).toBe(
      "file:///data/user/0/app/cache/recorded.mp4",
    );
  });
});

describe("PASS A — native URI persistence strategy", () => {
  it("C: resolveNativeVideoPersistStrategy chooses uri-copy on native", () => {
    expect(
      resolveNativeVideoPersistStrategy({
        nativeSourceUri: "content://video/1",
        isNativePlatform: true,
      }),
    ).toBe("uri-copy");
  });

  it("E: falls back to file-bytes when native URI unavailable", () => {
    expect(
      resolveNativeVideoPersistStrategy({
        nativeSourceUri: null,
        isNativePlatform: true,
      }),
    ).toBe("file-bytes");
    expect(
      resolveNativeVideoPersistStrategy({
        nativeSourceUri: "content://video/1",
        isNativePlatform: false,
      }),
    ).toBe("file-bytes");
  });
});

describe("PASS A — saveNativeDraftVideoFromUri copy before bytes", () => {
  beforeEach(() => {
    copyMock.mockReset();
    writeMock.mockReset();
    mkdirMock.mockReset();
    statMock.mockReset();
    deleteFileMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    deleteFileMock.mockResolvedValue(undefined);
  });

  it("D: successful URI copy does not read file bytes", async () => {
    copyMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 1024 });
    const file = mp4();
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");

    const result = await saveNativeDraftVideoFromUri(
      "post-1",
      "local-1",
      "content://video/99",
      file,
    );

    expect(result.strategy).toBe("uri-copy");
    expect(copyMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "content://video/99" }),
    );
    expect(statMock).toHaveBeenCalled();
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    arrayBufferSpy.mockRestore();
  });

  it("E: URI copy failure never uses JS arrayBuffer/btoa recovery", async () => {
    copyMock.mockRejectedValue(new Error("copy failed"));

    const file = mp4();
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");

    await expect(
      saveNativeDraftVideoFromUri(
        "post-1",
        "local-2",
        "content://video/100",
        file,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
    arrayBufferSpy.mockRestore();
  });

  it("empty-File fallback is refused after URI copy failure", async () => {
    copyMock.mockRejectedValue(new Error("copy failed"));
    const empty = new File([], "clip.mp4", { type: "video/mp4" });

    await expect(
      saveNativeDraftVideoFromUri(
        "post-1",
        "local-3",
        "content://video/101",
        empty,
      ),
    ).rejects.toThrow("NATIVE_VIDEO_INACCESSIBLE");

    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe("PASS A — image acquisition unchanged", () => {
  it("F: web library image routing unchanged", () => {
    const routed = routeWebLibraryFiles([jpg(), jpg("b.jpg")], {
      hasActiveVideo: false,
      imageSlotsRemaining: 10,
    });
    expect(routed.images).toHaveLength(2);
    expect(routed.video).toBeNull();
    expect(routed.videoNativeSourceUri).toBeNull();
  });

  it("F: native partition still routes images only", () => {
    const partitioned = partitionNativePickedMedia(
      [{ kind: "image", file: jpg() }],
      { hasActiveVideo: false, imageSlotsRemaining: 10 },
    );
    expect(partitioned.images).toHaveLength(1);
    expect(partitioned.video).toBeNull();
  });
});

describe("PASS A — expanded tray height fits square thumbnails", () => {
  it("G: tray max height derived from 28% square thumb geometry", () => {
    const px = computeExpandedMediaTrayMaxHeightPx(400);
    expect(px).toBeGreaterThanOrEqual(112);
    expect(px).toBeLessThanOrEqual(128);
    expect(EXPANDED_MEDIA_TRAY_MAX_HEIGHT).toContain("rem");
    const rem = parseFloat(EXPANDED_MEDIA_TRAY_MAX_HEIGHT);
    expect(rem).toBeGreaterThanOrEqual(7);
    expect(rem).toBeLessThanOrEqual(8);
  });

  it("G: thumb width fraction matches strip class", () => {
    expect(FINALIZE_MEDIA_THUMB_WIDTH_FRACTION).toBe(0.28);
  });
});

describe("PASS A — vertical overflow and selected rings", () => {
  it("H: dock strip source avoids destructive vertical overflow-hidden", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/create/CreateFinalizeHeroImageDock.tsx"),
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("overflow-y-visible");
    const stripBlock = src.slice(
      src.indexOf("data-media-dock-strip"),
      src.indexOf("data-media-dock-strip") + 400,
    );
    expect(stripBlock).not.toContain("overflow-hidden");
  });

  it("I/J: selected image and video thumb shells use inset ring (no clip)", () => {
    const selected = finalizeMediaThumbShellClass({ isSelected: true });
    expect(selected).toContain("ring-inset");
    expect(selected).toContain("ring-2");
  });
});

describe("PASS A — fixed bottom media bar", () => {
  it("K: dock stack keeps bar below strip (bar position unchanged)", () => {
    expect(CREATE_FINALIZE_DOCK_STACK_CLASS).toBe("flex flex-col");
    expect(CREATE_FINALIZE_DOCK_STACK_ORDER).toEqual(["strip", "bar"]);
    expect(CREATE_FINALIZE_DOCK_BAR_HEIGHT_CSS).toBe("3rem");
    expect(CREATE_FINALIZE_DOCK_BOTTOM_CSS).toBe("0.5rem");
  });
});

describe("PASS A — no Bunny on native video pick persistence", () => {
  it("L: createDraftVideo persistence does not reference Bunny upload", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/createDraftVideo/index.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/invokeBunny/i);
    expect(src).not.toMatch(/bunnyTus/i);
    expect(src).toContain("saveNativeDraftVideoFromUri");
  });

  it("L: picker provider passes nativeSourceUri into persistDraftVideo", () => {
    const provider = readFileSync(
      join(process.cwd(), "src/components/create/CreatePostMediaProvider.tsx"),
      "utf8",
    );
    expect(provider).toContain("nativeSourceUri");
    expect(provider).not.toMatch(/invokeBunnyUploadInit/);
  });
});

describe("PASS A — resolveNativeVideoSourceUri compatibility", () => {
  it("prefers durable path over content:// uri", () => {
    expect(
      resolveNativeVideoSourceUri({
        uri: "content://media/1",
        path: "/sdcard/1.mp4",
      }),
    ).toBe("/sdcard/1.mp4");
  });

  it("falls back to path when uri missing", () => {
    expect(
      resolveNativeVideoSourceUri({
        uri: "",
        path: "file:///sdcard/1.mp4",
      }),
    ).toBe("file:///sdcard/1.mp4");
  });
});
