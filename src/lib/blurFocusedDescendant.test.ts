/**
 * blurFocusedDescendant — scoped blur only when focus is inside root.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blurFocusedDescendant } from "./blurFocusedDescendant";

const rootDir = process.cwd();
function readSrc(rel: string): string {
  return readFileSync(join(rootDir, "src", rel), "utf8");
}

describe("blurFocusedDescendant", () => {
  it("no-ops without document / root / outside focus", () => {
    expect(blurFocusedDescendant(null)).toBe(false);
    expect(blurFocusedDescendant(undefined)).toBe(false);

    const blur = vi.fn();
    const outside = { blur } as unknown as HTMLElement;
    const root = {
      contains: vi.fn(() => false),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = { activeElement: outside } as unknown as Document;
    try {
      expect(blurFocusedDescendant(root)).toBe(false);
      expect(blur).not.toHaveBeenCalled();
    } finally {
      doc.document = prev;
    }
  });

  it("blurs focused descendant inside root", () => {
    const blur = vi.fn();
    const active = { blur } as unknown as HTMLElement;
    const root = {
      contains: vi.fn((node: Node) => node === active),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = { activeElement: active } as unknown as Document;
    try {
      expect(blurFocusedDescendant(root)).toBe(true);
      expect(blur).toHaveBeenCalledTimes(1);
    } finally {
      doc.document = prev;
    }
  });

  it("blurs when activeElement is the root itself", () => {
    const blur = vi.fn();
    const root = {
      blur,
      contains: vi.fn(),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = { activeElement: root } as unknown as Document;
    try {
      expect(blurFocusedDescendant(root)).toBe(true);
      expect(blur).toHaveBeenCalledTimes(1);
    } finally {
      doc.document = prev;
    }
  });
});

describe("BottomTab aria-hidden focus handoff", () => {
  it("1–6: blurs before hide; Home search helper unchanged", () => {
    const tab = readSrc("components/BottomTab.tsx");
    expect(tab).toContain("blurFocusedDescendant");
    expect(tab).toContain("tabChromeHideRootRef");
    expect(tab).toContain("useLayoutEffect");
    expect(tab).toMatch(
      /useLayoutEffect\(\(\) => \{\s*if \(!hideTabChrome\) return;\s*blurFocusedDescendant\(tabChromeHideRootRef\.current\);/,
    );
    expect(tab).toContain("aria-hidden={hideTabChrome}");
    expect(tab).toContain("navigate(Paths.people)");
    const peopleNavIdx = tab.indexOf("navigate(Paths.people)");
    const blurBeforeNav = tab.lastIndexOf(
      "blurFocusedDescendant(tabChromeHideRootRef.current)",
      peopleNavIdx,
    );
    expect(blurBeforeNav).toBeGreaterThan(-1);
    expect(blurBeforeNav).toBeLessThan(peopleNavIdx);

    const homeHelper = readSrc("lib/moveFocusOutOfHomeSearchHiddenTrees.ts");
    expect(homeHelper).toContain("moveFocusOutOfHomeSearchHiddenTrees");
    expect(homeHelper).toContain("[data-home-search-input]");

    const homePage = readSrc("pages/HomePage.tsx");
    expect(homePage).toContain("moveFocusOutOfHomeSearchHiddenTrees");
    expect(homePage.match(/moveFocusOutOfHomeSearchHiddenTrees\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Create Finalize exit focus handoff", () => {
  it("7–13: blur shell focus only on approved exit before exiting=true", () => {
    const page = readSrc("pages/CreateFinalizePage.tsx");
    expect(page).toContain("blurFocusedDescendant");
    expect(page).toContain("[data-create-finalize-shell]");
    expect(page).toMatch(
      /blurFocusedDescendant\(shell\);\s*flushSync\(\(\) => \{\s*setIsExiting\(true\);/,
    );
    expect(page).toContain("dispatchCreateFlowLeaveRequest");
    // Exit blur is only in leave callback — not on undo/redo alone as the gate.
    const leaveIdx = page.indexOf("handleLeaveCreateFlow");
    expect(leaveIdx).toBeGreaterThan(-1);
    const leaveBlock = page.slice(leaveIdx, leaveIdx + 600);
    expect(leaveBlock).toContain("blurFocusedDescendant");
    expect(leaveBlock).toContain("setIsExiting(true)");

    const shell = readSrc("components/create/CreateFinalizeComposerShell.tsx");
    expect(shell).toContain("data-create-finalize-shell");
    expect(shell).toContain("aria-hidden={exiting || undefined}");
  });
});
