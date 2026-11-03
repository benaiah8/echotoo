import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("DirectMessagePage open newest-page reconcile", () => {
  const src = read("src/pages/messages/DirectMessagePage.tsx");

  it("always fetches listMessages on open (no fresh-cache skip)", () => {
    expect(src).not.toContain("skipFirstPageList");
    expect(src).not.toContain("needMessages");
    expect(src).not.toContain("threadRealtimeHadCoverageGap");
    expect(src).toContain(
      "Always reconcile newest page on open"
    );
    // Group and direct both call listMessages in the open effect.
    const openEffectStart = src.indexOf(
      "// Resolve conversation kind + messages"
    );
    const focusEffectStart = src.indexOf(
      "// Mounted focus/reconnect: merge newest page"
    );
    expect(openEffectStart).toBeGreaterThan(-1);
    expect(focusEffectStart).toBeGreaterThan(openEffectStart);
    const openEffect = src.slice(openEffectStart, focusEffectStart);
    const listCalls = openEffect.match(/listMessages\(conversationId\)/g) ?? [];
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("silent-merges into usable cache and preserves older pagination cursors", () => {
    expect(src).toContain("const silentMerge = cacheUsable && hasCachedMessages");
    expect(src).toContain("mergeNewestPage(prev, chronological)");
    expect(src).toContain("cached.hasMoreOlder");
    expect(src).toContain("cached.olderCursor");
    expect(src).toContain(
      "Preserve older-page pagination from the painted cache/session"
    );
  });

  it("marks read only after a successful newest-page fetch", () => {
    expect(src).toContain(
      "do not advance read on failed newest-page fetch"
    );
    expect(src).not.toContain(
      "scheduleMarkRead(tipFromMessages(cached.messages))"
    );
    const openEffectStart = src.indexOf(
      "// Resolve conversation kind + messages"
    );
    const focusEffectStart = src.indexOf(
      "// Mounted focus/reconnect: merge newest page"
    );
    const openEffect = src.slice(openEffectStart, focusEffectStart);
    expect(openEffect).toContain(
      "scheduleMarkRead(tipFromMessages(chronological))"
    );
  });

  it("keeps Realtime INSERT dedupe via messageKey / client_message_id", () => {
    expect(src).toContain("handleRealtimeInsert");
    expect(src).toContain("m.client_message_id === incoming.client_message_id");
    expect(src).toContain('from "../../lib/dmMessageMerge"');
  });
});
