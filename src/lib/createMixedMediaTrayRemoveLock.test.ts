/**
 * Mixed-media tray remove: sibling click-through lock + scoped video cleanup.
 *
 * Physical Android bug: IMAGE × → layout shift → VIDEO × under same touch
 * → removePostVideo → deleteDraftVideo → rmdir whole create-drafts/{postId}.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetFinalizeMediaTrayRemoveTransactionForTests,
  beginFinalizeMediaTrayRemoveTransaction,
  endFinalizeMediaTrayRemoveTransaction,
  FINALIZE_MEDIA_TRAY_REMOVE_POST_PAINT_SUPPRESS_MS,
  isFinalizeMediaTrayRemoveLocked,
} from "./createFinalizeMediaRemoveGesture";
import {
  buildLocalDraftImageUrl,
  imageOrderItem,
  removeMediaOrderItemByClientId,
  videoOrderItem,
} from "./createDraftMediaOrder";
import { writeDraftVideoMeta, readDraftVideoMeta } from "./createDraftVideo/draftVideoMeta";
import type { DraftVideo } from "./createDraftVideo/types";

const deleteFileMock = vi.hoisted(() => vi.fn());
const rmdirMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    stat: statMock,
    deleteFile: deleteFileMock,
    rmdir: rmdirMock,
    mkdir: vi.fn(),
    copy: vi.fn(),
    writeFile: vi.fn(),
  },
  Directory: { Data: "DATA" },
}));

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => true,
}));

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function draftVideo(
  localId: string,
  overrides: Partial<DraftVideo> = {},
): DraftVideo {
  return {
    localId,
    fileName: `${localId}.mp4`,
    mimeType: "video/mp4",
    size: 1024,
    localStorageKind: "native-fs",
    localReference: `create-drafts/post-1/${localId}.mp4`,
    ...overrides,
  };
}

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
  return store;
}

function stubRaf() {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(Date.now()), 0) as unknown as number;
    },
  );
}

function flushDoubleRaf(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("mixed-media tray remove transaction + scoped video cleanup", () => {
  beforeEach(() => {
    stubLocalStorage();
    stubRaf();
    __resetFinalizeMediaTrayRemoveTransactionForTests();
    deleteFileMock.mockReset();
    rmdirMock.mockReset();
    statMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
    rmdirMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ type: "file", size: 10 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetFinalizeMediaTrayRemoveTransactionForTests();
  });

  it("A: [image, video] image remove starts → immediate sibling video remove blocked", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const order = [
      imageOrderItem(imgUrl, "img-a"),
      videoOrderItem("vid-1"),
    ];

    expect(beginFinalizeMediaTrayRemoveTransaction("img-a")).toBe(true);
    // Image remove proceeds (owner not locked against itself).
    expect(isFinalizeMediaTrayRemoveLocked("img-a")).toBe(false);
    const afterImage = removeMediaOrderItemByClientId(order, "img-a");
    expect(afterImage.map((i) => i.clientId)).toEqual(["vid-1"]);

    // Sibling VIDEO remove from same interaction must be blocked.
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(false);
    expect(isFinalizeMediaTrayRemoveLocked("vid-1")).toBe(true);
  });

  it("B: [video, image] intentional video remove → image remains", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const order = [
      videoOrderItem("vid-1"),
      imageOrderItem(imgUrl, "img-a"),
    ];
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(true);
    const afterVideo = removeMediaOrderItemByClientId(order, "vid-1");
    expect(afterVideo.map((i) => i.clientId)).toEqual(["img-a"]);
    // Sibling image blocked during same txn.
    expect(beginFinalizeMediaTrayRemoveTransaction("img-a")).toBe(false);
  });

  it("C: two separate intentional taps — both allowed after release", async () => {
    expect(beginFinalizeMediaTrayRemoveTransaction("img-a")).toBe(true);
    endFinalizeMediaTrayRemoveTransaction({ postPaintSuppressMs: 0 });
    await flushDoubleRaf();
    // Suppress window of 0 — next tap allowed.
    expect(isFinalizeMediaTrayRemoveLocked()).toBe(false);
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(true);
  });

  it("D: [imgA, imgB, video] remove imgA → imgB + video remain", () => {
    const a = buildLocalDraftImageUrl("img-a");
    const b = buildLocalDraftImageUrl("img-b");
    const order = [
      imageOrderItem(a, "img-a"),
      imageOrderItem(b, "img-b"),
      videoOrderItem("vid-1"),
    ];
    expect(beginFinalizeMediaTrayRemoveTransaction("img-a")).toBe(true);
    const next = removeMediaOrderItemByClientId(order, "img-a");
    expect(next.map((i) => i.clientId)).toEqual(["img-b", "vid-1"]);
    expect(beginFinalizeMediaTrayRemoveTransaction("img-b")).toBe(false);
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(false);
  });

  it("E: image removal path never calls removePostVideo / deleteDraftVideo", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    const start = strip.indexOf("const removeSlot0MediaByClientId");
    const end = strip.indexOf("const onDragEnd", start);
    const removeFn = strip.slice(start, end);
    const imageBranch = removeFn.slice(
      removeFn.indexOf("LI1D.5: logical DraftMeta remove"),
      removeFn.indexOf("persistMediaOrder(nextOrder)"),
    );
    expect(imageBranch).not.toContain("removePostVideo");
    expect(imageBranch).not.toContain("deleteDraftVideo");
  });

  it("F: blocked sibling video remove never deletes source", async () => {
    writeDraftVideoMeta(draftVideo("vid-1"));
    expect(beginFinalizeMediaTrayRemoveTransaction("img-a")).toBe(true);
    // Sibling cannot begin — product path must not reach deleteDraftVideo.
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(false);
    expect(readDraftVideoMeta()?.localId).toBe("vid-1");
    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(rmdirMock).not.toHaveBeenCalled();
  });

  it("G: intentional video remove still works (deleteDraftVideo scoped)", async () => {
    writeDraftVideoMeta(
      draftVideo("vid-1", {
        preparedReference: "create-drafts/post-1/vid-1.prepared.mp4",
      }),
    );
    const { deleteDraftVideo } = await import("./createDraftVideo/index");
    await deleteDraftVideo("post-1");

    expect(readDraftVideoMeta()).toBeNull();
    const deletedPaths = deleteFileMock.mock.calls.map(
      (c) => (c[0] as { path?: string } | undefined)?.path,
    );
    expect(deletedPaths).toContain("create-drafts/post-1/vid-1.mp4");
    expect(deletedPaths).toContain("create-drafts/post-1/vid-1.prepared.mp4");
    expect(deletedPaths).toContain(
      "create-drafts/post-1/vid-1.prepared.tmp.mp4",
    );
    // H: must NOT rmdir whole create-drafts/{postId}
    expect(rmdirMock).not.toHaveBeenCalled();
  });

  it("H: single video removal does NOT rmdir create-drafts/{postId}", () => {
    const index = read("src/lib/createDraftVideo/index.ts");
    const start = index.indexOf("export async function deleteDraftVideo");
    const end = index.indexOf("export async function deletePreparedVideoStorageBytes");
    const fn = index.slice(start, end);
    expect(fn).not.toContain("deleteNativeDraftVideoDirectory");
    expect(fn).toContain("Never rmdir");
  });

  it("I: full draft discard still performs whole-tree cleanup", () => {
    const index = read("src/lib/createDraftVideo/index.ts");
    const start = index.indexOf("export async function cleanupDraftVideoAssets");
    const end = index.indexOf(
      "export function createDraftVideoPreviewSource",
      start,
    );
    const fn = index.slice(start, end);
    expect(fn).toContain("deleteNativeDraftVideoDirectory(publishPostId)");
    const discard = read("src/lib/createDraftVideo/discardCleanup.ts");
    expect(discard).toContain("cleanupDraftVideoAssets");
  });

  it("J: shared button + strip wire tray lock; mediaOrder contract preserved", () => {
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).toContain("beginFinalizeMediaTrayRemoveTransaction");
    expect(tile).toContain("endFinalizeMediaTrayRemoveTransaction");
    expect(tile).toContain("blocked-tray-txn");

    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("isFinalizeMediaTrayRemoveLocked");
    expect(strip).toContain("blocked-tray-txn");

    const order = read("src/lib/createDraftMediaOrder.ts");
    // Preserve undefined / null / string videoLocalId contract.
    expect(order).toContain("videoLocalId");
  });

  it("K: publish-only video preparation remains unchanged", () => {
    const ensure = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(ensure.length).toBeGreaterThan(0);
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    // No auto-prepare on select/hydrate — publish path still uses ensure.
    expect(provider).toContain("ensurePublishVideoPreparation");
  });

  it("post-paint suppress blocks sibling briefly then releases", async () => {
    expect(beginFinalizeMediaTrayRemoveTransaction("img-a")).toBe(true);
    endFinalizeMediaTrayRemoveTransaction({
      postPaintSuppressMs: FINALIZE_MEDIA_TRAY_REMOVE_POST_PAINT_SUPPRESS_MS,
    });
    await flushDoubleRaf();
    expect(isFinalizeMediaTrayRemoveLocked("vid-1")).toBe(true);
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(false);

    await new Promise((r) =>
      setTimeout(r, FINALIZE_MEDIA_TRAY_REMOVE_POST_PAINT_SUPPRESS_MS + 20),
    );
    expect(isFinalizeMediaTrayRemoveLocked()).toBe(false);
    expect(beginFinalizeMediaTrayRemoveTransaction("vid-1")).toBe(true);
  });
});
