import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createMineButtonFlightLatch,
  flushMineButtonLatch,
  planMineButtonStep,
  queueMineButtonTarget,
} from "./mineEdgeNavGesture";
import { isPeopleMineRealIncomingEnabled } from "../../pages/people/matchDeckDevMocks";

const OVERLAY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/MatchDeckOverlay.tsx"),
  "utf8"
);
const CAROUSEL_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/MatchDeckCarousel.tsx"),
  "utf8"
);
const DUO_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleDuoCandidateSlide.tsx"),
  "utf8"
);
const CANONICAL_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
  ),
  "utf8"
);
const NOTE_WRAP_SRC = readFileSync(
  resolve(__dirname, "../../components/people/MineOpportunityNote.tsx"),
  "utf8"
);
const NOTE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleExpandableNote.tsx"),
  "utf8"
);
const OPEN_PLANS_BODY = readFileSync(
  resolve(__dirname, "../../pages/people/OpenPlanDeckBody.tsx"),
  "utf8"
);
const PLANS_SLIDE = readFileSync(
  resolve(__dirname, "../../components/people/PeopleOpenPlanCandidateSlide.tsx"),
  "utf8"
);
const GROUPS_BODY = readFileSync(
  resolve(__dirname, "../../pages/people/GroupUpDeckBody.tsx"),
  "utf8"
);

/** Parity fixture — non-empty Discover opportunity note. */
export const DISCOVER_PARITY_NOTE_FIXTURE =
  "This is a Discover opportunity note used for parity testing.";

