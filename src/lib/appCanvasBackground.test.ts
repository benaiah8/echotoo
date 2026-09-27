/**
 * Light-mode main canvas token: pages use --app-canvas; overlays keep --bg.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("app-canvas light-mode main background", () => {
  it("defines --app-canvas without changing light --bg", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/:root\s*\{[\s\S]*?--app-canvas:\s*var\(--bg\)/);
    expect(css).toMatch(
      /\.theme-light\s*\{[\s\S]*?--bg:\s*#ffffff;[\s\S]*?--app-canvas:\s*#fffbf5;/i
    );
    expect(css).toMatch(
      /html,\s*\nbody,\s*\n#root\s*\{[\s\S]*?background:\s*var\(--app-canvas\)/
    );
    expect(css).toMatch(
      /--gradient-from-top:\s*linear-gradient\(\s*to bottom,\s*var\(--app-canvas\)/
    );
  });

  it("wires main page shells to --app-canvas", () => {
    expect(read("src/components/container/PrimaryPageContainer.tsx")).toContain(
      "bg-[var(--app-canvas)]"
    );
    expect(read("src/pages/people/PeoplePage.tsx")).toContain(
      "bg-[var(--app-canvas)]"
    );
    expect(read("src/pages/messages/MessagesInboxPage.tsx")).toContain(
      "bg-[var(--app-canvas)]"
    );
    expect(read("src/components/HomeTopBar.tsx")).toContain(
      "var(--app-canvas)"
    );
  });

  it("leaves overlay and glass panel backgrounds on --bg / surfaces", () => {
    const bottomDrawer = read("src/components/ui/BottomDrawer.tsx");
    expect(bottomDrawer).toContain("var(--bg)");
    expect(bottomDrawer).not.toContain("--app-canvas");

    const glass = read("src/lib/glassActionSheetStyles.ts");
    expect(glass).toContain("var(--surface-2)");
    expect(glass).not.toContain("--app-canvas");

    const createShell = read(
      "src/components/create/CreateFinalizeComposerShell.tsx"
    );
    expect(createShell).toContain("bg-[var(--bg)]");
    expect(createShell).not.toContain("--app-canvas");
  });
});
