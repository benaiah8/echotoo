import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("useHomePullToRefresh promise-aware commit", () => {
  it("awaits onCommit promises before ending the refreshing UI", () => {
    const src = read("src/hooks/useHomePullToRefresh.ts");
    expect(src).toContain("void | Promise<void>");
    expect(src).toContain("isThenable");
    expect(src).toContain("awaitCommitPromiseRef");
    expect(src).toContain("Promise.resolve(commitResult).finally");
    expect(src).toContain("scheduleEndRefreshingUi");
    expect(src).toContain(
      "Promise-aware commits own the hold; ignore epoch until that settles"
    );
  });
});
