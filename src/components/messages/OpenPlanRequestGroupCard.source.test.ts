import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  openPlanRequestGroupSecondary,
  openPlanRequestGroupTitle,
} from "./OpenPlanRequestGroupCard";
import type { OpenPlanRequestGroup } from "../../lib/people/types";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

function readCard(): string {
  return readFileSync(
    join(process.cwd(), "src/components/messages/OpenPlanRequestGroupCard.tsx"),
    "utf8"
  );
}

function readInbox(): string {
  return readFileSync(
    join(process.cwd(), "src/pages/messages/MessagesInboxPage.tsx"),
    "utf8"
  );
}

function group(
  partial: Partial<OpenPlanRequestGroup>
): OpenPlanRequestGroup {
  return {
    opportunity_id: "opp-1",
    source_post_id: "post-1",
    plan_description: "Coffee after",
    source_caption: "Friday gig",
    occurs_at: "2026-09-20T12:00:00.000Z",
    occurs_time_explicit: false,
    pending_count: 2,
    latest_request_at: "2026-09-18T10:00:00.000Z",
    latest_request_id: "req-1",
    preview_requesters: [],
    ...partial,
  };
}

describe("openPlanRequestGroupTitle / secondary", () => {
  it("uses the host note as primary and caption as secondary", () => {
    expect(openPlanRequestGroupTitle(group({}))).toBe("Coffee after");
    expect(openPlanRequestGroupSecondary(group({}))).toBe("Friday gig");
  });

  it("falls back to source caption then Open Plan when the note is empty", () => {
    expect(
      openPlanRequestGroupTitle(
        group({ plan_description: "  ", source_caption: "Friday gig" })
      )
    ).toBe("Friday gig");
    expect(
      openPlanRequestGroupSecondary(
        group({ plan_description: "", source_caption: "Friday gig" })
      )
    ).toBeNull();
    expect(
      openPlanRequestGroupTitle(
        group({ plan_description: null, source_caption: "  " })
      )
    ).toBe(peopleUiCopy.openPlanIncomingLabel);
  });
});

describe("OpenPlanRequestGroupCard presentation (source)", () => {
  it("uses a purple squircle, calendar icon, and summary previews only", () => {
    const src = readCard();
    expect(src).toContain("PiCalendarBlank");
    expect(src).toContain("#5b21b6");
    expect(src).toContain("SQUIRCLE_PX = 48");
    expect(src).toContain("OpenPlanAnonymousAvatar");
    expect(src).toContain("group.preview_requesters");
    expect(src).toContain("data-request-count-badge");
    expect(src).toContain("openPlanRequestGroupViewPost");
    expect(src).toContain("e.stopPropagation()");
    expect(src).toContain("onViewPost(group)");
    expect(src).toContain("formatSocialOccursSchedule");
    expect(src).toContain("data-open-plan-occurs-label");
    expect(src).toContain("bg-[var(--green-bg)]");
    expect(src).not.toContain("from \"../ui/Avatar\"");
    expect(src).not.toContain("userId");
    expect(src).not.toContain("display_name");
    expect(src).not.toContain("username");
    expect(src).not.toContain("requester_id");
    expect(src).not.toContain("getProfileByUserId");
    expect(src).not.toContain("listOpenPlanRequesters");
    expect(src).not.toContain("useOpenPlanRequesters");
    expect(src).not.toContain("supabase");
  });
});

describe("Messages Requests Open Plan grouping", () => {
  it("renders grouped Open Plan summaries keyed by opportunity_id with Load more", () => {
    const inbox = readInbox();
    expect(inbox).toContain("OpenPlanRequestGroupCard");
    expect(inbox).toContain("useOpenPlanRequestGroups");
    expect(inbox).toContain("openOpenPlanRequestersOverlay");
    expect(inbox).toContain('key={`op:${item.group.opportunity_id}`}');
    expect(inbox).toContain("openPlanRequestGroupSortAt");
    expect(inbox).toContain("latest_request_at");
    expect(inbox).toContain("openPlanHasMore");
    expect(inbox).toContain("loadMoreOpenPlanGroups");
    expect(inbox).toContain("Load more");
    expect(inbox).toContain("openPlanRequestGroups.length");
    expect(inbox).toContain('navigateToPostDetailInApp');
    expect(inbox).toContain('"experience"');
    expect(inbox).not.toContain("OpenPlanIncomingRequestRow");
    expect(inbox).not.toContain("useOpenPlanIncomingRequests");
    expect(inbox).not.toContain("uniqueBySourcePost");
    expect(inbox).not.toMatch(/key=\{`op:\$\{item\.group\.source_post_id\}`\}/);
  });
});
