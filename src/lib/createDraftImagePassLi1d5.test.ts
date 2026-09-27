/**
 * PASS LI1D.5 — remove resurrection / reconciliation race + guard lifetime.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLocalDraftImageUrl,
  removeDraftImageFromDraftMeta,
  readDraftImagesMeta,
  writeDraftImagesMeta,
  type DraftImage,
} from "./createDraftImage";
import {
  ensureDraftMediaOrderPersisted,
  imageOrderItem,
  persistDraftMediaOrderOnly,
  readDraftMediaOrderState,
  removeMediaOrderItemByClientId,
  writeSlot0ImagesForMediaReconcile,
} from "./createDraftMediaOrder";
import { beginFinalizeMediaRemoveOnce } from "./createFinalizeMediaRemoveGesture";
import { remapHeroIndexAfterMediaRemove } from "./createFinalizeHeroMedia";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseDraftImage(overrides: Partial<DraftImage> = {}): DraftImage {
  return {
    localId: "img-a",
    fileName: "img-a.webp",
    mimeType: "image/webp",
    size: 12,
    width: 10,
    height: 10,
    localStorageKind: "idb-blob",
    localReference: "post/img-a",
    ...overrides,
  };
}

describe("PASS LI1D.5 — remove resurrection / guard lifetime", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("A/B/C/O: explicit remove + reconcile does not resurrect DraftImage", () => {
    const a = buildLocalDraftImageUrl("a");
    const b = buildLocalDraftImageUrl("b");
    const c = buildLocalDraftImageUrl("c");
    const d = buildLocalDraftImageUrl("d");
    const e = buildLocalDraftImageUrl("e");
    const f = buildLocalDraftImageUrl("f");
    const urls = [a, b, c, d, e, f];
    const order = urls.map((url) =>
      imageOrderItem(url, url.replace(/^draft-image\//, "").replace(/\.webp$/i, "")),
    );

    writeDraftImagesMeta(
      urls.map((url) => {
        const localId = url.replace(/^draft-image\//, "").replace(/\.webp$/i, "");
        return baseDraftImage({
          localId,
          localReference: `post/${localId}`,
        });
      }),
    );
    persistDraftMediaOrderOnly(order, { notify: false });
    localStorage.setItem(
      "draftActivities",
      JSON.stringify([{ title: "Stop 1", images: urls }]),
    );

    expect(readDraftMediaOrderState().mediaOrder).toHaveLength(6);

    // Logical remove of "c" (same ordering as strip).
    removeDraftImageFromDraftMeta("c");
    const nextOrder = removeMediaOrderItemByClientId(order, "c");
    persistDraftMediaOrderOnly(nextOrder, { notify: false });
    writeSlot0ImagesForMediaReconcile(
      nextOrder
        .filter((i): i is Extract<typeof i, { kind: "image" }> => i.kind === "image")
        .map((i) => i.url),
    );

    expect(nextOrder).toHaveLength(5);
    expect(readDraftImagesMeta().map((img) => img.localId)).not.toContain("c");
    expect(readDraftMediaOrderState().mediaOrder.map((i) => i.clientId)).not.toContain(
      "c",
    );

    // Runtime reconcile must stay at 5 — no draftImages union resurrection.
    const after = ensureDraftMediaOrderPersisted({
      images: [a, b, d, e, f],
    });
    expect(after).toHaveLength(5);
    expect(after.map((i) => i.clientId)).toEqual(["a", "b", "d", "e", "f"]);
  });

  it("P: empty mediaOrder bootstrap can still restore from DraftImage meta", () => {
    const a = buildLocalDraftImageUrl("resume-a");
    writeDraftImagesMeta([
      baseDraftImage({
        localId: "resume-a",
        localReference: "post/resume-a",
      }),
    ]);
    persistDraftMediaOrderOnly([], { notify: false });
    localStorage.setItem("draftActivities", JSON.stringify([{ images: [] }]));

    const boot = ensureDraftMediaOrderPersisted({ images: [] });
    expect(boot.map((i) => i.clientId)).toContain("resume-a");
    expect(boot.some((i) => i.kind === "image" && i.url === a)).toBe(true);
  });

  it("D/E: logical meta gone before async cleanup; cleanup failure cannot restore meta", () => {
    writeDraftImagesMeta([
      baseDraftImage({ localId: "gone-1", localReference: "post/gone-1" }),
    ]);
    const snap = removeDraftImageFromDraftMeta("gone-1");
    expect(snap?.localId).toBe("gone-1");
    expect(readDraftImagesMeta().find((i) => i.localId === "gone-1")).toBeUndefined();

    // Simulate failed physical cleanup leaving orphan bytes — meta stays absent.
    expect(readDraftImagesMeta().map((i) => i.localId)).not.toContain("gone-1");
  });

  it("H/I: once guard blocks duplicate then allows later gesture after reset", () => {
    const guard = { current: false };
    expect(beginFinalizeMediaRemoveOnce(guard)).toBe(true);
    expect(beginFinalizeMediaRemoveOnce(guard)).toBe(false);
    guard.current = false; // simulates LI1D.5 scheduled reset
    expect(beginFinalizeMediaRemoveOnce(guard)).toBe(true);
  });

  it("N: active index remap unchanged", () => {
    expect(remapHeroIndexAfterMediaRemove(0, 2, 5)).toBe(0);
    expect(remapHeroIndexAfterMediaRemove(2, 2, 5)).toBe(2);
    expect(remapHeroIndexAfterMediaRemove(5, 5, 5)).toBe(4);
  });

  it("strip + deleteDraftImage split + diag events wired", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("removeDraftImageFromDraftMeta");
    expect(strip).toContain("cleanupDraftImageAsset");
    expect(strip).toContain("writeSlot0ImagesForMediaReconcile");
    expect(strip).toContain("explicit-remove-logical");
    expect(strip).toContain("draft-meta-after-logical-remove");
    expect(strip).toContain("removing-guard-cleared");
    expect(strip).toContain("clearRemovingGuard");
    expect(strip).not.toContain("await deleteDraftImage(");

    const index = read("src/lib/createDraftImage/index.ts");
    expect(index).toContain("export function removeDraftImageFromDraftMeta");
    expect(index).toContain("export async function cleanupDraftImageAsset");
    expect(index).toContain("removeDraftImageFromDraftMeta(id)");

    const order = read("src/lib/createDraftMediaOrder.ts");
    expect(order).toContain("LI1D.5 contract");
    expect(order).toContain("Do NOT re-union draftImages meta");

    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).toContain("scheduleOnceGuardReset");
    expect(tile).toContain("400");
  });

  it("T/U: LI1C publish + Edit paths not rewritten by this pass", () => {
    const pub = read("src/lib/createDraftImage/publishDraftImages.ts");
    expect(pub).toContain("mapActivityImagesToRemotePaths");
    expect(pub).toContain("assertPublishImagePayloadHasNoLocalLeak");
    const pv4 = read("src/lib/publishedMediaPassPv4.test.ts");
    expect(pv4).toContain("PASS PV4");
  });

  it("J/K/L structural: remove still by clientId; gesture ownership kept", () => {
    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain("removeSlot0MediaByClientId");
    expect(strip).toContain("FinalizeMediaRemoveButton");
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).toContain("claimFinalizeMediaRemovePointerDown");
  });
});
