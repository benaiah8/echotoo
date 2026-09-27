/**
 * DEV-ONLY Group requester drawer swipe diagnostics.
 *
 * Browser:
 *   window.__echoGroupRequestSwipeDebug.dump()
 *   window.__echoGroupRequestSwipeDebug.summary()
 *   window.__echoGroupRequestSwipeDebug.clear()
 *
 * Layout/gesture only — never log identities, tokens, or request payloads.
 */

const IS_DEV = import.meta.env.DEV;
const BUFFER_SIZE = 160;
const MOVE_SAMPLE_MS = 48;
const LOG_PREFIX = "[ECHO GROUP REQUEST SWIPE]";

export type EchoGroupRequestSwipeDebugEvent = {
  t: number;
  stage: string;
  data?: Record<string, unknown>;
};

const BLOCKED_KEY =
  /conversation|request_id|requester|userId|user_id|username|display_name|email|token|authorization|avatar/i;

const CONSOLE_STAGES = new Set([
  "lifecycle",
  "pointerdown",
  "skip",
  "trackStart",
  "lock",
  "cancel",
  "pointerup",
  "pointercancel",
  "commit",
  "snapback",
  "onSwipeCommit",
  "storeAfterCommit",
  "motion",
]);

const events: EchoGroupRequestSwipeDebugEvent[] = [];
let apiInstalled = false;
let lastMoveSampleAt = 0;

function sanitizeData(
  data?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (BLOCKED_KEY.test(key)) continue;
    if (typeof value === "string" && value.length > 96) {
      out[key] = value.slice(0, 96);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function echoGroupRequestSwipeLayoutSnapshot(
  el: Element | null
): Record<string, unknown> {
  if (!(el instanceof HTMLElement)) return { present: false };
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const clipAncestors: Array<Record<string, string>> = [];
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 8) {
    const pcs = getComputedStyle(parent);
    if (pcs.overflow !== "visible" || pcs.overflowX !== "visible") {
      clipAncestors.push({
        tag: parent.tagName,
        className:
          typeof parent.className === "string"
            ? parent.className.slice(0, 72)
            : "",
        overflow: pcs.overflow,
        overflowX: pcs.overflowX,
      });
    }
    parent = parent.parentElement;
    depth += 1;
  }
  return {
    present: true,
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    transform: cs.transform,
    overflow: cs.overflow,
    overflowX: cs.overflowX,
    clipAncestors,
  };
}

export function echoGroupRequestSwipeRecord(
  stage: string,
  data?: Record<string, unknown>
): void {
  if (!IS_DEV) return;
  if (stage === "move" || stage === "motion") {
    const now = performance.now();
    if (now - lastMoveSampleAt < MOVE_SAMPLE_MS) return;
    lastMoveSampleAt = now;
  }
  const row: EchoGroupRequestSwipeDebugEvent = {
    t: performance.now(),
    stage,
    data: sanitizeData(data),
  };
  events.push(row);
  if (events.length > BUFFER_SIZE) {
    events.splice(0, events.length - BUFFER_SIZE);
  }
  ensureWindowApi();
  if (CONSOLE_STAGES.has(stage)) {
    console.info(LOG_PREFIX, stage, row.data ?? {});
  }
}

function countStage(stage: string): number {
  return events.filter((e) => e.stage === stage).length;
}

function lastOf(stage: string): EchoGroupRequestSwipeDebugEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.stage === stage) return events[i];
  }
  return undefined;
}

function buildSummary(): Record<string, unknown> {
  const skip = events.filter((e) => e.stage === "skip").map((e) => e.data?.reason);
  return {
    eventCount: events.length,
    pointerdown: countStage("pointerdown"),
    skip: countStage("skip"),
    skipReasons: skip.slice(-8),
    trackStart: countStage("trackStart"),
    moveSamples: countStage("move"),
    lock: countStage("lock"),
    cancel: countStage("cancel"),
    pointerup: countStage("pointerup"),
    pointercancel: countStage("pointercancel"),
    commit: countStage("commit"),
    snapback: countStage("snapback"),
    onSwipeCommit: countStage("onSwipeCommit"),
    storeAfterCommit: countStage("storeAfterCommit"),
    lastPointerdown: lastOf("pointerdown")?.data ?? null,
    lastSkip: lastOf("skip")?.data ?? null,
    lastLock: lastOf("lock")?.data ?? null,
    lastUp: lastOf("pointerup")?.data ?? lastOf("pointercancel")?.data ?? null,
    lastCommit: lastOf("commit")?.data ?? null,
    lastMotion: lastOf("motion")?.data ?? null,
  };
}

export function echoGroupRequestSwipeClear(): void {
  events.length = 0;
  lastMoveSampleAt = 0;
}

export function echoGroupRequestSwipeDump(): EchoGroupRequestSwipeDebugEvent[] {
  return events.slice();
}

export function echoGroupRequestSwipeSummary(): Record<string, unknown> {
  return buildSummary();
}

function ensureWindowApi(): void {
  if (!IS_DEV || apiInstalled) return;
  if (typeof globalThis === "undefined") return;
  const w = (globalThis as { window?: Window }).window;
  if (!w) return;
  apiInstalled = true;

  const api = {
    clear() {
      echoGroupRequestSwipeClear();
    },
    dump() {
      const rows = events.map((e, i) => ({
        i,
        t: Number(e.t.toFixed(1)),
        stage: e.stage,
        ...(e.data ?? {}),
      }));
      console.table(rows);
      return echoGroupRequestSwipeDump();
    },
    summary() {
      const out = echoGroupRequestSwipeSummary();
      console.log(`${LOG_PREFIX} summary`, out);
      return out;
    },
  };

  (
    w as Window & {
      __echoGroupRequestSwipeDebug?: typeof api;
    }
  ).__echoGroupRequestSwipeDebug = api;
}

export function echoGroupRequestSwipeInstall(): () => void {
  if (!IS_DEV) return () => {};
  ensureWindowApi();
  return () => {
    /* Keep the window API for the session so dump() still works after close. */
  };
}
