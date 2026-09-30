import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeoutSignal } from "./createTimeoutSignal";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createTimeoutSignal", () => {
  it("uses AbortSignal.timeout when available", () => {
    const signal = new AbortController().signal;
    const timeout = vi.fn(() => signal);
    vi.stubGlobal("AbortSignal", { timeout });

    expect(createTimeoutSignal(20000)).toBe(signal);
    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(20000);
  });

  it("returns an AbortSignal that aborts after the given duration", () => {
    vi.useFakeTimers();
    const original = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: undefined,
    });

    try {
      const signal = createTimeoutSignal(20000);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);

      vi.advanceTimersByTime(19999);
      expect(signal.aborted).toBe(false);
      vi.advanceTimersByTime(1);
      expect(signal.aborted).toBe(true);
    } finally {
      Object.defineProperty(AbortSignal, "timeout", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("profile Created timeout call site", () => {
  it("keeps the 20s timeout and does not add a second policy", () => {
    const src = read("src/api/queries/getUserPostsCreated.ts");
    expect(src).toContain(".abortSignal(createTimeoutSignal(20000))");
    expect(src).not.toContain("AbortSignal.timeout");
    expect(src).toContain("return { data: data ?? [], error }");
    expect(src).not.toContain("filterExpiredHangouts");
  });
});
