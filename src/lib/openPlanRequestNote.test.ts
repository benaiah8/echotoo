import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import OpenPlanRequesterDrawerTile from "../components/messages/OpenPlanRequesterDrawerTile";
import { __parseOpenPlanRequesterForTests } from "../api/services/openPlans";
import type { OpenPlanRequester } from "./people/types";
import {
  OPEN_PLAN_REQUEST_NOTE_MAX,
  OpenPlanRequestNoteComposerSheet,
  classifyOpenPlanRequestStatus,
  emitOpenPlanComposerToast,
  limitOpenPlanRequestNote,
  openOpenPlanRequestComposer,
  openPlanHeartIntent,
  openPlanRequestComposerStillValid,
  runOpenPlanRequestSubmit,
  trimOpenPlanRequestNote,
  type OpenPlanRequestComposerContext,
} from "../components/people/OpenPlanRequestNoteComposer";

const ANON_CONTEXT: OpenPlanRequestComposerContext = {
  identitySource: {
    profile_photos: [],
    echo_preset: "echo_a",
    avatar_url: null,
    display_name: null,
    username: null,
  },
  caption: "Coffee near campus",
  scheduleLabel: "Today",
  scheduleLabelKind: "today",
  feedNeutralEchoSeed: "plan-a",
};

const NOTE_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261105120000_open_plan_request_note.sql"
);
const GROUPS_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261009120000_open_plan_request_groups.sql"
);
const PUSH_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20260907120000_open_plan_request_push.sql"
);
const ACCEPT_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20260908120000_match_context_messages.sql"
);
const WITHDRAW_SQL = resolve(
  __dirname,
  "../../supabase/migrations/20260903120000_open_plan_requests_foundation.sql"
);

function functionBody(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.",
    start + needle.length
  );
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

function requester(patch: Partial<OpenPlanRequester> = {}): OpenPlanRequester {
  return {
    request_id: "req-1",
    requested_at: "2026-09-18T10:00:00Z",
    display_name: "Ada",
    profile_open_key: "ada",
    note: null,
    avatar_url: null,
    profile_photos: [],
    echo_preset: null,
    bio: null,
    ...patch,
  };
}

describe("Open Plan request note SQL", () => {
  const sql = readFileSync(NOTE_SQL, "utf8").replace(/\r\n/g, "\n");
  const requestBody = functionBody(sql, "request_open_plan");
  const listBody = functionBody(sql, "list_open_plan_requesters");
  const reuseIdx = requestBody.indexOf("IF FOUND THEN");
  const noteIdx = requestBody.indexOf("v_note :=");
  const insertIdx = requestBody.indexOf("INSERT INTO public.open_plan_requests");
  const reuseBlock = requestBody.slice(reuseIdx, noteIdx);

  it("keeps a no-note request compatible with the identity default", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS note text");
    expect(sql).toContain("p_identity_visible_to_host boolean DEFAULT false");
    expect(sql).toContain("p_note text DEFAULT NULL");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.request_open_plan(uuid, boolean);"
    );
    expect(sql).not.toContain("DROP CASCADE");
    expect(sql).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.request_open_plan(uuid, boolean);"
    );
    expect(requestBody).toContain("v_note := NULLIF(btrim(COALESCE(p_note, '')), '')");
  });

  it("trims the note, stores null when blank, and rejects more than 200 characters", () => {
    expect(requestBody).toContain("char_length(v_note) > 200");
    expect(requestBody).toContain("Open Plan request note is too long");
    expect(sql).toContain("char_length(note) <= 200");
    const insertValues = requestBody.slice(insertIdx, requestBody.indexOf("RETURNING *"));
    expect(insertValues).toContain("note");
    expect(insertValues).toContain("v_note");
  });

  it("rejects a nonempty note unless identity is visible", () => {
    expect(requestBody).toContain(
      "IF v_note IS NOT NULL AND v_identity_visible IS NOT TRUE THEN"
    );
    expect(requestBody).toContain(
      "Open Plan request note requires identity visibility"
    );
    expect(sql).toContain("note IS NULL OR identity_visible_to_host IS TRUE");
  });

  it("does not overwrite the note or identity flag on a reused request", () => {
    expect(reuseIdx).toBeGreaterThan(0);
    expect(noteIdx).toBeGreaterThan(reuseIdx);
    expect(insertIdx).toBeGreaterThan(noteIdx);
    expect(reuseBlock).toContain("RETURN jsonb_build_object");
    expect(reuseBlock).not.toMatch(/^\s*UPDATE\b/im);
    expect(reuseBlock).not.toContain("v_note");
    expect(reuseBlock).not.toContain("identity_visible_to_host");
    const raceIdx = requestBody.indexOf("Race recovery");
    const raceBlock = requestBody.slice(raceIdx, requestBody.indexOf("New request only"));
    expect(raceBlock).not.toMatch(/^\s*UPDATE\b/im);
    expect(raceBlock).not.toContain("v_note");
  });

  it("returns the note only from the organizer-gated host list", () => {
    expect(listBody).toContain("o.creator_id = v_me");
    expect(listBody).toContain("IF NOT EXISTS");
    expect(listBody).toContain("RETURN v_empty");
    expect(listBody).toContain(
      "WHEN r.identity_visible_to_host IS TRUE THEN NULLIF(btrim(r.note), '')"
    );
    expect(listBody).toContain("'note', t.note");
    expect(listBody).not.toContain("'username'");
    expect(listBody).not.toContain("'email'");
    expect(listBody).not.toContain("'requester_id'");
  });

  it("leaves anonymous group previews, push text, accept, and withdraw unchanged", () => {
    expect(sql).not.toContain("list_my_open_plan_request_groups");
    expect(sql).toContain("PERFORM public.enqueue_open_plan_request_push(v_req.id)");
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.enqueue_open_plan_request_push/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.accept_open_plan_request/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.withdraw_open_plan_request/
    );
    expect(sql).not.toContain("Someone is interested");
    expect(sql).not.toContain("You matched on an Open Plan");

    const groups = readFileSync(GROUPS_SQL, "utf8");
    expect(groups).toContain("'avatar_url', s.avatar_url");
    expect(groups).not.toContain("'note'");
    expect(groups).not.toContain("'display_name'");

    const push = readFileSync(PUSH_SQL, "utf8");
    expect(push).toContain("Someone is interested in your open plan.");
    expect(push).not.toContain("p_note");

    const accept = functionBody(
      readFileSync(ACCEPT_SQL, "utf8"),
      "accept_open_plan_request"
    );
    expect(accept).toContain("You matched on an Open Plan");
    expect(accept).not.toContain("p_note");
    expect(accept).toContain("dm_grant_direct_access");

    const withdraw = functionBody(
      readFileSync(WITHDRAW_SQL, "utf8"),
      "withdraw_open_plan_request"
    );
    expect(withdraw).toContain("status = 'withdrawn'");
    expect(withdraw).not.toContain("note");
  });
});

