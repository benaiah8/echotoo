import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDuoJoinDebugSnapshot,
  describeCanOfferPairUpBranch,
  DUO_JOIN_DEBUG_STORAGE_KEY,
  emitDuoJoinDebugLog,
  isDuoJoinDebugEnabled,
  sanitizeDuoJoinDebugError,
} from "../duoJoinDebug";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memory = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", memory);
  return memory;
}

describe("duoJoinDebug gating", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off when storage key is absent", () => {
    localStorage.removeItem(DUO_JOIN_DEBUG_STORAGE_KEY);
    expect(isDuoJoinDebugEnabled()).toBe(false);
  });

  it("is on when storage key is 1 under DEV", () => {
    localStorage.setItem(DUO_JOIN_DEBUG_STORAGE_KEY, "1");
    expect(isDuoJoinDebugEnabled()).toBe(true);
  });

  it("is off when storage key is not exactly 1", () => {
    localStorage.setItem(DUO_JOIN_DEBUG_STORAGE_KEY, "true");
    expect(isDuoJoinDebugEnabled()).toBe(false);
  });

  it("is off when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(isDuoJoinDebugEnabled()).toBe(false);
  });
});

describe("sanitizeDuoJoinDebugError", () => {
  it("preserves PostgREST-shaped fields including nulls", () => {
    expect(
      sanitizeDuoJoinDebugError({
        message: "Source is not eligible",
        code: "P0001",
        details: null,
        hint: null,
      })
    ).toEqual({
      outcome: "failure",
      message: "Source is not eligible",
      code: "P0001",
      details: null,
      hint: null,
      httpStatus: "unavailable",
    });
  });

  it("reads numeric status when exposed", () => {
    expect(
      sanitizeDuoJoinDebugError({
        message: "x",
        code: "P0001",
        details: null,
        hint: null,
        status: 400,
      }).httpStatus
    ).toBe(400);
  });
});

describe("buildDuoJoinDebugSnapshot", () => {
  it("marks omitted Feed fields as unavailable (no public defaults)", () => {
    const snap = buildDuoJoinDebugSnapshot({
      postId: "3c791a4d-0950-4fd6-b8a0-b0c6a58147af",
      origin: "feed",
      postType: "hangout",
      postProvided: true,
      pairStatus: "none",
      post: {
        type: "hangout",
        selected_dates: ["2026-09-10T08:00:00.000Z"],
        is_recurring: false,
        recurrence_days: null,
        author: { is_private: false },
      },
    });

    expect(snap.status).toBe("unavailable");
    expect(snap.visibility).toBe("unavailable");
    expect(snap.authorIsPrivate).toBe(false);
    expect(snap.selected_dates).toEqual(["2026-09-10T08:00:00.000Z"]);
    expect(snap.canOfferPairUp.inputs.status).toBe("unavailable");
    expect(snap.canOfferPairUp.inputs.visibility).toBe("unavailable");
    expect(snap.explicitTimeOrDateOnlyFlags).toBe("unavailable");
  });

  it("emitDuoJoinDebugLog never throws", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const snap = buildDuoJoinDebugSnapshot({
      postId: "p1",
      origin: "detailDock",
      postType: "hangout",
      postProvided: false,
      pairStatus: null,
      post: null,
    });
    expect(() =>
      emitDuoJoinDebugLog(snap, { outcome: "success" })
    ).not.toThrow();
    expect(info).toHaveBeenCalledWith(
      "[Duo debug]",
      expect.stringContaining('"outcome": "success"')
    );
    info.mockRestore();
  });
});

describe("describeCanOfferPairUpBranch", () => {
  it("labels non-recurring calendar upcoming branch", () => {
    expect(
      describeCanOfferPairUpBranch({
        postId: "p1",
        postType: "hangout",
        isRecurring: false,
        selectedDates: ["2099-06-01T12:00:00.000Z"],
        status: "published",
        visibility: "public",
        authorIsPrivate: false,
      })
    ).toBe("hangout_non_recurring_calendar_upcoming");
  });
});
