import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  closePeopleCommentComposer,
  ensurePeopleCommentComposerClientMessageId,
  getPeopleCommentComposerState,
  openPeopleCommentComposer,
} from "./peopleCommentComposerStore";
import {
  commentComposerPlaceholderRecipientLabel,
  peopleCommentComposerPlaceholder,
  sendPeopleContextComment,
} from "./peopleCommentComposerSend";

const getOrCreateDirectConversation = vi.fn();
const sendSharedPostMessage = vi.fn();

vi.mock("../../api/services/messaging", () => ({
  createClientMessageId: () => "client-msg-test-id",
  getOrCreateDirectConversation: (...args: unknown[]) =>
    getOrCreateDirectConversation(...args),
  sendSharedPostMessage: (...args: unknown[]) =>
    sendSharedPostMessage(...args),
  isDmStrangerLimitError: () => false,
}));

describe("peopleCommentComposerStore", () => {
  beforeEach(() => {
    closePeopleCommentComposer();
  });

  it("opens and closes with context", () => {
    openPeopleCommentComposer({
      surface: "discover",
      opportunityId: "opp-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      displayName: "Alex",
      identitySource: { user_id: "user-1" },
      caption: "Caption",
      scheduleLabel: "Today",
      scheduleLabelKind: "today",
      sourceType: "hangout",
      expressedByMe: false,
    });
    expect(getPeopleCommentComposerState().open).toBe(true);
    expect(getPeopleCommentComposerState().context?.opportunityId).toBe("opp-1");
    closePeopleCommentComposer();
    expect(getPeopleCommentComposerState().open).toBe(false);
    expect(getPeopleCommentComposerState().context).toBeNull();
  });

  it("rejects open without recipient or post id", () => {
    openPeopleCommentComposer({
      surface: "duo",
      opportunityId: "opp-1",
      sourcePostId: "",
      recipientUserId: "user-1",
      displayName: "Alex",
      identitySource: {},
      caption: null,
      scheduleLabel: null,
      scheduleLabelKind: null,
      sourceType: null,
      expressedByMe: false,
    });
    expect(getPeopleCommentComposerState().open).toBe(false);
  });

  it("keeps sticky client message id within one open session", () => {
    openPeopleCommentComposer({
      surface: "discover",
      opportunityId: "opp-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      displayName: "Alex",
      identitySource: {},
      caption: null,
      scheduleLabel: null,
      scheduleLabelKind: null,
      sourceType: "hangout",
      expressedByMe: false,
    });
    const a = ensurePeopleCommentComposerClientMessageId(() => "id-a");
    const b = ensurePeopleCommentComposerClientMessageId(() => "id-b");
    expect(a).toBe("id-a");
    expect(b).toBe("id-a");
  });
});

describe("peopleCommentComposerPlaceholder", () => {
  it("personalizes with permitted display name", () => {
    expect(peopleCommentComposerPlaceholder("Jordan Lee")).toBe(
      "Say hi to Jordan Lee…"
    );
  });

  it("falls back when name is missing or anonymous", () => {
    expect(peopleCommentComposerPlaceholder("")).toBe("Say hi…");
    expect(peopleCommentComposerPlaceholder("Someone")).toBe("Say hi…");
    expect(peopleCommentComposerPlaceholder(null)).toBe("Say hi…");
  });

  it("shortens long names for placeholder without changing stored value", () => {
    const long = "Alexandrina Constantinescu-Montgomery";
    const label = commentComposerPlaceholderRecipientLabel(long);
    expect(label).toBe("Alexandrina");
    expect(peopleCommentComposerPlaceholder(long)).toBe(
      "Say hi to Alexandrina…"
    );
  });

  it("uses ellipsis when a single token exceeds max label length", () => {
    const single = "A".repeat(30);
    expect(commentComposerPlaceholderRecipientLabel(single)).toBe(
      `${"A".repeat(21)}…`
    );
  });
});

