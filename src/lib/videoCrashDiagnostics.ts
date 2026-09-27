/**
 * Android video crash diagnostics (Chrome Inspect).
 * Diagnostic-only — no media I/O, no behavior changes.
 */

import { Capacitor } from "@capacitor/core";
import {
  EchoVideoCrashDiagnostics,
  type EchoVideoCrashDiagnosticsSnapshot,
  type VideoCrashCheckpoint,
  type VideoCrashDraftFileState,
  type VideoCrashActivityLifecycle,
  type VideoCrashExitReason,
  type VideoCrashNativePrepareStage,
  type VideoCrashPrepareState,
  type VideoCrashRendererPriority,
} from "../plugins/echoVideoCrashDiagnostics";
import { isNativeApp } from "./storage/utils/capacitorDetection";

export const VIDEO_CRASH_DIAG_PREFIX = "[echotoo video crash diagnostic]";
export const VIDEO_CHECKPOINT_PREFIX = "[echotoo video checkpoint]";

export const VIDEO_CRASH_CHECKPOINTS = [
  "ingest-start",
  "ingest-job-created",
  "preview-mount",
  "poster-start",
  "poster-finish",
  "prepare-capabilities",
  "prepare-listeners-ready",
  "prepare-start",
  "prepare-accepted",
  "prepare-progress",
  "prepare-complete",
  "prepare-failed",
  "prepare-cancel",
  "draft-hydrate-start",
  "draft-hydrate-prepare",
  "idle",
] as const satisfies readonly VideoCrashCheckpoint[];

export const VIDEO_CRASH_PREPARE_STATES = [
  "idle",
  "capabilities",
  "listeners_ready",
  "starting",
  "accepted",
  "progress",
  "complete",
  "failed",
  "cancelled",
] as const satisfies readonly VideoCrashPrepareState[];

export const VIDEO_CRASH_NATIVE_STAGES = [
  "idle",
  "native_preflight_start",
  "native_preflight_pass",
  "transformer_start_call",
  "transformer_started",
  "transformer_progress",
  "transformer_complete",
  "transformer_error",
  "transformer_cancel",
] as const satisfies readonly VideoCrashNativePrepareStage[];

export const VIDEO_CRASH_DRAFT_FILE_STATES = [
  "unknown",
  "exists_after_copy",
  "exists_after_job_commit",
  "exists_before_prepare",
  "exists_after_old_cleanup",
  "missing_on_hydrate",
] as const satisfies readonly VideoCrashDraftFileState[];

const CHECKPOINT_SET = new Set<string>(VIDEO_CRASH_CHECKPOINTS);
const PREPARE_STATE_SET = new Set<string>(VIDEO_CRASH_PREPARE_STATES);
const NATIVE_STAGE_SET = new Set<string>(VIDEO_CRASH_NATIVE_STAGES);
const DRAFT_FILE_SET = new Set<string>(VIDEO_CRASH_DRAFT_FILE_STATES);

/** Checkpoints that update prepareState (poster/preview never touch prepareState). */
const CHECKPOINT_TO_PREPARE_STATE: Partial<
  Record<VideoCrashCheckpoint, VideoCrashPrepareState>
> = {
  "prepare-capabilities": "capabilities",
  "prepare-listeners-ready": "listeners_ready",
  "prepare-start": "starting",
  "prepare-accepted": "accepted",
  "prepare-progress": "progress",
  "prepare-complete": "complete",
  "prepare-failed": "failed",
  "prepare-cancel": "cancelled",
};

const CONSOLE_CHECKPOINTS = new Set<VideoCrashCheckpoint>([
  "ingest-start",
  "ingest-job-created",
  "preview-mount",
  "poster-start",
  "poster-finish",
  "prepare-capabilities",
  "prepare-listeners-ready",
  "prepare-start",
  "prepare-accepted",
  "prepare-complete",
  "prepare-failed",
  "prepare-cancel",
  "draft-hydrate-start",
  "draft-hydrate-prepare",
  "idle",
]);

let memoryCheckpoint: VideoCrashCheckpoint = "idle";
let memoryCheckpointAtMs = 0;
let memoryPrepareState: VideoCrashPrepareState = "idle";
let memoryNativeStage: VideoCrashNativePrepareStage = "idle";
let memoryDraftFileState: VideoCrashDraftFileState = "unknown";
let memoryDraftGeneration = 0;
let prepareProgressPersisted = false;
let startupEmitted = false;
let errorHandlersInstalled = false;
let windowHookInstalled = false;

