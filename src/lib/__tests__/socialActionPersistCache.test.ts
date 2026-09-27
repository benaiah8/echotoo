import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  __resetSocialActionPersistForTests,
  persistDuoOwnState,
  persistGroupCount,
  persistGroupOwnState,
  persistOpenPlanOwnState,
  readSocialActionLastUserId,
  readSocialActionPersistBag,
  SOCIAL_COUNT_PERSIST_TTL_MS,
  SOCIAL_OWN_PERSIST_TTL_MS,
  clearSocialActionPersistForUser,
} from "../socialActionPersistCache";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("socialActionPersistCache", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    __resetSocialActionPersistForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scopes duo/group/openPlan/count by user and sets last user", () => {
    persistDuoOwnState("u1", "p1", true);
    persistOpenPlanOwnState("u1", "p1", true);
    persistGroupOwnState("u1", "p1", true);
    persistGroupCount("u1", "p1", 3);
    expect(readSocialActionLastUserId()).toBe("u1");
    const bag = readSocialActionPersistBag("u1");
    expect(bag.duo.p1?.active).toBe(true);
    expect(bag.openPlan.p1?.active).toBe(true);
    expect(bag.groupOwn.p1?.active).toBe(true);
    expect(bag.counts.p1?.count).toBe(3);
    expect(readSocialActionPersistBag("u2").duo.p1).toBeUndefined();
  });

  it("does not leak across clear for account switch last-user", () => {
    persistDuoOwnState("u1", "p1", true);
    clearSocialActionPersistForUser("u1");
    expect(readSocialActionPersistBag("u1").duo.p1).toBeUndefined();
  });

  it("exposes longer own TTL than count TTL", () => {
    expect(SOCIAL_OWN_PERSIST_TTL_MS).toBeGreaterThan(SOCIAL_COUNT_PERSIST_TTL_MS);
    expect(SOCIAL_COUNT_PERSIST_TTL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});
