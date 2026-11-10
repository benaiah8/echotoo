/**
 * FollowButton state paint — light-mode contrast without changing handlers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function stateClassBody(src: string): string {
  const start = src.indexOf("const getStateClass = () => {");
  const end = src.indexOf("const getButtonText = () => {");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("FollowButton contrast", () => {
  const src = read("src/components/ui/FollowButton.tsx");
  const state = stateClassBody(src);

  it("paints Following with dark text on a neutral surface in light mode", () => {
    expect(state).toContain('followStatus === "following"');
    expect(state).toContain("bg-[var(--surface-2)]");
    expect(state).toContain("text-[var(--text)]");
    expect(state).toContain("border-[var(--border)]");
    expect(state).not.toContain("bg-white/10 text-white");
  });

  it("keeps the previous dark-mode Following chip", () => {
    expect(state).toContain("app-dark:bg-white/10");
    expect(state).toContain("app-dark:text-white");
    expect(state).toContain("app-dark:border-white/20");
    expect(state).toContain("app-dark:hover:bg-white/20");
  });

  it("keeps Follow on brand yellow with dark ink", () => {
    expect(state).toContain(
      "bg-[var(--brand)] text-[var(--brand-ink)] border-[var(--brand)]"
    );
    expect(state).toContain(
      "bg-[var(--brand)]/80 text-[var(--brand-ink)] border-[var(--brand)]"
    );
  });

  it("keeps Unfollowing and Canceling readable in light mode", () => {
    expect(state).toContain("text-[var(--text)]/75");
    expect(state).toContain("bg-[var(--text)]/10");
    expect(state).toContain("app-dark:text-gray-300");
    expect(state).not.toContain(
      '"bg-gray-500/30 text-gray-300 border-gray-500/50 animate-pulse"'
    );
    expect(src).toContain('"Canceling..."');
    expect(src).toContain('"Unfollowing..."');
  });

  it("uses a darker error red in light mode and keeps the dark-mode red", () => {
    expect(state).toContain("text-red-800");
    expect(state).toContain("app-dark:text-red-400");
    expect(state).not.toMatch(/return "bg-red-500\/20 text-red-400 /);
  });

  it("gives Requested a neutral chip and leaves labels, lock, and handlers", () => {
    expect(state).toContain('followStatus === "pending"');
    expect(state).toContain("bg-[var(--text)]/8 text-[var(--text)]");
    expect(src).toContain('if (followStatus === "following") return "Following"');
    expect(src).toContain('if (followStatus === "pending") return "Requested"');
    expect(src).toContain('return "Follow"');
    expect(src).toContain("<PiLock");
    expect(src).toContain("doFollow");
    expect(src).toContain("doUnfollow");
    expect(src).toContain("const onToggle = async");
    expect(src).toContain("h-6 min-w-[80px]");
  });
});