export function isVideoCrashCheckpoint(
  value: unknown,
): value is VideoCrashCheckpoint {
  return typeof value === "string" && CHECKPOINT_SET.has(value);
}

export function isVideoCrashPrepareState(
  value: unknown,
): value is VideoCrashPrepareState {
  return typeof value === "string" && PREPARE_STATE_SET.has(value);
}

export function isVideoCrashNativePrepareStage(
  value: unknown,
): value is VideoCrashNativePrepareStage {
  return typeof value === "string" && NATIVE_STAGE_SET.has(value);
}

export function isVideoCrashDraftFileState(
  value: unknown,
): value is VideoCrashDraftFileState {
  return typeof value === "string" && DRAFT_FILE_SET.has(value);
}

export function getMemoryVideoCrashCheckpoint(): VideoCrashCheckpoint {
  return memoryCheckpoint;
}

export function getMemoryPrepareState(): VideoCrashPrepareState {
  return memoryPrepareState;
}

export function getMemoryDraftFileState(): VideoCrashDraftFileState {
  return memoryDraftFileState;
}

function isAndroidNative(): boolean {
  try {
    return isNativeApp() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

async function persistBridge(
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch {
    /* never throw from diagnostics */
  }
}

/**
 * Persist lastVideoCheckpoint. Poster/preview do NOT clear prepareState.
 * Prepare-* checkpoints also update prepareState independently.
 */
export async function setVideoCrashCheckpoint(
  checkpoint: VideoCrashCheckpoint,
  options?: { silent?: boolean },
): Promise<void> {
  if (!isVideoCrashCheckpoint(checkpoint)) return;

  if (checkpoint === "prepare-progress") {
    if (prepareProgressPersisted) return;
    prepareProgressPersisted = true;
  }
  if (
    checkpoint === "prepare-start" ||
    checkpoint === "prepare-complete" ||
    checkpoint === "prepare-failed" ||
    checkpoint === "prepare-cancel"
  ) {
    prepareProgressPersisted = false;
  }

  memoryCheckpoint = checkpoint;
  memoryCheckpointAtMs = Date.now();

  const prepareMapped = CHECKPOINT_TO_PREPARE_STATE[checkpoint];
  if (prepareMapped) {
    memoryPrepareState = prepareMapped;
  }

  const silent =
    options?.silent === true ||
    checkpoint === "prepare-progress" ||
    !CONSOLE_CHECKPOINTS.has(checkpoint);

  if (!silent) {
    console.info(VIDEO_CHECKPOINT_PREFIX, {
      checkpoint,
      prepareState: memoryPrepareState,
    });
  }

  await persistBridge(() =>
    EchoVideoCrashDiagnostics.setCheckpoint({ checkpoint }),
  );
  if (prepareMapped) {
    await persistBridge(() =>
      EchoVideoCrashDiagnostics.setPrepareState({
        prepareState: prepareMapped,
      }),
    );
  }
}

export function markVideoCrashCheckpoint(
  checkpoint: VideoCrashCheckpoint,
): void {
  void setVideoCrashCheckpoint(checkpoint);
}

export async function setVideoCrashPrepareState(
  prepareState: VideoCrashPrepareState,
): Promise<void> {
  if (!isVideoCrashPrepareState(prepareState)) return;
  memoryPrepareState = prepareState;
  await persistBridge(() =>
    EchoVideoCrashDiagnostics.setPrepareState({ prepareState }),
  );
}

export async function setVideoCrashDraftFileState(
  draftFileState: VideoCrashDraftFileState,
  options?: { draftGeneration?: number },
): Promise<void> {
  if (!isVideoCrashDraftFileState(draftFileState)) return;
  memoryDraftFileState = draftFileState;
  if (
    typeof options?.draftGeneration === "number" &&
    options.draftGeneration >= 0
  ) {
    memoryDraftGeneration = options.draftGeneration;
  }
  await persistBridge(() =>
    EchoVideoCrashDiagnostics.setDraftFileState({
      draftFileState,
      ...(typeof options?.draftGeneration === "number"
        ? { draftGeneration: options.draftGeneration }
        : {}),
    }),
  );
}

export function markVideoCrashDraftFileState(
  draftFileState: VideoCrashDraftFileState,
  options?: { draftGeneration?: number },
): void {
  void setVideoCrashDraftFileState(draftFileState, options);
}

export async function bumpVideoCrashDraftGeneration(): Promise<number> {
  try {
    const result = await EchoVideoCrashDiagnostics.bumpDraftGeneration();
    memoryDraftGeneration = result.draftGeneration;
    return result.draftGeneration;
  } catch {
    memoryDraftGeneration += 1;
    return memoryDraftGeneration;
  }
}

export function classifySanitizedJsErrorCategory(error: unknown): string {
  if (error == null) return "unknown";
  if (typeof error === "string") {
    const t = error.trim().toLowerCase();
    if (t.includes("network")) return "network";
    if (t.includes("quota")) return "quota";
    return "string_error";
  }
  if (typeof error === "object") {
    const name =
      "name" in error && typeof (error as { name?: unknown }).name === "string"
        ? (error as { name: string }).name.trim()
        : "";
    if (name === "TypeError") return "type_error";
    if (name === "ReferenceError") return "reference_error";
    if (name === "RangeError") return "range_error";
    if (name === "SyntaxError") return "syntax_error";
    if (name === "AbortError") return "abort_error";
    if (name) {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9_.\-]/g, "_")
        .slice(0, 48);
    }
  }
  return "error";
}

