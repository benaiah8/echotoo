import { WebPlugin } from "@capacitor/core";
import type {
  EchoVideoCrashDiagnosticsPlugin,
  EchoVideoCrashDiagnosticsSnapshot,
  SetCheckpointResult,
  VideoCrashCheckpoint,
  VideoCrashDraftFileState,
  VideoCrashNativePrepareStage,
  VideoCrashPrepareState,
} from "./definitions";

/**
 * Web/iOS stub — in-memory only; exit reason always unsupported.
 */
export class EchoVideoCrashDiagnosticsWeb
  extends WebPlugin
  implements EchoVideoCrashDiagnosticsPlugin
{
  private checkpoint: VideoCrashCheckpoint = "idle";
  private checkpointAtMs = 0;
  private sessionGeneration = 0;
  private prepareState: VideoCrashPrepareState = "idle";
  private nativePrepareStage: VideoCrashNativePrepareStage = "idle";
  private draftFileState: VideoCrashDraftFileState = "unknown";
  private draftGeneration = 0;
  private lastJsErrorCategory: string | null = null;
  private lastJsErrorCheckpoint: string | null = null;
  private lastJsErrorAtMs = 0;

  async setCheckpoint(options: {
    checkpoint: VideoCrashCheckpoint;
  }): Promise<SetCheckpointResult> {
    this.checkpoint = options.checkpoint;
    this.checkpointAtMs = Date.now();
    return {
      ok: true,
      checkpoint: this.checkpoint,
      checkpointAtMs: this.checkpointAtMs,
    };
  }

  async setPrepareState(options: {
    prepareState: VideoCrashPrepareState;
  }): Promise<{ ok: true }> {
    this.prepareState = options.prepareState;
    return { ok: true };
  }

  async setNativePrepareStage(options: {
    nativePrepareStage: VideoCrashNativePrepareStage;
  }): Promise<{ ok: true }> {
    this.nativePrepareStage = options.nativePrepareStage;
    return { ok: true };
  }

  async setDraftFileState(options: {
    draftFileState: VideoCrashDraftFileState;
    draftGeneration?: number;
  }): Promise<{ ok: true }> {
    this.draftFileState = options.draftFileState;
    if (typeof options.draftGeneration === "number" && options.draftGeneration >= 0) {
      this.draftGeneration = options.draftGeneration;
    }
    return { ok: true };
  }

  async bumpDraftGeneration(): Promise<{ ok: true; draftGeneration: number }> {
    this.draftGeneration += 1;
    return { ok: true, draftGeneration: this.draftGeneration };
  }

  async recordJsErrorCategory(options: {
    category: string;
  }): Promise<{ ok: true }> {
    this.lastJsErrorCategory = options.category.slice(0, 64);
    this.lastJsErrorCheckpoint = this.checkpoint;
    this.lastJsErrorAtMs = Date.now();
    return { ok: true };
  }

  private snapshot(bumpSession: boolean): EchoVideoCrashDiagnosticsSnapshot {
    if (bumpSession) this.sessionGeneration += 1;
    const now = Date.now();
    return {
      available: false,
      implementation: "web-stub",
      lastVideoCheckpoint: this.checkpoint,
      checkpointAtMs: this.checkpointAtMs,
      checkpointAgeMs:
        this.checkpointAtMs > 0 ? Math.max(0, now - this.checkpointAtMs) : -1,
      sessionGeneration: this.sessionGeneration,
      prepareState: this.prepareState,
      nativePrepareStage: this.nativePrepareStage,
      draftFileState: this.draftFileState,
      draftGeneration: this.draftGeneration,
      previousExitReason: "unsupported",
      previousExitDescriptionSafe: null,
      lastJsErrorCategory: this.lastJsErrorCategory,
      lastJsErrorCheckpoint: this.lastJsErrorCheckpoint,
      lastJsErrorAgeMs:
        this.lastJsErrorAtMs > 0
          ? Math.max(0, now - this.lastJsErrorAtMs)
          : null,
      rendererGone: false,
      rendererDidCrash: null,
      rendererPriorityAtExit: null,
      rendererGoneAtMs: 0,
      rendererGoneAgeMs: -1,
      prepareStateAtRendererGone: null,
      nativePrepareStageAtRendererGone: null,
      checkpointAtRendererGone: null,
      activityLifecycle: "onCreate",
      activityGeneration: 0,
      webViewPageGeneration: 0,
    };
  }

  async getStartupDiagnostics(): Promise<EchoVideoCrashDiagnosticsSnapshot> {
    return this.snapshot(true);
  }

  async getDiagnostics(): Promise<EchoVideoCrashDiagnosticsSnapshot> {
    return this.snapshot(false);
  }
}