describe("sendPeopleContextComment", () => {
  beforeEach(() => {
    getOrCreateDirectConversation.mockReset();
    sendSharedPostMessage.mockReset();
  });

  it("sends shared_post with note after conversation resolve", async () => {
    getOrCreateDirectConversation.mockResolvedValue({
      data: { conversation_id: "conv-1" },
      error: null,
    });
    sendSharedPostMessage.mockResolvedValue({
      data: { message: { id: "m1" }, created: true },
      error: null,
    });

    const result = await sendPeopleContextComment({
      recipientUserId: "user-1",
      sourcePostId: "post-1",
      note: "Hello there",
      clientMessageId: "sticky-1",
      recipientLabel: "Alex",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conversationId).toBe("conv-1");
    }
    expect(sendSharedPostMessage).toHaveBeenCalledWith(
      "conv-1",
      "post-1",
      "Hello there",
      "sticky-1",
      true
    );
    expect(sendSharedPostMessage).toHaveBeenCalledTimes(1);
  });

  it("maps a duplicate Duo comment without sending again", async () => {
    getOrCreateDirectConversation.mockResolvedValue({
      data: { conversation_id: "conv-1" },
      error: null,
    });
    sendSharedPostMessage.mockResolvedValue({
      data: null,
      error: { message: "DUO_COMMENT_ALREADY_SENT" },
    });

    const result = await sendPeopleContextComment({
      recipientUserId: "user-1",
      sourcePostId: "post-1",
      note: "Hello there",
      clientMessageId: "sticky-1",
      recipientLabel: "Alex",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.userMessage).toBe(
        "You've already commented on this opportunity."
      );
    }
    expect(sendSharedPostMessage).toHaveBeenCalledTimes(1);
    expect(sendSharedPostMessage).toHaveBeenCalledWith(
      "conv-1",
      "post-1",
      "Hello there",
      "sticky-1",
      true
    );
  });

  it("does not fall back to an ordinary share when the opportunity is unavailable", async () => {
    getOrCreateDirectConversation.mockResolvedValue({
      data: { conversation_id: "conv-1" },
      error: null,
    });
    sendSharedPostMessage.mockResolvedValue({
      data: null,
      error: { message: "DUO_COMMENT_NOT_AVAILABLE" },
    });

    const result = await sendPeopleContextComment({
      recipientUserId: "user-1",
      sourcePostId: "post-1",
      note: "Hello there",
      clientMessageId: "sticky-1",
      recipientLabel: "Alex",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.userMessage).toBe(
        "This opportunity isn't available to comment on."
      );
    }
    expect(sendSharedPostMessage).toHaveBeenCalledTimes(1);
    expect(sendSharedPostMessage.mock.calls[0]?.[4]).toBe(true);
  });

  it("retries with the same client message id", async () => {
    getOrCreateDirectConversation.mockResolvedValue({
      data: { conversation_id: "conv-1" },
      error: null,
    });
    sendSharedPostMessage
      .mockResolvedValueOnce({
        data: null,
        error: { message: "network" },
      })
      .mockResolvedValueOnce({
        data: { message: { id: "m1" }, created: false },
        error: null,
      });

    const input = {
      recipientUserId: "user-1",
      sourcePostId: "post-1",
      note: "Hello there",
      clientMessageId: "sticky-1",
      recipientLabel: "Alex",
    };
    const first = await sendPeopleContextComment(input);
    const second = await sendPeopleContextComment(input);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.created).toBe(false);
    expect(sendSharedPostMessage).toHaveBeenNthCalledWith(
      1,
      "conv-1",
      "post-1",
      "Hello there",
      "sticky-1",
      true
    );
    expect(sendSharedPostMessage).toHaveBeenNthCalledWith(
      2,
      "conv-1",
      "post-1",
      "Hello there",
      "sticky-1",
      true
    );
  });

  it("rejects empty note", async () => {
    const result = await sendPeopleContextComment({
      recipientUserId: "user-1",
      sourcePostId: "post-1",
      note: "   ",
      clientMessageId: "sticky-1",
      recipientLabel: "Alex",
    });
    expect(result.ok).toBe(false);
    expect(getOrCreateDirectConversation).not.toHaveBeenCalled();
  });
});
