import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOptionalBoolean } from "./duoCommentFields";
import {
  applyDuoCommentListFlags,
  duoCommentStateKey,
  duoCommentVisual,
  getDuoCommentSnapshot,
  markDuoCommentSent,
  setDuoCommentPending,
  setDuoCommentViewerForTests,
} from "./duoCommentState";
import {
  noteConfirmedDuoComment,
  recoverDuplicateDuoComment,
  reopenSentDuoComment,
} from "./duoCommentActions";

const identity = {
  surface: "discover" as const,
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

function key(post = "post-1", recipient = "user-1", viewer = "viewer-1") {
  return duoCommentStateKey(viewer, post, recipient);
}

describe("duo comment reliability", () => {
  it("treats a missing list flag as unknown and keeps a confirmed send", () => {
    expect(parseOptionalBoolean(undefined)).toBeNull();
    expect(parseOptionalBoolean(true)).toBe(true);
    expect(parseOptionalBoolean(false)).toBe(false);
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(key(), "Kept");
    applyDuoCommentListFlags({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      commented: null,
      viewerHasActivePairUp: null,
    });
    expect(getDuoCommentSnapshot(key()).state).toBe("sent");
    expect(getDuoCommentSnapshot(key()).body).toBe("Kept");
    applyDuoCommentListFlags({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      commented: false,
      viewerHasActivePairUp: false,
    });
    expect(getDuoCommentSnapshot(key()).state).toBe("sent");
  });

  it("keeps pending local to one comment key and leaves Heart mapping alone", () => {
    setDuoCommentViewerForTests("viewer-1");
    const first = key();
    const second = key("post-2", "user-2");
    setDuoCommentPending(first, true);
    const pending = duoCommentVisual({
      snapshot: getDuoCommentSnapshot(first),
      listCommented: null,
    });
    const other = duoCommentVisual({
      snapshot: getDuoCommentSnapshot(second),
      listCommented: null,
    });
    expect(pending.state).toBe("pending");
    expect(other.state).toBe("pending");
    expect(other.domain).toBe("unknown");
    expect(other.confirmedState).toBe("idle");
  });

  it("reopens a sent comment without lookup when the body is cached and retries only the pool join", async () => {
    setDuoCommentViewerForTests("viewer-1");
    const join = vi
      .fn()
      .mockRejectedValueOnce(new Error("pool"))
      .mockResolvedValueOnce({ id: "pool-1" });
    const lookup = vi.fn();
    const first = await noteConfirmedDuoComment({
      identity,
      body: "Sunset note",
      created: true,
      join,
    });
    expect(first).toBe("failed");
    expect(getDuoCommentSnapshot(key()).body).toBe("Sunset note");
    expect(getDuoCommentSnapshot(key()).viewerHasActivePairUp).toBe(false);
    const opened = await reopenSentDuoComment({
      identity,
      lookup,
      join,
    });
    expect(opened).toBe("opened");
    expect(lookup).not.toHaveBeenCalled();
    expect(join).toHaveBeenCalledTimes(2);
    expect(getDuoCommentSnapshot(key()).viewerHasActivePairUp).toBe(true);
  });

  it("recovers a duplicate comment from lookup and does not require another send", async () => {
    setDuoCommentViewerForTests("viewer-1");
    applyDuoCommentListFlags({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      commented: true,
      viewerHasActivePairUp: false,
    });
    const lookup = vi.fn().mockResolvedValue({
      ok: true,
      status: "sent",
      body: "Stored",
      messageId: "m1",
      conversationId: "c1",
      referenceId: "post-1",
    });
    const join = vi.fn().mockResolvedValue({ id: "pool" });
    const outcome = await recoverDuplicateDuoComment({
      identity,
      lookup,
      join,
    });
    expect(outcome).toBe("opened");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledTimes(1);
    expect(getDuoCommentSnapshot(key()).body).toBe("Stored");
  });

  it("marks access-denied comments unavailable and does not join", async () => {
    setDuoCommentViewerForTests("viewer-1");
    const lookup = vi.fn().mockResolvedValue({
      ok: true,
      status: "unavailable",
    });
    const join = vi.fn();
    const outcome = await reopenSentDuoComment({
      identity,
      lookup,
      join,
    });
    expect(outcome).toBe("unavailable");
    expect(join).not.toHaveBeenCalled();
    expect(getDuoCommentSnapshot(key()).state).toBe("unavailable");
    expect(getDuoCommentSnapshot(key()).body).toBeNull();
  });

  it("drops comment state when the signed-in viewer changes", () => {
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(key(), "Mine");
    setDuoCommentViewerForTests("viewer-2");
    expect(getDuoCommentSnapshot(key("post-1", "user-1", "viewer-2")).state).toBe(
      "unknown"
    );
    expect(getDuoCommentSnapshot(key()).state).toBe("unknown");
  });

  it("does not look up comments while parsing the candidate list", () => {
    const root = join(__dirname, "../..");
    const pairUp = readFileSync(join(root, "api/services/pairUp.ts"), "utf8");
    const hook = readFileSync(join(root, "hooks/usePairUpCandidates.ts"), "utf8");
    const duoRow = readFileSync(
      join(root, "components/people/PeopleDuoBottomActionRow.tsx"),
      "utf8"
    );
    const overlay = readFileSync(
      join(root, "pages/people/MatchDeckOverlay.tsx"),
      "utf8"
    );
    expect(pairUp).not.toContain("get_my_duo_comment");
    expect(hook).not.toContain("get_my_duo_comment");
    expect(duoRow).not.toContain("duoCommentState");
    expect(duoRow).toContain("h-[52px]");
    expect(overlay).toContain("duoCommentVisual");
    expect(overlay).toContain("applyDuoCommentListFlags");
    expect(overlay).toContain("subscribeDuoCommentState");
    expect(overlay).toContain("commentState={duoBottomCommentVisual.state}");
  });
});
