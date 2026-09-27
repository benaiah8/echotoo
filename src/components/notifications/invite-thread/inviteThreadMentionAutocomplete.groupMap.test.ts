import { describe, expect, it } from "vitest";
import {
  filterMentionParticipants,
  mentionInsertForParticipant,
  parseActiveMentionQuery,
} from "./inviteThreadMentionAutocomplete";
import type { ConversationMemberRow } from "../../../api/services/messaging";
import type { InviteThreadParticipant } from "../../../api/services/inviteThreads";

function memberToParticipant(m: ConversationMemberRow): InviteThreadParticipant {
  return {
    user_id: m.user_id,
    username: m.username,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  };
}

describe("persistent group mention mapping + helpers", () => {
  const members: ConversationMemberRow[] = [
    {
      user_id: "viewer",
      role: "admin",
      joined_at: "2026-01-01T00:00:00Z",
      display_name: "Me",
      username: "me",
      avatar_url: null,
    },
    {
      user_id: "u2",
      role: "member",
      joined_at: "2026-01-02T00:00:00Z",
      display_name: "Jordan Lee",
      username: "jordan",
      avatar_url: null,
    },
    {
      user_id: "u3",
      role: "member",
      joined_at: "2026-01-03T00:00:00Z",
      display_name: "Alex",
      username: "alex",
      avatar_url: null,
    },
  ];

  it("parses active @ token and filters excluding viewer", () => {
    const token = parseActiveMentionQuery("hey @jo", 7);
    expect(token).toEqual({ atIndex: 4, query: "jo" });
    const hits = filterMentionParticipants(
      members.map(memberToParticipant),
      "viewer",
      token!.query,
      5
    );
    expect(hits.map((p) => p.user_id)).toEqual(["u2"]);
    expect(mentionInsertForParticipant(hits[0]!)).toBe("@jordan ");
  });

  it("inserts after replacing query span", () => {
    const draft = "hey @al";
    const caret = draft.length;
    const token = parseActiveMentionQuery(draft, caret)!;
    const ins = mentionInsertForParticipant({
      user_id: "u3",
      username: "alex",
      display_name: "Alex",
    });
    const next =
      draft.slice(0, token.atIndex) + ins + draft.slice(caret);
    expect(next).toBe("hey @alex ");
  });
});
