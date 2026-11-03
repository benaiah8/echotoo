/**
 * Sent Comment popup — read-only presentation (unified panel, plain text).
 */
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../components/ui/BottomDrawer", () => ({
  default: ({
    children,
    open,
  }: {
    children?: unknown;
    open?: boolean;
  }) =>
    open
      ? createElement("div", { "data-test-drawer": "true" }, children as never)
      : null,
}));

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

import PeopleCommentComposerOverlay from "../../components/people/PeopleCommentComposerOverlay";
import {
  closePeopleCommentComposer,
  getPeopleCommentComposerState,
  openPeopleCommentComposer,
} from "./peopleCommentComposerStore";
import { PEOPLE_PERSONAL_NOTE_TEXT_CLASS } from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const longMultiline = [
  "Line one with a short greeting.",
  "",
  "Line three wraps a very-long-token-" + "x".repeat(80),
  "Final line keeps newlines.",
].join("\n");

describe("peopleCommentComposerSentPresentation", () => {
  beforeEach(() => {
    closePeopleCommentComposer();
  });

  it("renders one unified sent panel with plain text and compact X", () => {
    openPeopleCommentComposer({
      surface: "duo",
      presentation: "sent",
      sentBody: longMultiline,
      opportunityId: "opp-1",
      sourcePostId: "post-1",
      recipientUserId: "user-1",
      displayName: "Alex Rivera",
      identitySource: { user_id: "user-1", display_name: "Alex Rivera" },
      caption: "Sunset hike this weekend",
      scheduleLabel: "Sat",
      scheduleLabelKind: "tomorrow",
      sourceType: "hangout",
      expressedByMe: false,
    });

    const html = renderToStaticMarkup(
      createElement(PeopleCommentComposerOverlay)
    );

    expect(html).toContain('data-people-comment-composer-mode="sent"');
    expect(html).toContain('data-people-comment-composer-sent-panel="true"');
    expect(html).toContain('data-people-comment-composer-context="true"');
    expect(html).toContain('data-people-comment-composer-caption="true"');
    expect(html).toContain("Sunset hike this weekend");
    expect(html).toContain("Alex Rivera");
    expect(html).toContain('data-people-comment-composer-sent-divider="true"');
    expect(html).toContain('data-people-comment-composer-sent-body="true"');
    expect(html).toContain('data-no-overlay-swipe');
    expect(html).toContain("select-text");
    expect(html).toContain('data-people-comment-composer-close-x="true"');
    expect(html).toContain(PEOPLE_PERSONAL_NOTE_TEXT_CLASS);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("break-words");
    expect(html).toContain(longMultiline.split("\n")[0]!);
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('data-people-comment-composer-compose="true"');
    expect(html).not.toContain(
      'data-people-comment-composer-char-count="true"'
    );
    expect(html).not.toContain(
      'data-people-comment-composer-action-tray="true"'
    );
    expect(html).not.toContain("Send");
    expect(html).not.toContain("Previously sent");
    expect(html).not.toContain("Cancel");
  });

  it("keeps the editable two-box composer for new comments with X", () => {
    openPeopleCommentComposer({
      surface: "discover",
      opportunityId: "opp-2",
      sourcePostId: "post-2",
      recipientUserId: "user-2",
      displayName: "Jordan",
      identitySource: { user_id: "user-2" },
      caption: "Coffee walk",
      scheduleLabel: "Today",
      scheduleLabelKind: "today",
      sourceType: "hangout",
      expressedByMe: false,
    });

    const html = renderToStaticMarkup(
      createElement(PeopleCommentComposerOverlay)
    );

    expect(html).toContain('data-people-comment-composer-mode="compose"');
    expect(html).toContain('data-people-comment-composer-context="true"');
    expect(html).toContain('data-people-comment-composer-compose="true"');
    expect(html).toContain('data-people-comment-composer-close-x="true"');
    expect(html).toContain("<textarea");
    expect(html).toContain('data-people-comment-composer-char-count="true"');
    expect(html).toContain("Cancel");
    expect(html).toContain("Send");
    expect(html).not.toContain('data-people-comment-composer-sent-panel="true"');
  });

  it("does not change comment controllers from this presentation pass", () => {
    const overlay = read("components/people/PeopleCommentComposerOverlay.tsx");
    const actions = read("lib/people/duoCommentActions.ts");
    const state = read("lib/people/duoCommentState.ts");
    const send = read("lib/people/peopleCommentComposerSend.ts");
    expect(overlay).toContain("sendPeopleContextComment");
    expect(overlay).toContain("noteConfirmedDuoComment");
    expect(overlay).toContain("recoverDuplicateDuoComment");
    expect(actions).toContain("routeDuoCommentTap");
    expect(actions).toContain('presentation: "sent"');
    expect(state).toContain("duoCommentVisual");
    expect(send).toContain("sendSharedPostMessage");
    expect(overlay).not.toContain("routeDuoCommentTap");
    expect(overlay).not.toContain("get_my_duo_comment");
  });

  it("keeps last painted content after store clear instead of a ghost Close drawer", () => {
    openPeopleCommentComposer({
      surface: "duo",
      presentation: "sent",
      sentBody: "Keep me while closing",
      opportunityId: "opp-close-1",
      sourcePostId: "post-close-1",
      recipientUserId: "user-close-1",
      displayName: "Casey",
      identitySource: { user_id: "user-close-1" },
      caption: "Trail run",
      scheduleLabel: "Today",
      scheduleLabelKind: "today",
      sourceType: "hangout",
      expressedByMe: false,
    });
    // First paint seeds lastCtxRef.
    renderToStaticMarkup(createElement(PeopleCommentComposerOverlay));
    closePeopleCommentComposer();

    // Mock drawer only mounts when open; assert source retains lastCtx path and
    // never branches to a second default-Close BottomDrawer.
    const overlay = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(overlay).toContain("const displayCtx = ctx ?? lastCtxRef.current");
    expect(overlay.match(/<BottomDrawer\b/g)?.length).toBe(1);
    expect(overlay).toContain("showCloseButton={false}");
    expect(overlay).not.toContain("if (!viewCtx)");
    expect(getPeopleCommentComposerState().context).toBeNull();
  });
});
