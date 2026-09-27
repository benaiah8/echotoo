/**
 * Publish-only video preparation + draft source lifecycle contracts.
 * Covers select/replace/hydrate (no auto-prepare) and Publish gate behavior.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPreparationDecisionAfterSourceReady,
  resolveVideoPreparationPolicy,
  reconcileInterruptedPreparing,
  reconcileDraftVideoPreparation,
} from "./createDraftVideo";
import {
  deleteDraftVideoStorageBytes,
  cleanupDraftVideoAssets,
} from "./createDraftVideo/index";
import { writeDraftVideoMeta, readDraftVideoMeta } from "./createDraftVideo/draftVideoMeta";
import { mapLocalDraftVideoToJob } from "./createPostVideoUpload";
import { DRAFT_VIDEO_MISSING_MESSAGE } from "./createDraftVideo/types";
import type { DraftVideo } from "./createDraftVideo/types";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

const deleteFileMock = vi.hoisted(() => vi.fn());
const rmdirMock = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    deleteFile: deleteFileMock,
    rmdir: rmdirMock,
    mkdir: vi.fn(),
    copy: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
  },
  Directory: { Data: "DATA" },
}));

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => true,
}));

vi.mock("./createFlowLeaveRequest", () => ({
  dispatchCreateFlowDraftContentChanged: () => undefined,
}));

const MB = 1024 * 1024;

function draft(overrides: Partial<DraftVideo> = {}): DraftVideo {
  return {
    localId: "gen-a",
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    size: 80 * MB,
    localStorageKind: "native-fs",
    localReference: "create-drafts/post-1/gen-a.mp4",
    width: 3840,
    height: 2160,
    duration: 45,
    remoteMediaId: null,
    remoteVideoId: null,
    preparationStatus: "local_ready",
    preparationStrategy: "transcode",
    ...overrides,
  };
}

describe("publish-only video preparation lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    deleteFileMock.mockReset();
    rmdirMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
    rmdirMock.mockResolvedValue(undefined);
    writeDraftVideoMeta(null);
  });

  afterEach(() => {
    writeDraftVideoMeta(null);
    vi.unstubAllGlobals();
  });

  it("A/B: select + replace do not start native prepare", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(start).not.toContain("ensureDraftVideoPreparationStarted");
    expect(start).toContain("Publish-only prepare: do NOT start native encode after ingest/replace");
    expect(provider).not.toMatch(
      /ensureDraftVideoPreparationStarted\(/,
    );
  });

  it("C: reopen draft does not start native prepare", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const hydrate = provider.slice(
      provider.indexOf("const hydrateLocalDraftVideo"),
      provider.indexOf("const hydrateLegacyRemoteVideo"),
    );
    expect(hydrate).not.toContain("ensureDraftVideoPreparationStarted");
    expect(hydrate).toContain("Publish-only prepare: do NOT start Media3/AVFoundation on draft reopen");
    expect(hydrate).toContain("reconcileDraftVideoPreparation");
  });

  it("D: Publish transcode gate starts prepare exactly once via ensurePublish", () => {
    const gate = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(gate).toContain("needs_prepare start once");
    expect(gate).toContain("ensureDraftVideoPreparationStarted");
    expect(gate).toContain("awaitActiveDraftVideoPreparation");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const publish = provider.slice(
      provider.indexOf("const uploadVideoForPublish"),
      provider.indexOf("const cancelPublishVideoUpload"),
    );
    expect(publish).toContain("ensurePublishVideoPreparation");
    expect(publish).toContain("setHeavyMediaExclusive(true)");
    expect(publish).toContain("setHeavyMediaExclusive(false)");
  });

  it("E: passthrough policy does not require encoder", () => {
    const policy = resolveVideoPreparationPolicy({
      durationSeconds: 30,
      sizeBytes: 8 * MB,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
    });
    expect(policy.strategy).toBe("passthrough");
    const next = applyPreparationDecisionAfterSourceReady(draft(), policy);
    expect(next.preparationStatus).toBe("prepared");
    expect(next.preparationStrategy).toBe("passthrough");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain('policy.strategy === "passthrough"');
  });

  it("F: Create preview inactive while Publish exclusive", () => {
    const hero = read("src/components/create/CreateFinalizeHeroMedia.tsx");
    expect(hero).toContain("createVideoHeavyMediaExclusive");
    expect(hero).toContain(
      "createVideoHeavyMediaExclusive ? null : videoObjectUrl",
    );
    expect(hero).toContain(
      "mediaDockExpanded || createVideoHeavyMediaExclusive",
    );
  });

  it("G: poster work cancelled / deferred while exclusive", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("posterEnrichGenerationRef.current += 1");
    expect(provider).toContain("if (heavyMediaExclusiveRef.current)");
    expect(provider).toContain("!heavyMediaExclusiveRef.current");
  });

  it("H: prepare failure preserves source fields on draft", () => {
    const failed = reconcileInterruptedPreparing(
      draft({ preparationStatus: "preparing" }),
    );
    expect(failed.localReference).toBe("create-drafts/post-1/gen-a.mp4");
    expect(failed.preparationStatus).toBe("local_ready");
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain("writeDraftMetaIfCurrentGeneration");
  });

  it("I: successful replace cleanup cannot delete protected new source", async () => {
    const oldGen = draft({
      localId: "gen-a",
      localReference: "create-drafts/post-1/gen-a.mp4",
    });
    const newGen = draft({
      localId: "gen-b",
      localReference: "create-drafts/post-1/gen-b.mp4",
    });
    writeDraftVideoMeta(newGen);

    await deleteDraftVideoStorageBytes(oldGen, {
      protectLocalId: newGen.localId,
      protectLocalReference: newGen.localReference,
    });

    const deletedPaths = deleteFileMock.mock.calls.map((c) => c[0]?.path);
    expect(deletedPaths).toContain("create-drafts/post-1/gen-a.mp4");
    expect(deletedPaths).not.toContain("create-drafts/post-1/gen-b.mp4");
    expect(readDraftVideoMeta()?.localId).toBe("gen-b");

    // Refuse deleting current meta generation entirely.
    await deleteDraftVideoStorageBytes(newGen);
    expect(
      deleteFileMock.mock.calls.every(
        (c) => c[0]?.path !== "create-drafts/post-1/gen-b.mp4",
      ),
    ).toBe(true);
  });

  it("J: failed replace leaves prior source/meta (commitMeta false contract)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const start = provider.slice(
      provider.indexOf("const startPostVideoUpload"),
      provider.indexOf("const uploadVideoForPublish"),
    );
    expect(start).toContain("commitMeta: false");
    expect(start.indexOf("writeDraftVideoMeta(withPreparation)")).toBeGreaterThan(
      start.indexOf("commitMeta: false"),
    );
    expect(start).toContain("deleteDraftVideoStorageBytes(uncommitted)");
    expect(start).toContain("deleteDraftVideoStorageBytes(previousDraft,");
    expect(start).toContain("protectLocalId: withPreparation.localId");
    expect(start).toContain(
      "protectLocalReference: withPreparation.localReference",
    );
  });

  it("K: draft reopen finds current replacement source (meta not clobbered)", () => {
    const controller = read(
      "src/lib/createDraftVideo/draftVideoPreparationController.ts",
    );
    expect(controller).toContain("writeDraftMetaIfCurrentGeneration");
    expect(controller).toContain("meta-write-skipped-stale-generation");
    expect(controller).toContain("current.localId !== draft.localId");
  });

  it("L: missing source → Unavailable without deleting draft meta", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    const hydrate = provider.slice(
      provider.indexOf("const hydrateLocalDraftVideo"),
      provider.indexOf("const hydrateLegacyRemoteVideo"),
    );
    expect(hydrate).toContain("Never auto-delete draft video meta/images on hydrate failure");
    expect(hydrate).not.toContain("deleteDraftVideo(");
    expect(hydrate).toContain("mapLocalDraftVideoToJob(draftVideo, null, null)");
    const job = mapLocalDraftVideoToJob(
      draft({ localReference: "create-drafts/post-1/missing.mp4" }),
      null,
      null,
    );
    expect(job.status).toBe("local_error");
    expect(job.errorMessage).toBe(DRAFT_VIDEO_MISSING_MESSAGE);
  });

  it("M: Android shared Publish path still uses ensurePublishVideoPreparation", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("ensurePublishVideoPreparation");
    expect(provider).toContain('onPhase?.("preparing_video")');
    const main = read(
      "android/app/src/main/java/com/experience/app/MainActivity.java",
    );
    expect(main).toContain("registerPlugin(EchoVideoPreparePlugin.class)");
  });

  it("N: iOS shared JS path — no Android-only prepare starter; Publish is sole starter", () => {
    const gate = read(
      "src/lib/createDraftVideo/ensurePublishVideoPreparation.ts",
    );
    expect(gate).toContain("isNativeEchoVideoPrepareAvailable");
    expect(gate).not.toContain("preparation skip non-android");
    expect(gate).toContain("preparation skip non-native");
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).not.toMatch(/ensureDraftVideoPreparationStarted\(/);
    const iosPlugin = read(
      "ios/App/App/plugins/EchoVideoPrepare/EchoVideoPreparePlugin.swift",
    );
    expect(iosPlugin.length).toBeGreaterThan(100);
  });

  it("O: Create publishing still wired (uploadVideoForPublish + createPublishVideoUpload)", () => {
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("const uploadVideoForPublish");
    expect(provider).toContain("createPublishVideoUpload");
    expect(provider).toContain("resolvePublishVideoBytesSource");
  });

  it("stale preparing reconciles to local_ready without starting encoder", async () => {
    const result = await reconcileDraftVideoPreparation(
      draft({ preparationStatus: "preparing" }),
    );
    expect(result.changed).toBe(true);
    expect(result.draftVideo.preparationStatus).toBe("local_ready");
    expect(result.draftVideo.localReference).toContain("gen-a.mp4");
  });

  it("async discard must not wipe directory while newer generation depends on it", async () => {
    const oldGen = draft({
      localId: "gen-a",
      localReference: "create-drafts/post-1/gen-a.mp4",
    });
    const newGen = draft({
      localId: "gen-b",
      localReference: "create-drafts/post-1/gen-b.mp4",
    });
    writeDraftVideoMeta(newGen);

    await cleanupDraftVideoAssets({
      publishPostId: "post-1",
      draftVideo: oldGen,
    });

    expect(rmdirMock).not.toHaveBeenCalled();
    expect(readDraftVideoMeta()?.localId).toBe("gen-b");
    const deletedPaths = deleteFileMock.mock.calls.map((c) => c[0]?.path);
    expect(deletedPaths).toContain("create-drafts/post-1/gen-a.mp4");
    expect(deletedPaths).not.toContain("create-drafts/post-1/gen-b.mp4");
  });
});
