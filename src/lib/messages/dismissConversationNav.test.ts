import { describe, expect, it, vi } from "vitest";
import {
  buildGroupManageConversationNavState,
  buildGroupManageOpenGroupNavigation,
  CONVERSATION_RETURN_GROUP_MANAGE,
  dismissConversationOverlay,
  getConversationOverlayReturnContext,
  isGroupManageConversationLaunch,
  isMessagesInboxBackground,
  messagesBackgroundFromLocationState,
  normalizeMessagesInboxBackground,
} from "./dismissConversationNav";
import { Paths } from "../../router/Paths";
import { SOCIAL_OVERLAY_LAYER } from "../socialOverlayLayers";

describe("normalizeMessagesInboxBackground", () => {
  it("keeps a real /messages inbox location (incl. search)", () => {
    const bg = normalizeMessagesInboxBackground({
      pathname: Paths.messages,
      search: "?tab=requests",
      hash: "",
      key: "abc",
      state: { peek: 1 },
    });
    expect(bg.pathname).toBe("/messages");
    expect(bg.search).toBe("?tab=requests");
    expect(bg.state).toEqual({ peek: 1 });
  });

  it("never accepts a conversation path as background", () => {
    const bg = normalizeMessagesInboxBackground({
      pathname: "/messages/conv-old",
      search: "",
      hash: "",
      key: "x",
      state: null,
    });
    expect(bg.pathname).toBe("/messages");
    expect(isMessagesConversationPoison(bg.pathname)).toBe(false);
  });

  it("falls back for null/undefined/garbage", () => {
    expect(normalizeMessagesInboxBackground(null).pathname).toBe("/messages");
    expect(normalizeMessagesInboxBackground(undefined).pathname).toBe(
      "/messages"
    );
    expect(normalizeMessagesInboxBackground("nope").pathname).toBe("/messages");
  });
});

describe("messagesBackgroundFromLocationState", () => {
  it("returns null when backgroundLocation is a conversation route", () => {
    expect(
      messagesBackgroundFromLocationState({
        backgroundLocation: {
          pathname: "/messages/abc",
          search: "",
          hash: "",
          key: "k",
          state: null,
        },
      })
    ).toBeNull();
  });

  it("returns inbox background when valid", () => {
    const bg = messagesBackgroundFromLocationState({
      backgroundLocation: {
        pathname: "/messages",
        search: "",
        hash: "",
        key: "k",
        state: null,
      },
    });
    expect(isMessagesInboxBackground(bg)).toBe(true);
  });
});

describe("group-manage conversation return context", () => {
  const feedLocation = {
    pathname: "/",
    search: "",
    hash: "",
    key: "feed",
    state: null,
  };

  it("buildGroupManageConversationNavState tags contextual return", () => {
    const state = buildGroupManageConversationNavState(feedLocation);
    expect(state.conversationReturnContext).toBe(
      CONVERSATION_RETURN_GROUP_MANAGE
    );
    expect(state.backgroundLocation).toEqual(feedLocation);
    expect(isGroupManageConversationLaunch(state)).toBe(true);
    expect(getConversationOverlayReturnContext(state)).toBe(
      CONVERSATION_RETURN_GROUP_MANAGE
    );
  });

  it("buildGroupManageOpenGroupNavigation never closes Manage", () => {
    const nav = buildGroupManageOpenGroupNavigation("conv-1", feedLocation);
    expect(nav.closeManage).toBe(false);
    expect(nav.path).toBe("/messages/conv-1");
    expect(nav.state.conversationReturnContext).toBe(
      CONVERSATION_RETURN_GROUP_MANAGE
    );
    expect(nav.state.backgroundLocation?.pathname).toBe("/");
  });

  it("dismiss uses history -1 for group-manage launches", () => {
    const navigate = vi.fn();
    dismissConversationOverlay(
      navigate,
      buildGroupManageConversationNavState(feedLocation)
    );
    expect(navigate).toHaveBeenCalledWith(-1);
    expect(navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: Paths.messages }),
      expect.anything()
    );
  });

  it("normal Messages dismiss still returns to Messages", () => {
    const navigate = vi.fn();
    dismissConversationOverlay(navigate, {
      backgroundLocation: {
        pathname: Paths.messages,
        search: "?tab=requests",
        hash: "",
        key: "inbox",
        state: null,
      },
    });
    expect(navigate).toHaveBeenCalledWith(
      { pathname: Paths.messages, search: "?tab=requests", hash: "" },
      { state: null, replace: true }
    );
  });

  it("unmarked conversation state falls back to Messages", () => {
    const navigate = vi.fn();
    dismissConversationOverlay(navigate, {
      backgroundLocation: feedLocation,
    });
    expect(navigate).toHaveBeenCalledWith(
      { pathname: Paths.messages, search: "", hash: "" },
      { state: null, replace: true }
    );
  });

  it("socialConversation layer sits above manage/browse and below photoGate", () => {
    const create = Number(
      SOCIAL_OVERLAY_LAYER.createManage.match(/\d+/)?.[0] ?? 0
    );
    const browse = Number(
      SOCIAL_OVERLAY_LAYER.browseOrNote.match(/\d+/)?.[0] ?? 0
    );
    const chat = Number(
      SOCIAL_OVERLAY_LAYER.socialConversation.match(/\d+/)?.[0] ?? 0
    );
    const gate = Number(SOCIAL_OVERLAY_LAYER.photoGate.match(/\d+/)?.[0] ?? 0);
    expect(chat).toBeGreaterThan(create);
    expect(chat).toBeGreaterThan(browse);
    expect(gate).toBeGreaterThan(chat);
  });
});

function isMessagesConversationPoison(pathname: string): boolean {
  return /^\/messages\/[^/]+\/?$/.test(pathname);
}
