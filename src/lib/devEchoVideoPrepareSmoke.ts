/**
 * DEV-only helper to manually invoke EchoVideoPrepare on a physical Android device.
 * Not wired into Create UI. Call from a debug console / temporary debug entry.
 *
 * Example (Chrome remote WebView console on device):
 *   const { runDevEchoVideoPrepareSmoke } = await import('/src/lib/devEchoVideoPrepareSmoke.ts')
 * Or import in a temporary debug screen while developing C2.
 */
import { Capacitor } from "@capacitor/core";
import {
  EchoVideoPrepare,
  type EchoVideoPrepareOptions,
  type PrepareCompletedEvent,
  type PrepareFailedEvent,
  type PrepareProgressEvent,
} from "../plugins/echoVideoPrepare";
import {
  buildNativePreparedVideoPath,
  buildNativePreparedVideoTempPath,
} from "./createDraftVideo/preparedVideoPaths";

export type DevEchoVideoPrepareSmokeInput = {
  publishPostId: string;
  localId: string;
  /** Source extension without dot, default mp4 */
  sourceExt?: string;
  targetLongEdge?: number;
  targetVideoBitrate?: number;
  targetFps?: number;
  audioBitrate?: number;
};

export type DevEchoVideoPrepareSmokeResult =
  | { ok: true; completed: PrepareCompletedEvent }
  | { ok: false; code: string; message?: string };

/**
 * Runs one real native prepare against an existing draft source file.
 * Requires Capacitor Android with PASS C2 encoder.
 */
export async function runDevEchoVideoPrepareSmoke(
  input: DevEchoVideoPrepareSmokeInput,
): Promise<DevEchoVideoPrepareSmokeResult> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return {
      ok: false,
      code: "not_implemented",
      message: "DEV smoke requires Android native runtime",
    };
  }

  const caps = await EchoVideoPrepare.getCapabilities();
  if (!caps.encoderImplemented) {
    return {
      ok: false,
      code: "not_implemented",
      message: "encoderImplemented is false",
    };
  }

  const ext = (input.sourceExt ?? "mp4").replace(/^\./, "");
  const sourcePath = `create-drafts/${input.publishPostId}/${input.localId}.${ext}`;
  const destinationPath = buildNativePreparedVideoPath(
    input.publishPostId,
    input.localId,
  );
  const temporaryPath = buildNativePreparedVideoTempPath(
    input.publishPostId,
    input.localId,
  );

  const options: EchoVideoPrepareOptions = {
    jobId: `dev-smoke-${Date.now()}`,
    sourcePath,
    destinationPath,
    temporaryPath,
    targetLongEdge: input.targetLongEdge ?? 1080,
    targetVideoBitrate: input.targetVideoBitrate ?? 4_500_000,
    targetFps: input.targetFps ?? 30,
    audioBitrate: input.audioBitrate ?? 128_000,
  };

  return new Promise(async (resolve) => {
    let settled = false;
    const finish = (result: DevEchoVideoPrepareSmokeResult) => {
      if (settled) return;
      settled = true;
      void EchoVideoPrepare.removeAllListeners();
      resolve(result);
    };

    await EchoVideoPrepare.addListener(
      "prepareProgress",
      (event: PrepareProgressEvent) => {
        if (event.jobId !== options.jobId) return;
        // eslint-disable-next-line no-console
        console.info("[EchoVideoPrepare DEV]", "progress", event.progress);
      },
    );
    await EchoVideoPrepare.addListener(
      "prepareCompleted",
      (event: PrepareCompletedEvent) => {
        if (event.jobId !== options.jobId) return;
        finish({ ok: true, completed: event });
      },
    );
    await EchoVideoPrepare.addListener(
      "prepareFailed",
      (event: PrepareFailedEvent) => {
        if (event.jobId !== options.jobId) return;
        finish({
          ok: false,
          code: event.code,
          message: event.message,
        });
      },
    );
    await EchoVideoPrepare.addListener("prepareCancelled", (event) => {
      if (event.jobId !== options.jobId) return;
      finish({ ok: false, code: "cancelled" });
    });

    try {
      const accepted = await EchoVideoPrepare.prepareVideo(options);
      // eslint-disable-next-line no-console
      console.info("[EchoVideoPrepare DEV]", "accepted", accepted);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      finish({
        ok: false,
        code: e.code ?? "encode_failed",
        message: e.message ?? String(err),
      });
    }
  });
}
