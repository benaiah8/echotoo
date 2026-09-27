import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_MINE_NOTE_COLLAPSED_LINES,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  computePeopleDiscoverCardMetrics,
} from "./peopleCandidateMediaPresentation";

const SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleOpenPlanCandidateSlide.tsx"),
  "utf8"
);
const SHARED_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleExpandableNote.tsx"),
  "utf8"
);
const COPY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/peopleUiCopy.ts"),
  "utf8"
);
const BODY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/OpenPlanDeckBody.tsx"),
  "utf8"
);
const DOCK_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleBottomDock.tsx"),
  "utf8"
);

describe("Plans content chrome → canonical (superseded stack removed)", () => {
  it("Plans slide is a thin adapter onto PeopleCanonicalCandidatePresentation", () => {
    expect(SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(SLIDE_SRC).toContain("identityVisible={false}");
    expect(SLIDE_SRC).not.toContain("data-people-plans-chrome");
    expect(SLIDE_SRC).not.toContain("PEOPLE_PLANS_CHROME_H_PX");
  });

  it("Plans note uses canonical floating expandable path", () => {
    expect(PEOPLE_MINE_NOTE_COLLAPSED_LINES).toBe(3);
    expect(PEOPLE_MINE_NOTE_RESERVE_H_PX).toBeGreaterThanOrEqual(70);
    expect(SHARED_SRC).toContain('expansionMode = "inline"');
    expect(SHARED_SRC).toContain('expansionMode === "floating"');
    expect(SLIDE_SRC).toContain("candidate.description");
    expect(BODY_SRC).toContain('duoPresentation="mine"');
  });

  it("privacy disclosure is not on compact action or Plans slide", () => {
    expect(COPY_SRC).toContain(
      "Requesting shares your name and photo with the host."
    );
    expect(BODY_SRC).not.toContain("openPlansPrivacyLine");
    expect(BODY_SRC).not.toContain("disclosure");
    expect(DOCK_SRC).not.toContain("data-people-shell-action-disclosure");
    expect(SLIDE_SRC).not.toContain("openPlansPrivacyLine");
  });

  it("no host identity / profile / Connect in Plans adapter", () => {
    expect(SLIDE_SRC).toContain("avatarUrl={null}");
    expect(SLIDE_SRC).toContain("identityVisible={false}");
    expect(SLIDE_SRC).toContain("onOpenProfile={undefined}");
    expect(SLIDE_SRC).not.toContain("Connect");
    expect(BODY_SRC).toContain("display_name: null");
    expect(BODY_SRC).toContain("username: null");
  });

  it("I'm down / Withdraw request path untouched in body", () => {
    expect(BODY_SRC).toContain("requestOpenPlan");
    expect(BODY_SRC).toContain("withdrawOpenPlanRequest");
    expect(BODY_SRC).toContain("identityVisibleToHost: true");
    expect(BODY_SRC).toContain("fixedRailsGeometry");
  });

  it("Plans live metrics use Mine chromeProfile (not Plans chrome reserve)", () => {
    const m = computePeopleDiscoverCardMetrics({
      hostW: 390,
      hostH: 844,
      reserveInFlowChrome: true,
      distributeVerticalSurplus: true,
      upwardPeekPad: true,
      fullWidthSlide: true,
      chromeProfile: "mine",
    });
    expect(m.fullWidthSlide).toBe(true);
    expect(BODY_SRC).toContain('duoPresentation="mine"');
  });
});
