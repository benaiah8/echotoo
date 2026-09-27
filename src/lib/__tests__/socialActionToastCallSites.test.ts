import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("social action toast call-site wiring", () => {
  it("S: Event Duo join uses showPairUpJoinToast → showSocialActionToast", () => {
    const pair = readSrc("lib/showPairUpJoinToast.tsx");
    expect(pair).toContain("showSocialActionToast");
    expect(pair).toContain("pair-up-join:");
    expect(readSrc("hooks/useDuoSocialAction.ts")).toContain(
      "showPairUpJoinToast"
    );
    expect(readSrc("components/ui/PairUpActionButton.tsx")).toContain(
      "showPairUpJoinToast"
    );
  });

  it("T: Place/Open Plan create success uses showOpenPlanJoinToast", () => {
    const open = readSrc("lib/showOpenPlanJoinToast.tsx");
    expect(open).toContain("showSocialActionToast");
    expect(open).toContain("open-plan-join:");
    expect(open).toContain("openPlanCreateSuccessLead");
    expect(open).toContain("cancelOpenPlan");
    expect(open).not.toContain("openPlanJoinToastLead");
    expect(readSrc("components/ui/OpenPlanActiveOverlay.tsx")).toContain(
      "showOpenPlanJoinToast"
    );
    const copy = readSrc("pages/people/peopleUiCopy.ts");
    expect(copy).toContain(
      'openPlanCreateSuccess: "Your Open Plan is ready ✌️"'
    );
    expect(copy).not.toContain("Down to go here");
  });

  it("U/V: Source Groups request/withdrawn use shared helpers", () => {
    const group = readSrc("lib/showGroupUpRequestToast.tsx");
    expect(group).toContain("showSocialActionToast");
    expect(group).toContain("group-up-request:");
    expect(group).toContain("group-up-withdrawn:");
    expect(readSrc("lib/sourceGroupRequestActions.ts")).toContain(
      "showGroupUpRequestToast"
    );
    expect(readSrc("lib/sourceGroupRequestActions.ts")).toContain(
      "showGroupUpWithdrawnToast"
    );
  });

  it("W: People Groups request uses showGroupUpRequestToast", () => {
    expect(readSrc("pages/people/GroupUpDeckBody.tsx")).toContain(
      "showGroupUpRequestToast"
    );
  });

  it("X: People Connect remains generic top toast", () => {
    const deck = readSrc("pages/people/MatchDeckOverlay.tsx");
    expect(deck).toContain("toast.success");
    expect(deck).toContain("toast.error");
    expect(deck).not.toContain("showSocialActionToast");
    expect(deck).not.toContain("showPairUpJoinToast");
  });

  it("Y: Group Create/Manage remains generic top toast", () => {
    const overlay = readSrc("components/ui/GroupUpActiveOverlay.tsx");
    expect(overlay).toContain("toast.success");
    expect(overlay).toContain("toast.error");
    expect(overlay).not.toContain("showSocialActionToast");
    expect(overlay).not.toContain("showGroupUpRequestToast");
  });
});
