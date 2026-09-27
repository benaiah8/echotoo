/**
 * Dev-only smoke tests for bunny-upload-init and Bunny TUS upload.
 * Browser console (DEV builds only):
 *   await window.__echotooBunnyInitSmokeTest?.()
 *   await window.__echotooBunnyTusSmokeTest?.()
 */
import { uploadFileToBunnyTus } from "./bunnyUpload/bunnyTusUpload";
import {
  BUNNY_VIDEO_FILE_ACCEPT,
  validateBunnyVideoFile,
} from "./bunnyUpload/bunnyVideoConstraints";
import { invokeBunnyUploadInit } from "./bunnyUpload/invokeBunnyUploadInit";
import {
  buildSafeBunnySmokeLog,
  type SafeBunnySmokeLog,
} from "./bunnyUpload/safeLogging";
import type { BunnyUploadInitResponse } from "./bunnyUpload/types";
import { readDraftPublishPostId } from "./drafts";
import { supabase } from "./supabaseClient";

declare global {
  interface Window {
    __echotooBunnyInitSmokeTest?: () => Promise<void>;
    __echotooBunnyTusSmokeTest?: () => Promise<void>;
  }
}

function logSmoke(payload: Partial<SafeBunnySmokeLog>): void {
  console.log("[echotoo bunny smoke]", buildSafeBunnySmokeLog(payload));
}

export function createDecimatedProgressLogger(
  onLog: (percent: number) => void,
): (percent: number) => void {
  const loggedBuckets = new Set<number>();

  return (percent: number) => {
    const bucket = percent >= 100 ? 100 : Math.floor(percent / 10) * 10;

    for (let milestone = 0; milestone <= bucket; milestone += 10) {
      if (loggedBuckets.has(milestone)) continue;
      loggedBuckets.add(milestone);
      onLog(milestone);
    }

    if (percent >= 100 && !loggedBuckets.has(100)) {
      loggedBuckets.add(100);
      onLog(100);
    }
  };
}

async function requireAuthenticatedDraftPublishPostId(): Promise<string | null> {
  const publishPostId = readDraftPublishPostId();
  if (!publishPostId) {
    logSmoke({
      ok: false,
      error: "No draft publishPostId — open or continue a V4 Create draft first",
    });
    return null;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    logSmoke({
      ok: false,
      publishPostId,
      error: "Not authenticated — sign in first",
    });
    return null;
  }

  return publishPostId;
}

function logInitWithoutUpload(
  publishPostId: string,
  init: BunnyUploadInitResponse,
): void {
  if (init.videoStatus === "ready") {
    logSmoke({
      ok: true,
      publishPostId,
      mediaId: init.mediaId,
      videoId: init.videoId,
      videoStatus: init.videoStatus,
      reused: init.reused ?? false,
      uploaded: true,
      alreadyReady: true,
    });
    return;
  }

  logSmoke({
    ok: true,
    publishPostId,
    mediaId: init.mediaId,
    videoId: init.videoId,
    videoStatus: init.videoStatus,
    reused: init.reused ?? false,
    alreadyUploaded: true,
  });
}

export async function runBunnyUploadInitSmokeTest(): Promise<void> {
  const publishPostId = await requireAuthenticatedDraftPublishPostId();
  if (!publishPostId) return;

  const init = await invokeBunnyUploadInit({
    publishPostId,
    fileName: "echotoo-smoke-test.mp4",
    fileSize: 1024,
    mimeType: "video/mp4",
  });

  if (!init.ok) {
    logSmoke({
      ok: false,
      publishPostId,
      error: init.error,
    });
    return;
  }

  logSmoke({
    ok: true,
    publishPostId,
    mediaId: init.data.mediaId,
    videoId: init.data.videoId,
    videoStatus: init.data.videoStatus,
    reused: init.data.reused ?? false,
  });
}

function pickLocalVideoFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = BUNNY_VIDEO_FILE_ACCEPT;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.oncancel = () => {
      resolve(null);
    };
    input.click();
  });
}

export async function runBunnyTusSmokeTest(): Promise<void> {
  const publishPostId = await requireAuthenticatedDraftPublishPostId();
  if (!publishPostId) return;

  const file = await pickLocalVideoFile();
  if (!file) {
    logSmoke({
      ok: false,
      publishPostId,
      error: "No video file selected",
    });
    return;
  }

  const validation = validateBunnyVideoFile(file);
  if (!validation.ok) {
    logSmoke({
      ok: false,
      publishPostId,
      error: validation.error,
    });
    return;
  }

  const init = await invokeBunnyUploadInit({
    publishPostId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: validation.mimeType,
  });

  if (!init.ok) {
    logSmoke({
      ok: false,
      publishPostId,
      error: init.error,
    });
    return;
  }

  if (!init.data.uploadRequired) {
    logInitWithoutUpload(publishPostId, init.data);
    return;
  }

  try {
    await uploadFileToBunnyTus(file, init.data, {
      onProgress: createDecimatedProgressLogger((progress) => {
        logSmoke({
          ok: true,
          publishPostId,
          mediaId: init.data.mediaId,
          videoId: init.data.videoId,
          videoStatus: init.data.videoStatus,
          reused: init.data.reused ?? false,
          progress,
        });
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TUS upload failed";
    logSmoke({
      ok: false,
      publishPostId,
      mediaId: init.data.mediaId,
      videoId: init.data.videoId,
      videoStatus: init.data.videoStatus,
      reused: init.data.reused ?? false,
      error: message,
    });
    return;
  }

  logSmoke({
    ok: true,
    publishPostId,
    mediaId: init.data.mediaId,
    videoId: init.data.videoId,
    videoStatus: init.data.videoStatus,
    reused: init.data.reused ?? false,
    uploaded: true,
    progress: 100,
  });
}

export function registerDevBunnyUploadInitSmokeTestHook(): () => void {
  if (!import.meta.env.DEV) {
    return () => {};
  }

  window.__echotooBunnyInitSmokeTest = runBunnyUploadInitSmokeTest;
  window.__echotooBunnyTusSmokeTest = runBunnyTusSmokeTest;

  return () => {
    delete window.__echotooBunnyInitSmokeTest;
    delete window.__echotooBunnyTusSmokeTest;
  };
}