describe("Open Plan request note client", () => {
  it("parses a trimmed note and drops blank or oversized notes", () => {
    expect(
      __parseOpenPlanRequesterForTests({
        request_id: "req-1",
        requested_at: "2026-09-18T10:00:00Z",
        avatar_url: null,
        profile_photos: [],
        echo_preset: null,
        bio: null,
        note: "  hello  ",
      })?.note
    ).toBe("hello");

    expect(
      __parseOpenPlanRequesterForTests({
        request_id: "req-2",
        requested_at: "2026-09-18T10:00:00Z",
        avatar_url: null,
        profile_photos: [],
        echo_preset: null,
        bio: null,
        note: "   ",
      })?.note
    ).toBeNull();

    expect(
      __parseOpenPlanRequesterForTests({
        request_id: "req-3",
        requested_at: "2026-09-18T10:00:00Z",
        avatar_url: null,
        profile_photos: [],
        echo_preset: null,
        bio: null,
        note: "x".repeat(201),
      })?.note
    ).toBeNull();
  });

  it("shows a note as text and leaves a missing note off the tile", () => {
    const todayIso = new Date().toISOString();
    const withNote = renderToStaticMarkup(
      createElement(OpenPlanRequesterDrawerTile, {
        request: requester({ note: "See you there", requested_at: todayIso }),
        busy: false,
        onAccept: () => {},
        onProfile: () => {},
      })
    );
    expect(withNote).toContain("See you there");
    expect(withNote).toContain("data-open-plan-request-note");
    expect(withNote).toContain('data-open-plan-requester-row="true"');
    expect(withNote).toContain("data-open-plan-request-sent");
    expect(withNote).toContain("Sent today");
    expect(withNote).toContain('data-open-plan-requester-top="true"');
    expect(withNote).toContain('data-open-plan-requester-divider="true"');
    expect(withNote).toContain("w-full break-words");
    expect(withNote).toContain("Chat");
    expect(withNote).not.toContain("<script");
    const topAt = withNote.indexOf('data-open-plan-requester-top="true"');
    const acceptAt = withNote.indexOf("data-open-plan-accept-pill");
    const noteAt = withNote.indexOf("data-open-plan-request-note");
    const dividerAt = withNote.indexOf('data-open-plan-requester-divider="true"');
    expect(topAt).toBeGreaterThan(0);
    expect(acceptAt).toBeGreaterThan(topAt);
    expect(noteAt).toBeGreaterThan(acceptAt);
    expect(dividerAt).toBeGreaterThan(noteAt);

    const withoutNote = renderToStaticMarkup(
      createElement(OpenPlanRequesterDrawerTile, {
        request: requester({ requested_at: todayIso }),
        busy: false,
        onAccept: () => {},
        onProfile: () => {},
      })
    );
    expect(withoutNote).not.toContain("data-open-plan-request-note");
    expect(withoutNote).toContain("Chat");
    expect(withoutNote).toContain("data-open-plan-accept-pill");
    expect(withoutNote).toContain('data-open-plan-requester-top="true"');
  });

  it("shows Name hidden only for intentional anonymity, Someone when disclosed name is missing", () => {
    const todayIso = new Date().toISOString();
    const anonymous = renderToStaticMarkup(
      createElement(OpenPlanRequesterDrawerTile, {
        request: requester({
          display_name: null,
          profile_open_key: null,
          note: null,
          requested_at: todayIso,
        }),
        busy: false,
        onAccept: () => {},
        onProfile: () => {},
      })
    );
    expect(anonymous).toContain("Name hidden");
    expect(anonymous).toContain('data-requester-name-kind="anonymous"');
    expect(anonymous).toContain("Chat");
    expect(anonymous).not.toContain("Someone");
    expect(anonymous).not.toContain("onDecline");

    const disclosedMissing = renderToStaticMarkup(
      createElement(OpenPlanRequesterDrawerTile, {
        request: requester({
          display_name: null,
          profile_open_key: "ada",
          note: null,
          requested_at: todayIso,
        }),
        busy: false,
        onAccept: () => {},
        onProfile: () => {},
      })
    );
    expect(disclosedMissing).toContain("Someone");
    expect(disclosedMissing).toContain('data-requester-name-kind="missing"');
    expect(disclosedMissing).not.toContain("Name hidden");
    expect(disclosedMissing).toContain("Chat");
  });

  it("submits a trimmed note only from the shared request path", () => {
    const deck = readFileSync(
      resolve(__dirname, "../pages/people/OpenPlanDeckBody.tsx"),
      "utf8"
    );
    const imDown = deck.slice(
      deck.indexOf("const handleImDown"),
      deck.indexOf("const handleWithdraw")
    );
    const heartAt = deck.indexOf("const handlePlansHeart");
    const heart = deck.slice(heartAt, deck.indexOf("return (", heartAt));
    const submit = deck.slice(
      deck.indexOf("const submitOpenPlanRequest"),
      deck.indexOf("const handleImDown")
    );

    expect(imDown).toContain("openRequestComposer");
    expect(imDown).not.toContain("requestOpenPlan");
    expect(heart).toContain("openPlanHeartIntent");
    expect(heart).toContain("openRequestComposer");
    expect(heart).toContain("withdrawOpenPlanRequest");
    expect(heart).not.toContain("requestOpenPlan");
    expect(submit).toContain("requestOpenPlan(id,");
    expect(submit).toContain("identityVisibleToHost: true");
    expect(submit).toContain("note: options.note");
    expect(submit).toContain("classifyOpenPlanRequestStatus");
    expect(submit).toContain("openPlansAlreadyAccepted");
    expect(deck).toContain("note={row.description?.trim() || null}");
    expect(deck).not.toContain("p_note");
    expect(deck).not.toContain("send-open-plan-request-push");
  });
});

