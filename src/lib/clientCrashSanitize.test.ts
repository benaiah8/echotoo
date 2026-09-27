import { describe, expect, it } from "vitest";
import { crashRoutePathOnly, sanitizeCrashText } from "./clientCrashSanitize";

describe("sanitizeCrashText", () => {
  it("redacts Bearer, JWT, apikey, and sb- secrets", () => {
    const raw = [
      "Bearer abc.def.ghi-token",
      "jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFBPVXlZqJQ",
      "apikey=secret-value",
      "apikey: other-secret",
      "sb-anon-key-abcdefghi",
    ].join(" ");
    const out = sanitizeCrashText(raw);
    expect(out).not.toMatch(/abc\.def\.ghi-token/);
    expect(out).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    expect(out).not.toMatch(/secret-value/);
    expect(out).not.toMatch(/other-secret/);
    expect(out).not.toMatch(/sb-anon-key-abcdefghi/);
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("apikey=[REDACTED]");
  });
});

describe("crashRoutePathOnly", () => {
  it("drops query and hash", () => {
    expect(crashRoutePathOnly("/profile/foo?token=abc#section")).toBe(
      "/profile/foo"
    );
  });

  it("extracts pathname from absolute URLs", () => {
    expect(crashRoutePathOnly("https://example.com/u/me?x=1")).toBe("/u/me");
  });
});
