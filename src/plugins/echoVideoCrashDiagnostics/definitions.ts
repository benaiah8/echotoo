import type { PluginListenerHandle } from "@capacitor/core";

/** Allowed video crash diagnostic checkpoints (enum-like; no free text). */
export type VideoCrashCheckpoint =
  | "ingest-start"
  | "ingest-job-created"
  | "preview-mount"
  | "poster-start"
  | "poster-finish"
  | "prepare-capabilities"
  | "prepare-listeners-ready"
  | "prepare-start"
  | "prepare-accepted"
  | "prepare-progress"
  | "prepare-complete"
  | "prepare-failed"
  | "prepare-cancel"
  | "draft-hydrate-start"
  | "draft-hydrate-prepare"
  | "idle";

/** Independent JS prepare pipeline state — not overwritten by poster/preview. */
export type VideoCrashPrepareState =
  | "idle"
  | "capabilities"
  | "listeners_ready"
  | "starting"
  | "accepted"
  | "progress"
  | "complete"
  | "failed"
  | "cancelled";

/** Native Media3 Transformer stages (Android Engine). */
export type VideoCrashNativePrepareStage =
  | "idle"
  | "native_preflight_start"
  | "native_preflight_pass"
  | "transformer_start_call"
  | "transformer_started"
  | "transformer_progress"
  | "transformer_complete"
  | "transformer_error"
  | "transformer_cancel";

export type VideoCrashDraftFileState =
  | "unknown"
  | "exists_after_copy"
  | "exists_after_job_commit"
  | "exists_before_prepare"
  | "exists_after_old_cleanup"
  | "missing_on_hydrate";

export type VideoCrashExitReason =
  | "normal"
  | "crash"
  | "crash_native"
  | "anr"
  | "low_memory"
  | "excessive_resource_usage"
  | "initialization_failure"
  | "permission_change"
  | "user_requested"
  | "dependency_died"
  | "unknown"
  | "unsupported";

export type VideoCrashActivityLifecycle =
  | "onCreate"
  | "onStart"
  | "onResume"
  | "onPause"
  | "onStop"
  | "onDestroy";

export type VideoCrashRendererPriority =
  | "waived"
  | "bound"
  | "important"
  | "unknown";

export type EchoVideoCrashDiagnosticsSnapshot = {
  available: boolean;
  implementation: "android" | "web-stub" | "ios-stub";
  lastVideoCheckpoint: VideoCrashCheckpoint;
  checkpointAtMs: number;
  checkpointAgeMs: number;
  sessionGeneration: number;
  prepareState: VideoCrashPrepareState;
  nativePrepareStage: VideoCrashNativePrepareStage;
  draftFileState: VideoCrashDraftFileState;
  draftGeneration: number;
  previousExitReason: VideoCrashExitReason;
  previousExitDescriptionSafe: string | null;
  sdkInt?: number;
  lastJsErrorCategory?: string | null;
  lastJsErrorCheckpoint?: string | null;
  lastJsErrorAgeMs?: number | null;
  rendererGone: boolean;
  rendererDidCrash: boolean | null;
  rendererPriorityAtExit: VideoCrashRendererPriority | null;
  rendererGoneAtMs: number;
  rendererGoneAgeMs: number;
  prepareStateAtRendererGone?: VideoCrashPrepareState | null;
  nativePrepareStageAtRendererGone?: VideoCrashNativePrepareStage | null;
  checkpointAtRendererGone?: VideoCrashCheckpoint | null;
  activityLifecycle: VideoCrashActivityLifecycle;
  activityGeneration: number;
  webViewPageGeneration: number;
};

/** @deprecated Alias — prefer EchoVideoCrashDiagnosticsSnapshot */
export type EchoVideoCrashDiagnosticsStartup = EchoVideoCrashDiagnosticsSnapshot;

export type SetCheckpointResult = {
  ok: true;
  checkpoint: VideoCrashCheckpoint;
  checkpointAtMs: number;
};

export interface EchoVideoCrashDiagnosticsPlugin {
  setCheckpoint(options: {
    checkpoint: VideoCrashCheckpoint;
  }): Promise<SetCheckpointResult>;
  setPrepareState(options: {
    prepareState: VideoCrashPrepareState;
  }): Promise<{ ok: true }>;
  setNativePrepareStage(options: {
    nativePrepareStage: VideoCrashNativePrepareStage;
  }): Promise<{ ok: true }>;
  setDraftFileState(options: {
    draftFileState: VideoCrashDraftFileState;
    draftGeneration?: number;
  }): Promise<{ ok: true }>;
  bumpDraftGeneration(): Promise<{ ok: true; draftGeneration: number }>;
  recordJsErrorCategory(options: {
    category: string;
  }): Promise<{ ok: true }>;
  getStartupDiagnostics(): Promise<EchoVideoCrashDiagnosticsSnapshot>;
  getDiagnostics(): Promise<EchoVideoCrashDiagnosticsSnapshot>;
  addListener?(
    eventName: string,
    listenerFunc: (event: unknown) => void,
  ): Promise<PluginListenerHandle>;
}
