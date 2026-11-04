/**
 * Discover help is icon-only: default ON, no auto intro, OFF prefs preserved.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Discover info panel (icon-only, no auto intro)", () => {
  const overlay = read("pages/people/MatchDeckOverlay.tsx");
  const nav = read("pages/people/PeopleFeedTopNav.tsx");
  const copy = read("pages/people/peopleUiCopy.ts");
  const pairUp = read("api/services/pairUp.ts");

  it("defaults Discover ON when preference is missing/null (explicit OFF stays OFF)", () => {
    expect(overlay).toContain("value !== false");
    expect(overlay).toContain("me?.p2p_discover_enabled !== false");
    expect(overlay).toContain(
      "Does not flip persistent Discover OFF preferences"
    );
    // Cache helper: only explicit false means disabled.
    expect(pairUp).toContain("existing.p2p_discover_enabled === false");
  });

  it("does not auto-open intro from Discover select / login gates", () => {
    expect(overlay).not.toContain("hasP2pDiscoverIntroSeen");
    expect(overlay).not.toContain("setP2pDiscoverIntroSeen");
    expect(overlay).not.toContain('setDiscoverDialog("intro")');
    expect(overlay).not.toContain("handleIntroContinue");
    expect(overlay).not.toContain("Meet people outside your plans");
    expect(overlay).not.toContain("Not now");
    expect(overlay).toContain('type DiscoverDialog = null | "info"');
    expect(overlay).toContain("handleDiscoverInfo");
    expect(overlay).toContain("dismissDiscoverInfo");
    expect(overlay).toContain('open={discoverDialog === "info"}');
    expect(overlay).toContain("hideCancel");
  });

  it("wires a single accessible info icon beside Discover", () => {
    expect(nav).toContain("onDiscoverInfo");
    expect(nav).toContain('data-people-discover-info="true"');
    expect(nav).toContain("PiInfo");
    expect(nav).toContain("peopleUiCopy.discoverInfoAria");
    expect(overlay).toContain("onDiscoverInfo={handleDiscoverInfo}");
    // Avoid a second Discover info control in the overlay chrome.
    expect(overlay.match(/onDiscoverInfo=/g)?.length ?? 0).toBe(1);
    expect(nav.match(/data-people-discover-info/g)?.length ?? 0).toBe(1);
  });

  it("uses the release help copy and closes on destination changes", () => {
    expect(peopleUiCopy.discoverInfoBody).toBe(
      "Discover helps you meet people beyond your existing plans. You can turn it on or off anytime in Profile Settings."
    );
    expect(peopleUiCopy.discoverInfoDismiss).toBe("Got it");
    expect(copy).toContain("discoverInfoBody");
    expect(overlay).toContain("peopleUiCopy.discoverInfoBody");
    // Navigation dismisses; does not re-open.
    expect(overlay).toMatch(
      /const selectDuoMode = useCallback\(\(\) => \{\s*setDiscoverDialog\(null\);/s
    );
    expect(overlay).toMatch(
      /const handleSelectOpenPlans = useCallback\(\(\) => \{\s*setDiscoverDialog\(null\);/s
    );
    expect(overlay).toMatch(
      /const selectGroupsMode = useCallback\(\(\) => \{\s*setDiscoverDialog\(null\);/s
    );
    expect(overlay).toContain("setDiscoverDialog(null)");
  });

  it("info panel does not call preference or fetch APIs", () => {
    const infoStart = overlay.indexOf("const handleDiscoverInfo");
    const infoEnd = overlay.indexOf("const dismissDiscoverInfo");
    expect(infoStart).toBeGreaterThan(-1);
    expect(infoEnd).toBeGreaterThan(infoStart);
    const infoBlock = overlay.slice(infoStart, infoEnd);
    expect(infoBlock).toContain('setDiscoverDialog("info")');
    expect(infoBlock).not.toContain("setP2pDiscoverEnabled");
    expect(infoBlock).not.toContain("enterDiscover");
    expect(infoBlock).not.toContain("onRequestDiscoverMount");
  });
});