describe("Canonical Mine + Discover motion / edge / note parity", () => {
  it("production real-incoming is enabled for canonical PairUp (not my_plans-only)", () => {
    expect(OVERLAY_SRC).toContain(
      "isCanonicalPairUpScope && isPeopleMineRealIncomingEnabled()"
    );
    expect(OVERLAY_SRC).not.toMatch(
      /mineRealIncomingEnabled\s*=\s*\n\s*contentScope === "my_plans"/
    );
    // Prod flag helper defaults on (DEV may override via localStorage).
    expect(typeof isPeopleMineRealIncomingEnabled()).toBe("boolean");
  });

  it("prepareRef + motion controller + cardsRef are not gated to visualScope my_plans", () => {
    expect(OVERLAY_SRC).toContain("mineMotionProbeRef={");
    expect(OVERLAY_SRC).toContain("mineProxyProgrammaticPrepareRef={");
    expect(OVERLAY_SRC).toContain("mineEdgeNavCardsRef={");
    expect(OVERLAY_SRC).not.toContain(
      "mineMotionSurfaceEnabled && visualScope === \"my_plans\""
    );
    expect(OVERLAY_SRC).not.toContain(
      "mineRealIncomingEnabled && visualScope === \"my_plans\""
    );
    expect(OVERLAY_SRC).toContain(
      "mineMotionSurfaceEnabled\n                          ? mineMotionProbeCtrlRef"
    );
    expect(OVERLAY_SRC).toContain(
      "mineMotionSurfaceEnabled\n                          ? mineProxyProgrammaticPrepareRef"
    );
    expect(OVERLAY_SRC).toContain(
      "mineRealIncomingEnabled\n                          ? mineEdgeNavCardsRef"
    );
    expect(OVERLAY_SRC).toContain(
      "mineMotionProbeCtrlRef.current.onFlightSettled = flushMineButtonPending"
    );
    expect(OVERLAY_SRC).toMatch(
      /cardsRef=\{\s*\n\s*mineRealIncomingEnabled \? mineEdgeNavCardsRef/
    );
  });

  it("carousel still owns jump prepare + real-incoming scroll writes for duoPresentation mine", () => {
    expect(CAROUSEL_SRC).toContain("mineButtonScrollJumpRef");
    expect(CAROUSEL_SRC).toContain("opts?.jump === true");
    expect(CAROUSEL_SRC).toContain("emblaApi.scrollTo(index, jump)");
    expect(CAROUSEL_SRC).toContain("writeMineIncomingRealSlideVisual");
    expect(CAROUSEL_SRC).toContain("mineRealIncomingEnabledRef");
    expect(CAROUSEL_SRC).toContain("unlockMineMotionProbeFlight");
    expect(OVERLAY_SRC).toContain('duoPresentation="mine"');
  });

  it("edge-button latch supports second and rapid hops after flush", () => {
    let latch = createMineButtonFlightLatch();
    const first = planMineButtonStep(latch, 1, 0, 5, true);
    expect(first.shouldNavigate).toBe(true);
    expect(first.latch.flightActive).toBe(true);
    latch = first.latch;

    // While in flight, queue a farther target (rapid tap).
    latch = queueMineButtonTarget(latch, 3, 5);
    expect(latch.pendingTarget).toBe(3);
    expect(latch.flightActive).toBe(true);

    // Settle/unlock path flushes next step.
    const flushed = flushMineButtonLatch(latch, 1, 5);
    expect(flushed.latch.flightActive).toBe(false);
    expect(flushed.nextStep).toBe(2);

    const second = planMineButtonStep(
      flushed.latch,
      flushed.nextStep!,
      1,
      5,
      true
    );
    expect(second.shouldNavigate).toBe(true);
    expect(second.latch.flightActive).toBe(true);
  });

  it("DEV proxy/probe fixtures remain my_plans-only", () => {
    expect(OVERLAY_SRC).toMatch(
      /mineIncomingProxyEnabled\s*=\s*\n\s*contentScope === "my_plans"/
    );
    expect(OVERLAY_SRC).toMatch(
      /mineMotionProbeEnabled\s*=\s*\n[\s\S]*?contentScope === "my_plans"/
    );
    expect(OVERLAY_SRC).toContain("isPeopleMineDevFixturesForced");
  });

  it("Discover note adapter uses description → canonical MineOpportunityNote", () => {
    expect(DUO_SRC).toContain("candidate.description");
    expect(DUO_SRC).toContain("note={note}");
    expect(DUO_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(CANONICAL_SRC).toContain("MineOpportunityNote");
    expect(CANONICAL_SRC).toContain("note={note}");
    expect(NOTE_WRAP_SRC).toContain('expansionMode="floating"');
    expect(NOTE_SRC).toContain("line-clamp-3");
    expect(NOTE_SRC).toContain("createPortal");
    // Empty description must not invent caption/bio as note.
    expect(DUO_SRC).not.toMatch(/note=\{[^}]*caption/);
    expect(DUO_SRC).not.toMatch(/note=\{[^}]*bio/);
  });

  it("non-empty Discover parity fixture note would render collapsed + floating path", () => {
    expect(DISCOVER_PARITY_NOTE_FIXTURE.trim().length).toBeGreaterThan(10);
    // Same collapsed shell Mine uses when note is truthy.
    expect(NOTE_SRC).toContain("line-clamp-3");
    expect(NOTE_SRC).toContain("{note ? (");
    expect(NOTE_SRC).toContain("sr-only");
    expect(NOTE_WRAP_SRC).toContain("resetKey");
    expect(CANONICAL_SRC).toContain("noteResetKey");
    expect(DUO_SRC).toContain("noteResetKey={candidate.opportunity_id}");
  });

  it("Plans and Groups remain outside canonical PairUp presentation", () => {
    expect(OPEN_PLANS_BODY).toContain('duoPresentation="mine"');
    expect(OPEN_PLANS_BODY).toContain("PeopleOpenPlanCandidateSlide");
    expect(OPEN_PLANS_BODY).toContain("plansPrepareRef");
    expect(PLANS_SLIDE).toContain("PeopleCanonicalCandidatePresentation");
    expect(GROUPS_BODY).not.toContain("PeopleCanonicalCandidatePresentation");
    expect(OVERLAY_SRC).toContain("GroupUpDeckBody");
    // Plans owns its motion controller (same production path), not Overlay PairUp latch.
    expect(OPEN_PLANS_BODY).toContain("createMineMotionProbeController");
    expect(OPEN_PLANS_BODY).toContain("plansRealIncomingEnabled");
  });
});
