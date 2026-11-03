/**
 * Open Plans Discover-style vertical card — presentation contracts.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../components/people/PeopleCandidateMedia", () => ({
  default: function MockMedia() {
    return createElement("div", {
      "data-people-candidate-media-mock": "true",
    });
  },
}));

import PeopleOpenPlanFeedCard from "../../components/people/PeopleOpenPlanFeedCard";
import PeopleDiscoverOpportunityBox from "../../components/people/PeopleDiscoverOpportunityBox";
import {
  PEOPLE_PERSONAL_NOTE_ACCENT_CLASS,
  PEOPLE_PERSONAL_NOTE_TEXT_CLASS,
} from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const baseProps = {
  opportunityId: "opp-1",
  identitySource: {
    profile_photos: ["https://example.com/a.jpg"],
    echo_preset: null,
    avatar_url: null,
    display_name: null,
    username: null,
  },
  feedNeutralEchoSeed: "opp-1",
  photoIndex: 0,
  onPhotoIndexChange: () => {},
  isCurrent: true,
  caption: "A long source caption for clamp testing that fills several lines",
  scheduleLabel: "Sat 3 May",
  note: null as string | null,
  heartLabel: "I'm down",
  heartState: "idle" as const,
  onHeart: () => {},
};

describe("PeopleOpenPlanFeedCard", () => {
  it("uses Discover portrait width/aspect and info-card chrome", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleOpenPlanFeedCard, baseProps)
    );
    expect(html).toContain("data-people-open-plan-feed-card");
    expect(html).toContain("min(100%, var(--people-discover-photo-max-w, 26rem))");
    expect(html).toContain("var(--people-discover-photo-aspect, 4 / 5)");
    expect(html).toContain("data-people-open-plan-info-card");
    expect(html).toContain("rounded-xl");
    expect(html).toContain("Plan");
    expect(html).toContain("Sat 3 May");
    expect(html).toContain("data-people-open-plan-heart");
    expect(html).toContain('data-people-feed-heart-state="idle"');
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("h-6 w-6");
    expect(html).not.toContain("h-8 w-8");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain('data-people-open-plan-caption-lines="3"');
    expect(html).not.toContain("See post");
    expect(html).not.toContain("data-people-see-post");
    expect(html).not.toContain("data-people-personal-note-accent");
    expect(html).not.toContain("data-people-open-plan-note");
  });

  it("keeps the 44px circle and enlarges the red active heart glyph", () => {
    const idle = renderToStaticMarkup(
      createElement(PeopleOpenPlanFeedCard, baseProps)
    );
    const active = renderToStaticMarkup(
      createElement(PeopleOpenPlanFeedCard, {
        ...baseProps,
        heartState: "active",
        heartLabel: "Withdraw",
      })
    );
    const card = read("components/people/PeopleOpenPlanFeedCard.tsx");
    expect(idle).toContain("h-11 w-11");
    expect(idle).toContain("h-6 w-6");
    expect(idle).not.toContain("text-[rgb(225,29,72)]");
    expect(active).toContain("h-11 w-11");
    expect(active).toContain("h-8 w-8");
    expect(active).toContain("text-[rgb(225,29,72)]");
    expect(active).toContain('data-people-feed-heart-state="active"');
    expect(card).toContain("HEART_GLYPH_ACTIVE");
    expect(card).toContain("motion-safe:transition-colors");
    expect(card).toContain("motion-safe:transition-[width,height,color]");
    expect(card).not.toContain("PeopleActionStateButton");
  });

  it("keeps source caption separate from the accented plan note", () => {
    const note = "Looking for a chill\nafternoon walk near the lake";
    const html = renderToStaticMarkup(
      createElement(PeopleOpenPlanFeedCard, {
        ...baseProps,
        note,
      })
    );
    expect(html).toContain('data-people-open-plan-caption-lines="3"');
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("data-people-open-plan-caption");
    expect(html).toContain("A long source caption for clamp testing");
    expect(html).toContain("data-people-open-plan-note");
    expect(html).toContain('data-people-personal-note-accent="true"');
    expect(html).toContain(PEOPLE_PERSONAL_NOTE_ACCENT_CLASS);
    expect(html).toContain(PEOPLE_PERSONAL_NOTE_TEXT_CLASS);
    expect(html).toContain("Looking for a chill");
    expect(html).toContain("afternoon walk near the lake");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("px-3 py-2");
    expect(html).toContain(
      "bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))]"
    );
    expect(html).toContain(
      "app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]"
    );
    expect(html).not.toContain("Personal Note");
    expect(html).not.toContain("data-people-open-plan-note-divider");
    expect(html).not.toContain("my-2 h-px w-full");
    expect(PEOPLE_PERSONAL_NOTE_ACCENT_CLASS).not.toMatch(/shadow/);
    expect(PEOPLE_PERSONAL_NOTE_ACCENT_CLASS).not.toContain("border border-");
  });

  it("shares the personal-note accent with Discover and omits it when empty", () => {
    const plans = renderToStaticMarkup(
      createElement(PeopleOpenPlanFeedCard, {
        ...baseProps,
        note: "Plan note body",
      })
    );
    const discover = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        opportunityId: "opp-d",
        postType: "hangout",
        caption: "Discover caption",
        scheduleLabel: "Today",
        note: "Discover note body",
        displayName: "Ada",
        personKey: "ada",
        heartLabel: "Connect",
        heartState: "idle",
        onHeart: () => {},
      })
    );
    const discoverEmpty = renderToStaticMarkup(
      createElement(PeopleDiscoverOpportunityBox, {
        opportunityId: "opp-d2",
        postType: "hangout",
        caption: "Discover caption",
        scheduleLabel: "Today",
        note: null,
        displayName: "Ada",
        personKey: "ada",
        heartLabel: "Connect",
        heartState: "idle",
        onHeart: () => {},
      })
    );
    expect(plans).toContain(PEOPLE_PERSONAL_NOTE_ACCENT_CLASS);
    expect(discover).toContain(PEOPLE_PERSONAL_NOTE_ACCENT_CLASS);
    expect(plans).toContain('data-people-personal-note-accent="true"');
    expect(discover).toContain('data-people-personal-note-accent="true"');
    expect(discoverEmpty).not.toContain("data-people-personal-note-accent");
    expect(discoverEmpty).not.toContain("data-people-discover-opp-note");
    const layout = read("lib/people/peopleFeedLayout.ts");
    expect(layout).toContain("PEOPLE_PERSONAL_NOTE_ACCENT_CLASS");
    expect(layout).toContain("var(--brand-readable)");
    expect(layout).toContain(
      "bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))]"
    );
    expect(layout).toContain(
      "app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]"
    );
    expect(layout).toContain("px-3 py-2");
    expect(discover).toContain(
      "bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))]"
    );
    expect(discover).toContain(
      "app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]"
    );
    const duo = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    expect(duo).toContain("data-people-duo-opportunity-note-strip");
    expect(duo).not.toContain("PEOPLE_PERSONAL_NOTE_ACCENT_CLASS");
    expect(duo).not.toContain("data-people-personal-note-accent");
  });

  it("wires Open Plans body to the new card with anonymous identity and request path", () => {
    const body = read("pages/people/OpenPlanDeckBody.tsx");
    const card = read("components/people/PeopleOpenPlanFeedCard.tsx");
    expect(body).toContain("PeopleOpenPlanFeedCard");
    expect(body).not.toContain("PeopleFeedRow");
    expect(body).toContain('surface="plans"');
    expect(body).toContain("feedNeutralEchoSeed={row.opportunity_id}");
    expect(body).toContain("caption={row.source_caption}");
    expect(body).toContain("note={row.description?.trim() || null}");
    expect(body).toContain("display_name: null");
    expect(body).toContain("username: null");
    expect(body).toContain("profile_photos: row.profile_photos");
    expect(body).toContain("echo_preset: row.echo_preset");
    expect(body).toContain("requestOpenPlan");
    expect(body).toContain("withdrawOpenPlanRequest");
    expect(body).toContain("openPlanHeartIntent");
    expect(body).toContain("OpenPlanRequestNoteComposer");
    expect(body).not.toContain("onSeePost");
    expect(card).toContain("identityOverlay={null}");
    expect(card).toContain("feedNeutralEchoSeed");
    expect(card).toContain("PeopleCandidateMedia");
    expect(card).not.toContain("PeopleActionStateButton");
    expect(card).not.toContain("onSeePost");
    expect(card).not.toContain("onOpenProfile");
  });

  it("does not change Discover, Duo, or Groups presentation wiring", () => {
    const discoverBox = read(
      "components/people/PeopleDiscoverOpportunityBox.tsx"
    );
    const discoverRow = read("components/people/PeopleDiscoverPersonRow.tsx");
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    const duoRow = read("components/people/PeopleDuoBottomActionRow.tsx");
    expect(discoverBox).not.toContain("PeopleOpenPlanFeedCard");
    expect(discoverRow).not.toContain("PeopleOpenPlanFeedCard");
    expect(groups).toContain("PeopleGroupUpFeedCard");
    expect(groups).not.toContain("PeopleFeedRow");
    expect(groups).not.toContain("PeopleOpenPlanFeedCard");
    expect(duoRow).not.toContain("PeopleOpenPlanFeedCard");
  });
});
