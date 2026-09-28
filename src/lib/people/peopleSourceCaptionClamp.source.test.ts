/**
 * People source caption: the 3-line clamp must hold on the inner span.
 * The outer flex item (often a button) only shrinks; it is not the clamp box.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PEOPLE_MINE_SOURCE_CHROME_H_PX } from "./peopleCandidateMediaPresentation";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const CANONICAL = read(
  "src/components/people/PeopleCanonicalCandidatePresentation.tsx",
);
const GROUP = read(
  "src/components/people/PeopleGroupUpCandidatePresentation.tsx",
);

function captionClass(src: string): string {
  const start = src.indexOf("const CAPTION_CLASS =");
  const tick = src.indexOf("`", start);
  return src.slice(start, src.indexOf("`", tick + 1));
}

describe("People source caption clamp", () => {
  it("A/C/F/G: canonical outer caption keeps 13px leading-tight and can shrink", () => {
    const caption = captionClass(CANONICAL);
    expect(caption).toContain("line-clamp-3");
    expect(caption).toContain("min-h-0");
    expect(caption).toContain("overflow-hidden");
    expect(caption).toContain("text-[13px]");
    expect(caption).toContain("leading-tight");
  });

  it("B: Group presentation keeps the same 3-line outer caption", () => {
    const caption = captionClass(GROUP);
    expect(caption).toContain("line-clamp-3");
    expect(caption).toContain("min-h-0");
    expect(caption).toContain("overflow-hidden");
    expect(caption).toContain("text-[13px]");
    expect(caption).toContain("leading-tight");
  });

  it("D/E: visible caption text is clamped on an inner span in both presentations", () => {
    for (const src of [CANONICAL, GROUP]) {
      expect(src).toContain(
        'const CAPTION_CLAMP_CLASS = "min-h-0 overflow-hidden line-clamp-3"',
      );
      expect(src).not.toContain("block min-h-0 overflow-hidden line-clamp-3");
      expect(src).toContain('data-people-source-caption-clamp="true"');
      expect(src).toContain("{captionText}");
      const clampAt = src.indexOf('data-people-source-caption-clamp="true"');
      const textAt = src.indexOf("{captionText}", clampAt);
      expect(textAt).toBeGreaterThan(clampAt);
      expect(textAt - clampAt).toBeLessThan(80);
    }
  });

  it("H/I: chrome reserve stays 93px and line-clamp-4 is absent", () => {
    expect(PEOPLE_MINE_SOURCE_CHROME_H_PX).toBe(93);
    expect(CANONICAL).not.toContain("line-clamp-4");
    expect(GROUP).not.toContain("line-clamp-4");
    const media = read("src/lib/people/peopleCandidateMediaPresentation.ts");
    expect(media).toContain("PEOPLE_MINE_SOURCE_CAPTION_3LINE_H_PX = Math.ceil(13 * 1.25 * 3)");
  });

  it("J/K/N: no measurement, observer, or device branch for the caption", () => {
    for (const src of [CANONICAL, GROUP]) {
      expect(src).not.toContain("ResizeObserver");
      expect(src).not.toContain("scrollHeight");
      expect(src).not.toContain("getBoundingClientRect");
      expect(src).not.toMatch(/iPhone|isIOS|isAndroid|window\.innerWidth/);
    }
  });

  it("L/M: See Post, date row, and portrait reserve are unchanged", () => {
    for (const src of [CANONICAL, GROUP]) {
      expect(src).toContain("<PeopleSeePostControl");
      expect(src).toContain("data-people-source-date-row");
      expect(src).toContain("DATE_PILL_BASE");
      expect(src).toContain("minHeight: PEOPLE_MINE_SOURCE_CHROME_H_PX");
      expect(src).toContain("paddingTop: PEOPLE_MINE_STACK_PAD_Y_TOP");
    }
    expect(CANONICAL).toContain('data-people-duo-portrait="true"');
  });
});
