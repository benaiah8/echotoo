import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Open Plan requester identity disclosure", () => {
  it("keeps copy + request identityVisibleToHost; compact action has no disclosure line", () => {
    const copy = read("src/pages/people/peopleUiCopy.ts");
    expect(copy).toContain(
      "Requesting shares your name and photo with the host."
    );
    expect(copy).toContain('openPlanRequesterNameHidden: "Name hidden"');
    expect(copy).not.toContain(
      "Identity is revealed if your request is accepted."
    );

    // Legacy card surface may still show the line; deck compact CTA does not.
    const deck = read("src/pages/people/OpenPlanDeckCard.tsx");
    expect(deck).toContain("openPlansPrivacyLine");

    const body = read("src/pages/people/OpenPlanDeckBody.tsx");
    const dock = read("src/pages/people/PeopleBottomDock.tsx");
    expect(body).not.toContain("openPlansPrivacyLine");
    expect(dock).not.toContain("data-people-shell-action-disclosure");

    expect(body).toContain("identityVisibleToHost: true");
    expect(body).toContain("requestOpenPlan(id,");
  });
});
