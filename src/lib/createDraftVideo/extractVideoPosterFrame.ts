import { isCreateVideoResolutionOverLimit } from "./createVideoResolutionConstraints";

/** Modest poster edge — suitable for thumbnail + hero fallback. */
export const DRAFT_VIDEO_POSTER_MAX_EDGE_PX = 720;

/** Bound metadata / first-frame decode so ingest and hydrate cannot hang forever. */
export const VIDEO_ELEMENT_LOAD_TIMEOUT_MS = 10_000;

/**
 * Seek near the start for a decodable poster frame.
 * Avoid relying on t=0 which is often black/undecoded on mobile WebViews.
 */
export function computePosterSeekSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0.15;
  // Prefer ~0.1–0.35s; do not skip meaningful content for later playback.
  return Math.min(0.35, Math.max(0.1, duration * 0.05));
}

export type LocalVideoProbeResult = {
  width: number;
  height: number;
  duration: number;
};

export type ExtractedPosterFrame = LocalVideoProbeResult & {
  blob: Blob;
  objectUrl: string;
};

export type VideoElementLoadFailureKind =
  | "timeout"
  | "load_failed"
  | "invalid_source"
  | "aborted";

export class VideoElementLoadError extends Error {
  readonly kind: VideoElementLoadFailureKind;

  constructor(kind: VideoElementLoadFailureKind, message: string) {
    super(message);
    this.name = "VideoElementLoadError";
    this.kind = kind;
  }
}

export function isVideoElementLoadError(
  err: unknown,
): err is VideoElementLoadError {
  return err instanceof VideoElementLoadError;
}

export function isVideoElementLoadAborted(err: unknown): boolean {
  return isVideoElementLoadError(err) && err.kind === "aborted";
}

export type LoadVideoElementOptions = {
  signal?: AbortSignal | null;
  timeoutMs?: number;
};

function releaseHiddenVideoElement(video: HTMLVideoElement): void {
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  video.onloadedmetadata = null;
  video.onloadeddata = null;
  video.onerror = null;
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    /* ignore */
  }
}

/**
 * Create a muted off-DOM video for poster/probe. Honors AbortSignal: aborts
 * release the element immediately and reject with kind "aborted".
 */
export function loadVideoElement(
  objectUrl: string,
  options: LoadVideoElementOptions = {},
): Promise<HTMLVideoElement> {
  const timeoutMs = options.timeoutMs ?? VIDEO_ELEMENT_LOAD_TIMEOUT_MS;
  const signal = options.signal ?? null;

  return new Promise((resolve, reject) => {
    if (!objectUrl?.trim()) {
      reject(
        new VideoElementLoadError("invalid_source", "Empty video source"),
      );
      return;
    }

    if (signal?.aborted) {
      reject(new VideoElementLoadError("aborted", "Video load aborted"));
      return;
    }

    const video = document.createElement("video");
    // metadata alone often yields a black first canvas draw on Android WebView.
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    let settled = false;
    let metadataFallbackTimer: number | null = null;

    const clearMetadataFallback = () => {
      if (metadataFallbackTimer != null) {
        window.clearTimeout(metadataFallbackTimer);
        metadataFallbackTimer = null;
      }
    };

    const detachHandlers = () => {
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onerror = null;
      clearMetadataFallback();
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    const hardCleanup = () => {
      detachHandlers();
      releaseHiddenVideoElement(video);
    };

    const settleOk = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutTimer);
      detachHandlers();
      resolve(video);
    };

    const settleErr = (kind: VideoElementLoadFailureKind, message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutTimer);
      hardCleanup();
      reject(new VideoElementLoadError(kind, message));
    };

    const onAbort = () => {
      settleErr("aborted", "Video load aborted");
    };

    const timeoutTimer = window.setTimeout(() => {
      settleErr("timeout", "Video metadata load timed out");
    }, timeoutMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    video.onloadedmetadata = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      // Prefer loadeddata when available so a frame can decode before seek/draw.
      if (video.readyState >= 2) {
        settleOk();
        return;
      }
      // Fallback if loadeddata never fires after metadata (some WebViews).
      clearMetadataFallback();
      metadataFallbackTimer = window.setTimeout(() => {
        if (!settled && video.readyState >= 1) settleOk();
      }, 800);
    };
    video.onloadeddata = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      settleOk();
    };
    video.onerror = () => {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      settleErr("load_failed", "Could not load video metadata");
    };

    try {
      video.src = objectUrl;
    } catch (err) {
      settleErr(
        "invalid_source",
        err instanceof Error ? err.message : "Invalid video source",
      );
    }
  });
}

