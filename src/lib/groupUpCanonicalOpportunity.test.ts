import { describe, expect, it } from "vitest";
import { selectCanonicalGroupUpOpportunity } from "./groupUpCanonicalOpportunity";

describe("selectCanonicalGroupUpOpportunity", () => {
  it("A: prefers renewed active over expired historical", () => {
    const picked = selectCanonicalGroupUpOpportunity(
      [
        {
          id: "old",
          conversation_id: "c1",
          status: "closed",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "new",
          conversation_id: "c1",
          status: "active",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      "c1"
    );
    expect(picked?.id).toBe("new");
  });

  it("B: with only historical, picks newest", () => {
    const picked = selectCanonicalGroupUpOpportunity(
      [
        {
          id: "a",
          conversation_id: "c1",
          status: "closed",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "b",
          conversation_id: "c1",
          status: "expired",
          created_at: "2026-03-01T00:00:00Z",
        },
        {
          id: "c",
          conversation_id: "c1",
          status: "closed",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      "c1"
    );
    expect(picked?.id).toBe("b");
  });

  it("never returns multiple — one conversation one pick", () => {
    const rows = [
      {
        id: "r1",
        conversation_id: "c1",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "r2",
        conversation_id: "c1",
        status: "active",
        created_at: "2026-02-01T00:00:00Z",
      },
      {
        id: "other",
        conversation_id: "c2",
        status: "active",
        created_at: "2026-03-01T00:00:00Z",
      },
    ];
    expect(selectCanonicalGroupUpOpportunity(rows, "c1")?.id).toBe("r2");
    expect(selectCanonicalGroupUpOpportunity(rows, "c2")?.id).toBe("other");
  });
});
