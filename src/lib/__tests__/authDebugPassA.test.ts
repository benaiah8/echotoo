/**
 * Auth debug helper — opt-in + redaction contracts (Pass A).
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const store = new Map<string, string>();

const localStorageMock = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
};

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {
  localStorage: localStorageMock,
  __AUTHDBG: [] as unknown[],
  location: {
    pathname: "/auth/callback",
    search: "",
    hash: "",
    href: "https://app.example/auth/callback",
    origin: "https://app.example",
  },
  matchMedia: () => ({ matches: false }),
});

import {
  __isAuthDebugOnForTests,
  __redactAuthDebugPayloadForTests,
  dbg,
  dumpAuthEnv,
  summarizeAuthUrl,
} from "../authDebug";

describe("authDebug Pass A", () => {
  beforeEach(() => {
    store.clear();
    (window as unknown as { __AUTHDBG: unknown[] }).__AUTHDBG = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    store.clear();
  });

  it("is off unless DBG_AUTH=1", () => {
    expect(__isAuthDebugOnForTests()).toBe(false);
    dbg("should_not_log", { email: "a@b.com" });
    expect(console.log).not.toHaveBeenCalled();
  });

  it("redacts email, tokens, user ids, and URLs", () => {
    const out = __redactAuthDebugPayloadForTests({
      email: "user@example.com",
      access_token: "secret-token",
      refresh_token: "refresh-secret",
      userId: "uuid-123",
      sessionUserId: "uuid-456",
      href: "https://app.example/auth/callback?code=abc#access_token=xyz",
      hasSession: true,
    }) as Record<string, unknown>;

    expect(out.email).toBe("[redacted]");
    expect(out.access_token).toBe("[redacted]");
    expect(out.refresh_token).toBe("[redacted]");
    expect(out.userId).toBe("[present]");
    expect(out.sessionUserId).toBe("[present]");
    expect(out.hasSession).toBe(true);
    expect(out.href).toMatchObject({
      pathname: "/auth/callback",
      hasSearch: true,
      hasHash: true,
      hasCodeParam: true,
    });
    expect(JSON.stringify(out)).not.toContain("user@example.com");
    expect(JSON.stringify(out)).not.toContain("secret-token");
    expect(JSON.stringify(out)).not.toContain("access_token=xyz");
    expect(JSON.stringify(out)).not.toContain("code=abc");
  });

  it("summarizeAuthUrl never returns query/hash contents", () => {
    const s = summarizeAuthUrl(
      "https://app.example/auth/callback?code=SECRET#access_token=TOK"
    );
    expect(s.pathname).toBe("/auth/callback");
    expect(s.hasCodeParam).toBe(true);
    expect(JSON.stringify(s)).not.toContain("SECRET");
    expect(JSON.stringify(s)).not.toContain("TOK");
  });

  it("opt-in dbg writes redacted ring + console", () => {
    localStorage.setItem("DBG_AUTH", "1");
    dbg("App:bootstrap_getSession", {
      hasSession: true,
      email: "leak@x.com",
      userId: "u1",
    });
    expect(console.log).toHaveBeenCalled();
    const ring = (window as unknown as { __AUTHDBG: unknown[] }).__AUTHDBG;
    expect(ring.length).toBeGreaterThan(0);
    const payload = JSON.stringify(ring);
    expect(payload).not.toContain("leak@x.com");
    expect(payload).not.toContain('"u1"');
    expect(payload).toContain("[redacted]");
    expect(payload).toContain("[present]");
  });

  it("dumpAuthEnv omits raw href/search/hash contents", () => {
    localStorage.setItem("DBG_AUTH", "1");
    const info = dumpAuthEnv({ email: "x@y.com" });
    expect(info.location).toMatchObject({
      pathname: expect.any(String),
      hasSearch: expect.any(Boolean),
      hasHash: expect.any(Boolean),
    });
    const s = JSON.stringify(info);
    expect(s).not.toContain("x@y.com");
    expect(info.location).not.toHaveProperty("href");
    expect(info.location).not.toHaveProperty("search");
    expect(info.location).not.toHaveProperty("hash");
  });
});

describe("Pass A source guards", () => {
  it("no unconditional AUTHDBG / raw OAuth URL console in auth files", () => {
    const root = process.cwd();
    const read = (rel: string) =>
      readFileSync(join(root, "src", rel), "utf8");

    const app = read("App.tsx");
    expect(app).not.toMatch(/console\.log\(\s*["']\[AUTHDBG\]/);
    expect(app).toContain('dbg("App:bootstrap_getSession"');
    expect(app).toContain('dbg("App:onAuthStateChange"');

    const cb = read("pages/AuthCallback.tsx");
    expect(cb).not.toMatch(/console\.log\(\s*["']\[AUTHDBG\]/);
    expect(cb).not.toContain("Setting session from hash tokens");
    expect(cb).not.toContain("APP URL OPEN RAW");
    expect(cb).not.toContain("EXCHANGE DEBUG");
    expect(cb).not.toContain("EXCHANGE RESULT");
    expect(cb).not.toMatch(/console\.log\(\s*["']\[DBG:OAUTH\]/);
    expect(cb).not.toContain(
      'console.error("[AuthCallback] URL used for exchange:"'
    );
    expect(cb).not.toContain("Calling exchangeCodeForSession with:");

    const oauth = read("components/CapacitorOAuthListener.tsx");
    expect(oauth).not.toContain("APP URL OPEN RAW");
    expect(oauth).not.toMatch(/console\.log\(\s*["']\[DBG:OAUTH\]/);
    expect(oauth).not.toContain("url: event.url");
    expect(oauth).toContain("summarizeAuthUrl");
    expect(oauth).toContain('dbg("oauth:appUrlOpen"');
  });
});
