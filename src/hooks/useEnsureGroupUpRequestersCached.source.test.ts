import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readHook(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/hooks/useEnsureGroupUpRequestersCached.ts"
    ),
    "utf8"
  );
}

function readService(): string {
  return readFileSync(
    join(process.cwd(), "src/api/services/groupUp.ts"),
    "utf8"
  );
}

function readOverlay(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/components/messages/GroupUpRequestersOverlay.tsx"
    ),
    "utf8"
  );
}

describe("useEnsureGroupUpRequestersCached", () => {
  it("warms the overlay cache without force-refetch or a smaller page", () => {
    const src = readHook();
    expect(src).toContain("listGroupUpRequesters");
    expect(src).toContain("conversationId: convId");
    expect(src).not.toContain("force: true");
    expect(src).not.toContain("force: false");
    expect(src).not.toContain("limit:");
    expect(src).not.toContain("useGroupUpRequesters");
    expect(src).not.toContain("getProfileByUserId");
  });

  it("shares the same first-page cache path the overlay already uses", () => {
    const service = readService();
    expect(service).toContain("listGroupUpRequesters");
    expect(service).toContain("getCachedGroupUpRequesters(userId, conversationId)");
    expect(service).toContain("setCachedGroupUpRequesters");
    expect(service).toContain("p_limit: limit");
    expect(service).toContain("options.limit ?? 20");

    const overlay = readOverlay();
    expect(overlay).toContain("useGroupUpRequesters");
    expect(overlay).toContain("enabled: held");
    expect(overlay).not.toContain("useEnsureGroupUpRequestersCached");
  });
});
