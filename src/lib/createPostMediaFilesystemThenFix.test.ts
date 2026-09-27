import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Filesystem.then Promise-assimilation fix", () => {
  it("A/B: no async helper resolves with raw Filesystem proxy", () => {
    const storage = read("src/lib/createDraftVideo/nativeDraftVideoStorage.ts");
    expect(storage).not.toMatch(/async function getFilesystem\s*\(/);
    expect(storage).not.toMatch(/return\s+mod\.Filesystem\b/);
    expect(storage).not.toMatch(/return\s+Filesystem\b/);
    expect(storage).toContain("async function withFilesystem");
    expect(storage).toContain("return fn(mod.Filesystem, mod.Directory.Data)");
  });

  it("C: Filesystem.stat is invoked directly (not via awaited proxy helper)", () => {
    const video = read("src/lib/mediaAcquisitionVideo.ts");
    expect(video).toContain("await Filesystem.stat({ path: uri })");
    expect(video).not.toMatch(/await getFilesystem\s*\(/);
    expect(video).not.toMatch(/return\s+mod\.Filesystem\b/);
  });

  it("D: Filesystem.copy is invoked directly inside withFilesystem", () => {
    const storage = read("src/lib/createDraftVideo/nativeDraftVideoStorage.ts");
    expect(storage).toContain("await Filesystem.copy({");
    expect(storage).not.toMatch(/const Filesystem = await getFilesystem/);
  });

  it("E: diagnostics do not Promise-assimilate plugin proxies", () => {
    const diag = read("src/lib/devAndroidVideoDiagnostics.ts");
    expect(diag).not.toContain("@capacitor/filesystem");
    expect(diag).not.toContain("Filesystem");
    expect(diag).not.toMatch(/await\s+Filesystem\b/);
  });

  it("F/G/H: video acquisition + image routing + no Bunny in native storage", () => {
    const storage = read("src/lib/createDraftVideo/nativeDraftVideoStorage.ts");
    const routing = read("src/lib/createPostMediaRouting.ts");
    expect(storage).toContain("saveNativeDraftVideoFromUri");
    expect(storage).toContain("logAndroidVideoDiagnostic");
    expect(storage).not.toContain("bunny-upload-init");
    expect(storage).not.toContain("invokeBunnyUploadInit");
    expect(routing).toContain("routeWebLibraryFiles");
    expect(routing).toContain("partitionNativePickedMedia");
  });
});
