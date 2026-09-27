import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createDecimatedProgressLogger,
  runBunnyTusSmokeTest,
} from "./devBunnyUploadInitSmokeTest";
import * as bunnyTusUpload from "./bunnyUpload/bunnyTusUpload";
import * as invokeBunnyUploadInit from "./bunnyUpload/invokeBunnyUploadInit";
import * as drafts from "./drafts";
import { supabase } from "./supabaseClient";

const TEST_PUBLISH_POST_ID = "550e8400-e29b-41d4-a716-446655440000";

function mockSmokePrerequisites(): void {
  vi.spyOn(drafts, "readDraftPublishPostId").mockReturnValue(TEST_PUBLISH_POST_ID);
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { user: { id: "user-1" } } as never },
    error: null,
  });
}

function mockFilePicker(): void {
  vi.stubGlobal(
    "document",
    {
      createElement: () => {
        const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
        const input = {
          type: "",
          accept: "",
          files: [file] as unknown as FileList,
          onchange: null as (() => void) | null,
          oncancel: null as (() => void) | null,
          click: () => {
            input.onchange?.();
          },
        };
        return input;
      },
    } as unknown as Document,
  );
}

describe("createDecimatedProgressLogger", () => {
  it("logs decile progress buckets without per-percent spam", () => {
    const logs: number[] = [];
    const log = createDecimatedProgressLogger((percent) => {
      logs.push(percent);
    });

    log(0);
    log(1);
    log(9);
    log(10);
    log(11);
    log(99);
    log(100);

    expect(logs).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

describe("runBunnyTusSmokeTest", () => {
  beforeEach(() => {
    mockSmokePrerequisites();
    mockFilePicker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not invoke TUS when init is ready", async () => {
    const uploadSpy = vi.spyOn(bunnyTusUpload, "uploadFileToBunnyTus");
    const invokeSpy = vi
      .spyOn(invokeBunnyUploadInit, "invokeBunnyUploadInit")
      .mockResolvedValue({
        ok: true,
        data: {
          mediaId: "media-1",
          videoId: "video-1",
          libraryId: "12345",
          videoStatus: "ready",
          uploadRequired: false,
          reused: true,
        },
      });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runBunnyTusSmokeTest();

    expect(invokeSpy).toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(
      logSpy.mock.calls.some(
        (call) =>
          call[1] &&
          typeof call[1] === "object" &&
          (call[1] as { alreadyReady?: boolean }).alreadyReady === true,
      ),
    ).toBe(true);
  });

  it("does not invoke TUS when init is processing", async () => {
    const uploadSpy = vi.spyOn(bunnyTusUpload, "uploadFileToBunnyTus");
    vi.spyOn(invokeBunnyUploadInit, "invokeBunnyUploadInit").mockResolvedValue({
      ok: true,
      data: {
        mediaId: "media-1",
        videoId: "video-1",
        libraryId: "12345",
        videoStatus: "processing",
        uploadRequired: false,
        reused: true,
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runBunnyTusSmokeTest();

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(
      logSpy.mock.calls.some(
        (call) =>
          call[1] &&
          typeof call[1] === "object" &&
          (call[1] as { alreadyUploaded?: boolean }).alreadyUploaded === true,
      ),
    ).toBe(true);
  });
});
