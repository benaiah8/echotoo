import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  isMatchDeckHostSizeValid,
  logMatchDeckHostSizeTransition,
  logMatchDeckReadyTransition,
  resolveMatchDeckHostSize,
} from "./matchDeckHostSize";

describe("resolveMatchDeckHostSize", () => {
  it("keeps 0×0 until the first genuine positive measurement", () => {
    const a = resolveMatchDeckHostSize({ w: 0, h: 0 }, 0, 0);
    expect(a.next).toEqual({ w: 0, h: 0 });
    expect(a.changed).toBe(false);
    expect(a.ignoredTransientZero).toBe(false);
    expect(isMatchDeckHostSizeValid(a.next)).toBe(false);

    const b = resolveMatchDeckHostSize({ w: 0, h: 0 }, 390, 780);
    expect(b.next).toEqual({ w: 390, h: 780 });
    expect(b.changed).toBe(true);
    expect(b.ignoredTransientZero).toBe(false);
  });

  it("preserves last valid size across a transient zero observation", () => {
    const prev = { w: 440, h: 956 };
    const result = resolveMatchDeckHostSize(prev, 0, 0);
    expect(result.next).toBe(prev);
    expect(result.next).toEqual({ w: 440, h: 956 });
    expect(result.ignoredTransientZero).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.observed).toEqual({ w: 0, h: 0 });
  });

  it("preserves last valid size when only one axis collapses to zero", () => {
    const prev = { w: 390, h: 800 };
    expect(resolveMatchDeckHostSize(prev, 0, 800).ignoredTransientZero).toBe(
      true
    );
    expect(resolveMatchDeckHostSize(prev, 390, 0).next).toBe(prev);
  });

  it("ignores repeated zero observations without inventing sizes", () => {
    let size = { w: 412, h: 900 };
    for (let i = 0; i < 5; i += 1) {
      const r = resolveMatchDeckHostSize(size, 0, 0);
      expect(r.ignoredTransientZero).toBe(true);
      expect(r.next).toEqual({ w: 412, h: 900 });
      size = r.next;
    }
  });

  it("accepts positive-to-positive resizes", () => {
    const result = resolveMatchDeckHostSize({ w: 440, h: 956 }, 360, 800);
    expect(result.next).toEqual({ w: 360, h: 800 });
    expect(result.changed).toBe(true);
    expect(result.ignoredTransientZero).toBe(false);
  });

  it("recovers from transient zero when positive dimensions return", () => {
    const valid = { w: 440, h: 956 };
    const zero = resolveMatchDeckHostSize(valid, 0, 0);
    expect(zero.next).toEqual(valid);

    const recovered = resolveMatchDeckHostSize(zero.next, 360, 780);
    expect(recovered.next).toEqual({ w: 360, h: 780 });
    expect(recovered.changed).toBe(true);
    expect(recovered.ignoredTransientZero).toBe(false);
  });

  it("does not change state when the same positive size is re-observed", () => {
    const prev = { w: 390, h: 844 };
    const result = resolveMatchDeckHostSize(prev, 390, 844);
    expect(result.next).toBe(prev);
    expect(result.changed).toBe(false);
  });
});

describe("DEV host size transition logs", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs ignored transient zero and deckReady transitions", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logMatchDeckHostSizeTransition({
      prev: { w: 440, h: 956 },
      result: resolveMatchDeckHostSize({ w: 440, h: 956 }, 0, 0),
    });
    expect(info).toHaveBeenCalledWith(
      "[echoMatchDeckHostSize]",
      expect.objectContaining({ kind: "ignored-transient-zero" })
    );

    info.mockClear();
    logMatchDeckHostSizeTransition({
      prev: { w: 0, h: 0 },
      result: resolveMatchDeckHostSize({ w: 0, h: 0 }, 390, 780),
    });
    expect(info).toHaveBeenCalledWith(
      "[echoMatchDeckHostSize]",
      expect.objectContaining({ kind: "first-positive" })
    );

    info.mockClear();
    logMatchDeckReadyTransition({
      prevReady: true,
      nextReady: false,
      host: { w: 440, h: 956 },
    });
    expect(info).toHaveBeenCalledWith(
      "[echoMatchDeckHostSize]",
      expect.objectContaining({
        kind: "deck-not-ready",
        emblaViewport: "unmount",
      })
    );

    info.mockClear();
    logMatchDeckReadyTransition({
      prevReady: false,
      nextReady: false,
      host: { w: 0, h: 0 },
    });
    expect(info).not.toHaveBeenCalled();
  });
});
