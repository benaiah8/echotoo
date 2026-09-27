import { describe, expect, it } from "vitest";
import {
  inboxLongPressDestructiveLabels,
  inboxLongPressShowsDeleteGroup,
} from "./ConversationMuteActionsDrawer";

describe("inbox long-press Delete group gate", () => {
  it("A. DM row → no Delete group", () => {
    expect(inboxLongPressShowsDeleteGroup("direct", "admin")).toBe(false);
    expect(inboxLongPressShowsDeleteGroup("direct", "member")).toBe(false);
    expect(inboxLongPressShowsDeleteGroup("direct", null)).toBe(false);
    expect(
      inboxLongPressDestructiveLabels({
        isGroup: false,
        showDeleteChat: true,
        showLeaveGroup: true,
        showDeleteGroup: inboxLongPressShowsDeleteGroup("direct", "admin"),
      })
    ).toEqual(["Delete chat"]);
  });

  it('B. Group viewer_role = "member" → Mute / Delete chat / Leave; no Delete group', () => {
    expect(inboxLongPressShowsDeleteGroup("group", "member")).toBe(false);
    expect(
      inboxLongPressDestructiveLabels({
        isGroup: true,
        showDeleteChat: true,
        showLeaveGroup: true,
        showDeleteGroup: inboxLongPressShowsDeleteGroup("group", "member"),
      })
    ).toEqual(["Delete chat", "Leave group"]);
  });

  it('C. Group viewer_role = "admin" → Delete group below Leave group', () => {
    expect(inboxLongPressShowsDeleteGroup("group", "admin")).toBe(true);
    expect(
      inboxLongPressDestructiveLabels({
        isGroup: true,
        showDeleteChat: true,
        showLeaveGroup: true,
        showDeleteGroup: inboxLongPressShowsDeleteGroup("group", "admin"),
      })
    ).toEqual(["Delete chat", "Leave group", "Delete group"]);
  });

  it("D. viewer_role = null → Delete group hidden", () => {
    expect(inboxLongPressShowsDeleteGroup("group", null)).toBe(false);
    expect(inboxLongPressShowsDeleteGroup("group", undefined)).toBe(false);
    expect(
      inboxLongPressDestructiveLabels({
        isGroup: true,
        showDeleteChat: true,
        showLeaveGroup: true,
        showDeleteGroup: inboxLongPressShowsDeleteGroup("group", null),
      })
    ).toEqual(["Delete chat", "Leave group"]);
  });
});
