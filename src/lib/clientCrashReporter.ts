import { reportClientCrash as submitCrashRpc } from "../api/services/clientCrashReports";
import type {
  ClientCrashPlatform,
  ClientCrashSource,
  ReportClientCrashInput,
} from "../types/clientCrashReport";
import { isIgnorableOperationalError } from "./clientCrashFilters";
import { clientCrashPageLabel } from "./clientCrashPageLabel";
import {
  clipCrashText,
  crashRoutePathOnly,
  sanitizeCrashText,
} from "./clientCrashSanitize";
import { getPlatform, isNativeApp } from "./storage/utils/capacitorDetection";

export const CLIENT_CRASH_COOLDOWN_MS = 60_000;

const WEB_APP_VERSION = "1.0.4";

type CaptureInput = {
  source: ClientCrashSource;
  error: unknown;
  componentStack?: string | null;
};

type ReporterDeps = {
  submit?: (input: ReportClientCrashInput) => Promise<void>;
  now?: () => number;
};

let reporting = false;
const lastSentAt = new Map<string, number>();

export function clientCrashCooldownKey(input: {
  source: string;
  errorName: string;
  message: string;
  pageLabel: string;
}): string {
  return `${input.source}|${input.errorName}|${input.message}|${input.pageLabel}`;
}

export function resetClientCrashReporterForTests(): void {
  reporting = false;
  lastSentAt.clear();
}

function toErrorName(err: unknown): string {
  if (err instanceof Error && err.name.trim()) return err.name.trim();
  return "Error";
}

function toErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "(no message)";
}

function toErrorStack(err: unknown): string | null {
  if (err instanceof Error && err.stack) return err.stack;
  return null;
}

function resolvePlatform(): ClientCrashPlatform {
  const p = getPlatform();
  if (p === "android" || p === "ios" || p === "web") return p;
  return "web";
}

function runtimeSummary(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = sanitizeCrashText(navigator.userAgent || "");
  return clipCrashText(ua, 200);
}

async function nativeVersion(): Promise<{
  version: string | null;
  build: string | null;
}> {
  if (!isNativeApp()) {
    return { version: WEB_APP_VERSION, build: null };
  }
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return {
      version: info.version?.trim() || WEB_APP_VERSION,
      build: info.build?.trim() || null,
    };
  } catch {
    return { version: WEB_APP_VERSION, build: null };
  }
}

export function buildClientCrashPayload(
  input: CaptureInput,
  extras?: {
    platform?: ClientCrashPlatform;
    appVersion?: string | null;
    appBuild?: string | null;
  }
): ReportClientCrashInput | null {
  if (isIgnorableOperationalError(input.error)) return null;

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const route = crashRoutePathOnly(pathname);
  const pageLabel = clientCrashPageLabel(route ?? pathname);

  const errorName = clipCrashText(toErrorName(input.error), 100) || "Error";
  const message =
    clipCrashText(sanitizeCrashText(toErrorMessage(input.error)), 500) ||
    "(no message)";
  const stack = clipCrashText(
    sanitizeCrashText(toErrorStack(input.error)),
    8000
  );
  const componentStack = clipCrashText(
    sanitizeCrashText(input.componentStack),
    4000
  );

  return {
    source: input.source,
    error_name: errorName,
    message,
    stack,
    component_stack: componentStack,
    route,
    page_label: pageLabel,
    platform: extras?.platform ?? resolvePlatform(),
    app_version: extras?.appVersion ?? WEB_APP_VERSION,
    app_build: extras?.appBuild ?? null,
    runtime_summary: runtimeSummary(),
  };
}

/**
 * Fire-and-forget crash submit. Never throws. Safe from ErrorBoundary.
 */
export function reportCapturedCrash(
  input: CaptureInput,
  deps: ReporterDeps = {}
): void {
  try {
    void reportCapturedCrashAsync(input, deps);
  } catch {
    /* ignore */
  }
}

export async function reportCapturedCrashAsync(
  input: CaptureInput,
  deps: ReporterDeps = {}
): Promise<boolean> {
  const submit = deps.submit ?? submitCrashRpc;
  const now = deps.now ?? Date.now;

  if (reporting) return false;
  reporting = true;
  try {
    const payload = buildClientCrashPayload(input);
    if (!payload) return false;

    const key = clientCrashCooldownKey({
      source: payload.source,
      errorName: payload.error_name,
      message: payload.message,
      pageLabel: payload.page_label ?? "",
    });
    const last = lastSentAt.get(key);
    if (last != null && now() - last < CLIENT_CRASH_COOLDOWN_MS) {
      return false;
    }

    const native = await nativeVersion();
    payload.app_version = native.version ?? payload.app_version;
    payload.app_build = native.build;
    payload.platform = resolvePlatform();

    lastSentAt.set(key, now());
    await submit(payload);
    return true;
  } catch {
    return false;
  } finally {
    reporting = false;
  }
}
