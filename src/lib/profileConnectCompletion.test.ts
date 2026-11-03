import { describe, expect, it, vi } from "vitest";
import {
  retryProfileMatchCompletion,
  settleProfileConnect,
} from "./profileConnectCompletion";

const completion = {
  conversation_id: "conv-1",
  other_user_id: "user-2",
  source_post_id: "post-1",
  created: true,
};

describe("settleProfileConnect", () => {
  it("marks a non-mutual connect without completing the match", async () => {
    const markInterestOnly = vi.fn();
    const markConnected = vi.fn();
    const complete = vi.fn();

    const settled = await settleProfileConnect({
      matched: false,
      opportunityId: "opp-1",
      markInterestOnly,
      markConnected,
      complete,
    });

    expect(settled).toEqual({ status: "interest" });
    expect(markConnected).toHaveBeenCalledOnce();
    expect(markInterestOnly).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("marks connected only after completion succeeds", async () => {
    const order: string[] = [];
    const settled = await settleProfileConnect({
      matched: true,
      opportunityId: "opp-server",
      markInterestOnly: () => order.push("interest"),
      markConnected: () => order.push("connected"),
      complete: async (opportunityId) => {
        order.push(`complete:${opportunityId}`);
        return completion;
      },
    });

    expect(settled).toEqual({ status: "completed", completion });
    expect(order).toEqual(["interest", "complete:opp-server", "connected"]);
  });

  it("keeps the server opportunity id when completion fails", async () => {
    const markConnected = vi.fn();
    const complete = vi.fn(async () => {
      throw new Error("rpc down");
    });

    const settled = await settleProfileConnect({
      matched: true,
      opportunityId: "opp-server",
      markInterestOnly: () => {},
      markConnected,
      complete,
    });

    expect(settled).toEqual({
      status: "needs_retry",
      opportunityId: "opp-server",
    });
    expect(markConnected).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledExactlyOnceWith("opp-server");
  });
});

describe("retryProfileMatchCompletion", () => {
  it("retries only completion and navigates from the server conversation", async () => {
    const express = vi.fn();
    const markConnected = vi.fn();
    const complete = vi.fn(async () => completion);

    const retried = await retryProfileMatchCompletion({
      opportunityId: "opp-server",
      complete,
      markConnected,
    });

    expect(retried).toEqual({ ok: true, completion });
    expect(complete).toHaveBeenCalledExactlyOnceWith("opp-server");
    expect(markConnected).toHaveBeenCalledOnce();
    expect(express).not.toHaveBeenCalled();
    expect(retried.ok && retried.completion.conversation_id).toBe("conv-1");
  });

  it("stays retryable when completion fails again", async () => {
    const markConnected = vi.fn();
    const retried = await retryProfileMatchCompletion({
      opportunityId: "opp-server",
      complete: async () => {
        throw new Error("still down");
      },
      markConnected,
    });

    expect(retried).toEqual({ ok: false, opportunityId: "opp-server" });
    expect(markConnected).not.toHaveBeenCalled();
  });

  it("ignores a second completion while the first is in flight", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const inFlight = { current: false };

    const once = async () => {
      if (inFlight.current) return { started: false as const };
      inFlight.current = true;
      calls += 1;
      try {
        await gate;
        return { started: true as const };
      } finally {
        inFlight.current = false;
      }
    };

    const first = once();
    const second = await once();
    release?.();
    await first;

    expect(second).toEqual({ started: false });
    expect(calls).toBe(1);
  });
});