export function sanitizeExitReason(
  value: unknown,
): VideoCrashExitReason {
  const allowed: VideoCrashExitReason[] = [
    "normal",
    "crash",
    "crash_native",
    "anr",
    "low_memory",
    "excessive_resource_usage",
    "initialization_failure",
    "permission_change",
    "user_requested",
    "dependency_died",
    "unknown",
    "unsupported",
  ];
  if (typeof value === "string" && (allowed as string[]).includes(value)) {
    return value as VideoCrashExitReason;
  }
  return "unknown";
}

function sanitizeDescriptionSafe(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replace(
      /(file:\/\/|\/data\/|\/storage\/|content:\/\/|https?:\/\/|Bearer\s+\S+|eyJ[A-Za-z0-9_-]{10,})/gi,
      "[redacted]",
    )
    .replace(/[A-Za-z0-9._\-]+\.(mp4|mov|m4v|webm|mkv)/gi, "[file]")
    .slice(0, 120);
  return cleaned || null;
}

export type VideoCrashDiagConsolePayload = {
  previousExitReason: VideoCrashExitReason;
  previousExitDescriptionSafe: string | null;
  lastVideoCheckpoint: VideoCrashCheckpoint;
  prepareState: VideoCrashPrepareState;
  nativePrepareStage: VideoCrashNativePrepareStage;
  draftFileState: VideoCrashDraftFileState;
  checkpointAgeMs: number;
  sessionGeneration: number;
  lastJsErrorCategory: string | null;
  draftGeneration?: number;
  rendererGone: boolean;
  rendererDidCrash: boolean | null;
  rendererPriorityAtExit: VideoCrashRendererPriority | null;
  rendererGoneAgeMs: number;
  prepareStateAtRendererGone: VideoCrashPrepareState | null;
  nativePrepareStageAtRendererGone: VideoCrashNativePrepareStage | null;
  checkpointAtRendererGone: VideoCrashCheckpoint | null;
  activityLifecycle: VideoCrashActivityLifecycle;
  activityGeneration: number;
  webViewPageGeneration: number;
};

function sanitizeActivityLifecycle(
  value: unknown,
): VideoCrashActivityLifecycle {
  const allowed: VideoCrashActivityLifecycle[] = [
    "onCreate",
    "onStart",
    "onResume",
    "onPause",
    "onStop",
    "onDestroy",
  ];
  if (typeof value === "string" && (allowed as string[]).includes(value)) {
    return value as VideoCrashActivityLifecycle;
  }
  return "onCreate";
}

function sanitizeRendererPriority(
  value: unknown,
): VideoCrashRendererPriority | null {
  if (value == null) return null;
  const allowed: VideoCrashRendererPriority[] = [
    "waived",
    "bound",
    "important",
    "unknown",
  ];
  if (typeof value === "string" && (allowed as string[]).includes(value)) {
    return value as VideoCrashRendererPriority;
  }
  return "unknown";
}

