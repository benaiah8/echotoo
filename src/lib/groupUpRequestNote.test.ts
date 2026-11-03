/**
 * Client tests for Group Up optional request notes.
 * SQL contract stays in groupUpRequestNote.sql.test.ts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { __parseGroupUpRequesterForTests } from "../api/services/groupUp";
import GroupUpRequesterDrawerTile from "../components/messages/GroupUpRequesterDrawerTile";
import {
  GROUP_UP_NO_REQUEST_SENT_TOAST,
  GROUP_UP_REQUEST_NOTE_MAX,
  GroupUpRequestNoteComposerSheet,
  emitGroupUpComposerToast,
  groupUpHeartIntent,
  groupUpRequestComposerStillValid,
  limitGroupUpRequestNote,
  openGroupUpRequestComposer,
  runGroupUpRequestSubmit,
  trimGroupUpRequestNote,
  type GroupUpRequestComposerContext,
} from "../components/people/GroupUpRequestNoteComposer";
import type { GroupUpRequester } from "./people/types";

const ANON_CONTEXT: GroupUpRequestComposerContext = {
  identitySource: {
    profile_photos: [],
    echo_preset: "echo_a",
    avatar_url: null,
    display_name: null,
    username: null,
  },
  caption: "Saturday hiking crew",
  scheduleLabel: "Today",
  scheduleLabelKind: "today",
  feedNeutralEchoSeed: "group-a",
};

function requester(patch: Partial<GroupUpRequester> = {}): GroupUpRequester {
  return {
    request_id: "req-1",
    opportunity_id: "opp-1",
    conversation_id: "conv-1",
    requested_at: "2026-09-18T10:00:00Z",
    requester_user_id: "user-1",
    requester_profile_id: "profile-1",
    display_name: "Ada",
    username: "ada",
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
    ...patch,
  };
}

describe("Group Up request note client", () => {
  it("parses a trimmed note and drops blank or oversized notes", () => {
    expect(
      __parseGroupUpRequesterForTests({
        request_id: "req-1",
        opportunity_id: "opp-1",
        conversation_id: "conv-1",
        requested_at: "2026-09-18T10:00:00Z",
        requester_user_id: "user-1",
        note: "  hello  ",
      })?.note
    ).toBe("hello");

    expect(
      __parseGroupUpRequesterForTests({
        request_id: "req-2",
        opportunity_id: "opp-1",
        conversation_id: "conv-1",
        requested_at: "2026-09-18T10:00:00Z",
        requester_user_id: "user-1",
        note: "   ",
      })?.note
    ).toBeNull();

    expect(
      __parseGroupUpRequesterForTests({
        request_id: "req-3",
        opportunity_id: "opp-1",
        conversation_id: "conv-1",
        requested_at: "2026-09-18T10:00:00Z",
        requester_user_id: "user-1",
        note: "x".repeat(201),
      })?.note
    ).toBeNull();

    expect(
      __parseGroupUpRequesterForTests({
        request_id: "req-4",
        opportunity_id: "opp-1",
        conversation_id: "conv-1",
        requested_at: "2026-09-18T10:00:00Z",
        requester_user_id: "user-1",
      })?.note
    ).toBeNull();
  });

  it("shows a note as text and leaves a missing note off the list row", () => {
    const withNote = renderToStaticMarkup(
      createElement(GroupUpRequesterDrawerTile, {
        request: requester({ note: "See you there" }),
        busy: false,
        onAccept: () => {},
        onDecline: () => {},
        onProfile: () => {},
      })
    );
    expect(withNote).toContain("See you there");
    expect(withNote).toContain("data-group-up-request-note");
    expect(withNote).toContain('data-group-up-requester-row="true"');
    expect(withNote).toContain('data-group-up-requester-top="true"');
    expect(withNote).toContain("data-requester-action-pill");
    expect(withNote).toContain("data-group-up-request-sent");
    expect(withNote).toContain("w-full break-words");
    expect(withNote).toContain("[overflow-wrap:anywhere]");
    expect(withNote).not.toContain("line-clamp-");
    expect(withNote).not.toContain("<script");
    const topAt = withNote.indexOf('data-group-up-requester-top="true"');
    const pillAt = withNote.indexOf("data-requester-action-pill");
    const noteAt = withNote.indexOf("data-group-up-request-note");
    expect(topAt).toBeGreaterThan(0);
    expect(pillAt).toBeGreaterThan(topAt);
    expect(noteAt).toBeGreaterThan(pillAt);

    const withoutNote = renderToStaticMarkup(
      createElement(GroupUpRequesterDrawerTile, {
        request: requester(),
        busy: false,
        onAccept: () => {},
        onDecline: () => {},
        onProfile: () => {},
      })
    );
    expect(withoutNote).not.toContain("data-group-up-request-note");
    expect(withoutNote).toContain("data-requester-action-pill");
    expect(withoutNote).toContain('data-group-up-requester-row="true"');
    expect(withoutNote).toContain('data-group-up-requester-divider="true"');
  });

  it("submits a trimmed note only from the composer Send path", () => {
    const deck = readFileSync(
      resolve(__dirname, "../pages/people/GroupUpDeckBody.tsx"),
      "utf8"
    );
    const heartAt = deck.indexOf("const handleGroupsHeart");
    const heart = deck.slice(heartAt, deck.indexOf("return (", heartAt));
    const joinAt = deck.indexOf("const handleJoin");
    const join = deck.slice(joinAt, deck.indexOf("const handleWithdrawCurrent"));
    const submit = deck.slice(
      deck.indexOf("const submitGroupUpRequest"),
      deck.indexOf("const handleJoin")
    );
    const proceed = deck.slice(
      deck.indexOf("const proceedRequest"),
      deck.indexOf("const openRequestComposer")
    );

    expect(heart).toContain("groupUpHeartIntent");
    expect(heart).toContain("openRequestComposer");
    expect(heart).toContain("runWithdraw");
    expect(heart).not.toContain("proceedRequest");
    expect(heart).not.toContain("requestGroupUp");

    expect(join).toContain("openRequestComposer");
    expect(join).not.toContain("proceedRequest");
    expect(join).not.toContain("requestGroupUp");

    expect(submit).toContain("proceedRequest(target, draft)");
    expect(proceed).toContain("requestGroupUp(");
    expect(proceed).toContain("note.length > 0 ? { note }");
    expect(proceed).toContain("trimGroupUpRequestNote");
    expect(deck).toContain("GroupUpRequestNoteComposer");
    expect(deck).toContain('emitGroupUpComposerToast("cancel"');
    expect(deck).not.toContain("OpenPlanRequestNoteComposer");
  });
});

describe("Group Up request note composer", () => {
  it("opens for a new group and keeps a pending heart on withdraw", () => {
    expect(groupUpHeartIntent("none")).toBe("compose");
    expect(groupUpHeartIntent(undefined)).toBe("compose");
    expect(groupUpHeartIntent("pending")).toBe("withdraw");
    expect(groupUpHeartIntent("member")).toBe("open");
    expect(groupUpHeartIntent("owner")).toBe("open");
    const opened = openGroupUpRequestComposer(null, "group-a", ANON_CONTEXT);
    expect(opened).toEqual({
      opportunityId: "group-a",
      draft: "",
      ...ANON_CONTEXT,
    });
  });

  it("does not reuse a draft across opportunities", () => {
    const first = openGroupUpRequestComposer(null, "group-a", ANON_CONTEXT);
    const typed = { ...first, draft: "See you at noon" };
    const same = openGroupUpRequestComposer(typed, "group-a", ANON_CONTEXT);
    expect(same.draft).toBe("See you at noon");
    const otherCtx = { ...ANON_CONTEXT, feedNeutralEchoSeed: "group-b" };
    const other = openGroupUpRequestComposer(typed, "group-b", otherCtx);
    expect(other).toEqual({
      opportunityId: "group-b",
      draft: "",
      ...otherCtx,
    });
  });

  it("closes a composer when the group is gone or already pending", () => {
    const state = {
      opportunityId: "group-a",
      draft: "hello",
      ...ANON_CONTEXT,
    };
    expect(
      groupUpRequestComposerStillValid(state, [
        { opportunity_id: "group-a", viewer_state: "none" },
      ])
    ).toBe(true);
    expect(
      groupUpRequestComposerStillValid(state, [
        { opportunity_id: "group-a", viewer_state: "pending" },
      ])
    ).toBe(false);
    expect(groupUpRequestComposerStillValid(state, [])).toBe(false);
  });

  it("limits the field to 200 characters and trims on submit", () => {
    expect(limitGroupUpRequestNote("x".repeat(240))).toHaveLength(
      GROUP_UP_REQUEST_NOTE_MAX
    );
    expect(trimGroupUpRequestNote("  hello  ")).toBe("hello");
    expect(trimGroupUpRequestNote("   ")).toBe("");
  });

  it("renders two glass cards with anonymous context and empty note", () => {
    const html = renderToStaticMarkup(
      createElement(GroupUpRequestNoteComposerSheet, {
        draft: "",
        busy: false,
        context: ANON_CONTEXT,
        onDraftChange: () => {},
        onCancel: () => {},
        onSubmit: () => {},
      })
    );
    expect(html).toContain("Request to join");
    expect(html).toContain("Group Up");
    expect(html).toContain("Saturday hiking crew");
    expect(html).toContain("Today");
    expect(html).toContain('data-people-composer-context-card="true"');
    expect(html).toContain("Message to the host (optional)");
    expect(html).toContain("Say hi and share why you&#x27;d like to join…");
    expect(html).toContain("Cancel");
    expect(html).toContain("Send request");
    expect(html).toContain('maxLength="200"');
    expect(html).toContain("0/200");
    expect(html).toContain('data-group-up-request-note-sheet="true"');
    expect(html).toContain('data-group-up-request-note-compose="true"');
    expect(html).toContain('data-group-up-request-note-count="true"');
    expect(html).toContain('data-group-up-request-note-action-tray="true"');
    expect(html).toContain('data-group-up-request-note-dismiss="true"');
    expect(html).toContain('data-group-up-request-note-cancel="true"');
    expect(html).toContain("var(--text)");
    expect(html).toContain("backdrop-blur");
    expect(html).not.toContain("requestGroupUp");
    expect(html).not.toContain("display_name");
  });

  it("submits one trimmed note and keeps the draft after a failure", async () => {
    const flight = { current: false };
    const calls: string[] = [];
    let fail = true;
    const request = (id: string, options: { note: string }) => {
      calls.push(`${id}:${options.note}`);
      if (fail) return Promise.reject(new Error("network"));
      return Promise.resolve({ status: "pending" });
    };

    const failed = await runGroupUpRequestSubmit({
      flight,
      opportunityId: "group-a",
      draft: "  bring a jacket  ",
      request,
    });
    expect(failed).toEqual({
      status: "error",
      note: "  bring a jacket  ",
    });
    expect(flight.current).toBe(false);

    fail = false;
    const retried = await runGroupUpRequestSubmit({
      flight,
      opportunityId: "group-a",
      draft: "  bring a jacket  ",
      request,
    });
    expect(retried.status).toBe("ok");
    if (retried.status === "ok") {
      expect(retried.note).toBe("bring a jacket");
    }
    expect(calls).toEqual([
      "group-a:bring a jacket",
      "group-a:bring a jacket",
    ]);
  });

  it("sends one request when confirm is tapped twice", async () => {
    const flight = { current: false };
    let resolveRequest: (value: { status: string }) => void = () => {};
    const request = () =>
      new Promise<{ status: string }>((resolve) => {
        resolveRequest = resolve;
      });
    const first = runGroupUpRequestSubmit({
      flight,
      opportunityId: "group-a",
      draft: "",
      request,
    });
    const second = await runGroupUpRequestSubmit({
      flight,
      opportunityId: "group-a",
      draft: "second",
      request,
    });
    expect(second.status).toBe("skipped");
    resolveRequest({ status: "pending" });
    const done = await first;
    expect(done.status).toBe("ok");
    if (done.status === "ok") {
      expect(done.note).toBe("");
    }
  });

  it("toasts cancel once and stays quiet for dismiss", () => {
    const deck = readFileSync(
      resolve(__dirname, "../pages/people/GroupUpDeckBody.tsx"),
      "utf8"
    );
    const messages: string[] = [];
    const emit = {
      info: (message: string) => messages.push(message),
    };
    emitGroupUpComposerToast("cancel", emit);
    expect(messages).toEqual([GROUP_UP_NO_REQUEST_SENT_TOAST]);
    messages.length = 0;
    emitGroupUpComposerToast("dismiss", emit);
    expect(messages).toEqual([]);

    const heartAt = deck.indexOf("const handleGroupsHeart");
    const heart = deck.slice(heartAt, deck.indexOf("return (", heartAt));
    expect(heart).toContain("runWithdraw");
    expect(heart).not.toContain("emitGroupUpComposerToast");
    expect(heart).not.toContain("No request sent");
    const dismiss = deck.slice(
      deck.indexOf("onDismiss={() => {"),
      deck.indexOf("onSubmit={(draft)")
    );
    expect(dismiss).toContain("setComposer(null)");
    expect(dismiss).not.toContain("emitGroupUpComposerToast");
    expect(deck.match(/emitGroupUpComposerToast\("cancel"/g)?.length).toBe(1);
  });

  it("does not submit on composer open or Cancel", () => {
    const deck = readFileSync(
      resolve(__dirname, "../pages/people/GroupUpDeckBody.tsx"),
      "utf8"
    );
    const open = deck.slice(
      deck.indexOf("const openRequestComposer"),
      deck.indexOf("const submitGroupUpRequest")
    );
    const cancel = deck.slice(
      deck.indexOf("onCancel={() => {"),
      deck.indexOf("onDismiss={() => {")
    );
    expect(open).toContain("openGroupUpRequestComposer");
    expect(open).not.toContain("proceedRequest");
    expect(open).not.toContain("requestGroupUp");
    expect(cancel).toContain('emitGroupUpComposerToast("cancel"');
    expect(cancel).not.toContain("proceedRequest");
    expect(cancel).not.toContain("requestGroupUp");
  });
});
