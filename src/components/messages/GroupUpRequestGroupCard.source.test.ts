import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupUpRequestPreviewKind,
  groupUpRequestPreviewSlots,
} from "./GroupUpRequestGroupCard";
import type { GroupUpRequester } from "../../lib/people/types";

function readCard(): string {
  return readFileSync(
    join(process.cwd(), "src/components/messages/GroupUpRequestGroupCard.tsx"),
    "utf8"
  );
}

function requester(id: string): GroupUpRequester {
  return {
    request_id: id,
    opportunity_id: "opp",
    conversation_id: "conv",
    requested_at: "2026-01-01T00:00:00Z",
    requester_user_id: `user-${id}`,
    requester_profile_id: null,
    display_name: `Name ${id}`,
    username: `u${id}`,
    avatar_url: `https://example.test/${id}.jpg`,
    profile_photos: [],
    echo_preset: null,
    bio: null,
  };
}

describe("groupUpRequestPreviewKind / slots", () => {
  it("uses self + latest requester when pending is 1", () => {
    expect(groupUpRequestPreviewKind(1)).toBe("self_and_latest");
    const a = requester("a");
    const b = requester("b");
    expect(groupUpRequestPreviewSlots(1, [a, b])).toEqual([
      { kind: "self" },
      { kind: "requester", requester: a },
    ]);
  });

  it("uses latest two requesters when pending is 2+", () => {
    expect(groupUpRequestPreviewKind(2)).toBe("latest_two");
    expect(groupUpRequestPreviewKind(5)).toBe("latest_two");
    const a = requester("a");
    const b = requester("b");
    const c = requester("c");
    expect(groupUpRequestPreviewSlots(3, [a, b, c])).toEqual([
      { kind: "requester", requester: a },
      { kind: "requester", requester: b },
    ]);
  });

  it("keeps requester slots as placeholders when cache is cold", () => {
    expect(groupUpRequestPreviewSlots(1, [])).toEqual([
      { kind: "self" },
      { kind: "requester", requester: null },
    ]);
    expect(groupUpRequestPreviewSlots(4, [])).toEqual([
      { kind: "requester", requester: null },
      { kind: "requester", requester: null },
    ]);
  });
});

