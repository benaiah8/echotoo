import { describe, expect, it, vi } from "vitest";
import {
  BUNNY_TUS_REMOVE_FINGERPRINT_ON_SUCCESS,
  BUNNY_TUS_RETRY_DELAYS,
  buildBunnyTusFingerprint,
  buildBunnyTusHeaders,
  pickPreviousUploadForResume,
} from "./bunnyTusUpload";
import {
  MAX_BUNNY_VIDEO_FILE_BYTES,
  validateBunnyVideoFile,
} from "./bunnyVideoConstraints";
import { parseBunnyUploadInitResponse } from "./invokeBunnyUploadInit";
import { buildSafeBunnySmokeLog, logPayloadContainsSecret } from "./safeLogging";

const ENDPOINT = "https://video.bunnycdn.com/tusupload";
const FILE = {
  name: "clip.mp4",
  type: "video/mp4",
  size: 1024,
  lastModified: 1_700_000_000_000,
};

describe("buildBunnyTusFingerprint", () => {
  it("returns the same fingerprint for the same file and Bunny video slot", () => {
    const scope = {
      endpoint: ENDPOINT,
      libraryId: "12345",
      videoId: "video-a",
    };
    expect(buildBunnyTusFingerprint(FILE, scope)).toBe(
      buildBunnyTusFingerprint(FILE, scope),
    );
  });

  it("returns different fingerprints for different video IDs", () => {
    const base = { endpoint: ENDPOINT, libraryId: "12345" };
    expect(buildBunnyTusFingerprint(FILE, { ...base, videoId: "video-a" })).not.toBe(
      buildBunnyTusFingerprint(FILE, { ...base, videoId: "video-b" }),
    );
  });

  it("returns different fingerprints for different library IDs", () => {
    const base = { endpoint: ENDPOINT, videoId: "video-a" };
    expect(buildBunnyTusFingerprint(FILE, { ...base, libraryId: "111" })).not.toBe(
      buildBunnyTusFingerprint(FILE, { ...base, libraryId: "222" }),
    );
  });

  it("does not embed secrets in the fingerprint", () => {
    const fingerprint = buildBunnyTusFingerprint(FILE, {
      endpoint: ENDPOINT,
      libraryId: "12345",
      videoId: "video-a",
    });
    expect(fingerprint).not.toContain("authorizationSignature");
    expect(fingerprint).not.toContain("secret");
  });
});

describe("BUNNY_TUS client hardening constants", () => {
  it("removes resume fingerprint after successful upload", () => {
    expect(BUNNY_TUS_REMOVE_FINGERPRINT_ON_SUCCESS).toBe(true);
  });
});

describe("pickPreviousUploadForResume", () => {
  it("prefers the newest previous upload", () => {
    const selected = pickPreviousUploadForResume([
      { uploadUrl: "https://old", creationTime: 1 },
      { uploadUrl: "https://new", creationTime: 99 },
    ] as never);
    expect(selected?.uploadUrl).toBe("https://new");
  });
});

describe("buildBunnyTusHeaders", () => {
  it("maps Bunny upload-init fields to TUS headers", () => {
    expect(
      buildBunnyTusHeaders({
        authorizationSignature: "abc123sig",
        authorizationExpire: 1700000000,
        videoId: "bunny-guid",
        libraryId: "12345",
      }),
    ).toEqual({
      AuthorizationSignature: "abc123sig",
      AuthorizationExpire: "1700000000",
      VideoId: "bunny-guid",
      LibraryId: "12345",
    });
  });
});

describe("BUNNY_TUS_RETRY_DELAYS", () => {
  it("uses the expected retry schedule", () => {
    expect(BUNNY_TUS_RETRY_DELAYS).toEqual([0, 1000, 3000, 5000, 10000]);
  });
});

describe("parseBunnyUploadInitResponse", () => {
  it("accepts pending init with upload credentials", () => {
    const parsed = parseBunnyUploadInitResponse({
      mediaId: "media-1",
      videoId: "video-1",
      libraryId: "12345",
      videoStatus: "pending",
      uploadRequired: true,
      tusEndpoint: ENDPOINT,
      authorizationExpire: 1700000000,
      authorizationSignature: "sig",
    });
    expect(parsed?.uploadRequired).toBe(true);
  });

  it("accepts ready init without upload credentials", () => {
    const parsed = parseBunnyUploadInitResponse({
      mediaId: "media-1",
      videoId: "video-1",
      libraryId: "12345",
      videoStatus: "ready",
      uploadRequired: false,
      reused: true,
    });
    expect(parsed).toEqual({
      mediaId: "media-1",
      videoId: "video-1",
      libraryId: "12345",
      videoStatus: "ready",
      uploadRequired: false,
      reused: true,
    });
  });

  it("rejects ready init that still includes TUS credentials", () => {
    const parsed = parseBunnyUploadInitResponse({
      mediaId: "media-1",
      videoId: "video-1",
      libraryId: "12345",
      videoStatus: "ready",
      uploadRequired: false,
      tusEndpoint: ENDPOINT,
      authorizationExpire: 1700000000,
      authorizationSignature: "sig",
    });
    expect(parsed).toBeNull();
  });
});

describe("validateBunnyVideoFile", () => {
  it("accepts allowed MIME types under the size cap", () => {
    const result = validateBunnyVideoFile({
      name: "clip.mp4",
      type: "video/mp4",
      size: 1024,
    });
    expect(result).toEqual({ ok: true, mimeType: "video/mp4" });
  });

  it("rejects files over 200MB", () => {
    const result = validateBunnyVideoFile({
      name: "big.mp4",
      type: "video/mp4",
      size: MAX_BUNNY_VIDEO_FILE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("200MB");
    }
  });

  it("rejects unsupported MIME types", () => {
    const result = validateBunnyVideoFile({
      name: "clip.txt",
      type: "text/plain",
      size: 1024,
    });
    expect(result.ok).toBe(false);
  });
});

describe("safeLogging", () => {
  it("buildSafeBunnySmokeLog omits signature fields", () => {
    const log = buildSafeBunnySmokeLog({
      ok: true,
      publishPostId: "550e8400-e29b-41d4-a716-446655440000",
      mediaId: "media-1",
      videoId: "video-1",
      reused: false,
      uploaded: true,
    });
    expect(log).toEqual({
      ok: true,
      publishPostId: "550e8400-e29b-41d4-a716-446655440000",
      mediaId: "media-1",
      videoId: "video-1",
      videoStatus: null,
      reused: false,
      uploaded: true,
      alreadyReady: null,
      alreadyUploaded: null,
      progress: null,
      error: null,
    });
    expect(logPayloadContainsSecret(log as Record<string, unknown>)).toBe(false);
  });

  it("detects leaked authorizationSignature in payloads", () => {
    expect(
      logPayloadContainsSecret({
        authorizationSignature: "secret",
      }),
    ).toBe(true);
  });
});
