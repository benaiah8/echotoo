import { describe, expect, it } from "vitest";
import { isIgnorableOperationalError } from "./clientCrashFilters";

describe("isIgnorableOperationalError", () => {
  it("ignores abort, network, and chunk load failures", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isIgnorableOperationalError(abort)).toBe(true);
    expect(isIgnorableOperationalError(new TypeError("Failed to fetch"))).toBe(
      true
    );
    expect(isIgnorableOperationalError(new Error("NetworkError when attempting"))).toBe(
      true
    );
    expect(isIgnorableOperationalError(new Error("Load failed"))).toBe(true);
    expect(
      isIgnorableOperationalError(new Error("The Internet connection appears to be offline"))
    ).toBe(true);
    const chunk = new Error("Loading chunk 5 failed");
    chunk.name = "ChunkLoadError";
    expect(isIgnorableOperationalError(chunk)).toBe(true);
    expect(
      isIgnorableOperationalError(
        new Error("Failed to fetch dynamically imported module")
      )
    ).toBe(true);
  });

  it("ignores expected Supabase/auth business errors", () => {
    expect(
      isIgnorableOperationalError({ message: "JWT expired", code: "PGRST301" })
    ).toBe(true);
    expect(
      isIgnorableOperationalError({ message: "duplicate", code: "23505" })
    ).toBe(true);
    const auth = new Error("Invalid login");
    auth.name = "AuthApiError";
    expect(isIgnorableOperationalError(auth)).toBe(true);
    expect(isIgnorableOperationalError({ message: "denied", status: 403 })).toBe(
      true
    );
  });

  it("does not ignore genuine programming exceptions", () => {
    expect(
      isIgnorableOperationalError(
        new TypeError("Cannot read properties of undefined (reading 'id')")
      )
    ).toBe(false);
    expect(isIgnorableOperationalError(new ReferenceError("x is not defined"))).toBe(
      false
    );
  });
});
