import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { joinDuoPoolAfterCreatedComment } from "./commentJoinsDuoPool";

describe("joinDuoPoolAfterCreatedComment", () => {
  it("joins once after a newly created comment", async () => {
    const join = vi.fn().mockResolvedValue({ id: "opp-existing-or-new" });
    const result = await joinDuoPoolAfterCreatedComment({
      created: true,
      sourcePostId: " post-1 ",
      join,
    });
    expect(result).toBe("joined");
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith("post-1");
  });

  it("does not join when the comment was an idempotent retry", async () => {
    const join = vi.fn();
    const result = await joinDuoPoolAfterCreatedComment({
      created: false,
      sourcePostId: "post-1",
      join,
    });
    expect(result).toBe("skipped");
    expect(join).not.toHaveBeenCalled();
  });

  it("reports join failure without calling join again", async () => {
    const join = vi.fn().mockRejectedValue(new Error("Source is not eligible"));
    const result = await joinDuoPoolAfterCreatedComment({
      created: true,
      sourcePostId: "post-1",
      join,
    });
    expect(result).toBe("failed");
    expect(join).toHaveBeenCalledTimes(1);
  });
});

describe("comment composer does not Connect", () => {
  const overlay = readFileSync(
    join(__dirname, "../../components/people/PeopleCommentComposerOverlay.tsx"),
    "utf8"
  );
  const send = readFileSync(
    join(__dirname, "peopleCommentComposerSend.ts"),
    "utf8"
  );
  const share = readFileSync(
    join(__dirname, "../shareToMessagesSend.ts"),
    "utf8"
  );

  it("joins the pool after send and does not run the legacy Connect callback", () => {
    const actions = readFileSync(
      join(__dirname, "duoCommentActions.ts"),
      "utf8"
    );
    expect(actions).toContain("joinDuoPoolAfterCreatedComment");
    expect(actions).toContain("join: input.join");
    expect(overlay).toContain("noteConfirmedDuoComment");
    expect(overlay).toContain("result.created");
    expect(overlay).not.toContain("onAfterMessageDelivered");
    expect(overlay).not.toMatch(
      /connectDiscoverPairUp|expressPairUpInterest|completePairUpMatch/
    );
    expect(actions).not.toMatch(
      /connectDiscoverPairUp|expressPairUpInterest|completePairUpMatch|sendPeopleContextComment/
    );
    expect(send).not.toMatch(
      /joinPairUp|connectDiscoverPairUp|expressPairUpInterest|completePairUpMatch/
    );
  });

  it("leaves ordinary Share on the four-argument send", () => {
    expect(share).toContain("sendSharedPostMessage(");
    expect(share).not.toContain("joinPairUp");
    expect(share).not.toContain("joinDuoPoolAfterCreatedComment");
  });
});