export function formatDiagnosticPayload(
  raw: EchoVideoCrashDiagnosticsSnapshot,
): VideoCrashDiagConsolePayload {
  return {
    previousExitReason: sanitizeExitReason(raw.previousExitReason),
    previousExitDescriptionSafe: sanitizeDescriptionSafe(
      raw.previousExitDescriptionSafe,
    ),
    lastVideoCheckpoint: isVideoCrashCheckpoint(raw.lastVideoCheckpoint)
      ? raw.lastVideoCheckpoint
      : "idle",
    prepareState: isVideoCrashPrepareState(raw.prepareState)
      ? raw.prepareState
      : "idle",
    nativePrepareStage: isVideoCrashNativePrepareStage(raw.nativePrepareStage)
      ? raw.nativePrepareStage
      : "idle",
    draftFileState: isVideoCrashDraftFileState(raw.draftFileState)
      ? raw.draftFileState
      : "unknown",
    checkpointAgeMs:
      typeof raw.checkpointAgeMs === "number" &&
      Number.isFinite(raw.checkpointAgeMs)
        ? raw.checkpointAgeMs
        : -1,
    sessionGeneration:
      typeof raw.sessionGeneration === "number" ? raw.sessionGeneration : 0,
    lastJsErrorCategory:
      typeof raw.lastJsErrorCategory === "string"
        ? raw.lastJsErrorCategory.slice(0, 64)
        : null,
    draftGeneration:
      typeof raw.draftGeneration === "number" ? raw.draftGeneration : 0,
    rendererGone: Boolean(raw.rendererGone),
    rendererDidCrash:
      typeof raw.rendererDidCrash === "boolean" ? raw.rendererDidCrash : null,
    rendererPriorityAtExit: sanitizeRendererPriority(
      raw.rendererPriorityAtExit,
    ),
    rendererGoneAgeMs:
      typeof raw.rendererGoneAgeMs === "number" &&
      Number.isFinite(raw.rendererGoneAgeMs)
        ? raw.rendererGoneAgeMs
        : -1,
    prepareStateAtRendererGone: isVideoCrashPrepareState(
      raw.prepareStateAtRendererGone,
    )
      ? raw.prepareStateAtRendererGone
      : null,
    nativePrepareStageAtRendererGone: isVideoCrashNativePrepareStage(
      raw.nativePrepareStageAtRendererGone,
    )
      ? raw.nativePrepareStageAtRendererGone
      : null,
    checkpointAtRendererGone: isVideoCrashCheckpoint(
      raw.checkpointAtRendererGone,
    )
      ? raw.checkpointAtRendererGone
      : null,
    activityLifecycle: sanitizeActivityLifecycle(raw.activityLifecycle),
    activityGeneration:
      typeof raw.activityGeneration === "number" ? raw.activityGeneration : 0,
    webViewPageGeneration:
      typeof raw.webViewPageGeneration === "number"
        ? raw.webViewPageGeneration
        : 0,
  };
}

/** @deprecated use formatDiagnosticPayload */
export function formatStartupDiagnosticPayload(
  raw: EchoVideoCrashDiagnosticsSnapshot,
): VideoCrashDiagConsolePayload {
  return formatDiagnosticPayload(raw);
}

function applySnapshotToMemory(raw: EchoVideoCrashDiagnosticsSnapshot): void {
  if (isVideoCrashCheckpoint(raw.lastVideoCheckpoint)) {
    memoryCheckpoint = raw.lastVideoCheckpoint;
  }
  if (typeof raw.checkpointAtMs === "number") {
    memoryCheckpointAtMs = raw.checkpointAtMs;
  }
  if (isVideoCrashPrepareState(raw.prepareState)) {
    memoryPrepareState = raw.prepareState;
  }
  if (isVideoCrashNativePrepareStage(raw.nativePrepareStage)) {
    memoryNativeStage = raw.nativePrepareStage;
  }
  if (isVideoCrashDraftFileState(raw.draftFileState)) {
    memoryDraftFileState = raw.draftFileState;
  }
  if (typeof raw.draftGeneration === "number") {
    memoryDraftGeneration = raw.draftGeneration;
  }
}

/**
 * Emit ONE startup diagnostic block for Chrome Inspect.
 */
export async function emitVideoCrashStartupDiagnostic(): Promise<void> {
  if (startupEmitted) return;
  startupEmitted = true;

  if (!isAndroidNative()) {
    if (!isNativeApp()) return;
  }

  try {
    const raw = await EchoVideoCrashDiagnostics.getStartupDiagnostics();
    const payload = formatDiagnosticPayload(raw);
    console.info(VIDEO_CRASH_DIAG_PREFIX, payload);
    applySnapshotToMemory(raw);
  } catch {
    console.info(VIDEO_CRASH_DIAG_PREFIX, {
      previousExitReason: "unknown",
      previousExitDescriptionSafe: null,
      lastVideoCheckpoint: memoryCheckpoint,
      prepareState: memoryPrepareState,
      nativePrepareStage: memoryNativeStage,
      draftFileState: memoryDraftFileState,
      checkpointAgeMs:
        memoryCheckpointAtMs > 0
          ? Math.max(0, Date.now() - memoryCheckpointAtMs)
          : -1,
      sessionGeneration: 0,
      lastJsErrorCategory: null,
      rendererGone: false,
      rendererDidCrash: null,
      rendererPriorityAtExit: null,
      rendererGoneAgeMs: -1,
      prepareStateAtRendererGone: null,
      nativePrepareStageAtRendererGone: null,
      checkpointAtRendererGone: null,
      activityLifecycle: "onCreate",
      activityGeneration: 0,
      webViewPageGeneration: 0,
    } satisfies VideoCrashDiagConsolePayload);
  }
}

