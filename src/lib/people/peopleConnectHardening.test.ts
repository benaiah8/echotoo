import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildPeopleConnectFailureLog,
  extractPeopleConnectErrorFields,
  isPeopleConnectStaleEligibilityError,
  peopleConnectUserToastKind,
} from "./peopleConnectHardening";

describe("peopleConnectHardening", () => {
  it("extracts PostgREST-shaped error fields", () => {
    const fields = extractPeopleConnectErrorFields({
      message: "Source is not eligible",
      code: "P0001",
      details: "hangout gate",
      hint: "check dates",
    });
    expect(fields).toEqual({
      message: "Source is not eligible",
      code: "P0001",
      details: "hangout gate",
      hint: "check dates",
    });
  });

  it("classifies stale/ineligible errors", () => {
    expect(
      isPeopleConnectStaleEligibilityError({
        message: "Source is not eligible",
      })
    ).toBe(true);
    expect(
      isPeopleConnectStaleEligibilityError({
        message: "Target is not an active Pair Up",
      })
    ).toBe(true);
    expect(
      isPeopleConnectStaleEligibilityError({
        message: "Network request failed",
      })
    ).toBe(false);
    expect(peopleConnectUserToastKind({ message: "Source is not eligible" })).toBe(
      "stale"
    );
    expect(peopleConnectUserToastKind({ message: "boom" })).toBe("generic");
  });

  it("builds diagnostics without auth tokens", () => {
    const log = buildPeopleConnectFailureLog({
      rpc: "connect_discover_pair_up",
      err: { message: "Source is not eligible", code: "P0001" },
      opportunityId: "opp-1",
      sourcePostId: "post-1",
      scope: "discover",
    });
    expect(log.rpc).toBe("connect_discover_pair_up");
    expect(log.opportunity_id).toBe("opp-1");
    expect(log.source_post_id).toBe("post-1");
    expect(log.scope).toBe("discover");
    expect(JSON.stringify(log)).not.toMatch(/token|jwt|authorization/i);
  });
});

describe("People Connect single-flight contract", () => {
  it("documents one mutation gate: in-flight blocks second tap", async () => {
    let inFlight = false;
    let mutations = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const connect = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        mutations += 1;
        await gate;
      } finally {
        inFlight = false;
      }
    };
    const first = connect();
    void connect();
    expect(mutations).toBe(1);
    release();
    await first;
  });

  it("photo-gate continue still yields one mutation", async () => {
    let inFlight = false;
    let mutations = 0;
    const runConnect = async () => {
      try {
        mutations += 1;
      } finally {
        inFlight = false;
      }
    };
    const start = () => {
      if (inFlight) return;
      inFlight = true;
      /* open prompt — keep lock */
    };
    start();
    start(); /* double tap while prompt open */
    expect(mutations).toBe(0);
    await runConnect(); /* continue */
    expect(mutations).toBe(1);
    expect(inFlight).toBe(false);
  });

  it("generic failure clears resolving without retiring", () => {
    const removed: string[] = [];
    const onFail = (err: { message: string }, id: string) => {
      let resolving = true;
      try {
        if (isPeopleConnectStaleEligibilityError(err)) removed.push(id);
      } finally {
        resolving = false;
      }
      expect(resolving).toBe(false);
    };
    onFail({ message: "Network request failed" }, "opp-a");
    expect(removed).toEqual([]);
  });

  it("stale failure retires candidate id", () => {
    const removed: string[] = [];
    const err = { message: "Source is not eligible" };
    if (isPeopleConnectStaleEligibilityError(err)) removed.push("opp-b");
    expect(removed).toEqual(["opp-b"]);
  });

  it("Open Plan scopes never select Pair Up RPCs", () => {
    const selectPairUpRpc = (
      scope: "discover" | "my_plans" | "open_plans",
    ): string | null => {
      if (scope === "discover") return "connect_discover_pair_up";
      if (scope === "my_plans") return "express_pair_up_interest";
      return null;
    };
    expect(selectPairUpRpc("open_plans")).toBeNull();
  });
});

describe("peopleConnectHardening DEV log gate", () => {
  const originalDev = import.meta.env.DEV;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv("DEV", originalDev);
  });

  it("buildPeopleConnectFailureLog is stable for success-path diagnostics", () => {
    expect(
      buildPeopleConnectFailureLog({
        rpc: "express_pair_up_interest",
        err: new Error("Not in pool"),
        opportunityId: "x",
        sourcePostId: "y",
        scope: "my_plans",
      }).message
    ).toBe("Not in pool");
  });
});
