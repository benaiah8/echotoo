import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_CRASH_COOLDOWN_MS,
  reportCapturedCrashAsync,
  resetClientCrashReporterForTests,
} from "./clientCrashReporter";

afterEach(() => {
  resetClientCrashReporterForTests();
});

describe("reportCapturedCrashAsync", () => {
  it("submits a genuine TypeError once", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const sent = await reportCapturedCrashAsync(
      {
        source: "react_boundary",
        error: new TypeError("Cannot read properties of undefined"),
        componentStack: "\n    in Feed",
      },
      { submit, now: () => 1_000 }
    );
    expect(sent).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    const payload = submit.mock.calls[0][0];
    expect(payload.source).toBe("react_boundary");
    expect(payload.error_name).toBe("TypeError");
    expect(payload.page_label).toBeTruthy();
    expect(payload.route).not.toMatch(/[?#]/);
  });

  it("skips ignorable network errors", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const sent = await reportCapturedCrashAsync(
      {
        source: "react_boundary",
        error: new TypeError("Failed to fetch"),
      },
      { submit }
    );
    expect(sent).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("applies a 60s client cooldown for the same error", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const err = new TypeError("boom");
    let now = 10_000;
    await reportCapturedCrashAsync(
      { source: "react_boundary", error: err },
      { submit, now: () => now }
    );
    const again = await reportCapturedCrashAsync(
      { source: "react_boundary", error: err },
      { submit, now: () => now + CLIENT_CRASH_COOLDOWN_MS - 1 }
    );
    expect(again).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    now = 10_000 + CLIENT_CRASH_COOLDOWN_MS;
    const later = await reportCapturedCrashAsync(
      { source: "react_boundary", error: err },
      { submit, now: () => now }
    );
    expect(later).toBe(true);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("blocks reentrant reports", async () => {
    let release!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const err = new TypeError("reenter");
    const first = reportCapturedCrashAsync(
      { source: "react_boundary", error: err },
      { submit }
    );
    const second = await reportCapturedCrashAsync(
      { source: "react_boundary", error: err },
      { submit }
    );
    expect(second).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
