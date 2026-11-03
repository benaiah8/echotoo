import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DUO_MATCH_REVEAL_STEPS,
  DUO_MATCH_TOAST_MS,
  duoDeckHeartAfterMatchReveal,
  duoMatchConfirmAfterComplete,
  duoMatchFailedCompletionShouldClear,
  duoMatchHeartPulseMs,
  duoMatchHoldShouldRemove,
  duoMatchRevealKeepsCandidate,
  matchDeckShouldRestorePinnedCandidate,
  matchPinReleaseAllowed,
  duoMatchToastBody,
  duoMatchToastNavigationAllowed,
} from "./MatchDeckOverlay";

const done = {
  conversation_id: "conv-1",
  other_user_id: "user-2",
};

const toast = {
  conversationId: "conv-1",
  otherUserId: "user-2",
  displayName: "Ada",
  viewerId: "viewer-1",
};

describe("Duo match toast", () => {
  it("keeps an unmatched Duo result off the match toast", () => {
    expect(
      duoMatchConfirmAfterComplete({
        scope: "my_plans",
        failed: true,
        completion: done,
      })
    ).toBe("error");
  });

  it("confirms a mutual Duo match without choosing navigation", () => {
    expect(
      duoMatchConfirmAfterComplete({
        scope: "my_plans",
        failed: false,
        completion: done,
      })
    ).toEqual({ conversationId: "conv-1", otherUserId: "user-2" });
  });

  it("keeps Discover on immediate navigation", () => {
    expect(
      duoMatchConfirmAfterComplete({
        scope: "discover",
        failed: false,
        completion: done,
      })
    ).toBe("navigate");
  });

  it("uses a display name when it is safe and a generic line otherwise", () => {
    expect(duoMatchToastBody("Ada")).toBe("You matched with Ada!");
    expect(duoMatchToastBody("  ")).toBe("You matched with this person!");
    expect(duoMatchToastBody(null)).toBe("You matched with this person!");
  });

  it("allows the stored conversation once for the same viewer", () => {
    expect(
      duoMatchToastNavigationAllowed({
        toast,
        viewerId: "viewer-1",
        alreadyNavigated: false,
      })
    ).toBe(true);
    expect(
      duoMatchToastNavigationAllowed({
        toast,
        viewerId: "viewer-1",
        alreadyNavigated: true,
      })
    ).toBe(false);
    expect(
      duoMatchToastNavigationAllowed({
        toast: null,
        viewerId: "viewer-1",
        alreadyNavigated: false,
      })
    ).toBe(false);
    expect(
      duoMatchToastNavigationAllowed({
        toast,
        viewerId: "viewer-2",
        alreadyNavigated: false,
      })
    ).toBe(false);
  });

  it("skips the heart pulse when reduced motion is requested", () => {
    expect(duoMatchHeartPulseMs(false)).toBeGreaterThan(0);
    expect(duoMatchHeartPulseMs(true)).toBe(0);
    expect(DUO_MATCH_TOAST_MS).toBe(5000);
  });

  it("wires a nonblocking compact toast, one Chat now action, and Discover navigation", () => {
    const overlay = readFileSync(join(__dirname, "MatchDeckOverlay.tsx"), "utf8");
    const css = readFileSync(join(__dirname, "DuoMatchToast.css"), "utf8");
    const toastAt = overlay.indexOf("{duoMatchConfirm ? (");
    expect(toastAt).toBeGreaterThan(-1);
    expect(overlay).toContain('data-duo-match-toast="true"');
    const toastEnd = overlay.indexOf("</div>\n      ) : null}", toastAt);
    const toastIsland = overlay.slice(
      toastAt,
      toastEnd > toastAt ? toastEnd + 40 : toastAt + 4500
    );
    expect(toastIsland).toContain('fixed inset-0 z-[34]');
    expect(toastIsland).toContain('data-duo-match-toast-wash="true"');
    expect(toastIsland).toContain('data-duo-match-toast-ripple="true"');
    expect(toastIsland).toContain("pointer-events-none");
    expect(toastIsland).toContain("pointer-events-auto");
    expect(toastIsland).toContain("It's a Match!");
    expect(toastIsland).toContain("Chat now");
    expect(toastIsland.match(/Chat now/g)).toHaveLength(1);
    expect(toastIsland).not.toContain("Message now");
    expect(toastIsland).toContain('data-duo-match-toast-compact="true"');
    expect(toastIsland).toContain("inline-flex");
    expect(toastIsland).toContain("h-10");
    expect(toastIsland).toContain("rounded-full");
    expect(toastIsland).toContain("max-w-[min(100vw-24px,17.5rem)]");
    expect(toastIsland).toContain("onClick={openDuoMatchConversation}");
    expect(toastIsland).toContain(
      "aria-label={duoMatchToastBody(duoMatchConfirm.displayName)}"
    );
    // Wash starts below People nav (same inset token), not over the category pill.
    expect(toastIsland).toContain("top: peopleDuoModernScrollTopInset()");
    expect(toastIsland).toContain(
      "top: `calc(${peopleDuoModernScrollTopInset()} + 8px)`"
    );
    expect(toastIsland).toContain("relative z-10");
    // No visible second-line subtitle — name stays on aria-label only.
    expect(toastIsland).not.toContain("You matched with");
    expect(toastIsland).not.toMatch(
      />\s*\{duoMatchToastBody\(duoMatchConfirm\.displayName\)\}\s*</
    );
    expect(overlay).not.toContain('cancelLabel="Keep Exploring"');
    expect(overlay).toContain("messagesConversationPath(confirm.conversationId)");
    expect(overlay).toContain('decision === "navigate"');
    expect(overlay).toContain("PeopleDeckEmptyCard");
    expect(overlay).toContain("duoMatchPulseId === current.opportunity_id");
    expect(overlay).toContain("clearTimeout");
    expect(overlay).toContain("currentToast.viewerId !== authUserId");
    expect(overlay).toContain("DUO_MATCH_TOAST_MS");
    expect(DUO_MATCH_TOAST_MS).toBe(5000);
    // Decorative emphasis: single-run CSS only — no new lifecycle timers/state.
    expect(css).toContain("@keyframes duo-match-toast-wash");
    expect(css).toContain("@keyframes duo-match-toast-ripple");
    expect(css).toContain("animation: duo-match-toast-wash 1400ms");
    expect(css).toContain("animation: duo-match-toast-ripple 840ms");
    expect(css).toContain("color-mix(in oklab, black 38%, transparent)");
    expect(css).toContain("color-mix(in oklab, black 28%, transparent)");
    expect(css).toContain("rgb(225, 29, 72)");
    expect(css).toContain("10.7%");
    expect(css).toContain("28.6%");
    expect(css).toContain("duo-match-heart-pulse");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation: none");
    expect(css).toContain(
      '[data-people-action-kind="heart"][data-people-action-visual="active"]'
    );
    const reduceAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const reduceBlock = css.slice(reduceAt);
    expect(reduceBlock).toContain(".duo-match-toast-wash");
    expect(reduceBlock).toContain(".duo-match-toast-ripple");
    expect(reduceBlock).toContain("visibility: hidden");
    expect(toastIsland).not.toContain("setTimeout");
    expect(toastIsland).not.toContain("useState");
    const messageAt = overlay.indexOf("const openDuoMatchConversation");
    expect(overlay.slice(messageAt, messageAt + 800)).not.toContain(
      "completePairUpMatch"
    );
  });

  it("shows the toast and red Heart before the matched candidate leaves", () => {
    expect(DUO_MATCH_REVEAL_STEPS).toEqual([
      "toast",
      "pulse",
      "hold",
      "remove",
      "clear-pulse",
      "idle",
    ]);
    expect(duoMatchRevealKeepsCandidate("toast")).toBe(true);
    expect(duoMatchRevealKeepsCandidate("pulse")).toBe(true);
    expect(duoMatchRevealKeepsCandidate("hold")).toBe(true);
    expect(duoMatchRevealKeepsCandidate("remove")).toBe(false);

    const overlay = readFileSync(join(__dirname, "MatchDeckOverlay.tsx"), "utf8");
    const runAt = overlay.indexOf("const runComplete = useCallback");
    const messageAt = overlay.indexOf("const openDuoMatchConversation");
    const runBody = overlay.slice(runAt, messageAt);
    const successBody = runBody.slice(0, runBody.indexOf("} catch {"));
    const toastAt = successBody.indexOf("setDuoMatchConfirm(confirm)");
    const pulseAt = successBody.indexOf("setDuoMatchPulseId(opportunityId)");
    const holdAt = successBody.indexOf("await new Promise");
    const removeAt = successBody.indexOf("onDuoConfirmed?.()");
    const clearAt = successBody.lastIndexOf("clearDuoMatchHeartPulse()");
    const idleAt = successBody.lastIndexOf('setPhase("idle")');
    expect(toastAt).toBeGreaterThan(0);
    expect(pulseAt).toBeGreaterThan(toastAt);
    expect(holdAt).toBeGreaterThan(pulseAt);
    expect(removeAt).toBeGreaterThan(holdAt);
    expect(clearAt).toBeGreaterThan(removeAt);
    expect(idleAt).toBeGreaterThan(clearAt);
    expect(runBody.indexOf('decision === "navigate"')).toBeLessThan(toastAt);
    expect(runBody.indexOf("setPhase(\"completing\")")).toBeLessThan(toastAt);
    expect(runBody.indexOf("DUO_MATCH_TOAST_MS")).toBeLessThan(holdAt);
    expect(runBody.match(/completePairUpMatch\(/g)).toHaveLength(1);
    const navAt = successBody.indexOf('decision === "navigate"');
    const navSlice = successBody.slice(navAt, toastAt);
    expect(navSlice.indexOf("releaseOwnedPin()")).toBeGreaterThan(-1);
    expect(navSlice.indexOf('setPhase("idle")')).toBeGreaterThan(
      navSlice.indexOf("releaseOwnedPin()")
    );
    expect(navSlice.indexOf("navigate(")).toBeGreaterThan(
      navSlice.indexOf('setPhase("idle")')
    );
    expect(successBody.lastIndexOf("releaseOwnedPin()")).toBeGreaterThan(removeAt);
    expect(successBody.lastIndexOf("releaseOwnedPin()")).toBeLessThan(idleAt);
    const catchBody = runBody.slice(runBody.indexOf("} catch {"));
    expect(catchBody).toContain('setPhase("completeFailed")');
    expect(catchBody).not.toContain("releaseOwnedPin");
    expect(catchBody).not.toContain("setPinned(null)");
  });

  it("retries with the same display name and removal callback as the first completion", () => {
    const overlay = readFileSync(
      join(__dirname, "MatchDeckOverlay.tsx"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const retryAt = overlay.indexOf("const handleRetryComplete = useCallback");
    const retry = overlay.slice(retryAt, retryAt + 650);
    expect(retry).toContain("pinned.display_name");
    expect(retry).toContain(
      "removeCompletedPairUpCandidate(scope, opportunityId)"
    );
    expect(retry).toContain(
      "runComplete(opportunityId, scope, pinned.display_name"
    );
    const matchedAt = overlay.indexOf("applyMatchedAndComplete:");
    const matched = overlay.slice(matchedAt, matchedAt + 900);
    expect(matched).toContain("target.display_name");
    expect(matched).toContain("removeCompletedPairUpCandidate(scope, leavingId)");
  });

  it("clears a failed completion only when the authenticated viewer changes", () => {
    expect(
      duoMatchFailedCompletionShouldClear({
        previousViewerId: null,
        nextViewerId: "viewer-1",
        phase: "completeFailed",
      })
    ).toBe(false);
    expect(
      duoMatchFailedCompletionShouldClear({
        previousViewerId: "viewer-1",
        nextViewerId: "viewer-1",
        phase: "completeFailed",
      })
    ).toBe(false);
    expect(
      duoMatchFailedCompletionShouldClear({
        previousViewerId: "viewer-1",
        nextViewerId: "viewer-2",
        phase: "idle",
      })
    ).toBe(false);
    expect(
      duoMatchFailedCompletionShouldClear({
        previousViewerId: "viewer-1",
        nextViewerId: "viewer-2",
        phase: "completeFailed",
      })
    ).toBe(true);
  });

  it("restores a pin only while completion is unfinished, and only for that operation", () => {
    expect(duoMatchHeartPulseMs(false)).toBe(480);
    expect(
      matchDeckShouldRestorePinnedCandidate({
        phase: "completing",
        pinnedOpportunityId: "matched",
        deckHasOpportunity: false,
      })
    ).toBe(true);
    expect(
      matchDeckShouldRestorePinnedCandidate({
        phase: "completeFailed",
        pinnedOpportunityId: "matched",
        deckHasOpportunity: false,
      })
    ).toBe(true);
    expect(
      matchDeckShouldRestorePinnedCandidate({
        phase: "idle",
        pinnedOpportunityId: "matched",
        deckHasOpportunity: false,
      })
    ).toBe(false);
    expect(
      matchDeckShouldRestorePinnedCandidate({
        phase: "expressing",
        pinnedOpportunityId: "matched",
        deckHasOpportunity: false,
      })
    ).toBe(false);
    expect(
      matchDeckShouldRestorePinnedCandidate({
        phase: "completeFailed",
        pinnedOpportunityId: "matched",
        deckHasOpportunity: true,
      })
    ).toBe(false);
    expect(
      matchPinReleaseAllowed({
        holdSequence: 2,
        liveSequence: 2,
        holdOpportunityId: "matched",
        pinnedOpportunityId: "matched",
      })
    ).toBe(true);
    expect(
      matchPinReleaseAllowed({
        holdSequence: 2,
        liveSequence: 3,
        holdOpportunityId: "matched",
        pinnedOpportunityId: "matched",
      })
    ).toBe(false);
    expect(
      matchPinReleaseAllowed({
        holdSequence: 2,
        liveSequence: 2,
        holdOpportunityId: "matched",
        pinnedOpportunityId: "newer",
      })
    ).toBe(false);
  });

  it("keeps the next candidate's own Heart after the pulse", () => {
    expect(
      duoDeckHeartAfterMatchReveal({
        visibleOpportunityId: "matched",
        matchedOpportunityId: "matched",
        pulseOpportunityId: "matched",
        expressedByMe: true,
        completionLocked: true,
      })
    ).toBe("active");
    expect(
      duoDeckHeartAfterMatchReveal({
        visibleOpportunityId: "next",
        matchedOpportunityId: "matched",
        pulseOpportunityId: null,
        expressedByMe: false,
        completionLocked: false,
      })
    ).toBe("idle");
    expect(
      duoDeckHeartAfterMatchReveal({
        visibleOpportunityId: "next",
        matchedOpportunityId: "matched",
        pulseOpportunityId: null,
        expressedByMe: true,
        completionLocked: false,
      })
    ).toBe("active");
  });

  it("cancels removal when the viewer or match generation changes", () => {
    expect(
      duoMatchHoldShouldRemove({
        holdGeneration: 1,
        liveGeneration: 2,
        holdViewerId: "viewer-1",
        liveViewerId: "viewer-2",
        navigated: false,
      })
    ).toBe(false);
    expect(
      duoMatchHoldShouldRemove({
        holdGeneration: 1,
        liveGeneration: 2,
        holdViewerId: "viewer-1",
        liveViewerId: "viewer-1",
        navigated: false,
      })
    ).toBe(false);
    expect(
      duoMatchHoldShouldRemove({
        holdGeneration: 1,
        liveGeneration: 1,
        holdViewerId: "viewer-1",
        liveViewerId: "viewer-1",
        navigated: false,
      })
    ).toBe(true);
    expect(
      duoMatchHoldShouldRemove({
        holdGeneration: 1,
        liveGeneration: 2,
        holdViewerId: "viewer-1",
        liveViewerId: "viewer-1",
        navigated: true,
      })
    ).toBe(true);
  });
});