describe("GroupUpRequestGroupCard presentation (source)", () => {
  it("keeps title/description and moves View post into the middle column", () => {
    const src = readCard();
    expect(src).toContain("group.group_title");
    expect(src).toContain("group.description");
    expect(src).toContain("line-clamp-2");
    expect(src).toContain("truncate");
    expect(src).toContain("min-w-0");
    expect(src).toContain("groupUpRequestGroupViewPost");
    expect(src).toContain("onViewPost(group)");
    expect(src).toContain("e.stopPropagation()");
    expect(src).toContain("onOpen(group)");
    const iconIdx = src.indexOf("PiUsersThree");
    const clampIdx = src.indexOf("line-clamp-2");
    const viewPostIdx = src.lastIndexOf("groupUpRequestGroupViewPost");
    expect(iconIdx).toBeGreaterThan(0);
    expect(viewPostIdx).toBeGreaterThan(clampIdx);
    expect(src.slice(iconIdx, clampIdx)).not.toContain(
      "groupUpRequestGroupViewPost"
    );
  });

  it("shows a compact attached count badge without request/requests copy", () => {
    const src = readCard();
    expect(src).toContain("data-request-count-badge");
    expect(src).toContain("pendingCountBadgeLabel");
    expect(src).toContain("data-preview-capsule");
    expect(src).toContain("translate-x-[5px] -translate-y-[5px]");
    expect(src).not.toContain("genericGroupUpRequestPlaceholderCount");
    expect(src).not.toMatch(/\{countLabel\}\s*<\/span>/);
    expect(src).not.toContain('" request"');
    expect(src).not.toContain('" requests"');
    expect(src).not.toContain("min-w-[0.75rem]");
    expect(src).toContain("tabular-nums");
  });

  it("uses cache-first requester previews and the 1 vs 2+ preview rules", () => {
    const src = readCard();
    expect(src).toContain("getCachedAvatar");
    expect(src).toContain("getCachedGroupUpRequesters");
    expect(src).toContain("subscribeGroupUpRequestersCache");
    expect(src).toContain("useSyncExternalStore");
    expect(src).toContain("useEnsureGroupUpRequestersCached");
    expect(src).toContain("self_and_latest");
    expect(src).toContain("latest_two");
    expect(src).toContain('from "../ui/Avatar"');
    expect(src).not.toContain("useGroupUpRequesters");
    expect(src).not.toContain("getProfileByUserId");
    expect(src).not.toContain("supabase");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("GroupMemberAvatarStack");
    expect(src).not.toContain("force: true");
  });

  it("uses a navy squircle, larger group icon, brand View post, and floating Yours pill", () => {
    const src = readCard();
    expect(src).toContain("PiUsersThree");
    expect(src).toContain("SQUIRCLE_PX = 48");
    expect(src).toContain("h-[26px] w-[26px]");
    expect(src).toContain("border-2");
    expect(src).toContain("rounded-[16px]");
    expect(src).not.toContain("brand-glass-bg");
    expect(src).toContain("groupUpBrowseTabYours");
    expect(src).toContain("translate-y-1/2");
    expect(src).not.toContain("h-6");
    expect(src).toContain("mt-1");
    expect(src).toContain("py-0");
    expect(src).toContain("text-[11px]");
    expect(src).toContain("min-h-8");
    expect(src).toContain("PiArrowSquareOutBold");
    expect(src).toContain("PREVIEW_AVATAR_PX = 34");
    expect(src).toContain("PREVIEW_OVERLAP_PX = 13");
    expect(src).toContain("PREVIEW_CAPSULE_PAD_PX = 3");
    expect(src).toContain("bg-[var(--brand)]");
  });

  it("shows opportunity schedule beside View post and omits undated groups", () => {
    const src = readCard();
    expect(src).toContain("formatSocialOccursSchedule");
    expect(src).toContain("group.occurs_at");
    expect(src).toContain("group.occurs_time_explicit !== false");
    expect(src).toContain("data-group-occurs-label");
    expect(src).toContain("bg-[var(--green-bg)]");
    expect(src).toContain("text-[var(--green-text)]");
    expect(src).not.toContain("green-border");
    expect(src).toContain("occursLabel || canViewPost");
    expect(src).toContain("onViewPost(group)");
    expect(src).toContain("e.stopPropagation()");
    expect(src).toContain("groupUpRequestGroupViewPost");
    expect(src).not.toContain("discoverable_until");
    expect(src).not.toContain("latest_request_at");
    expect(src).not.toContain("groupUpNoDateSet");
  });
});

describe("Messages Requests list inset vs Inbox fade", () => {
  it("adds Requests-only top padding without changing the shared chrome fade or Inbox list", () => {
    const inbox = readFileSync(
      join(process.cwd(), "src/pages/messages/MessagesInboxPage.tsx"),
      "utf8"
    );
    expect(inbox).toContain(
      'className="pointer-events-none absolute left-0 right-0 top-full z-[1] h-7"'
    );
    expect(inbox).toContain(
      '"linear-gradient(to bottom, var(--bg) 0%, var(--bg) 42%, transparent 100%)"'
    );
    expect(inbox).toContain('<ul className="flex flex-col pt-5">');
    expect(inbox).toMatch(
      /<ul className="flex flex-col">\s*\{visible\.map\(\(row\) =>/
    );
    const requestsIdx = inbox.indexOf('inboxTab === "requests"');
    const inboxListIdx = inbox.indexOf("{visible.map((row) =>");
    expect(inbox.slice(requestsIdx, inboxListIdx)).toContain(
      "flex flex-col pt-5"
    );
  });
});
