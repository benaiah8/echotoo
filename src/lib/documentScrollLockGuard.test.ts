import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Application document scroll locking must go through backgroundScrollLock.
 * Overlays: useOverlayBackgroundScrollLock
 * Page shells: usePageBackgroundScrollLock
 * Imperative: acquireBackgroundScrollLock
 */
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_REL = "lib/backgroundScrollLock.ts";

const LOCKED_PROPS = "overflow|overflowX|overflowY|position|top";
const DOC_ROOT = "document\\.(?:body|documentElement)";

const DIRECT_ASSIGN = new RegExp(
  `${DOC_ROOT}\\.style\\.(?:${LOCKED_PROPS})\\s*=`,
  "g"
);
const DIRECT_SET_PROPERTY = new RegExp(
  `${DOC_ROOT}\\.style\\.setProperty\\(\\s*['"](?:${LOCKED_PROPS})['"]`,
  "g"
);
const STYLE_ALIAS = new RegExp(
  `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${DOC_ROOT}\\.style\\b`,
  "g"
);
const ELEMENT_ALIAS = new RegExp(
  `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${DOC_ROOT}\\b(?!\\.style)`,
  "g"
);

type Hit = { file: string; line: number; snippet: string };

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    if (name.endsWith(".d.ts")) continue;
    acc.push(full);
  }
  return acc;
}

function toPosix(file: string): string {
  return relative(SRC_ROOT, file).split("\\").join("/");
}

function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, (line) => " ".repeat(line.length));
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function snippetAt(source: string, index: number): string {
  const line = source.split("\n")[lineOf(source, index) - 1] ?? "";
  return line.trim().slice(0, 160);
}

function pushMatch(hits: Hit[], file: string, source: string, regex: RegExp) {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source))) {
    hits.push({
      file,
      line: lineOf(source, m.index),
      snippet: snippetAt(source, m.index),
    });
  }
}

function aliasMutationRegex(id: string, viaStyle: boolean): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = viaStyle
    ? `\\b${escaped}\\.(?:${LOCKED_PROPS})`
    : `\\b${escaped}\\.style\\.(?:${LOCKED_PROPS})`;
  const assign = `${prefix}\\s*=`;
  const setProp = viaStyle
    ? `\\b${escaped}\\.setProperty\\(\\s*['"](?:${LOCKED_PROPS})['"]`
    : `\\b${escaped}\\.style\\.setProperty\\(\\s*['"](?:${LOCKED_PROPS})['"]`;
  return new RegExp(`${assign}|${setProp}`, "g");
}

function findHits(file: string, source: string): Hit[] {
  const hits: Hit[] = [];
  pushMatch(hits, file, source, DIRECT_ASSIGN);
  pushMatch(hits, file, source, DIRECT_SET_PROPERTY);

  for (const re of [STYLE_ALIAS, ELEMENT_ALIAS]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const id = m[1];
      if (!id) continue;
      const viaStyle = re === STYLE_ALIAS;
      pushMatch(hits, file, source, aliasMutationRegex(id, viaStyle));
    }
  }
  return hits;
}

describe("document scroll-lock guard", () => {
  it("forbids direct html/body scroll-lock writes outside backgroundScrollLock.ts", () => {
    const files = collectSourceFiles(SRC_ROOT);
    const hits: Hit[] = [];

    for (const abs of files) {
      const rel = toPosix(abs);
      if (rel === CANONICAL_REL) continue;
      const scanned = blankComments(readFileSync(abs, "utf8"));
      hits.push(...findHits(rel, scanned));
    }

    const report = hits
      .map((h) => `  ${h.file}:${h.line}: ${h.snippet}`)
      .join("\n");

    expect(
      hits,
      [
        "Direct document scroll-lock writes must go through src/lib/backgroundScrollLock.ts.",
        "Use useOverlayBackgroundScrollLock (overlays), usePageBackgroundScrollLock (page shells),",
        "or acquireBackgroundScrollLock. Do not set html/body overflow, position:fixed, or top for locking.",
        report && `Violations:\n${report}`,
      ]
        .filter(Boolean)
        .join("\n")
    ).toEqual([]);
  });
});
