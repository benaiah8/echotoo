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
  it("production real-incoming is Duo Embla only (Discover is vertical)", () => {
    expect(OVERLAY_SRC).toContain("isPeopleMineRealIncomingEnabled()");
    expect(OVERLAY_SRC).toMatch(
      /mineRealIncomingEnabled\s*=\s*\n\s*contentScope === "my_plans"/
    );
    // Prod flag helper defaults on (DEV may override via localStorage).
    expect(typeof isPeopleMineRealIncomingEnabled()).toBe("boolean");
  });

  it("hybrid: Discover vertical person rows; Duo remounts MatchDeckCarousel", () => {
    expect(OVERLAY_SRC).toContain("PeopleFeedList");
    expect(OVERLAY_SRC).toContain("PeopleDiscoverPersonRow");
    expect(OVERLAY_SRC).toContain("PeopleDiscoverOpportunityBox");
    expect(OVERLAY_SRC).toContain("groupDiscoverOpportunities");
    expect(OVERLAY_SRC).toContain("<MatchDeckCarousel");
    expect(OVERLAY_SRC).toContain("PeopleDuoCandidateSlide");
    expect(OVERLAY_SRC).toContain('data-people-duo-deck="true"');
    expect(OVERLAY_SRC).toContain("handleFeedHeart");
    expect(OVERLAY_SRC).toContain("handleFeedMessage");
    expect(OVERLAY_SRC).toContain("<MineAtmosphereCrossfade");
    expect(OVERLAY_SRC).toContain("isDuoAtmosphereScope");
    expect(OVERLAY_SRC).toContain("<PeopleBottomDock");
    expect(OVERLAY_SRC).toContain("hideCategoryNav");
  });

  it("MatchDeckCarousel retains jump/scroll helpers for Duo isolation", () => {
    expect(CAROUSEL_SRC).toContain("mineButtonScrollJumpRef");
    expect(CAROUSEL_SRC).toContain("opts?.jump === true");
    expect(CAROUSEL_SRC).toContain("emblaApi.scrollTo(index, jump)");
    expect(CAROUSEL_SRC).toContain("writeMineIncomingRealSlideVisual");
    expect(CAROUSEL_SRC).toContain("mineRealIncomingEnabledRef");
    expect(CAROUSEL_SRC).toContain("unlockMineMotionProbeFlight");
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

  it("Plans and Groups use feed rows; PairUp Connect stays Duo/Discover", () => {
    expect(OPEN_PLANS_BODY).toContain("PeopleFeedList");
    expect(OPEN_PLANS_BODY).toContain("PeopleOpenPlanFeedCard");
    expect(OPEN_PLANS_BODY).toContain("requestOpenPlan");
    expect(PLANS_SLIDE).toContain("PeopleCanonicalCandidatePresentation");
    expect(GROUPS_BODY).toContain("PeopleFeedList");
    expect(GROUPS_BODY).toContain("requestGroupUp");
    expect(OVERLAY_SRC).toContain("GroupUpDeckBody");
    expect(OVERLAY_SRC).toContain("runMinePairUpConnect");
  });
});
