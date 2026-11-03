import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resetActivatedDuoCommentLookupsForTests,
  resolveActivatedDuoComment,
  routeDuoCommentTap,
} from "./duoCommentActions";
import type { MyDuoCommentLookup } from "./getMyDuoComment";
import {
  applyDuoCommentListFlags,
  duoCommentStateKey,
  duoCommentVisual,
  getDuoCommentSnapshot,
  markDuoCommentSent,
  setDuoCommentViewerForTests,
  type DuoCommentSnapshot,
} from "./duoCommentState";

const unknownSnapshot: DuoCommentSnapshot = {
  state: "unknown",
  pending: false,
  body: null,
  viewerHasActivePairUp: null,
  confirmedBySend: false,
};

function key(viewer = "viewer-1", post = "post-1", recipient = "user-1") {
  return duoCommentStateKey(viewer, post, recipient);
}

describe("Duo comment immediate active state", () => {
  it("renders an already-commented candidate active before the store is written", () => {
    const visual = duoCommentVisual({
      snapshot: unknownSnapshot,
      listCommented: true,
    });
    expect(visual.state).toBe("active");
    expect(visual.domain).toBe("sent");
    expect(getDuoCommentSnapshot(key()).state).toBe("unknown");
  });

  it("renders a confirmed false candidate idle", () => {
    const visual = duoCommentVisual({
      snapshot: unknownSnapshot,
      listCommented: false,
    });
    expect(visual.state).toBe("idle");
    expect(visual.domain).toBe("idle");
  });

  it("renders a missing flag as neutral pending until a lookup resolves it", async () => {
    const pending = duoCommentVisual({
      snapshot: unknownSnapshot,
      listCommented: null,
    });
    expect(pending.state).toBe("pending");
    expect(pending.confirmedState).toBe("idle");
    expect(pending.domain).toBe("unknown");

    setDuoCommentViewerForTests("viewer-1");
    resetActivatedDuoCommentLookupsForTests();
    const lookup = vi.fn().mockResolvedValue({
      ok: true,
      status: "sent",
      body: "Stored",
      messageId: "m1",
      conversationId: "c1",
      referenceId: "post-1",
    });
    const outcome = await resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      listCommented: null,
      lookup,
    });
    expect(outcome).toBe("sent");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(getDuoCommentSnapshot(key()).state).toBe("sent");
  });

  it("does not leak comment state across rapid candidate changes", async () => {
    setDuoCommentViewerForTests("viewer-1");
    resetActivatedDuoCommentLookupsForTests();
    let releaseSecond: () => void = () => {};
    const lookup = vi.fn((postId: string): Promise<MyDuoCommentLookup> => {
      if (postId === "post-2") {
        return new Promise((resolve) => {
          releaseSecond = () =>
            resolve({
              ok: true,
              status: "sent",
              body: "Second",
              messageId: "m2",
              conversationId: "c2",
              referenceId: "post-2",
            });
        });
      }
      return Promise.resolve({ ok: true, status: "absent" });
    });
    const first = resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      listCommented: null,
      lookup,
    });
    const second = resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-2",
      recipientUserId: "user-2",
      listCommented: null,
      lookup,
    });
    await first;
    expect(getDuoCommentSnapshot(key()).state).toBe("idle");
    expect(getDuoCommentSnapshot(key("viewer-1", "post-2", "user-2")).state).toBe(
      "unknown"
    );
    releaseSecond();
    await second;
    expect(getDuoCommentSnapshot(key()).state).toBe("idle");
    expect(getDuoCommentSnapshot(key("viewer-1", "post-2", "user-2")).body).toBe(
      "Second"
    );
  });

  it("skips lookup when the candidate list already has a boolean", async () => {
    setDuoCommentViewerForTests("viewer-1");
    resetActivatedDuoCommentLookupsForTests();
    const lookup = vi.fn();
    const sent = await resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      listCommented: true,
      lookup,
    });
    const idle = await resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      listCommented: false,
      lookup,
    });
    expect(sent).toBe("skipped");
    expect(idle).toBe("skipped");
    expect(lookup).not.toHaveBeenCalled();
    const again = await resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-9",
      recipientUserId: "user-9",
      listCommented: null,
      lookup: vi.fn().mockResolvedValue({ ok: true, status: "absent" }),
    });
    expect(again).toBe("idle");
    const duplicate = await resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-9",
      recipientUserId: "user-9",
      listCommented: null,
      lookup,
    });
    expect(duplicate).toBe("skipped");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("drops sent state when the viewer changes and does not apply an in-flight lookup", async () => {
    setDuoCommentViewerForTests("viewer-1");
    resetActivatedDuoCommentLookupsForTests();
    markDuoCommentSent(key(), "Mine");
    let release: () => void = () => {};
    const pending = resolveActivatedDuoComment({
      viewerId: "viewer-1",
      sourcePostId: "post-3",
      recipientUserId: "user-3",
      listCommented: null,
      lookup: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              status: "sent",
              body: "Late",
              messageId: "m3",
              conversationId: "c3",
              referenceId: "post-3",
            });
        }),
    });
    setDuoCommentViewerForTests("viewer-2");
    release();
    await pending;
    expect(getDuoCommentSnapshot(key("viewer-2", "post-1", "user-1")).state).toBe(
      "unknown"
    );
    expect(getDuoCommentSnapshot(key("viewer-2", "post-3", "user-3")).state).toBe(
      "unknown"
    );
    expect(getDuoCommentSnapshot(key("viewer-1", "post-3", "user-3")).body).toBeNull();
  });

  it("keeps a confirmed send when an older list response says false", () => {
    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(key(), "Fresh");
    applyDuoCommentListFlags({
      viewerId: "viewer-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      commented: false,
      viewerHasActivePairUp: false,
    });
    const visual = duoCommentVisual({
      snapshot: getDuoCommentSnapshot(key()),
      listCommented: false,
    });
    expect(visual.state).toBe("active");
    expect(getDuoCommentSnapshot(key()).body).toBe("Fresh");
  });

  it("keeps Duo routing and Discover comment wiring on the existing paths", () => {
    const root = join(__dirname, "../..");
    const overlay = readFileSync(
      join(root, "pages/people/MatchDeckOverlay.tsx"),
      "utf8"
    );
    const discover = readFileSync(
      join(root, "components/people/PeopleDiscoverOpportunityBox.tsx"),
      "utf8"
    );
    const composer = readFileSync(
      join(root, "components/people/PeopleCommentComposerOverlay.tsx"),
      "utf8"
    );
    const pairUp = readFileSync(join(root, "api/services/pairUp.ts"), "utf8");
    const hook = readFileSync(join(root, "hooks/usePairUpCandidates.ts"), "utf8");
    expect(overlay).toContain("routeDuoCommentTap");
    expect(overlay).toContain("listCommented: current.duo_commented_by_me ?? null");
    expect(overlay).toContain("if (commented !== null) return;");
    expect(overlay).toContain("resolveActivatedDuoComment");
    expect(overlay).not.toContain("!duoCommentViewerId ||");
    expect(discover).toContain("duoCommentVisual");
    expect(discover).toContain("applyDuoCommentListFlags");
    expect(discover).not.toContain("resolveActivatedDuoComment");
    expect(composer).not.toContain("onAfterMessageDelivered");
    expect(pairUp).not.toContain("get_my_duo_comment");
    expect(hook).not.toContain("get_my_duo_comment");
    expect(routeDuoCommentTap).toBeTypeOf("function");
  });
});
