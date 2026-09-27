/**
 * Mixed-media: image remove must not drop video via reconcile;
 * optional prepared.tmp cleanup is idempotent when missing.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLocalDraftImageUrl,
  ensureDraftMediaOrderPersisted,
  imageOrderItem,
  persistDraftMediaOrderOnly,
  readDraftMediaOrderState,
  reconcileMediaOrder,
  removeMediaOrderItemByClientId,
  videoOrderItem,
  writeSlot0ImagesForMediaReconcile,
} from "./createDraftMediaOrder";
import { writeDraftVideoMeta } from "./createDraftVideo/draftVideoMeta";
import type { DraftVideo } from "./createDraftVideo/types";
import { getDraftMediaCoverItem } from "./createDraftMediaOrder";

const statMock = vi.hoisted(() => vi.fn());
const deleteFileMock = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    stat: statMock,
    deleteFile: deleteFileMock,
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

function draftVideo(localId: string, overrides: Partial<DraftVideo> = {}): DraftVideo {
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

describe("mixed-media image remove + reconcile video contract", () => {
  beforeEach(() => {
    stubLocalStorage();
    statMock.mockReset();
    deleteFileMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("A: [image, video] remove image → [video]", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const order = [
      imageOrderItem(imgUrl, "img-a"),
      videoOrderItem("vid-1"),
    ];
    const afterRemove = removeMediaOrderItemByClientId(order, "img-a");
    const rec = reconcileMediaOrder({
      currentOrder: afterRemove,
      images: [],
      videoLocalId: "vid-1",
      clientIdMap: { [imgUrl]: "img-a" },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual(["vid-1"]);
    expect(getDraftMediaCoverItem(rec.order)?.kind).toBe("video");
  });

  it("B: [video, image] remove image → [video]", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const order = [
      videoOrderItem("vid-1"),
      imageOrderItem(imgUrl, "img-a"),
    ];
    const afterRemove = removeMediaOrderItemByClientId(order, "img-a");
    const rec = reconcileMediaOrder({
      currentOrder: afterRemove,
      images: [],
      videoLocalId: "vid-1",
      clientIdMap: { [imgUrl]: "img-a" },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual(["vid-1"]);
  });

  it("C: [imgA, imgB, video] remove imgA → [imgB, video]", () => {
    const a = buildLocalDraftImageUrl("img-a");
    const b = buildLocalDraftImageUrl("img-b");
    const order = [
      imageOrderItem(a, "img-a"),
      imageOrderItem(b, "img-b"),
      videoOrderItem("vid-1"),
    ];
    const afterRemove = removeMediaOrderItemByClientId(order, "img-a");
    const rec = reconcileMediaOrder({
      currentOrder: afterRemove,
      images: [b],
      videoLocalId: "vid-1",
      clientIdMap: { [a]: "img-a", [b]: "img-b" },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual(["img-b", "vid-1"]);
    expect(getDraftMediaCoverItem(rec.order)?.clientId).toBe("img-b");
  });

  it("D: remove video explicitly → images remain", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const order = [
      imageOrderItem(imgUrl, "img-a"),
      videoOrderItem("vid-1"),
    ];
    const afterRemove = removeMediaOrderItemByClientId(order, "vid-1");
    const rec = reconcileMediaOrder({
      currentOrder: afterRemove,
      images: [imgUrl],
      videoLocalId: null,
      clientIdMap: { [imgUrl]: "img-a" },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual(["img-a"]);
  });

  it("E: images-only removal unchanged", () => {
    const a = buildLocalDraftImageUrl("img-a");
    const b = buildLocalDraftImageUrl("img-b");
    const order = [imageOrderItem(a, "img-a"), imageOrderItem(b, "img-b")];
    const afterRemove = removeMediaOrderItemByClientId(order, "img-a");
    const rec = reconcileMediaOrder({
      currentOrder: afterRemove,
      images: [b],
      videoLocalId: null,
      clientIdMap: { [a]: "img-a", [b]: "img-b" },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual(["img-b"]);
  });

  it("F: reconcile with videoLocalId undefined preserves existing video", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const rec = reconcileMediaOrder({
      currentOrder: [
        imageOrderItem(imgUrl, "img-a"),
        videoOrderItem("vid-keep"),
      ],
      images: [],
      // omit videoLocalId → undefined
      clientIdMap: { [imgUrl]: "img-a" },
    });
    expect(rec.order).toEqual([videoOrderItem("vid-keep")]);
  });

  it("G: reconcile with videoLocalId null removes video", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const rec = reconcileMediaOrder({
      currentOrder: [
        imageOrderItem(imgUrl, "img-a"),
        videoOrderItem("vid-1"),
      ],
      images: [imgUrl],
      videoLocalId: null,
      clientIdMap: { [imgUrl]: "img-a" },
    });
    expect(rec.order.map((i) => i.clientId)).toEqual(["img-a"]);
  });

  it("H: reconcile with videoLocalId string produces exactly one video entry", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const rec = reconcileMediaOrder({
      currentOrder: [
        videoOrderItem("vid-old"),
        videoOrderItem("vid-dup"),
        imageOrderItem(imgUrl, "img-a"),
      ],
      images: [imgUrl],
      videoLocalId: "vid-new",
      clientIdMap: { [imgUrl]: "img-a" },
    });
    const videos = rec.order.filter((i) => i.kind === "video");
    expect(videos).toHaveLength(1);
    expect(videos[0]).toEqual(videoOrderItem("vid-new"));
    expect(rec.order.map((i) => i.clientId)).toEqual(["vid-new", "img-a"]);
  });

  it("I: slot0 persisted reconcile after image removal cannot drop live video", () => {
    const imgUrl = buildLocalDraftImageUrl("img-a");
    const order = [
      imageOrderItem(imgUrl, "img-a"),
      videoOrderItem("vid-live"),
    ];
    persistDraftMediaOrderOnly(order, { notify: false });
    writeDraftVideoMeta(draftVideo("vid-live"));

    // Simulate strip remove: persist [video] then slot0 images=[] reconcile
    // WITHOUT passing videoLocalId (as older callers did) — meta still present.
    const afterStrip = removeMediaOrderItemByClientId(order, "img-a");
    persistDraftMediaOrderOnly(afterStrip, { notify: false });
    writeSlot0ImagesForMediaReconcile([]);

    // Meta lag simulation: clear draft video meta but caller would pass live id.
    // ensure with live string must keep video.
    writeDraftVideoMeta(null);
    const withLive = ensureDraftMediaOrderPersisted({
      images: [],
      videoLocalId: "vid-live",
    });
    expect(withLive.map((i) => i.clientId)).toEqual(["vid-live"]);

    // Meta missing + omitted videoLocalId must PRESERVE survivor (undefined ≠ null).
    persistDraftMediaOrderOnly(
      [videoOrderItem("vid-live")],
      { notify: false },
    );
    const preserved = ensureDraftMediaOrderPersisted({ images: [] });
    expect(preserved.map((i) => i.clientId)).toEqual(["vid-live"]);
  });

  it("J: index-0 removal correctly promotes next media", () => {
    const a = buildLocalDraftImageUrl("img-a");
    const b = buildLocalDraftImageUrl("img-b");
    const order = [
      imageOrderItem(a, "img-a"),
      videoOrderItem("vid-1"),
      imageOrderItem(b, "img-b"),
    ];
    const afterRemove = removeMediaOrderItemByClientId(order, "img-a");
    const rec = reconcileMediaOrder({
      currentOrder: afterRemove,
      images: [b],
      videoLocalId: "vid-1",
      clientIdMap: { [a]: "img-a", [b]: "img-b" },
    });
    expect(getDraftMediaCoverItem(rec.order)?.clientId).toBe("vid-1");
    expect(rec.order.map((i) => i.clientId)).toEqual(["vid-1", "img-b"]);
  });

  it("K: image removal path never deletes video bytes/meta (source contract)", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    const start = strip.indexOf("const removeSlot0MediaByClientId");
    const end = strip.indexOf("const onDragEnd", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const removeFn = strip.slice(start, end);
    expect(removeFn).toContain('item.kind === "video"');
    expect(removeFn).toContain("removePostVideo");
    // Image branch: after video early-return, only image meta + mediaOrder
    const imageBranch = removeFn.slice(
      removeFn.indexOf("LI1D.5: logical DraftMeta remove"),
      removeFn.indexOf("persistMediaOrder(nextOrder)"),
    );
    expect(imageBranch).not.toContain("removePostVideo");
    expect(imageBranch).not.toContain("deleteDraftVideo");
    expect(imageBranch).not.toContain("deleteDraftVideoStorageBytes");
    expect(imageBranch).toContain("removeDraftImageFromDraftMeta");
  });

  it("provider injects live videoJob localId when image reconcile omits videoLocalId", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const reconcileFn = provider.slice(
      provider.indexOf("const reconcileMediaOrder = useCallback"),
      provider.indexOf("const persistMediaOrder = useCallback"),
    );
    expect(reconcileFn).toContain("videoJobRef.current?.localId");
    expect(reconcileFn).toContain("options?.videoLocalId === undefined");
    expect(reconcileFn).toContain("videoLocalId: liveId");
  });

  it("L: missing optional prepared temp cleanup is idempotent (no deleteFile)", async () => {
    const { deleteNativeDraftVideoFile } = await import(
      "./createDraftVideo/nativeDraftVideoStorage"
    );
    statMock.mockRejectedValueOnce(
      Object.assign(new Error("File does not exist."), {
        code: "OS-PLUG-FILE-0008",
      }),
    );

    await deleteNativeDraftVideoFile(
      "create-drafts/post-1/vid-1.prepared.tmp.mp4",
      { optional: true },
    );

    expect(statMock).toHaveBeenCalled();
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it("L2: optional prepared cleanup still deletes when file exists", async () => {
    const { deleteNativeDraftVideoFile } = await import(
      "./createDraftVideo/nativeDraftVideoStorage"
    );
    statMock.mockResolvedValueOnce({ type: "file", size: 10 });
    deleteFileMock.mockResolvedValueOnce(undefined);

    await deleteNativeDraftVideoFile(
      "create-drafts/post-1/vid-1.prepared.tmp.mp4",
      { optional: true },
    );

    expect(deleteFileMock).toHaveBeenCalled();
  });

  it("M: missing CURRENT source still invokes deleteFile (not optional)", async () => {
    const { deleteNativeDraftVideoFile } = await import(
      "./createDraftVideo/nativeDraftVideoStorage"
    );
    deleteFileMock.mockRejectedValueOnce(
      Object.assign(new Error("File does not exist."), {
        code: "OS-PLUG-FILE-0008",
      }),
    );

    await deleteNativeDraftVideoFile("create-drafts/post-1/vid-1.mp4");

    expect(statMock).not.toHaveBeenCalled();
    expect(deleteFileMock).toHaveBeenCalled();
  });

  it("optional prepared/temp delete sites pass { optional: true }", () => {
    const index = read("src/lib/createDraftVideo/index.ts");
    expect(index).toContain(
      "deleteNativeDraftVideoFile(preparedRef, { optional: true })",
    );
    expect(index).toContain(
      "deleteNativeDraftVideoFile(tempPath, { optional: true })",
    );
  });

  it("readDraftMediaOrderState after ensure with undefined keeps video survivor", () => {
    persistDraftMediaOrderOnly(
      [
        imageOrderItem(buildLocalDraftImageUrl("img-a"), "img-a"),
        videoOrderItem("vid-1"),
      ],
      { notify: false },
    );
    // No draft video meta — previously coerced to null and dropped video.
    const next = ensureDraftMediaOrderPersisted({
      images: [],
    });
    expect(next.map((i) => i.clientId)).toEqual(["vid-1"]);
    expect(readDraftMediaOrderState().mediaOrder.map((i) => i.clientId)).toEqual([
      "vid-1",
    ]);
  });
});