/**
 * On-demand Chrome Inspect command — read-only, no session bump, no resets.
 */
export async function printVideoCrashDiagnostics(): Promise<VideoCrashDiagConsolePayload> {
  try {
    const raw = await EchoVideoCrashDiagnostics.getDiagnostics();
    const payload = formatDiagnosticPayload(raw);
    console.info(VIDEO_CRASH_DIAG_PREFIX, payload);
    applySnapshotToMemory(raw);
    return payload;
  } catch {
    const fallback: VideoCrashDiagConsolePayload = {
      previousExitReason: "unknown",
      previousExitDescriptionSafe: null,
      lastVideoCheckpoint: memoryCheckpoint,
      prepareState: memoryPrepareState,
      nativePrepareStage: memoryNativeStage,
      draftFileState: memoryDraftFileState,
      checkpointAgeMs:
        memoryCheckpointAtMs > 0
          ? Math.max(0, Date.now() - memoryCheckpointAtMs)
          : -1,
      sessionGeneration: 0,
      lastJsErrorCategory: null,
      draftGeneration: memoryDraftGeneration,
      rendererGone: false,
      rendererDidCrash: null,
      rendererPriorityAtExit: null,
      rendererGoneAgeMs: -1,
      prepareStateAtRendererGone: null,
      nativePrepareStageAtRendererGone: null,
      checkpointAtRendererGone: null,
      activityLifecycle: "onCreate",
      activityGeneration: 0,
      webViewPageGeneration: 0,
    };
    console.info(VIDEO_CRASH_DIAG_PREFIX, fallback);
    return fallback;
  }
}

export async function recordVideoCrashJsError(error: unknown): Promise<void> {
  const category = classifySanitizedJsErrorCategory(error);
  console.info(VIDEO_CRASH_DIAG_PREFIX, {
    kind: "js-error",
    category,
    lastVideoCheckpoint: memoryCheckpoint,
    prepareState: memoryPrepareState,
  });
  if (!isAndroidNative() && !isNativeApp()) return;
  await persistBridge(() =>
    EchoVideoCrashDiagnostics.recordJsErrorCategory({ category }),
  );
}

export function installVideoCrashErrorCorrelation(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (errorHandlersInstalled) return () => undefined;
  errorHandlersInstalled = true;

  const onError = (event: ErrorEvent) => {
    void recordVideoCrashJsError(event.error ?? event.message ?? "window_error");
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    void recordVideoCrashJsError(event.reason ?? "unhandledrejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    errorHandlersInstalled = false;
  };
}

type EchoDiagWindow = Window & {
  __echoVideoCrashDiag?: () => Promise<VideoCrashDiagConsolePayload>;
  __echoVideoCrashDiagHelp?: string;
};

/**
 * Expose window.__echoVideoCrashDiag() for late Chrome Inspect attach.
 */
export function installVideoCrashDiagWindowHook(): void {
  if (typeof window === "undefined") return;
  if (windowHookInstalled) return;
  windowHookInstalled = true;
  const w = window as EchoDiagWindow;
  w.__echoVideoCrashDiagHelp =
    "Call window.__echoVideoCrashDiag() to print sanitized video crash diagnostic state (read-only).";
  w.__echoVideoCrashDiag = () => printVideoCrashDiagnostics();
}

export function resetVideoCrashDiagnosticsForTests(): void {
  memoryCheckpoint = "idle";
  memoryCheckpointAtMs = 0;
  memoryPrepareState = "idle";
  memoryNativeStage = "idle";
  memoryDraftFileState = "unknown";
  memoryDraftGeneration = 0;
  prepareProgressPersisted = false;
  startupEmitted = false;
  errorHandlersInstalled = false;
  windowHookInstalled = false;
  if (typeof window !== "undefined") {
    const w = window as EchoDiagWindow;
    delete w.__echoVideoCrashDiag;
    delete w.__echoVideoCrashDiagHelp;
  }
}
