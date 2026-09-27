/**
 * PASS LI1D.4 — DEV-only media remove diagnostics (structural).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isMediaRemoveDiagEnabled,
  mediaRemoveDiag,
} from "./createFinalizeMediaRemoveDiag";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS LI1D.4 — media remove diagnostics", () => {
  const logs: unknown[][] = [];
  beforeEach(() => {
    logs.length = 0;
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefix and DEV gate", () => {
    expect(isMediaRemoveDiagEnabled()).toBe(Boolean(import.meta.env.DEV));
    mediaRemoveDiag("probe", { clientId: "x" });
    if (import.meta.env.DEV) {
      expect(logs.some((a) => String(a[0]).includes("[echotoo media remove]"))).toBe(
        true,
      );
    } else {
      expect(logs.length).toBe(0);
    }
  });

  it("button + strip + reconcile instrumentation present", () => {
    const tile = read("src/components/create/CreateFinalizeVideoTile.tsx");
    expect(tile).toContain('mediaRemoveDiag("pointerdown"');
    expect(tile).toContain('mediaRemoveDiag("click"');
    expect(tile).toContain('mediaRemoveDiag("invoke"');
    expect(tile).toContain('mediaRemoveDiag("blocked-once-guard"');
    expect(tile).toContain('mediaRemoveDiag("select-check"');

    const strip = read(
      "src/components/create/CreateFinalizeImageManagerStrip.tsx",
    );
    expect(strip).toContain('mediaRemoveDiag("remove-entry"');
    expect(strip).toContain('mediaRemoveDiag("clientId-not-found"');
    expect(strip).toContain('mediaRemoveDiag("blocked-already-removing"');
    expect(strip).toContain('mediaRemoveDiag("mediaOrder-after"');
    expect(strip).toContain('mediaRemoveDiag("cleanup-before"');
    expect(strip).toContain("uiWaitsOnCleanup: false");
    expect(strip).toContain('mediaRemoveDiag("index-remap"');

    const order = read("src/lib/createDraftMediaOrder.ts");
    expect(order).toContain('mediaRemoveDiag("reconcile"');

    const provider = read(
      "src/components/create/CreatePostMediaProvider.tsx",
    );
    expect(provider).toContain('mediaRemoveDiag("reconcile"');
    expect(provider).toContain("event:CREATE_FLOW_SLOT0_IMAGES_PERSISTED");
  });

  it("diag module is DEV-gated", () => {
    const diag = read("src/lib/createFinalizeMediaRemoveDiag.ts");
    expect(diag).toContain("import.meta.env.DEV");
    expect(diag).toContain("[echotoo media remove]");
    expect(diag).not.toContain("auth.getSession");
    // urlType classification may mention blob: prefix; never logs blob contents
    expect(diag).toContain('startsWith("blob:")');
  });
});
