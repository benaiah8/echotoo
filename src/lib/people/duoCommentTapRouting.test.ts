import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { routeDuoCommentTap } from "./duoCommentActions";
import {
  duoCommentStateKey,
  markDuoCommentIdle,
  markDuoCommentPoolNotJoined,
  markDuoCommentSent,
  markDuoCommentUnavailable,
  setDuoCommentPending,
  setDuoCommentViewerForTests,
} from "./duoCommentState";
import type { MyDuoCommentLookup } from "./getMyDuoComment";

const identity = {
  surface: "duo" as const,
  opportunityId: "opp-1",
  sourcePostId: "post-1",
  recipientUserId: "user-1",
  displayName: "Ada",
  identitySource: { display_name: "Ada" },
  caption: "Ridge",
  scheduleLabel: null,
  scheduleLabelKind: null,
  sourceType: "hangout" as const,
};

function key() {
  return duoCommentStateKey("viewer-1", "post-1", "user-1");
}

function absentLookup(): MyDuoCommentLookup {
  return { ok: true, status: "absent" };
}

describe("Duo comment tap routing", () => {
  it("opens a writable composer for a confirmed-idle first tap", async () => {
    setDuoCommentViewerForTests("viewer-1");
    const openComposer = vi.fn();
    const lookup = vi.fn();
    const result = await routeDuoCommentTap({
      rowCommented: false,
      identity,
      lookup,
      openComposer,
    });
    expect(result).toBe("composer");
    expect(openComposer).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reopens a sent comment read-only and does not send", async () => {
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(key(), "Sunset note");
    const openComposer = vi.fn();
    const lookup = vi.fn();
    const join = vi.fn();
    const result = await routeDuoCommentTap({
      rowCommented: true,
      identity,
      lookup,
      join,
      openComposer,
    });
    expect(result).toBe("reopened");
    expect(openComposer).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it("ignores a second tap while the first route is in flight", async () => {
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(key(), "Sunset note");
    let releaseJoin: (value: unknown) => void = () => {};
    const join = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseJoin = resolve;
        })
    );
    markDuoCommentPoolNotJoined(key());
    const openComposer = vi.fn();
    const first = routeDuoCommentTap({
      rowCommented: true,
      identity,
      join,
      openComposer,
      lookup: vi.fn(),
    });
    const second = await routeDuoCommentTap({
      rowCommented: true,
      identity,
      join,
      openComposer,
      lookup: vi.fn(),
    });
    expect(second).toBe("ignored");
    expect(join).toHaveBeenCalledTimes(1);
    releaseJoin({ id: "pool" });
    await first;
    expect(openComposer).not.toHaveBeenCalled();
  });

  it("blocks a tap while the comment key is pending", async () => {
    setDuoCommentViewerForTests("viewer-1");
    setDuoCommentPending(key(), true);
    const openComposer = vi.fn();
    const result = await routeDuoCommentTap({
      rowCommented: null,
      identity,
      lookup: vi.fn(),
      openComposer,
    });
    expect(result).toBe("ignored");
    expect(openComposer).not.toHaveBeenCalled();
  });

  it("looks up an unknown comment before opening a composer", async () => {
    setDuoCommentViewerForTests("viewer-1");
    const openComposer = vi.fn();
    const lookup = vi.fn().mockResolvedValue(absentLookup());
    const result = await routeDuoCommentTap({
      rowCommented: null,
      identity,
      lookup,
      openComposer,
    });
    expect(result).toBe("composer");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("post-1", "user-1");
    expect(openComposer).toHaveBeenCalledTimes(1);
  });

  it("reopens when an unknown lookup finds a sent comment", async () => {
    setDuoCommentViewerForTests("viewer-1");
    const openComposer = vi.fn();
    const lookup = vi.fn().mockResolvedValue({
      ok: true,
      status: "sent",
      body: "Stored note",
      messageId: "m-1",
      conversationId: "c-1",
      referenceId: "post-1",
    } satisfies MyDuoCommentLookup);
    const result = await routeDuoCommentTap({
      rowCommented: null,
      identity,
      lookup,
      join: vi.fn(),
      openComposer,
    });
    expect(result).toBe("reopened");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(openComposer).not.toHaveBeenCalled();
  });

  it("does not open a composer when lookup says unavailable", async () => {
    setDuoCommentViewerForTests("viewer-1");
    const openComposer = vi.fn();
    const result = await routeDuoCommentTap({
      rowCommented: null,
      identity,
      lookup: vi.fn().mockResolvedValue({ ok: true, status: "unavailable" }),
      openComposer,
    });
    expect(result).toBe("unavailable");
    expect(openComposer).not.toHaveBeenCalled();
  });

  it("keeps an unavailable comment closed", async () => {
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentUnavailable(key());
    const openComposer = vi.fn();
    const result = await routeDuoCommentTap({
      rowCommented: null,
      identity,
      lookup: vi.fn(),
      openComposer,
    });
    expect(result).toBe("unavailable");
    expect(openComposer).not.toHaveBeenCalled();
  });

  it("retries only the pool join after a failed join", async () => {
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(key(), "Sunset note");
    markDuoCommentPoolNotJoined(key());
    const openComposer = vi.fn();
    const lookup = vi.fn();
    const join = vi.fn().mockResolvedValue({ id: "pool" });
    const result = await routeDuoCommentTap({
      rowCommented: true,
      identity,
      lookup,
      join,
      openComposer,
    });
    expect(result).toBe("reopened");
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith("post-1");
    expect(lookup).not.toHaveBeenCalled();
    expect(openComposer).not.toHaveBeenCalled();
  });

  it("routes only Duo taps in the overlay and leaves Discover and the Duo row alone", () => {
    const overlay = readFileSync(
      join(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
      "utf8"
    );
    const row = readFileSync(
      join(__dirname, "../../components/people/PeopleDuoBottomActionRow.tsx"),
      "utf8"
    );
    const composer = overlay.slice(
      overlay.indexOf("const openPairUpCommentComposer"),
      overlay.indexOf("const handleFeedMessage")
    );
    expect(composer).toContain('if (scope === "my_plans")');
    expect(composer).toContain("routeDuoCommentTap");
    expect(composer).toContain("row.duo_commented_by_me ?? null");
    expect(composer.indexOf("routeDuoCommentTap")).toBeLessThan(
      composer.lastIndexOf("openWritable()")
    );
    expect(composer).toContain('surface: "duo"');
    expect(composer).toContain('surface: scope === "discover" ? "discover" : "duo"');
    expect(composer).not.toContain("sendPeopleContextComment");
    expect(composer).not.toContain("connectDiscoverPairUp");
    expect(row).not.toContain("routeDuoCommentTap");
    expect(row).not.toContain("duoCommentState");
    expect(overlay).toContain("duoCommentVisual");
    expect(overlay).toContain("commentState={duoBottomCommentVisual.state}");
    expect(overlay).toContain(
      "commentConfirmedState={duoBottomCommentVisual.confirmedState}"
    );
    expect(overlay).toContain("messageBusy={duoBottomCommentBusy}");
    expect(overlay).toContain("applyDuoCommentListFlags");
    markDuoCommentIdle(key());
  });
});
