import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("Android WebView / Vite contract", () => {
  it("pins the Vite 6 modules target at chrome87 and does not lower it", () => {
    const src = read("vite.config.ts");
    expect(src).toContain('"es2020"');
    expect(src).toContain('"edge88"');
    expect(src).toContain('"firefox78"');
    expect(src).toContain('"chrome87"');
    expect(src).toContain('"safari14"');
    expect(src).not.toMatch(/chrome(?:[1-9]|[1-7]\d|8[0-6])\b/);
    expect(src).not.toContain("cssTarget");
    expect(src).not.toContain("@vitejs/plugin-legacy");
    expect(src).not.toContain("plugin-legacy");
  });

  it("does not add the legacy plugin dependency", () => {
    const pkg = read("package.json");
    expect(pkg).not.toContain("@vitejs/plugin-legacy");
    expect(pkg).not.toContain("plugin-legacy");
  });

  it("sets Capacitor min WebView 87 and a local error page without a dev server", () => {
    const src = read("capacitor.config.ts");
    expect(src).toContain("minWebViewVersion: 87");
    expect(src).toContain('errorPath: "unsupported-webview.html"');
    expect(src).not.toMatch(/server\s*:\s*\{[^}]*\burl\s*:/s);
    expect(src).not.toContain("cleartext");
    expect(src).not.toContain("allowNavigation");
    expect(src).not.toContain("androidScheme");
  });

  it("ships a standalone unsupported-webview page with no network or module script", () => {
    const html = read("public/unsupported-webview.html");
    expect(html).toContain("EchoToo needs an update");
    expect(html).toContain("Android System WebView");
    expect(html).toContain("Google Play");
    expect(html).toContain("prefers-color-scheme");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("type=\"module\"");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("@import");
    expect(html).not.toContain("fonts.googleapis");
  });
});

describe("unguarded crypto.randomUUID production scan", () => {
  it("keeps randomUUID only in the helper or an existing typeof guard", () => {
    const files = walk(join(process.cwd(), "src")).filter(
      (file) => !file.includes(`${join("src", "lib")}`) || !/\.test\.tsx?$/.test(file),
    );
    const production = files.filter((file) => !/\.test\.tsx?$/.test(file));
    const offenders: string[] = [];
    for (const file of production) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("crypto.randomUUID")) continue;
      const rel = file.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "");
      const normalized = rel.replace(/\\/g, "/");
      if (normalized.endsWith("src/lib/createRandomUuid.ts")) continue;
      const guarded =
        text.includes('typeof crypto.randomUUID === "function"') ||
        text.includes("typeof crypto.randomUUID === 'function'");
      if (!guarded) offenders.push(normalized);
    }
    expect(offenders).toEqual([]);
  });
});
