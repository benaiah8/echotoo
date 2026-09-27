import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VIDEO_CHECKPOINT_PREFIX,
  VIDEO_CRASH_DIAG_PREFIX,
  bumpVideoCrashDraftGeneration,
  formatDiagnosticPayload,
  getMemoryDraftFileState,
  getMemoryPrepareState,
  getMemoryVideoCrashCheckpoint,
  installVideoCrashDiagWindowHook,
  isVideoCrashCheckpoint,
  markVideoCrashDraftFileState,
  printVideoCrashDiagnostics,
  resetVideoCrashDiagnosticsForTests,
  setVideoCrashCheckpoint,
} from "./videoCrashDiagnostics";

const store = {
  checkpoint: "idle" as string,
  prepareState: "idle" as string,
  nativePrepareStage: "idle" as string,
  draftFileState: "unknown" as string,
  draftGeneration: 0,
  sessionGeneration: 0,
  checkpointAtMs: 0,
  rendererGone: false,
  rendererDidCrash: null as boolean | null,
  rendererPriorityAtExit: null as string | null,
  rendererGoneAgeMs: -1,
  prepareStateAtRendererGone: null as string | null,
  nativePrepareStageAtRendererGone: null as string | null,
  checkpointAtRendererGone: null as string | null,
  activityLifecycle: "onResume" as string,
  activityGeneration: 1,
  webViewPageGeneration: 1,
};

const setCheckpoint = vi.fn(async (opts: { checkpoint: string }) => {
  store.checkpoint = opts.checkpoint;
  store.checkpointAtMs = Date.now();
  return {
    ok: true as const,
    checkpoint: opts.checkpoint,
    checkpointAtMs: store.checkpointAtMs,
  };
});
const setPrepareState = vi.fn(async (opts: { prepareState: string }) => {
  store.prepareState = opts.prepareState;
  return { ok: true as const };
});
const setDraftFileState = vi.fn(
  async (opts: { draftFileState: string; draftGeneration?: number }) => {
    store.draftFileState = opts.draftFileState;
    if (typeof opts.draftGeneration === "number") {
      store.draftGeneration = opts.draftGeneration;
    }
    return { ok: true as const };
  },
);
const bumpDraftGeneration = vi.fn(async () => {
  store.draftGeneration += 1;
  return { ok: true as const, draftGeneration: store.draftGeneration };
});
const getDiagnostics = vi.fn(async () => ({
  available: true,
  implementation: "android" as const,
  lastVideoCheckpoint: store.checkpoint as "prepare-accepted",
  checkpointAtMs: store.checkpointAtMs || Date.now() - 1000,
  checkpointAgeMs: 1000,
  sessionGeneration: store.sessionGeneration,
  prepareState: store.prepareState as "accepted",
  nativePrepareStage: store.nativePrepareStage as "transformer_start_call",
  draftFileState: store.draftFileState as "exists_before_prepare",
  draftGeneration: store.draftGeneration,
  previousExitReason: "normal" as const,
  previousExitDescriptionSafe: null,
  lastJsErrorCategory: null,
  lastJsErrorCheckpoint: null,
  lastJsErrorAgeMs: null,
  rendererGone: store.rendererGone,
  rendererDidCrash: store.rendererDidCrash,
  rendererPriorityAtExit: store.rendererPriorityAtExit as "important" | null,
  rendererGoneAtMs: store.rendererGone ? Date.now() - 5000 : 0,
  rendererGoneAgeMs: store.rendererGoneAgeMs,
  prepareStateAtRendererGone: store.prepareStateAtRendererGone as
    | "accepted"
    | null,
  nativePrepareStageAtRendererGone: store.nativePrepareStageAtRendererGone as
    | "transformer_started"
    | null,
  checkpointAtRendererGone: store.checkpointAtRendererGone as
    | "prepare-accepted"
    | null,
  activityLifecycle: store.activityLifecycle as "onResume",
  activityGeneration: store.activityGeneration,
  webViewPageGeneration: store.webViewPageGeneration,
}));
const getStartupDiagnostics = vi.fn(async () => {
  store.sessionGeneration += 1;
  return getDiagnostics();
});
const recordJsErrorCategory = vi.fn(async (_opts: { category: string }) => ({
  ok: true as const,
}));
const setNativePrepareStage = vi.fn(
  async (opts: { nativePrepareStage: string }) => {
    store.nativePrepareStage = opts.nativePrepareStage;
    return { ok: true as const };
  },
);