describe("Open Plan request note composer", () => {
  it("opens for a new plan and keeps a pending heart on withdraw", () => {
    expect(openPlanHeartIntent(null)).toBe("compose");
    expect(openPlanHeartIntent("pending")).toBe("withdraw");
    const opened = openOpenPlanRequestComposer(null, "plan-a", ANON_CONTEXT);
    expect(opened).toEqual({
      opportunityId: "plan-a",
      draft: "",
      ...ANON_CONTEXT,
    });
  });

  it("does not reuse a draft across opportunities", () => {
    const first = openOpenPlanRequestComposer(null, "plan-a", ANON_CONTEXT);
    const typed = { ...first, draft: "See you at noon" };
    const same = openOpenPlanRequestComposer(typed, "plan-a", ANON_CONTEXT);
    expect(same.draft).toBe("See you at noon");
    const otherCtx = { ...ANON_CONTEXT, feedNeutralEchoSeed: "plan-b" };
    const other = openOpenPlanRequestComposer(typed, "plan-b", otherCtx);
    expect(other).toEqual({
      opportunityId: "plan-b",
      draft: "",
      ...otherCtx,
    });
  });

  it("closes a composer when the plan is gone or already pending", () => {
    const state = { opportunityId: "plan-a", draft: "hello", ...ANON_CONTEXT };
    expect(
      openPlanRequestComposerStillValid(state, [
        { opportunity_id: "plan-a", my_request_status: null },
      ])
    ).toBe(true);
    expect(
      openPlanRequestComposerStillValid(state, [
        { opportunity_id: "plan-a", my_request_status: "pending" },
      ])
    ).toBe(false);
    expect(openPlanRequestComposerStillValid(state, [])).toBe(false);
  });

  it("limits the field to 200 characters and trims on submit", () => {
    expect(limitOpenPlanRequestNote("x".repeat(240))).toHaveLength(
      OPEN_PLAN_REQUEST_NOTE_MAX
    );
    expect(trimOpenPlanRequestNote("  hello  ")).toBe("hello");
    expect(trimOpenPlanRequestNote("   ")).toBe("");
  });

  it("renders two glass cards with anonymous context and empty note", () => {
    const html = renderToStaticMarkup(
      createElement(OpenPlanRequestNoteComposerSheet, {
        draft: "",
        busy: false,
        context: ANON_CONTEXT,
        onDraftChange: () => {},
        onCancel: () => {},
        onSubmit: () => {},
      })
    );
    expect(html).toContain("Request to join");
    expect(html).toContain("Open Plan");
    expect(html).toContain("Coffee near campus");
    expect(html).toContain("Today");
    expect(html).toContain('data-people-composer-context-card="true"');
    expect(html).toContain('data-people-composer-context-date-kind="today"');
    expect(html).toContain("Message to the host (optional)");
    expect(html).toContain("Say hi and share why you&#x27;d like to join…");
    expect(html).toContain("Cancel");
    expect(html).toContain("Send request");
    expect(html).toContain('maxLength="200"');
    expect(html).toContain("0/200");
    expect(html).toContain('data-open-plan-request-note-sheet="true"');
    expect(html).toContain('data-open-plan-request-note-compose="true"');
    expect(html).toContain('data-open-plan-request-note-count="true"');
    expect(html).toContain('data-open-plan-request-note-action-tray="true"');
    expect(html).toContain('data-open-plan-request-note-dismiss="true"');
    expect(html).toContain('data-open-plan-request-note-cancel="true"');
    expect(html).toContain("var(--text)");
    expect(html).toContain("backdrop-blur");
    expect(html).not.toContain("requestOpenPlan");
    expect(html).not.toContain("display_name");
  });

  it("uses BottomDrawer glass presentation without Comment composer coupling", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/people/OpenPlanRequestNoteComposer.tsx"),
      "utf8"
    );
    const deck = readFileSync(
      resolve(__dirname, "../pages/people/OpenPlanDeckBody.tsx"),
      "utf8"
    );
    expect(src).toContain("BottomDrawer");
    expect(src).toContain("transparentSheet");
    expect(src).toContain("shrinkSheetToContent");
    expect(src).toContain("liftWithKeyboard");
    expect(src).toContain("glassPeoplePanelClass");
    expect(src).toContain("PeopleComposerContextCard");
    expect(src).toContain("peopleUiCopy.openPlanIncomingLabel");
    expect(src).toContain("SOCIAL_OVERLAY_LAYER.browseOrNote");
    expect(src).toContain("sheet.onDismiss ?? sheet.onCancel");
    expect(src).toContain("data-open-plan-request-note-dismiss");
    expect(src).toContain("data-open-plan-request-note-cancel");
    expect(src).toContain("OPEN_PLAN_REQUEST_NOTE_MAX");
    expect(src).not.toContain("peopleCommentComposerStore");
    expect(src).not.toContain("sendPeopleContextComment");
    expect(src).not.toContain("openPeopleCommentComposer");
    expect(deck).toContain("composerContextFromRow");
    expect(deck).toContain("display_name: null");
    expect(deck).toContain("getPostScheduleLabel");
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

    const failed = await runOpenPlanRequestSubmit({
      flight,
      opportunityId: "plan-a",
      draft: "  bring a jacket  ",
      request,
    });
    expect(failed).toEqual({
      status: "error",
      note: "  bring a jacket  ",
    });
    expect(flight.current).toBe(false);

    fail = false;
    const retried = await runOpenPlanRequestSubmit({
      flight,
      opportunityId: "plan-a",
      draft: "  bring a jacket  ",
      request,
    });
    expect(retried.status).toBe("ok");
    if (retried.status === "ok") {
      expect(retried.note).toBe("bring a jacket");
      expect(classifyOpenPlanRequestStatus(retried.result.status)).toBe(
        "pending"
      );
    }
    expect(calls).toEqual([
      "plan-a:bring a jacket",
      "plan-a:bring a jacket",
    ]);
  });

  it("sends one request when confirm is tapped twice", async () => {
    const flight = { current: false };
    let resolveRequest: (value: { status: string }) => void = () => {};
    const request = () =>
      new Promise<{ status: string }>((resolve) => {
        resolveRequest = resolve;
      });
    const first = runOpenPlanRequestSubmit({
      flight,
      opportunityId: "plan-a",
      draft: "",
      request,
    });
    const second = await runOpenPlanRequestSubmit({
      flight,
      opportunityId: "plan-a",
      draft: "second",
      request,
    });
    expect(second.status).toBe("skipped");
    resolveRequest({ status: "accepted" });
    const done = await first;
    expect(done.status).toBe("ok");
    if (done.status === "ok") {
      expect(done.note).toBe("");
      expect(classifyOpenPlanRequestStatus(done.result.status)).toBe(
        "accepted"
      );
    }
    expect(classifyOpenPlanRequestStatus("closed")).toBe("refresh");
  });

  it("toasts cancel once and stays quiet for dismiss, refresh, and withdraw", () => {
    const deck = readFileSync(
      resolve(__dirname, "../pages/people/OpenPlanDeckBody.tsx"),
      "utf8"
    );
    const copy = {
      accepted: "Already accepted — check Messages.",
      error: "Couldn't send request.",
    };
    const messages: string[] = [];
    const emit = {
      info: (message: string) => messages.push(message),
      accepted: (message: string) => messages.push(`accepted:${message}`),
      error: (message: string) => messages.push(`error:${message}`),
    };
    emitOpenPlanComposerToast("cancel", emit, copy);
    expect(messages).toEqual(["No request sent"]);
    messages.length = 0;
    emitOpenPlanComposerToast("dismiss", emit, copy);
    emitOpenPlanComposerToast("refresh", emit, copy);
    expect(messages).toEqual([]);

    const heartAt = deck.indexOf("const handlePlansHeart");
    const heart = deck.slice(heartAt, deck.indexOf("return (", heartAt));
    expect(heart).toContain("withdrawOpenPlanRequest");
    expect(heart).not.toContain("emitOpenPlanComposerToast");
    expect(heart).not.toContain("No request sent");
    expect(heart).not.toContain("Request sent");
    const dismiss = deck.slice(
      deck.indexOf("onDismiss={() => {"),
      deck.indexOf("onSubmit={(draft)")
    );
    expect(dismiss).toContain("setComposer(null)");
    expect(dismiss).not.toContain("emitOpenPlanComposerToast");
    expect(deck.match(/"cancel"/g)?.length).toBe(1);
  });

  it("shows one Request sent toast for pending and keeps the accepted toast separate", () => {
    const copy = {
      accepted: "Already accepted — check Messages.",
      error: "Couldn't send request.",
    };
    const messages: string[] = [];
    const emit = {
      info: (message: string) => messages.push(message),
      accepted: (message: string) => messages.push(`accepted:${message}`),
      error: (message: string) => messages.push(`error:${message}`),
    };
    emitOpenPlanComposerToast("pending", emit, copy);
    expect(messages).toEqual(["Request sent"]);
    messages.length = 0;
    emitOpenPlanComposerToast("accepted", emit, copy);
    expect(messages).toEqual([`accepted:${copy.accepted}`]);
    expect(messages.some((message) => message === "Request sent")).toBe(false);
    messages.length = 0;
    emitOpenPlanComposerToast("error", emit, copy);
    expect(messages).toEqual([`error:${copy.error}`]);
    expect(messages.some((message) => message === "Request sent")).toBe(false);

    const deck = readFileSync(
      resolve(__dirname, "../pages/people/OpenPlanDeckBody.tsx"),
      "utf8"
    );
    const submit = deck.slice(
      deck.indexOf("const submitOpenPlanRequest"),
      deck.indexOf("const handleImDown")
    );
    expect(submit.match(/emitOpenPlanComposerToast\("pending"/g)?.length).toBe(1);
    expect(submit).toContain('emitOpenPlanComposerToast("accepted"');
    expect(submit).toContain('emitOpenPlanComposerToast("error"');
    expect(submit).not.toContain("No request sent");
  });
});
