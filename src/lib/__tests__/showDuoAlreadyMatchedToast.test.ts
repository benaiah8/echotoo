import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import { peopleDuoModernScrollTopInset } from "../people/peopleFeedLayout";
import {
  DUO_ALREADY_MATCHED_TOAST_ID,
  DUO_ALREADY_MATCHED_TOAST_TOP,
  DUO_ALREADY_MATCHED_TOASTER_ID,
} from "../showDuoAlreadyMatchedToast";
import {
  SOCIAL_ACTION_TOAST_DURATION_MS,
  SOCIAL_ACTION_TOASTER_ID,
} from "../showSocialActionToast";
import { DISCOVER_PREF_TOASTER_ID } from "../showDiscoverPrefToast";

const root = resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("showDuoAlreadyMatchedToast", () => {
  it("uses compact SocialActionToast on a dedicated top host below People nav", () => {
    const helper = readSrc("lib/showDuoAlreadyMatchedToast.tsx");
    expect(helper).toContain("showSocialActionToast");
    expect(helper).toContain('variant: "compact"');
    expect(helper).toContain('position: "top-center"');
    expect(helper).toContain("DUO_ALREADY_MATCHED_TOASTER_ID");
    expect(helper).toContain("PiCheckCircleFill");
    expect(helper).toContain("brand-readable");
    expect(helper).not.toContain("primaryAction");
    expect(helper).not.toContain("duo-match-toast-wash");
    expect(helper).not.toContain("duo-match-toast-ripple");
    expect(helper).not.toMatch(/\btoast\.error\s*\(/);
    expect(DUO_ALREADY_MATCHED_TOASTER_ID).toBe("duo-already-matched");
    expect(DUO_ALREADY_MATCHED_TOAST_ID).toBe("duo-already-matched-notice");
    expect(DUO_ALREADY_MATCHED_TOASTER_ID).not.toBe(SOCIAL_ACTION_TOASTER_ID);
    expect(DUO_ALREADY_MATCHED_TOASTER_ID).not.toBe(DISCOVER_PREF_TOASTER_ID);
    expect(DUO_ALREADY_MATCHED_TOAST_TOP).toBe(
      `calc(${peopleDuoModernScrollTopInset()} + 8px)`
    );
    expect(helper).toContain("SOCIAL_ACTION_TOAST_DURATION_MS");
    expect(SOCIAL_ACTION_TOAST_DURATION_MS).toBe(6500);
  });

  it("wires AppFloatingChrome host and Overlay presentation without toast.error", () => {
    const chrome = readSrc("components/AppFloatingChrome.tsx");
    expect(chrome).toContain("DUO_ALREADY_MATCHED_TOASTER_ID");
    expect(chrome).toContain("DUO_ALREADY_MATCHED_TOAST_TOP");
    expect(chrome).toMatch(
      /toasterId=\{DUO_ALREADY_MATCHED_TOASTER_ID\}[\s\S]*duration: 6500/
    );

    const overlay = readSrc("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).toContain("showDuoAlreadyMatchedToast");
    expect(overlay).not.toContain("toast.error(peopleUiCopy.duoHeartMatched)");
    expect(overlay.match(/showDuoAlreadyMatchedToast\(/g)).toHaveLength(1);
    expect(peopleUiCopy.duoHeartMatched).toBe("You're already matched!");
  });

  it("keeps real Duo withdrawal failures on OrdinaryError toast.error", () => {
    const overlay = readSrc("pages/people/MatchDeckOverlay.tsx");
    const start = overlay.indexOf("const withdrawDuoHeart");
    const end = overlay.indexOf("const handleConnect");
    const handler = overlay.slice(start, end);
    expect(handler).toContain("toast.error(peopleUiCopy.duoHeartDiscoverSourced)");
    expect(handler).toContain("peopleUiCopy.duoHeartWithdrawError");
    expect(handler).toContain("peopleUiCopy.deckConnectUnavailable");
  });
});
