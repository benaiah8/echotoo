import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  feedScheduleLabelUsesPill,
  getPostScheduleLabelClasses,
  getPostScheduleLabelTextClass,
} from "./postScheduleLabelStyles";
import type { PostScheduleLabelKind } from "./postScheduleLabel";

const KINDS: PostScheduleLabelKind[] = [
  "today",
  "tomorrow",
  "next_weekday",
  "in_days",
  "passed",
  "posted_ago",
];

describe("postScheduleLabelStyles semantic buckets", () => {
  it("maps every kind for feed / rail / text surfaces", () => {
    for (const kind of KINDS) {
      expect(getPostScheduleLabelClasses(kind, "feed")).toBeTruthy();
      expect(getPostScheduleLabelClasses(kind, "rail")).toBeTruthy();
      expect(getPostScheduleLabelTextClass(kind)).toBeTruthy();
    }
  });

  it("Today stays green; Tomorrow uses blue tokens", () => {
    const feedToday = getPostScheduleLabelClasses("today", "feed");
    const feedTomorrow = getPostScheduleLabelClasses("tomorrow", "feed");
    expect(feedToday).toContain("bg-green-500/20");
    expect(feedToday).toContain("text-green-600");
    expect(feedTomorrow).toContain("bg-[var(--blue-bg)]");
    expect(feedTomorrow).toContain("text-[var(--blue-text)]");
    expect(feedTomorrow).toContain("border-[var(--blue-border)]");
    expect(feedTomorrow).not.toContain("amber");

    expect(getPostScheduleLabelTextClass("today")).toContain("text-green-600");
    expect(getPostScheduleLabelTextClass("tomorrow")).toContain(
      "text-[var(--blue-text)]",
    );
  });

  it("next_weekday is violet; in_days is a neutral scheduled chip", () => {
    const near = getPostScheduleLabelClasses("next_weekday", "feed");
    const later = getPostScheduleLabelClasses("in_days", "feed");
    expect(near).toContain("violet");
    expect(later).toContain("rounded-md");
    expect(later).toContain("border");
    expect(later).toContain("bg-[var(--text)]/8");
    expect(later).not.toContain("violet");
    expect(later).not.toContain("green-500");
    expect(later).not.toContain("blue-bg");
  });

  it("passed is muted gray; posted_ago stays plain non-pill", () => {
    const passed = getPostScheduleLabelClasses("passed", "feed");
    const age = getPostScheduleLabelClasses("posted_ago", "feed");
    expect(passed).toContain("bg-gray-500/10");
    expect(passed).toContain("italic");
    expect(age).toContain("text-[var(--text)]/45");
    expect(age).not.toContain("rounded-md");
    expect(age).not.toContain("border");
    expect(feedScheduleLabelUsesPill("passed")).toBe(true);
    expect(feedScheduleLabelUsesPill("posted_ago")).toBe(false);
  });

  it("PostDetailBody uses shared text helper, not a local color map", () => {
    const body = readFileSync(
      join(process.cwd(), "src/components/detail/PostDetailBody.tsx"),
      "utf8",
    );
    expect(body).toContain("getPostScheduleLabelTextClass");
    expect(body).not.toContain("detailHeaderScheduleLabelClass");
    expect(body).not.toContain("text-amber-600");
  });
});