function seekVideo(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VideoElementLoadError("aborted", "Video seek aborted"));
      return;
    }
    let settled = false;
    const finish = (ok: boolean, err?: unknown) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      window.clearTimeout(timer);
      if (ok) resolve();
      else reject(err ?? new Error("Poster seek failed"));
    };
    const onSeeked = () => finish(true);
    const onError = () => finish(false, new Error("Poster seek error"));
    const onAbort = () =>
      finish(false, new VideoElementLoadError("aborted", "Video seek aborted"));
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = window.setTimeout(
      () => finish(false, new Error("Poster seek timeout")),
      2000,
    );
    try {
      video.currentTime = time;
    } catch (err) {
      finish(false, err);
    }
  });
}

function scalePosterDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const maxEdge = DRAFT_VIDEO_POSTER_MAX_EDGE_PX;
  const long = Math.max(width, height) || maxEdge;
  if (long <= maxEdge) {
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Exported for tests / poster sizing contracts. */
export function scalePoster(width: number, height: number) {
  return scalePosterDimensions(width, height);
}

export function isNearlyBlackPosterCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  try {
    const sample = ctx.getImageData(
      0,
      0,
      Math.min(16, width),
      Math.min(16, height),
    );
    let sum = 0;
    const pixels = sample.data.length / 4;
    for (let i = 0; i < sample.data.length; i += 4) {
      sum += (sample.data[i]! + sample.data[i + 1]! + sample.data[i + 2]!) / 3;
    }
    return pixels > 0 && sum / pixels < 8;
  } catch {
    return false;
  }
}

export type ProbeLocalVideoOptions = {
  signal?: AbortSignal | null;
};

export async function probeLocalVideoFile(
  file: File | Blob,
  options?: ProbeLocalVideoOptions,
): Promise<LocalVideoProbeResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await probeLocalVideoFromSrc(objectUrl, options);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function probeLocalVideoFromSrc(
  src: string,
  options?: ProbeLocalVideoOptions,
): Promise<LocalVideoProbeResult> {
  const video = await loadVideoElement(src, { signal: options?.signal });
  try {
    if (options?.signal?.aborted) {
      throw new VideoElementLoadError("aborted", "Video probe aborted");
    }
    return {
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    };
  } finally {
    releaseHiddenVideoElement(video);
  }
}

export type ExtractVideoPosterOptions = {
  signal?: AbortSignal | null;
};

export async function extractVideoPosterFrame(
  file: File | Blob,
  options?: ExtractVideoPosterOptions,
): Promise<ExtractedPosterFrame> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await extractVideoPosterFrameFromSrc(objectUrl, options);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Poster from an already-resolved playable URL (native convertFileSrc or blob). */
export async function extractVideoPosterFrameFromSrc(
  src: string,
  options?: ExtractVideoPosterOptions,
): Promise<ExtractedPosterFrame> {
  let video: HTMLVideoElement | null = null;
  const signal = options?.signal ?? null;

  try {
    video = await loadVideoElement(src, { signal });
    if (signal?.aborted) {
      throw new VideoElementLoadError("aborted", "Poster extraction aborted");
    }

    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    // Memory safety: never allocate a canvas for extreme sources.
    // Callers should reject >4K earlier; this is defense-in-depth.
    if (isCreateVideoResolutionOverLimit(width, height)) {
      throw new Error("Poster skipped: source resolution too high");
    }

    const seekCandidates = [
      computePosterSeekSeconds(duration),
      0.25,
      0.1,
      Math.min(0.5, Math.max(0.05, duration * 0.02)),
    ].filter((t, i, arr) => t > 0 && arr.indexOf(t) === i);

    const scaled = scalePosterDimensions(width || 640, height || 360);
    const canvas = document.createElement("canvas");
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");

    let drew = false;
    for (const seekTime of seekCandidates) {
      if (signal?.aborted) {
        throw new VideoElementLoadError("aborted", "Poster extraction aborted");
      }
      try {
        await seekVideo(video, seekTime, signal);
      } catch (err) {
        if (isVideoElementLoadAborted(err)) throw err;
        continue;
      }
      ctx.clearRect(0, 0, scaled.width, scaled.height);
      ctx.drawImage(video, 0, 0, scaled.width, scaled.height);
      if (!isNearlyBlackPosterCanvas(ctx, scaled.width, scaled.height)) {
        drew = true;
        break;
      }
    }

    if (signal?.aborted) {
      throw new VideoElementLoadError("aborted", "Poster extraction aborted");
    }

    if (!drew) {
      // Last attempt: draw whatever is current (may still be useful).
      ctx.drawImage(video, 0, 0, scaled.width, scaled.height);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Poster encode failed"))),
        "image/jpeg",
        0.82,
      );
    });

    return {
      blob,
      objectUrl: URL.createObjectURL(blob),
      width,
      height,
      duration,
    };
  } finally {
    if (video) {
      releaseHiddenVideoElement(video);
    }
  }
}

export function revokeVideoPosterObjectUrl(
  url: string | null | undefined,
): void {
  if (url) URL.revokeObjectURL(url);
}

/**
 * Wait until after the next paint so React can commit a new preview `src`
 * before old-generation draft bytes are deleted.
 */
export function waitForCreatePreviewConsumerSwitch(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      queueMicrotask(() => resolve());
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
