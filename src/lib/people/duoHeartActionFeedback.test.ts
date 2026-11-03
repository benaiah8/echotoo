import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DUO_HEART_FEEDBACK_MS,
  duoHeartErrorFeedbackVisible,
  duoHeartFeedbackAfterConnect,
  duoHeartFeedbackAfterWithdraw,
  duoHeartFeedbackDismissAllowed,
  duoHeartFeedbackShouldClear,
  duoHeartFeedbackText,
} from "./duoHeartActionFeedback";

describe("Duo heart action feedback", () => {
  it("shows connection sent only after an unmatched Duo connect succeeds", () => {
    expect(duoHeartFeedbackAfterConnect({ scope: "my_plans", status: "open" })).toBe(
      "sent"
    );
    expect(duoHeartFeedbackText("sent")).toBe("Connection sent.");
    expect(
      duoHeartFeedbackAfterConnect({ scope: "my_plans", status: "matched" })
    ).toBeNull();
    expect(
      duoHeartFeedbackAfterConnect({ scope: "my_plans", status: "failed" })
    ).toBeNull();
    expect(
      duoHeartFeedbackAfterConnect({ scope: "discover", status: "open" })
    ).toBeNull();
  });

  it("shows connection withdrawn only after withdrawal succeeds", () => {
    expect(duoHeartFeedbackAfterWithdraw("withdrawn")).toBe("withdrawn");
    expect(duoHeartFeedbackText("withdrawn")).toBe("Connection withdrawn.");
    expect(duoHeartFeedbackAfterWithdraw("matched-interest")).toBeNull();
    expect(duoHeartFeedbackAfterWithdraw("discover-sourced")).toBeNull();
    expect(duoHeartFeedbackAfterWithdraw("failed")).toBeNull();
    expect(duoHeartFeedbackAfterWithdraw("ignored")).toBeNull();
  });

  it("drops a stale timer and a notice for another candidate or viewer", () => {
    const feedback = {
      kind: "sent" as const,
      opportunityId: "opp-1",
      viewerId: "viewer-1",
      generation: 2,
    };
    expect(
      duoHeartFeedbackDismissAllowed({ timerGeneration: 1, liveGeneration: 2 })
    ).toBe(false);
    expect(
      duoHeartFeedbackDismissAllowed({ timerGeneration: 2, liveGeneration: 2 })
    ).toBe(true);
    expect(
      duoHeartFeedbackShouldClear({
        feedback,
        viewerId: "viewer-2",
        scope: "my_plans",
        currentOpportunityId: "opp-1",
      })
    ).toBe(true);
    expect(
      duoHeartFeedbackShouldClear({
        feedback,
        viewerId: "viewer-1",
        scope: "my_plans",
        currentOpportunityId: "opp-2",
      })
    ).toBe(true);
    expect(
      duoHeartFeedbackShouldClear({
        feedback,
        viewerId: "viewer-1",
        scope: "discover",
        currentOpportunityId: "opp-1",
      })
    ).toBe(true);
    expect(
      duoHeartFeedbackShouldClear({
        feedback,
        viewerId: "viewer-1",
        scope: "my_plans",
        currentOpportunityId: "opp-1",
      })
    ).toBe(false);
    expect(DUO_HEART_FEEDBACK_MS).toBe(3000);
  });

  it("wires one bottom notice without a second match toast", () => {
    const root = join(__dirname, "../..");
    const overlay = readFileSync(join(root, "pages/people/MatchDeckOverlay.tsx"), "utf8");
    const runner = readFileSync(join(root, "lib/people/runMinePairUpConnect.ts"), "utf8");
    const css = readFileSync(
      join(root, "pages/people/DuoHeartActionFeedback.css"),
      "utf8"
    );
    const noticeAt = overlay.indexOf('data-duo-heart-action-feedback="true"');
    expect(noticeAt).toBeGreaterThan(-1);
    const notice = overlay.slice(Math.max(0, noticeAt - 400), noticeAt + 500);
    expect(notice).toContain("pointer-events-none");
    expect(notice).toContain("duoHeartFeedbackText");
    expect(notice).toContain("peopleDuoModernTabBandPad()");
    expect(notice).not.toContain("It's a Match!");
    expect(overlay).toContain('showDuoActionFeedback("sent"');
    expect(overlay).toContain('showDuoActionFeedback("withdrawn"');
    expect(overlay).toContain("clearTimeout");
    expect(overlay).toContain("duoActionFeedbackGenRef");
    expect(runner).toContain("onDuoUnmatchedConfirmed");
    expect(runner).toContain("toast.success(peopleUiCopy.discoverAddedToP2p)");
    const matchedReturn = runner.indexOf('return "matched"');
    const confirmAt = runner.indexOf("host.onDuoUnmatchedConfirmed?.");
    expect(confirmAt).toBeGreaterThan(matchedReturn);
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("html.theme-light .duo-heart-action-feedback");
    expect(css).toContain("html.app-light .duo-heart-action-feedback");
    expect(css).toContain("var(--surface-2)");
    expect(css).toContain("var(--text)");
    expect(css).toContain("var(--brand)");
    expect(css).toContain("var(--brand-readable)");
    expect(css).toContain("box-shadow: none");
    expect(css).not.toMatch(/box-shadow:\s*0\s+4px\s+14px/);
    expect(notice).toContain("PEOPLE_DUO_MODERN_ACTION_ROW_H_PX");
    expect(notice).toContain("+ 8px");
  });

  it("shows a withdrawal error only while that Duo candidate is still committed", () => {
    const same = {
      capturedViewerId: "viewer-1",
      capturedOpportunityId: "opp-1",
      liveViewerId: "viewer-1",
      scope: "my_plans",
      mode: "p2p",
      currentOpportunityId: "opp-1",
    };
    expect(duoHeartErrorFeedbackVisible(same)).toBe(true);
    expect(
      duoHeartErrorFeedbackVisible({ ...same, currentOpportunityId: "opp-2" })
    ).toBe(false);
    expect(
      duoHeartErrorFeedbackVisible({ ...same, liveViewerId: "viewer-2" })
    ).toBe(false);
    expect(duoHeartErrorFeedbackVisible({ ...same, liveViewerId: null })).toBe(
      false
    );
    expect(duoHeartErrorFeedbackVisible({ ...same, scope: "discover" })).toBe(
      false
    );
    expect(duoHeartErrorFeedbackVisible({ ...same, mode: "groups" })).toBe(
      false
    );
  });

  it("guards Duo withdrawal error toasts without skipping refresh or stale removal", () => {
    const overlay = readFileSync(
      join(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
      "utf8"
    );
    const start = overlay.indexOf("const withdrawDuoHeart");
    const end = overlay.indexOf("const handleConnect");
    const handler = overlay.slice(start, end);
    const outside = overlay.slice(0, start) + overlay.slice(end);
    const matchedAt = handler.indexOf('result.type === "matched-interest"');
    const discoverAt = handler.indexOf('result.type === "discover-sourced"');
    const failedAt = handler.indexOf('result.type === "failed"');
    const successAt = handler.indexOf('result.type === "withdrawn"');
    const matched = handler.slice(matchedAt, discoverAt);
    const discoverSourced = handler.slice(discoverAt, failedAt);
    const failed = handler.slice(failedAt);

    expect(handler).toContain("contentScopeRef.current");
    expect(handler).toContain("modeRef.current");
    expect(handler).toContain("authUserIdRef.current");
    expect(handler).toContain(
      "scopeStateRef.current.my_plans.currentOpportunityId"
    );
    expect(handler.slice(successAt, matchedAt)).toContain(
      'showDuoActionFeedback("withdrawn"'
    );
    expect(handler.slice(successAt, matchedAt)).not.toContain(
      "errorFeedbackVisible"
    );
    expect(matched).toContain("if (errorFeedbackVisible())");
    expect(matched).toContain("showDuoAlreadyMatchedToast()");
    expect(matched).not.toContain("toast.error(peopleUiCopy.duoHeartMatched)");
    expect(matched).not.toMatch(/toast\.error\(/);
    expect(matched).toContain("myPlans.refresh()");
    expect(matched).not.toContain("noteDuoHeartWithdrawn");
    expect(matched).not.toContain("markDuoInterestCleared");
    expect(discoverSourced).toContain("if (errorFeedbackVisible())");
    expect(discoverSourced).toContain("toast.error(peopleUiCopy.duoHeartDiscoverSourced)");
    expect(discoverSourced).toContain("peopleUiCopy.duoHeartDiscoverSourced");
    expect(failed).toContain("if (errorFeedbackVisible())");
    expect(failed).toContain("peopleUiCopy.duoHeartWithdrawError");
    expect(failed).toContain("peopleUiCopy.deckConnectUnavailable");
    expect(failed).toContain("if (result.stale) dropMyPlansCandidate(opportunityId)");
    expect(failed.indexOf("dropMyPlansCandidate")).toBeGreaterThan(
      failed.indexOf("errorFeedbackVisible()")
    );
    expect(handler).not.toContain("setPhase");
    expect(handler.match(/duoHeartErrorFeedbackVisible\(/g)).toHaveLength(1);
    expect(outside).not.toContain("duoHeartErrorFeedbackVisible(");
    expect(overlay).toContain("withdrawDiscoverPairUpInterest");
    expect(overlay).toContain("routeDuoCommentTap");
    expect(overlay).toContain('showDuoAlreadyMatchedToast');
    expect(overlay.match(/showDuoAlreadyMatchedToast\(/g)).toHaveLength(1);
    expect(overlay).not.toContain("toast.error(peopleUiCopy.duoHeartMatched)");
  });
});

