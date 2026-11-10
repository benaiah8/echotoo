/**
 * NotificationBell paint — light-mode active contrast, handlers unchanged.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("NotificationBell contrast", () => {
  const src = read("src/components/ui/NotificationBell.tsx");

  it("gives the active bell a solid yellow face and dark icon in light mode", () => {
    expect(src).toContain("app-light:bg-[var(--brand)]");
    expect(src).toContain("app-light:text-[var(--brand-ink)]");
    expect(src).toContain(
      "app-light:border-[color-mix(in_oklab,var(--brand-ink)_32%,var(--brand))]"
    );
  });

  it("keeps the inactive gray chip", () => {
    expect(src).toContain(
      "bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30"
    );
    expect(src).toContain("<PiBellSlash");
  });

  it("keeps the dark-mode active wash", () => {
    expect(src).toContain(
      "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"
    );
    expect(src).toContain("<PiBell");
  });

  it("does not change size, toggle, or notification writes", () => {
    expect(src).toContain("h-6 w-6 rounded-md");
    expect(src).toContain("const toggleNotifications = async");
    expect(src).toContain("setIsEnabled(newEnabled)");
    expect(src).toContain('.from("notification_settings")');
    expect(src).toContain("disabled={loading}");
    expect(src).toContain('loading ? "animate-pulse cursor-wait"');
    expect(src).toContain("if (loading || !isFollowing) return");
  });
});
