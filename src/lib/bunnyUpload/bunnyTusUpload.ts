import * as tus from "tus-js-client";
import type {
  BunnyUploadInitUploadRequired,
  BunnyUploadInitResponse,
} from "./types";
import { isUploadRequiredInit } from "./types";

export const BUNNY_TUS_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000] as const;
export const BUNNY_TUS_STORE_FINGERPRINT_FOR_RESUMING = true;
export const BUNNY_TUS_REMOVE_FINGERPRINT_ON_SUCCESS = true;

export type BunnyTusHeaderInput = Pick<
  BunnyUploadInitUploadRequired,
  "authorizationSignature" | "authorizationExpire" | "videoId" | "libraryId"
>;

export type BunnyTusFingerprintInput = {
  endpoint: string;
  libraryId: string;
  videoId: string;
};

export type BunnyTusFileIdentity = Pick<
  File,
  "name" | "type" | "size" | "lastModified"
>;

export function buildBunnyTusFingerprint(
  file: BunnyTusFileIdentity,
  scope: BunnyTusFingerprintInput,
): string {
  return [
    "echotoo-bunny",
    file.name,
    file.type,
    String(file.size),
    String(file.lastModified),
    scope.endpoint,
    scope.libraryId,
    scope.videoId,
  ].join("|");
}

export function buildBunnyTusHeaders(
  init: BunnyTusHeaderInput,
): Record<string, string> {
  return {
    AuthorizationSignature: init.authorizationSignature,
    AuthorizationExpire: String(init.authorizationExpire),
    VideoId: init.videoId,
    LibraryId: init.libraryId,
  };
}

export function pickPreviousUploadForResume(
  previousUploads: tus.PreviousUpload[],
): tus.PreviousUpload | null {
  if (previousUploads.length === 0) return null;

  const createdAtMs = (upload: tus.PreviousUpload) => {
    const parsed = Date.parse(upload.creationTime);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return [...previousUploads].sort(
    (left, right) => createdAtMs(right) - createdAtMs(left),
  )[0];
}

export type BunnyTusUploadCallbacks = {
  onProgress?: (percent: number) => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
};

export type BunnyTusUploadHandle = {
  upload: tus.Upload;
  start: () => Promise<void>;
  /** Stops the active upload; tus-js-client URL storage allows resume on a later start. */
  abort: () => Promise<void>;
};

export function assertUploadRequiredInit(
  init: BunnyUploadInitResponse,
): asserts init is BunnyUploadInitUploadRequired {
  if (!isUploadRequiredInit(init)) {
    throw new Error(
      `Bunny TUS upload not required for video status ${init.videoStatus}`,
    );
  }
}

export function createBunnyTusUpload(
  file: File,
  init: BunnyUploadInitUploadRequired,
  callbacks: BunnyTusUploadCallbacks = {},
): BunnyTusUploadHandle {
  const fingerprintScope: BunnyTusFingerprintInput = {
    endpoint: init.tusEndpoint,
    libraryId: init.libraryId,
    videoId: init.videoId,
  };

  const upload = new tus.Upload(file, {
    endpoint: init.tusEndpoint,
    retryDelays: [...BUNNY_TUS_RETRY_DELAYS],
    headers: buildBunnyTusHeaders(init),
    storeFingerprintForResuming: BUNNY_TUS_STORE_FINGERPRINT_FOR_RESUMING,
    removeFingerprintOnSuccess: BUNNY_TUS_REMOVE_FINGERPRINT_ON_SUCCESS,
    metadata: {
      filetype: file.type,
      title: file.name,
    },
    fingerprint: (uploadFile, options) =>
      Promise.resolve(
        buildBunnyTusFingerprint(uploadFile, {
          endpoint: options.endpoint ?? init.tusEndpoint,
          libraryId: init.libraryId,
          videoId: init.videoId,
        }),
      ),
    onError: (error) => {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      if (bytesTotal <= 0) return;
      callbacks.onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
    },
    onSuccess: () => {
      callbacks.onSuccess?.();
    },
  });

  return {
    upload,
    start: async () => {
      const previousUploads = await upload.findPreviousUploads();
      const previousUpload = pickPreviousUploadForResume(previousUploads);
      if (previousUpload) {
        upload.resumeFromPreviousUpload(previousUpload);
      }
      upload.start();
    },
    abort: async () => {
      await upload.abort(false);
    },
  };
}

export function uploadFileToBunnyTus(
  file: File,
  init: BunnyUploadInitResponse,
  options?: {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  assertUploadRequiredInit(init);

  return new Promise((resolve, reject) => {
    const handle = createBunnyTusUpload(file, init, {
      onProgress: options?.onProgress,
      onSuccess: () => resolve(),
      onError: (error) => reject(error),
    });

    if (options?.signal) {
      if (options.signal.aborted) {
        void handle.abort().finally(() => {
          reject(new DOMException("Upload aborted", "AbortError"));
        });
        return;
      }
      options.signal.addEventListener(
        "abort",
        () => {
          void handle.abort().finally(() => {
            reject(new DOMException("Upload aborted", "AbortError"));
          });
        },
        { once: true },
      );
    }

    void handle.start().catch(reject);
  });
}
