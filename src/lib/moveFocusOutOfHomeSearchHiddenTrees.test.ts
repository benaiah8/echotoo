/**
 * Focus-handoff contracts for Home search aria-hidden (no jsdom).
 */
import { describe, expect, it, vi } from "vitest";
import { moveFocusOutOfHomeSearchHiddenTrees } from "./moveFocusOutOfHomeSearchHiddenTrees";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("moveFocusOutOfHomeSearchHiddenTrees", () => {
  it("moves focus from a browse descendant to the search input", () => {
    const search = {
      focus: vi.fn(),
    } as unknown as HTMLInputElement;
    const host = {
      querySelector: vi.fn(() => search),
    } as unknown as HTMLElement;
    const active = {
      closest: vi.fn(() => null),
      blur: vi.fn(),
    } as unknown as HTMLElement;
    const browse = {
      contains: vi.fn((node: Node) => node === active),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = {
      activeElement: active,
    } as unknown as Document;

    try {
      moveFocusOutOfHomeSearchHiddenTrees({
        browseRoot: browse,
        searchInputHost: host,
      });
      expect(search.focus).toHaveBeenCalledWith({ preventScroll: true });
      // Mock focus does not move activeElement; blur is the fallback.
      expect(active.blur).toHaveBeenCalled();
    } finally {
      doc.document = prev;
    }
  });

  it("moves focus from a bottom-tab control to the search input", () => {
    const search = {
      focus: vi.fn(),
    } as unknown as HTMLInputElement;
    const host = {
      querySelector: vi.fn(() => search),
    } as unknown as HTMLElement;
    const tabRoot = { id: "tab-root" };
    const active = {
      closest: vi.fn((sel: string) =>
        sel === "[data-bottomtab]" ? tabRoot : null
      ),
      blur: vi.fn(),
    } as unknown as HTMLElement;
    const browse = {
      contains: vi.fn(() => false),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = {
      activeElement: active,
    } as unknown as Document;

    try {
      moveFocusOutOfHomeSearchHiddenTrees({
        browseRoot: browse,
        searchInputHost: host,
      });
      expect(active.closest).toHaveBeenCalledWith("[data-bottomtab]");
      expect(search.focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(active.blur).toHaveBeenCalled();
    } finally {
      doc.document = prev;
    }
  });

  it("leaves unrelated focus alone", () => {
    const search = {
      focus: vi.fn(),
    } as unknown as HTMLInputElement;
    const host = {
      querySelector: vi.fn(() => search),
    } as unknown as HTMLElement;
    const active = {
      closest: vi.fn(() => null),
      blur: vi.fn(),
    } as unknown as HTMLElement;
    const browse = {
      contains: vi.fn(() => false),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = {
      activeElement: active,
    } as unknown as Document;

    try {
      moveFocusOutOfHomeSearchHiddenTrees({
        browseRoot: browse,
        searchInputHost: host,
      });
      expect(search.focus).not.toHaveBeenCalled();
      expect(active.blur).not.toHaveBeenCalled();
    } finally {
      doc.document = prev;
    }
  });

  it("blurs when no search input restore target exists", () => {
    const host = {
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement;
    const active = {
      closest: vi.fn(() => null),
      blur: vi.fn(),
    } as unknown as HTMLElement;
    const browse = {
      contains: vi.fn((node: Node) => node === active),
    } as unknown as HTMLElement;

    const doc = globalThis as typeof globalThis & { document?: Document };
    const prev = doc.document;
    doc.document = {
      activeElement: active,
    } as unknown as Document;

    try {
      moveFocusOutOfHomeSearchHiddenTrees({
        browseRoot: browse,
        searchInputHost: host,
      });
      expect(active.blur).toHaveBeenCalled();
    } finally {
      doc.document = prev;
    }
  });
});

describe("Home search aria-hidden focus handoff wiring", () => {
  it("calls the handoff before browse/tab aria-hidden activation", () => {
    const page = read("src/pages/HomePage.tsx");
    expect(page).toContain("moveFocusOutOfHomeSearchHiddenTrees");
    expect(page).toContain("homeBrowseRef");
    expect(page).toContain("ref={homeBrowseRef}");
    expect(page).toContain("aria-hidden={homePostSearchActive || undefined}");
    expect(
      page.match(/moveFocusOutOfHomeSearchHiddenTrees\(/g)?.length
    ).toBeGreaterThanOrEqual(2);
  });
});
