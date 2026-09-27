import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPeopleMineDevFixturesForced,
  isPeopleMineIncomingProxyEnabled,
  isPeopleMineMotionProbeEnabled,
  isPeopleMineRealIncomingEnabled,
  PEOPLE_MINE_REAL_INCOMING_STORAGE_KEY,
} from "../../pages/people/matchDeckDevMocks";

function stubLocalStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
    key: () => null,
    length: 0,
  });
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPeopleMineRealIncomingEnabled", () => {
  it("is enabled by default in DEV (Vitest / vite)", () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(isPeopleMineRealIncomingEnabled()).toBe(true);
  });

  it('DEV localStorage "0" disables real animation', () => {
    localStorage.setItem(PEOPLE_MINE_REAL_INCOMING_STORAGE_KEY, "0");
    expect(isPeopleMineRealIncomingEnabled()).toBe(false);
  });

  it('DEV localStorage "1" keeps real animation enabled', () => {
    localStorage.setItem(PEOPLE_MINE_REAL_INCOMING_STORAGE_KEY, "1");
    expect(isPeopleMineRealIncomingEnabled()).toBe(true);
  });

  it("documents production gate: !DEV returns true (compile-time in vite build)", () => {
    // Production branch in matchDeckDevMocks.ts:
    //   if (!import.meta.env.DEV) return true;
    // Vite replaces import.meta.env.DEV with false in `vite build`, so Capacitor
    // assets enable real-incoming without localStorage. This suite runs under
    // DEV=true and cannot flip that compile-time constant mid-process.
    expect(import.meta.env.PROD).toBe(false);
    expect(isPeopleMineRealIncomingEnabled()).toBe(true);
  });
});

describe("diagnostic Mine flags remain DEV-gated", () => {
  it("fixtures stay off by default", () => {
    expect(isPeopleMineDevFixturesForced()).toBe(false);
  });

  it("motion probe stays off unless explicitly opted in", () => {
    expect(isPeopleMineMotionProbeEnabled()).toBe(false);
  });

  it("incoming proxy is suppressed while real-incoming is on", () => {
    expect(isPeopleMineRealIncomingEnabled()).toBe(true);
    expect(isPeopleMineIncomingProxyEnabled()).toBe(false);
  });

  it("incoming proxy can turn on in DEV only when real-incoming is off", () => {
    localStorage.setItem(PEOPLE_MINE_REAL_INCOMING_STORAGE_KEY, "0");
    expect(isPeopleMineRealIncomingEnabled()).toBe(false);
    expect(isPeopleMineIncomingProxyEnabled()).toBe(true);
  });
});

describe("reduced-motion helper is untouched by this rollout", () => {
  it("prefersPeopleMotionReduce still reads matchMedia", async () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    const { prefersPeopleMotionReduce } = await import(
      "../../lib/people/peopleCandidateMediaPresentation"
    );
    expect(prefersPeopleMotionReduce()).toBe(true);
  });
});
