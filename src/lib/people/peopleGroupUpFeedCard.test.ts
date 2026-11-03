/**
 * Group Up unified text-first feed card — presentation contracts.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../components/ui/Avatar", () => ({
  default: function MockAvatar(props: {
    name?: string | null;
    size?: number;
  }) {
    return createElement("div", {
      "data-avatar-mock": "true",
      "data-avatar-name": props.name ?? "",
      "data-avatar-size": String(props.size ?? 0),
    });
  },
}));

import PeopleGroupUpFeedCard, {
  PEOPLE_GROUP_UP_CARD_GAP_CLASS,
} from "../../components/people/PeopleGroupUpFeedCard";
import { PEOPLE_PERSONAL_NOTE_ACCENT_CLASS } from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const base = {
  opportunityId: "grp-1",
  isCurrent: true,
  creatorName: "Ada Lovelace",
  creatorAvatarUrl: "https://example.com/a.jpg",
  creatorUserId: "user-ada",
  onOpenCreatorProfile: () => {},
  groupTitle: "Weekend trail crew",
  groupDescription: "Easy pace, bring water",
  sourceCaption: "Join us for a Saturday hike along the ridge trail",
  postType: "hangout" as const,
  scheduleLabel: "Sat 3 May",
  scheduleLabelKind: null as null,
  onSeePost: () => {},
  showYoursBadge: false,
  heartLabel: "Request",
  heartState: "idle" as const,
  onHeart: () => {},
};

describe("PeopleGroupUpFeedCard", () => {
  it("keeps creator inside one outer rounded card above group title", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleGroupUpFeedCard, base)
    );
    expect(html).toContain('data-people-group-up-card="true"');
    expect(html).toContain("data-people-group-up-creator");
    expect(html).toContain("data-people-group-up-title");
    expect(html).toContain("rounded-xl");
    expect(html).toContain(PEOPLE_GROUP_UP_CARD_GAP_CLASS);
    expect(html).toContain('data-people-group-up-list-gap="12"');
    expect(html).not.toContain("border-t border-[var(--border)]");

    const cardAt = html.indexOf('data-people-group-up-card="true"');
    const creatorAt = html.indexOf("data-people-group-up-creator");
    const titleAt = html.indexOf("data-people-group-up-title");
    const metaAt = html.indexOf("data-people-group-up-meta");
    const captionAt = html.indexOf("data-people-group-up-caption");
    expect(cardAt).toBeGreaterThan(-1);
    expect(creatorAt).toBeGreaterThan(cardAt);
    expect(titleAt).toBeGreaterThan(creatorAt);
    expect(metaAt).toBeGreaterThan(titleAt);
    expect(captionAt).toBeGreaterThan(metaAt);
  });

  it("renders group info before source metadata and accented source caption", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleGroupUpFeedCard, base)
    );
    expect(html).toContain("Weekend trail crew");
    expect(html).toContain("Easy pace, bring water");
    expect(html).toContain("Event");
    expect(html).toContain("Sat 3 May");
    expect(html).toContain("data-people-group-up-see-post");
    expect(html).toContain('data-people-group-up-source-caption-accent="true"');
    expect(html).toContain(PEOPLE_PERSONAL_NOTE_ACCENT_CLASS);
    expect(html).toContain("Join us for a Saturday hike");
    expect(html).toContain('data-people-group-up-caption-lines="3"');
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("data-people-feed-heart");
    expect(html).not.toContain("data-people-personal-note-accent");
    expect(html).not.toContain("Personal Note");
    expect(html).not.toContain("PeopleCandidateMedia");
    expect(html).not.toContain("aspect-ratio");
  });

  it("omits the source-caption accent when caption is missing", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleGroupUpFeedCard, {
        ...base,
        sourceCaption: null,
      })
    );
    expect(html).not.toContain("data-people-group-up-caption");
    expect(html).not.toContain("data-people-group-up-source-caption-accent");
    expect(html).toContain("Weekend trail crew");
    expect(html).toContain("data-people-group-up-creator");
  });

  it("omits optional fields and invents no identity when missing", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleGroupUpFeedCard, {
        ...base,
        creatorName: null,
        creatorAvatarUrl: null,
        creatorUserId: null,
        onOpenCreatorProfile: null,
        groupTitle: null,
        groupDescription: null,
        sourceCaption: null,
        postType: null,
        scheduleLabel: null,
        onSeePost: null,
        showYoursBadge: false,
      })
    );
    expect(html).toContain("Someone");
    expect(html).toContain('data-people-group-up-card="true"');
    expect(html).not.toContain("data-people-group-up-title");
    expect(html).not.toContain("data-people-group-up-description");
    expect(html).not.toContain("data-people-group-up-caption");
    expect(html).not.toContain("data-people-group-up-see-post");
    expect(html).not.toContain("data-people-group-up-type");
    expect(html).not.toContain("data-people-group-up-date");
    expect(html).not.toContain("data-people-group-up-yours-badge");
    expect(html).not.toContain("data-people-group-up-creator-avatar-btn");
  });

  it("shows a small Yours badge only when requested", () => {
    const yours = renderToStaticMarkup(
      createElement(PeopleGroupUpFeedCard, {
        ...base,
        showYoursBadge: true,
      })
    );
    expect(yours).toContain('data-people-group-up-yours="true"');
    expect(yours).toContain("data-people-group-up-yours-badge");
    expect(yours).toContain("Yours");
    const cardAt = yours.indexOf('data-people-group-up-card="true"');
    const badgeAt = yours.indexOf("data-people-group-up-yours-badge");
    expect(badgeAt).toBeGreaterThan(cardAt);
  });

  it("keeps description distinct from source caption and wraps multiline", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleGroupUpFeedCard, {
        ...base,
        groupDescription: "Line one\nLine two of the group note",
        sourceCaption: "Original post caption body only",
      })
    );
    expect(html).toContain("data-people-group-up-description");
    expect(html).toContain("Line one");
    expect(html).toContain("Line two of the group note");
    expect(html).toContain("Original post caption body only");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain('data-people-group-up-caption-action="see-post"');
    expect(html).toContain('data-people-group-up-source-caption-accent="true"');
  });

  it("wires GroupUpDeckBody to the card with request and See Post preserved", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    const card = read("components/people/PeopleGroupUpFeedCard.tsx");
    expect(body).toContain("PeopleGroupUpFeedCard");
    expect(body).not.toContain("PeopleFeedRow");
    expect(body).toContain('surface="groups"');
    expect(body).toContain("handleGroupsHeart");
    expect(body).toContain("openRequestComposer");
    expect(body).toContain("GroupUpRequestNoteComposer");
    expect(body).toContain("proceedRequest");
    expect(body).toContain("runWithdraw");
    expect(body).toContain("canOpenGroupSourcePost");
    expect(body).toContain("handleSeePostFor");
    expect(body).toContain("showYoursBadge={isOwner}");
    expect(body).toContain("sourceCaption={row.source_caption}");
    expect(body).toContain("groupTitle={row.group_title}");
    expect(body).toContain("groupDescription={row.group_description}");
    expect(body).toContain("creatorName={creatorName}");
    expect(card).toContain("PeopleFeedActionRail");
    expect(card).toContain("discoverNeutralChrome");
    expect(card).toContain("PEOPLE_GROUP_UP_CARD_GAP_CLASS");
    expect(card).not.toContain("PeopleCandidateMedia");
    expect(card).not.toContain("PeopleActionStateButton");
    expect(card).not.toContain("MatchDeckOverlay");
  });

  it("leaves Duo, Discover, and Open Plans live cards and separators untouched", () => {
    const duo = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    const discover = read(
      "components/people/PeopleDiscoverOpportunityBox.tsx"
    );
    const plans = read("components/people/PeopleOpenPlanFeedCard.tsx");
    const discoverRow = read("components/people/PeopleDiscoverPersonRow.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(duo).not.toContain("PeopleGroupUpFeedCard");
    expect(discover).not.toContain("PeopleGroupUpFeedCard");
    expect(plans).not.toContain("PeopleGroupUpFeedCard");
    expect(plans).toContain(
      "border-t border-[var(--border)] first:border-t-0"
    );
    expect(discoverRow).toContain(
      "border-t border-[var(--border)] first:border-t-0"
    );
    expect(overlay).toContain("toggleGroupsYoursBrowse");
    expect(overlay).toContain("PeopleGroupsBrowseToggle");
  });
});