vi.mock("../plugins/echoVideoCrashDiagnostics", () => ({
  EchoVideoCrashDiagnostics: {
    setCheckpoint: (opts: { checkpoint: string }) => setCheckpoint(opts),
    setPrepareState: (opts: { prepareState: string }) => setPrepareState(opts),
    setNativePrepareStage: (opts: { nativePrepareStage: string }) =>
      setNativePrepareStage(opts),
    setDraftFileState: (opts: {
      draftFileState: string;
      draftGeneration?: number;
    }) => setDraftFileState(opts),
    bumpDraftGeneration: () => bumpDraftGeneration(),
    getStartupDiagnostics: () => getStartupDiagnostics(),
    getDiagnostics: () => getDiagnostics(),
    recordJsErrorCategory: (opts: { category: string }) =>
      recordJsErrorCategory(opts),
  },
}));

vi.mock("./storage/utils/capacitorDetection", () => ({
  isNativeApp: () => true,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "android",
  },
}));

describe("videoCrashDiagnostics v2", () => {
  beforeEach(() => {
    resetVideoCrashDiagnosticsForTests();
    store.checkpoint = "idle";
    store.prepareState = "idle";
    store.nativePrepareStage = "idle";
    store.draftFileState = "unknown";
    store.draftGeneration = 0;
    store.sessionGeneration = 0;
    store.checkpointAtMs = 0;
    store.rendererGone = false;
    store.rendererDidCrash = null;
    store.rendererPriorityAtExit = null;
    store.rendererGoneAgeMs = -1;
    store.prepareStateAtRendererGone = null;
    store.nativePrepareStageAtRendererGone = null;
    store.checkpointAtRendererGone = null;
    store.activityLifecycle = "onResume";
    store.activityGeneration = 1;
    store.webViewPageGeneration = 1;
    setCheckpoint.mockClear();
    setPrepareState.mockClear();
    setDraftFileState.mockClear();
    bumpDraftGeneration.mockClear();
    getDiagnostics.mockClear();
    getStartupDiagnostics.mockClear();
  });

  afterEach(() => {
    resetVideoCrashDiagnosticsForTests();
  });

  it("poster checkpoint cannot erase prepareState", async () => {
    await setVideoCrashCheckpoint("prepare-start");
    expect(getMemoryPrepareState()).toBe("starting");
    expect(setPrepareState).toHaveBeenCalledWith({
      prepareState: "starting",
    });

    await setVideoCrashCheckpoint("poster-finish");
    expect(getMemoryVideoCrashCheckpoint()).toBe("poster-finish");
    expect(getMemoryPrepareState()).toBe("starting");
    expect(store.prepareState).toBe("starting");
  });

  it("preview mount cannot erase prepareState", async () => {
    await setVideoCrashCheckpoint("prepare-accepted");
    expect(getMemoryPrepareState()).toBe("accepted");
    await setVideoCrashCheckpoint("preview-mount");
    expect(getMemoryPrepareState()).toBe("accepted");
    expect(isVideoCrashCheckpoint("preview-mount")).toBe(true);
  });

  it("native prepare stages persist independently via store field", async () => {
    store.nativePrepareStage = "transformer_start_call";
    store.prepareState = "accepted";
    store.checkpoint = "poster-finish";
    const payload = formatDiagnosticPayload(await getDiagnostics());
    expect(payload.nativePrepareStage).toBe("transformer_start_call");
    expect(payload.prepareState).toBe("accepted");
    expect(payload.lastVideoCheckpoint).toBe("poster-finish");
  });

  it("draft file state survives conceptual restart via getDiagnostics", async () => {
    await markVideoCrashDraftFileState("exists_after_job_commit");
    expect(getMemoryDraftFileState()).toBe("exists_after_job_commit");
    store.draftFileState = "exists_after_job_commit";
    const payload = await printVideoCrashDiagnostics();
    expect(payload.draftFileState).toBe("exists_after_job_commit");
  });

  it("missing hydrate records missing_on_hydrate", async () => {
    await markVideoCrashDraftFileState("missing_on_hydrate");
    expect(getMemoryDraftFileState()).toBe("missing_on_hydrate");
    expect(setDraftFileState).toHaveBeenCalledWith({
      draftFileState: "missing_on_hydrate",
    });
  });

  it("__echoVideoCrashDiag prints sanitized state", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    store.checkpoint = "prepare-accepted";
    store.prepareState = "accepted";
    store.nativePrepareStage = "transformer_started";
    store.draftFileState = "exists_before_prepare";
    store.draftGeneration = 2;
    store.rendererGone = true;
    store.rendererDidCrash = true;
    store.rendererPriorityAtExit = "important";
    store.rendererGoneAgeMs = 5000;
    store.prepareStateAtRendererGone = "accepted";
    store.nativePrepareStageAtRendererGone = "transformer_started";
    store.checkpointAtRendererGone = "prepare-accepted";
    store.activityGeneration = 3;
    store.webViewPageGeneration = 4;

    const fakeWindow = {} as {
      __echoVideoCrashDiag?: () => Promise<unknown>;
      __echoVideoCrashDiagHelp?: string;
    };
    vi.stubGlobal("window", fakeWindow);

    installVideoCrashDiagWindowHook();
    expect(typeof fakeWindow.__echoVideoCrashDiag).toBe("function");
    const payload = await fakeWindow.__echoVideoCrashDiag!();
    expect(payload).toEqual(
      expect.objectContaining({
        previousExitReason: "normal",
        lastVideoCheckpoint: "prepare-accepted",
        prepareState: "accepted",
        nativePrepareStage: "transformer_started",
        draftFileState: "exists_before_prepare",
        rendererGone: true,
        rendererDidCrash: true,
        rendererPriorityAtExit: "important",
        activityGeneration: 3,
        webViewPageGeneration: 4,
        prepareStateAtRendererGone: "accepted",
        nativePrepareStageAtRendererGone: "transformer_started",
      }),
    );
    expect(info).toHaveBeenCalledWith(
      VIDEO_CRASH_DIAG_PREFIX,
      expect.objectContaining({ rendererGone: true }),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toMatch(/file:\/\//);
    expect(logged).not.toMatch(/content:\/\//);
    expect(logged).not.toMatch(/https?:\/\//);
    expect(fakeWindow.__echoVideoCrashDiagHelp).toContain(
      "__echoVideoCrashDiag",
    );
    vi.unstubAllGlobals();
  });

  it("preserves didCrash false faithfully", () => {
    const payload = formatDiagnosticPayload({
      available: true,
      implementation: "android",
      lastVideoCheckpoint: "prepare-accepted",
      checkpointAtMs: 1,
      checkpointAgeMs: 10,
      sessionGeneration: 2,
      prepareState: "accepted",
      nativePrepareStage: "transformer_started",
      draftFileState: "exists_before_prepare",
      draftGeneration: 1,
      previousExitReason: "normal",
      previousExitDescriptionSafe: null,
      rendererGone: true,
      rendererDidCrash: false,
      rendererPriorityAtExit: "bound",
      rendererGoneAtMs: 100,
      rendererGoneAgeMs: 50,
      prepareStateAtRendererGone: "accepted",
      nativePrepareStageAtRendererGone: "transformer_started",
      checkpointAtRendererGone: "prepare-accepted",
      activityLifecycle: "onResume",
      activityGeneration: 2,
      webViewPageGeneration: 3,
    });
    expect(payload.rendererGone).toBe(true);
    expect(payload.rendererDidCrash).toBe(false);
    expect(payload.rendererPriorityAtExit).toBe("bound");
  });

  it("activity and page generation are numeric only", async () => {
    store.activityGeneration = 7;
    store.webViewPageGeneration = 9;
    const payload = await printVideoCrashDiagnostics();
    expect(payload.activityGeneration).toBe(7);
    expect(payload.webViewPageGeneration).toBe(9);
    expect(typeof payload.activityGeneration).toBe("number");
  });

  it("checkpoint console includes prepareState without PII", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await setVideoCrashCheckpoint("prepare-start");
    expect(info).toHaveBeenCalledWith(VIDEO_CHECKPOINT_PREFIX, {
      checkpoint: "prepare-start",
      prepareState: "starting",
    });
  });

  it("bumpDraftGeneration is numeric only", async () => {
    const gen = await bumpVideoCrashDraftGeneration();
    expect(gen).toBe(1);
    expect(typeof gen).toBe("number");
  });
});
