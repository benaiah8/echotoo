/**
 * Discover opportunity card actions, compact See Post, and caption navigation.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PeopleDiscoverOpportunityBox, {
  PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS,
  PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS,
} from "../../components/people/PeopleDiscoverOpportunityBox";
import {
  clearDiscoverSentComments,
  shouldRecordDiscoverSentComment,
} from "./discoverSentComment";
import { applyDiscoverPageReplacement } from "../../hooks/usePairUpCandidates";
import type { PairUpCandidate } from "./types";
import {
  duoCommentStateKey,
  getDuoCommentSnapshot,
  markDuoCommentSent,
  setDuoCommentViewerForTests,
} from "./duoCommentState";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const base = {
  opportunityId: "opp-1",
  postType: "hangout" as const,
  caption: "Sunset walk along the ridge",
  scheduleLabel: "Today",
  note: "Near the overlook",
  displayName: "Ada",
  personKey: "ada",
  heartLabel: "Connect",
  onHeart: () => {},
  messageLabel: "Message",
  onMessage: () => {},
};

describe("Discover opportunity actions", () => {
  it("keeps idle Heart and Comment neutral gray, with rose only for real interest", () => {
    const idle = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "idle",
        onSeePost: () => {},
      })
    );
    expect(idle).toContain("bg-[var(--text)]/10");
    expect(idle).toContain("app-dark:bg-white/14");
    expect(idle).not.toContain("rgb(225,29,72)");
    expect(idle).not.toContain("var(--brand-ink)");
    expect(idle).toContain("h-11 w-11");
    expect(idle).toContain("flex-col");
    expect(idle).toContain("gap-2");
    expect(idle).toContain("self-start");
    expect(idle).toContain('data-people-discover-opp-actions-align="top-right"');
    expect(idle).toContain("motion-safe:active:scale-[0.94]");
    expect(idle).toContain("motion-reduce:transition-none");
    expect(idle).toContain('data-people-action-kind="heart"');
    expect(idle).toContain('data-people-action-kind="comment"');
    expect(idle).toContain('data-people-action-size="44"');
    expect(idle).toContain('data-people-action-icon="outline"');
    expect(idle).not.toContain('data-people-action-icon="fill"');

    const interested = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "active",
        note: "A long location note that makes this opportunity card taller than the action stack.",
      })
    );
    expect(interested).toContain("text-[rgb(225,29,72)]");
    expect(interested.match(/rgb\(225,29,72\)/g)?.length).toBe(1);
    expect(interested).toContain('data-people-action-kind="heart"');
    expect(interested).toContain('data-people-action-icon="fill"');
    expect(interested).toContain("bg-white");
  });

  it("does not fire a disabled or busy heart", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(box).toContain("if (!discoverHeartPressAllowed(heartState)) return;");
    expect(box).toContain("if (commentPressBlocked) return;");
    expect(box).toContain('return heartState !== "disabled" && heartState !== "busy"');
    const html = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "busy",
        messageDisabled: true,
      })
    );
    expect(html).toContain('data-people-action-state="pending"');
    expect(html).toContain("shadow-[inset_0_0_0_1px_currentColor]");
    expect(html).toContain("disabled");
  });

  it("uses a badge-height See Post control and leaves the shared control unchanged", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "idle",
        onSeePost: () => {},
      })
    );
    expect(html).toContain("data-people-discover-see-post");
    expect(html).toContain("h-5");
    expect(html).toContain("text-[10px]");
    expect(html).toContain("h-3 w-3");
    expect(html).toContain("See post");
    const shared = read("components/people/PeopleSeePostControl.tsx");
    expect(shared).toContain("h-7");
    expect(shared).not.toContain("data-people-discover-see-post");
  });

  it("makes the caption a button only when See Post is available", () => {
    const see = vi.fn();
    const heart = vi.fn();
    const message = vi.fn();
    const interactive = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "idle",
        onSeePost: see,
        onHeart: heart,
        onMessage: message,
      })
    );
    expect(interactive).toContain('data-people-discover-opp-caption-action="see-post"');
    expect(interactive).toContain("line-clamp-2");
    const plain = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "idle",
        note: null,
      })
    );
    expect(plain).not.toContain("data-people-discover-opp-caption-action");
    expect(plain).toContain("<p");
    expect(plain).toContain("line-clamp-3");
    expect(PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS).toContain("line-clamp-2");
    expect(PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS).toContain("line-clamp-3");
    expect(see).not.toHaveBeenCalled();
    expect(heart).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
  });

  it("does not restyle the shared rail, Duo dock, or comment composer", () => {
    const rail = read("components/people/PeopleFeedActionRail.tsx");
    const duo = read("components/people/PeopleDuoBottomActionRow.tsx");
    const composer = read("components/people/PeopleCommentComposerOverlay.tsx");
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    expect(rail).toContain("bg-[var(--surface)]/90");
    expect(rail).not.toContain("data-people-discover-see-post");
    expect(duo).toContain("h-[52px]");
    expect(composer).toContain("noteConfirmedDuoComment");
    expect(composer).not.toContain("onAfterMessageDelivered");
    expect(box).not.toContain("discoverNeutralChrome");
    expect(box).not.toContain("<PeopleFeedActionRail");
    expect(box).toContain("stopPropagation");
  });

  it("activates only Comment after a confirmed send and reopens that note read-only", () => {
    clearDiscoverSentComments();
    expect(
      shouldRecordDiscoverSentComment({
        surface: "discover",
        created: false,
        body: "Hello",
      })
    ).toBe(false);
    expect(
      shouldRecordDiscoverSentComment({
        surface: "duo",
        created: true,
        body: "Hello",
      })
    ).toBe(false);
    expect(
      shouldRecordDiscoverSentComment({
        surface: "discover",
        created: true,
        body: "  ",
      })
    ).toBe(false);

    setDuoCommentViewerForTests("viewer-1");
    markDuoCommentSent(
      duoCommentStateKey("viewer-1", "post-1", "user-1"),
      "Sunset note"
    );
    const html = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        ...base,
        heartState: "idle",
        sourcePostId: "post-1",
        recipientUserId: "user-1",
        duoCommentedByMe: true,
      })
    );
    expect(html).toContain('data-people-action-kind="comment"');
    expect(html).toContain('data-people-action-visual="active"');
    expect(html).toContain("text-black");
    expect(html).toContain('data-people-action-kind="heart"');
    expect(html).not.toContain("text-[rgb(225,29,72)]");
    expect(
      getDuoCommentSnapshot(duoCommentStateKey("viewer-1", "post-1", "user-1"))
        .body
    ).toBe("Sunset note");

    const kept = applyDiscoverPageReplacement(
      [ { opportunity_id: "opp-1" } as PairUpCandidate ],
      [],
      new Map([["opp-1", { opportunity_id: "opp-1" } as PairUpCandidate]])
    );
    expect(kept).toHaveLength(1);

    const composer = read("components/people/PeopleCommentComposerOverlay.tsx");
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    const actions = read("lib/people/duoCommentActions.ts");
    const recordAt = composer.indexOf("recordDiscoverSentComment({");
    const noteAt = composer.indexOf("noteConfirmedDuoComment({");
    const failedAt = composer.indexOf("if (!result.ok)");
    expect(failedAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(failedAt);
    expect(noteAt).toBeGreaterThan(recordAt);
    expect(actions).toContain("joinDuoPoolAfterCreatedComment");
    expect(actions).not.toContain("sendPeopleContextComment");
    expect(composer).toContain('ctx.presentation === "sent"');
    expect(composer).toContain('data-people-comment-composer-sent-body="true"');
    expect(composer).not.toContain("readOnly={sentView}");
    expect(box).toContain("reopenSentDuoComment");
    expect(composer).not.toContain("listMessages");
    expect(composer).not.toContain("get_my_duo_comment");
    expect(box).not.toContain("get_my_duo_comment");
    clearDiscoverSentComments();
    setDuoCommentViewerForTests(null);
  });
});
