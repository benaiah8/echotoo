/**
 * Shared People Comment Composer — wiring contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleCommentComposerWiring", () => {
  it("mounts overlay once in AppFloatingChrome", () => {
    const chrome = read("components/AppFloatingChrome.tsx");
    expect(chrome).toContain("PeopleCommentComposerOverlay");
    expect(chrome.match(/<PeopleCommentComposerOverlay\s*\/>/g)?.length).toBe(
      1
    );
  });

  it("Discover and Duo open shared composer from MatchDeckOverlay", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("openPeopleCommentComposer");
    expect(overlay).toContain("openPairUpCommentComposer");
    expect(overlay).toContain("onAfterMessageDelivered");
    expect(overlay).toContain('scope === "discover" && !row.expressed_by_me');
    expect(overlay).toContain("runPairUpConnectForTarget");
    expect(overlay).toContain("PeopleDuoBottomActionRow");
    expect(overlay).toContain("onMessage");
    expect(overlay).not.toContain("getOrCreateDirectConversation");
  });

  it("portaled Duo Connect gated on People tab visibility", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain('useTabActive("people")');
    expect(overlay).toContain("isDuoDeckScope && isPeopleTabVisible");
    expect(read("components/people/PeopleDuoBottomActionRow.tsx")).toContain(
      "createPortal"
    );
  });

  it("overlay uses BottomDrawer keyboard conventions", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain("liftWithKeyboard");
    expect(ui).toContain("SOCIAL_OVERLAY_LAYER.browseOrNote");
    expect(ui).toContain("sendPeopleContextComment");
    expect(ui).toContain("subscribeAndroidHardwareBack");
    expect(ui).not.toMatch(/\bfooter=\{/);
  });

  it("split context card and composition card with in-panel actions", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain("PeopleComposerContextCard");
    expect(ui).toContain('data-people-comment-composer-context="true"');
    expect(ui).toContain('data-people-comment-composer-compose="true"');
    expect(ui).toContain('data-people-comment-composer-action-tray="true"');
    expect(ui).toContain("people-comment-composer-body");
    expect(ui).toContain("commentComposerCancel");
    expect(ui).toContain("commentComposerSend");
    expect(ui).toContain("min-h-11");
    expect(ui).toContain('data-people-comment-composer-compose="true"');
    expect(ui).toContain("{composeActionTray}");
    expect(ui).toMatch(/disabled=\{!canSend\}/);
    expect(ui).toMatch(/disabled=\{sendBusy\}/);
    expect(ui).not.toContain("CommentComposerAvatar");
    expect(ui).not.toMatch(
      /getOrCreateDirectConversation|fetch\(|supabase\./
    );
  });

  it("send path uses shared_post only", () => {
    const send = read("lib/people/peopleCommentComposerSend.ts");
    expect(send).toContain("sendSharedPostMessage");
    expect(send).toContain("getOrCreateDirectConversation");
    expect(send).toContain("DUO_COMMENT_ALREADY_SENT");
    expect(send).toContain("DUO_COMMENT_NOT_AVAILABLE");
    expect(send).not.toContain("sendMessage(");
    expect(send).not.toMatch(
      /expressPairUpInterest|connectDiscoverPairUp|joinPairUp|completePairUpMatch|express_pair_up_interest|connect_discover_pair_up/
    );
    expect(send).toContain("commentComposerPlaceholderBreakTheIce");
    expect(send).toContain("peopleCommentComposerPlaceholder");
    expect(send).toContain("commentComposerPlaceholderRecipientLabel");
  });

  it("overlay uses shared placeholder helper with display name", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain("peopleCommentComposerPlaceholder(");
    expect(ui).toContain("displayCtx?.displayName");
    expect(ui).not.toContain(
      "peopleCommentComposerPlaceholder(ctx.sourceType)"
    );
  });

  it("action buttons use larger semibold label typography", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain("text-[13px] font-semibold");
    expect(ui).toContain("sm:text-sm");
    expect(ui).toContain("whitespace-nowrap truncate");
  });

  it("char counter lives inside textarea with overlap padding", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    expect(ui).toContain('data-people-comment-composer-textarea-wrap="true"');
    expect(ui).toContain('data-people-comment-composer-char-count="true"');
    expect(ui).toContain("pointer-events-none absolute");
    expect(ui).toContain("NOTE_COUNTER_PAD_BOTTOM_PX");
    expect(ui).toContain("NOTE_COUNTER_PAD_RIGHT_PX");
    expect(ui).toContain("maxLength={SHARE_NOTE_MAX}");
    expect(ui).toMatch(/\{trimmedLen\}\/\{SHARE_NOTE_MAX\}/);
    expect(ui).toContain("liftWithKeyboard");
  });

  it("sent read-only mode uses one unified panel with plain text message", () => {
    const ui = read("components/people/PeopleCommentComposerOverlay.tsx");
    const note = read("lib/people/peopleFeedLayout.ts");
    expect(ui).toContain('data-people-comment-composer-sent-panel="true"');
    expect(ui).toContain('data-people-comment-composer-sent-body="true"');
    expect(ui).toContain('data-people-comment-composer-sent-divider="true"');
    expect(ui).toContain("SENT_MESSAGE_SURFACE_CLASS");
    expect(ui).toContain("PEOPLE_PERSONAL_NOTE_TEXT_CLASS");
    expect(note).toContain("whitespace-pre-wrap");
    expect(note).toContain("break-words");
    expect(note).toContain("[overflow-wrap:anywhere]");
    expect(ui).toContain("PeopleComposerContextCard");
    expect(ui).toContain("embedded");
    expect(ui).toContain("select-text");
    expect(read("components/people/PeopleComposerContextCard.tsx")).toContain(
      "deckCloseLabel"
    );
    expect(ui).toContain("app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]");
    expect(ui).toContain("min-[320px]:w-full");
    expect(ui).not.toContain("Previously sent");
    expect(ui).not.toContain("readOnly={sentView}");
    expect(ui).not.toContain("closeOnlyTray");
    // Compose path still has the editable two-box + counter + Send.
    expect(ui).toContain('data-people-comment-composer-compose="true"');
    expect(ui).toContain("commentComposerSend");
    expect(ui).toContain('data-people-comment-composer-char-count="true"');
    expect(ui).toContain("people-comment-composer-body");
    // Controllers stay outside this overlay presentation.
    expect(ui).not.toContain("routeDuoCommentTap");
    expect(ui).not.toContain("get_my_duo_comment");
  });
});
