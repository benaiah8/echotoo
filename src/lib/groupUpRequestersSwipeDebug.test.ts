import { describe, expect, it } from "vitest";
import {
  echoGroupRequestSwipeClear,
  echoGroupRequestSwipeDump,
  echoGroupRequestSwipeRecord,
  echoGroupRequestSwipeSummary,
} from "./groupUpRequestersSwipeDebug";

describe("groupUpRequestersSwipeDebug", () => {
  it("records stages and strips identity fields", () => {
    echoGroupRequestSwipeClear();
    echoGroupRequestSwipeRecord("pointerdown", {
      pointerType: "mouse",
      clientX: 220,
      conversationId: "should-not-appear",
      request_id: "should-not-appear",
      username: "should-not-appear",
    });
    echoGroupRequestSwipeRecord("skip", { reason: "excluded" });

    if (!import.meta.env.DEV) {
      expect(echoGroupRequestSwipeDump()).toEqual([]);
      return;
    }

    const rows = echoGroupRequestSwipeDump();
    expect(rows.some((row) => row.stage === "pointerdown")).toBe(true);
    const blob = JSON.stringify(rows);
    expect(blob).not.toContain("should-not-appear");
    expect(blob).not.toContain("conversationId");
    expect(blob).not.toContain("request_id");
    const summary = echoGroupRequestSwipeSummary();
    expect(summary.pointerdown).toBe(1);
    expect(summary.skip).toBe(1);
    echoGroupRequestSwipeClear();
    expect(echoGroupRequestSwipeDump()).toEqual([]);
  });
});
