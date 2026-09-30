import { beforeEach, describe, expect, it, vi } from "vitest";

const reportVideoPublishFailure = vi.fn();

vi.mock("./reportVideoPublishFailure", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./reportVideoPublishFailure")>();
  return {
    ...actual,
    reportVideoPublishFailure: (...args: unknown[]) =>
      reportVideoPublishFailure(...args),
  };
});

import { logPublishFailureOutcome } from "./createPublishVideoUpload";

describe("logPublishFailureOutcome → reportVideoPublishFailure", () => {
  beforeEach(() => {
    reportVideoPublishFailure.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("invokes reporter once per terminal call with mapped stage", () => {
    logPublishFailureOutcome({
      stage: "tus",
      errorCode: "upload_stalled",
      recoverable: true,
      mediaId: "m1",
    });
    expect(reportVideoPublishFailure).toHaveBeenCalledTimes(1);
    expect(reportVideoPublishFailure).toHaveBeenCalledWith({
      stage: "upload_transfer",
      errorCode: "upload_stalled",
      recoverable: true,
      mediaId: "m1",
      bunnyVideoId: undefined,
      sizeBucket: undefined,
      durationBucket: undefined,
      width: undefined,
      height: undefined,
    });
  });

  it("still calls reporter for cancelled (reporter no-ops); console unchanged", () => {
    logPublishFailureOutcome({
      stage: "prep",
      errorCode: "cancelled",
      recoverable: true,
    });
    expect(reportVideoPublishFailure).toHaveBeenCalledTimes(1);
    expect(reportVideoPublishFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "prepare",
        errorCode: "cancelled",
      }),
    );
  });

  it("does not throw when reporter throws", () => {
    reportVideoPublishFailure.mockImplementation(() => {
      throw new Error("telemetry boom");
    });
    expect(() =>
      logPublishFailureOutcome({
        stage: "init",
        errorCode: "init_failed",
        recoverable: true,
      }),
    ).not.toThrow();
  });
});
