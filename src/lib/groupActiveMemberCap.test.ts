/**
 * Group active-member capacity 100 → 200 — migration source + shared client constant.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GROUP_ACTIVE_MEMBER_CAP,
  GROUP_MAX_OTHER_MEMBERS,
} from "./groupActiveMemberCap";
import { classifyGroupUpRequestError } from "../api/services/groupUp";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261030120000_group_active_member_cap_200.sql"
);

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("GROUP_ACTIVE_MEMBER_CAP shared constant", () => {
  it("12–13: shared cap is 200; max other members is 199", () => {
    expect(GROUP_ACTIVE_MEMBER_CAP).toBe(200);
    expect(GROUP_MAX_OTHER_MEMBERS).toBe(199);
  });
});

describe("group_active_member_cap_200 migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("replaces only the four client RPCs", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.create_group_conversation("
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.add_conversation_members("
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.accept_group_up_request("
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.request_group_up(p_opportunity_id uuid)"
    );
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public._count_active_members"
    );
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public._lock_group_conversation"
    );
    expect(sql).not.toContain("list_my_group_up_memberships");
  });

  it("1–2 CREATE: c_max 200; creator counts (1 + others)", () => {
    expect(sql).toMatch(
      /create_group_conversation[\s\S]*?c_max_active_members integer := 200/
    );
    expect(sql).toContain(
      "IF 1 + COALESCE(array_length(v_ids, 1), 0) > c_max_active_members THEN"
    );
  });

  it("3–6 ADD: lock preserved; 200 cap; reactivation path; left_at null filter", () => {
    const addBody = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.add_conversation_members"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.accept_group_up_request")
    );
    expect(addBody).toContain("c_max_active_members integer := 200");
    expect(addBody).toContain(
      "PERFORM public._lock_group_conversation(p_conversation_id)"
    );
    expect(addBody).toContain(
      "v_active + COALESCE(array_length(v_ids, 1), 0) > c_max_active_members"
    );
    expect(addBody).toContain("AND m.left_at IS NULL");
    expect(addBody).toContain("left_at = NULL");
    expect(addBody).toContain("AND m.left_at IS NOT NULL");
  });

  it("7–11 GROUP UP: request at 200 fails; accept uses 200 under lock; host via count", () => {
    const acceptBody = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.accept_group_up_request"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.request_group_up")
    );
    const requestBody = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.request_group_up")
    );
    expect(acceptBody).toContain("c_max_active_members integer := 200");
    expect(acceptBody).toContain(
      "PERFORM public._lock_group_conversation(v_conv_id)"
    );
    expect(acceptBody).toContain(
      "IF v_active >= c_max_active_members THEN"
    );
    expect(requestBody).toContain("IF v_member_count >= 200 THEN");
    expect(requestBody).toContain(
      "RAISE EXCEPTION 'Group member limit is 200'"
    );
    expect(requestBody).not.toContain("_lock_group_conversation");
    expect(sql).toContain("public._count_active_members");
  });

  it("preserves client grants; no anon", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_group_conversation\(text, uuid\[\]\)\s+TO authenticated, postgres, service_role/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.add_conversation_members\(uuid, uuid\[\]\)\s+TO authenticated, postgres, service_role/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.accept_group_up_request\(uuid\)\s+TO authenticated, postgres, service_role/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.request_group_up\(uuid\)\s+TO authenticated, postgres, service_role/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_group_conversation[\s\S]*?FROM PUBLIC, anon/
    );
  });

  it("no remaining genuine member-cap literal 100 in migration bodies", () => {
    expect(sql).not.toMatch(/c_max_active_members integer := 100/);
    expect(sql).not.toContain("Group member limit is 100");
    expect(sql).not.toContain("v_member_count >= 100");
  });
});

describe("frontend Group member-cap wiring", () => {
  it("14: NewMessageOverlay uses GROUP_MAX_OTHER_MEMBERS", () => {
    const src = readSrc("components/messages/NewMessageOverlay.tsx");
    expect(src).toContain("GROUP_MAX_OTHER_MEMBERS");
    expect(src).not.toMatch(/MAX_OTHER_MEMBERS\s*=\s*99/);
    expect(src).toContain(
      "You can select up to ${GROUP_MAX_OTHER_MEMBERS} people for a group."
    );
  });

  it("15: AddPeoplePicker uses GROUP_ACTIVE_MEMBER_CAP", () => {
    const src = readSrc("components/messages/AddPeoplePicker.tsx");
    expect(src).toContain("GROUP_ACTIVE_MEMBER_CAP");
    expect(src).not.toMatch(/GROUP_MEMBER_CAP\s*=\s*100/);
    expect(src).toContain("{availableSlots}/{GROUP_ACTIVE_MEMBER_CAP} available");
  });

  it("16: GroupUpDeckBody full threshold uses shared cap", () => {
    const src = readSrc("pages/people/GroupUpDeckBody.tsx");
    expect(src).toContain("GROUP_ACTIVE_MEMBER_CAP");
    expect(src).not.toMatch(/GROUP_UP_MEMBER_CAP\s*=\s*100/);
    expect(src).toContain("member_count >= GROUP_ACTIVE_MEMBER_CAP");
  });

  it("17: SourceGroups overlay + card use shared cap", () => {
    const overlay = readSrc("components/social/SourceGroupsOverlay.tsx");
    const card = readSrc("components/social/SourceGroupCard.tsx");
    expect(overlay).toContain("member_count >= GROUP_ACTIVE_MEMBER_CAP");
    expect(card).toContain("GROUP_ACTIVE_MEMBER_CAP");
    expect(overlay).not.toMatch(/member_count\s*>=\s*100/);
    expect(card).not.toMatch(/member_count\s*>=\s*100/);
  });

  it("18: error classifier keys off member limit generically", () => {
    expect(classifyGroupUpRequestError("Group member limit is 200")).toBe(
      "full"
    );
    expect(classifyGroupUpRequestError("Group member limit is 100")).toBe(
      "full"
    );
    expect(classifyGroupUpRequestError("member limit reached")).toBe("full");
    const src = readSrc("api/services/groupUp.ts");
    expect(src).toContain('lower.includes("member limit")');
    expect(src).not.toContain('limit is 100');
  });

  it("19: no genuine Group membership-cap literal 100 in touched UI", () => {
    const files = [
      "components/messages/NewMessageOverlay.tsx",
      "components/messages/AddPeoplePicker.tsx",
      "pages/people/GroupUpDeckBody.tsx",
      "components/social/SourceGroupsOverlay.tsx",
      "components/social/SourceGroupCard.tsx",
      "lib/groupActiveMemberCap.ts",
    ];
    for (const rel of files) {
      const src = readSrc(rel);
      expect(src).not.toMatch(
        /(?:MEMBER_CAP|OTHER_MEMBERS|member_count\s*>=)\s*=?\s*100\b/
      );
      expect(src).not.toMatch(/member_count\s*>=\s*100/);
    }
  });
});
