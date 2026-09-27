import { describe, expect, it } from "vitest";
import {
  resolveGroupUpRequesterProfileOpenKey,
  resolveOpenPlanRequesterProfileOpenKey,
} from "./resolveRequesterProfileOpenKey";

describe("resolveOpenPlanRequesterProfileOpenKey", () => {
  it("returns username or UUID open keys and ignores empty", () => {
    expect(
      resolveOpenPlanRequesterProfileOpenKey({ profile_open_key: "ada" })
    ).toBe("ada");
    expect(
      resolveOpenPlanRequesterProfileOpenKey({ profile_open_key: "@ada" })
    ).toBe("ada");
    expect(
      resolveOpenPlanRequesterProfileOpenKey({
        profile_open_key: "00000000-0000-4000-8000-000000000001",
      })
    ).toBe("00000000-0000-4000-8000-000000000001");
    expect(
      resolveOpenPlanRequesterProfileOpenKey({ profile_open_key: null })
    ).toBeNull();
    expect(
      resolveOpenPlanRequesterProfileOpenKey({ profile_open_key: "   " })
    ).toBeNull();
  });
});

describe("resolveGroupUpRequesterProfileOpenKey", () => {
  it("prefers username then requester_user_id UUID", () => {
    expect(
      resolveGroupUpRequesterProfileOpenKey({
        username: "bob",
        requester_user_id: "00000000-0000-4000-8000-000000000002",
      })
    ).toBe("bob");
    expect(
      resolveGroupUpRequesterProfileOpenKey({
        username: null,
        requester_user_id: "00000000-0000-4000-8000-000000000002",
      })
    ).toBe("00000000-0000-4000-8000-000000000002");
    expect(
      resolveGroupUpRequesterProfileOpenKey({
        username: null,
        requester_user_id: "not-a-uuid",
      })
    ).toBeNull();
  });
});
