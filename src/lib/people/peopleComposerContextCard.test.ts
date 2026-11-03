/**
 * Shared People composer context card — presentation + Duo/Open Plan wiring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PeopleComposerContextCard, {
  peopleComposerSchedulePillClass,
} from "../../components/people/PeopleComposerContextCard";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("PeopleComposerContextCard", () => {
  const card = read("components/people/PeopleComposerContextCard.tsx");
  const duoOpp = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
  const comment = read("components/people/PeopleCommentComposerOverlay.tsx");
  const openPlan = read("components/people/OpenPlanRequestNoteComposer.tsx");

  it("reuses Duo opportunity date-kind accent classes", () => {
    expect(card).toContain("DATE_KIND_CLASSES");
    expect(card).toContain("bg-green-100 text-green-900");
    expect(card).toContain("bg-sky-100 text-sky-950");
    expect(duoOpp).toContain("bg-green-100 text-green-900");
    expect(peopleComposerSchedulePillClass("today")).toContain("bg-green-100");
    expect(peopleComposerSchedulePillClass("tomorrow")).toContain("bg-sky-100");
    expect(peopleComposerSchedulePillClass(null)).toContain("bg-white/92");
  });

  it("renders glass context with name, kind accent, caption and close", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleComposerContextCard, {
        identitySource: {
          profile_photos: [],
          echo_preset: null,
          avatar_url: null,
          display_name: "Alex",
          username: "alex",
        },
        displayName: "Alex",
        caption: "Sunset walk",
        scheduleLabel: "Tomorrow",
        scheduleLabelKind: "tomorrow",
        onClose: () => {},
      })
    );
    expect(html).toContain('data-people-composer-context-card="true"');
    expect(html).toContain('data-people-comment-composer-context="true"');
    expect(html).toContain("Alex");
    expect(html).toContain("Tomorrow");
    expect(html).toContain('data-people-composer-context-date-kind="tomorrow"');
    expect(html).toContain("Sunset walk");
    expect(html).toContain('data-people-composer-context-close="true"');
    expect(html).toContain("backdrop-blur");
  });

  it("supports anonymous Open Plan title without inventing a host name", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleComposerContextCard, {
        identitySource: {
          profile_photos: [],
          echo_preset: "echo_b",
          avatar_url: null,
          display_name: null,
          username: null,
        },
        displayName: "Open Plan",
        caption: "Board games",
        scheduleLabel: "Sat, Nov 8",
        scheduleLabelKind: "in_days",
        feedNeutralEchoSeed: "opp-9",
        closeDataAttribute: "data-open-plan-request-note-dismiss",
        onClose: () => {},
      })
    );
    expect(html).toContain("Open Plan");
    expect(html).toContain("Board games");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain('data-people-composer-context-date-kind="in_days"');
    expect(html).toContain('data-open-plan-request-note-dismiss="true"');
    expect(html).not.toContain("username");
  });

  it("clamps captions to two lines without mutating caption text", () => {
    const longCaption =
      "First line of a long plan caption. Second line continues here. Third line should be clamped visually.";
    expect(card).toContain("line-clamp-2");
    expect(card).not.toContain("fullCaption");
    const html = renderToStaticMarkup(
      createElement(PeopleComposerContextCard, {
        identitySource: {
          profile_photos: [],
          echo_preset: null,
          avatar_url: null,
          display_name: "Alex",
          username: "alex",
        },
        displayName: "Alex",
        caption: longCaption,
        scheduleLabel: "Today",
        scheduleLabelKind: "today",
        onClose: () => {},
      })
    );
    expect(html).toContain("line-clamp-2");
    expect(html).toContain(longCaption);
  });

  it("Duo overlay and Open Plan composer both mount the shared card", () => {
    expect(comment).toContain('from "./PeopleComposerContextCard"');
    expect(comment).toContain("<PeopleComposerContextCard");
    expect(comment).toContain("scheduleLabelKind={displayCtx.scheduleLabelKind}");
    expect(comment).toContain("embedded");
    expect(openPlan).toContain('from "./PeopleComposerContextCard"');
    expect(openPlan).toContain("<PeopleComposerContextCard");
    expect(openPlan).toContain("peopleUiCopy.openPlanIncomingLabel");
    expect(openPlan).not.toContain("fullCaption");
    expect(openPlan).toContain('data-open-plan-request-note-compose="true"');
  });
});
