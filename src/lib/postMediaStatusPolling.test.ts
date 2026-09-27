import { describe, expect, it } from "vitest";
import {
  nextPostMediaPollDelayMs,
  shouldPollPostMediaVideoStatus,
} from "./postMediaStatusPolling";

describe("post_media status polling", () => {
  it("polls processing and pre-ready server states", () => {
    expect(shouldPollPostMediaVideoStatus("processing")).toBe(true);
    expect(shouldPollPostMediaVideoStatus("pending")).toBe(true);
    expect(shouldPollPostMediaVideoStatus("uploading")).toBe(true);
    expect(shouldPollPostMediaVideoStatus("ready")).toBe(false);
    expect(shouldPollPostMediaVideoStatus("failed")).toBe(false);
  });

  it("uses bounded backoff delays", () => {
    expect(nextPostMediaPollDelayMs(1)).toBe(3000);
    expect(nextPostMediaPollDelayMs(10)).toBe(6000);
    expect(nextPostMediaPollDelayMs(25)).toBe(10000);
  });
});
