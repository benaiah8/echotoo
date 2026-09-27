import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SOCIAL_ACTION_TOAST_EXIT_MS,
  SOCIAL_ACTION_TOAST_VERTICAL_DOMINANCE,
  SOCIAL_ACTION_TOAST_VERTICAL_MIN_PX,
  isSocialActionToastControlTarget,
  resolveSocialActionToastVerticalDismiss,
} from "../social/socialActionToastSwipe";

describe("socialActionToastSwipe vertical-only", () => {
  it("thresholds", () => {
    expect(SOCIAL_ACTION_TOAST_VERTICAL_MIN_PX).toBe(40);
    expect(SOCIAL_ACTION_TOAST_VERTICAL_DOMINANCE).toBe(1.15);
    expect(SOCIAL_ACTION_TOAST_EXIT_MS).toBe(200);
  });

  it("D: upward valid swipe dismisses", () => {
    expect(resolveSocialActionToastVerticalDismiss(0, -40)).toBe("up");
    expect(resolveSocialActionToastVerticalDismiss(5, -50)).toBe("up");
  });

  it("E: downward valid swipe dismisses", () => {
    expect(resolveSocialActionToastVerticalDismiss(0, 40)).toBe("down");
    expect(resolveSocialActionToastVerticalDismiss(-8, 50)).toBe("down");
  });

  it("F: horizontal swipe does NOT dismiss", () => {
    expect(resolveSocialActionToastVerticalDismiss(-50, 0)).toBeNull();
    expect(resolveSocialActionToastVerticalDismiss(50, 5)).toBeNull();
  });

  it("G: diagonal-horizontal does not dismiss", () => {
    /* dy 40, dx 40 → 40 <= 40*1.15 */
    expect(resolveSocialActionToastVerticalDismiss(40, 40)).toBeNull();
    expect(resolveSocialActionToastVerticalDismiss(35, -40)).toBeNull();
  });

  it("H: short vertical movement does not dismiss", () => {
    expect(resolveSocialActionToastVerticalDismiss(0, -39)).toBeNull();
    expect(resolveSocialActionToastVerticalDismiss(0, 20)).toBeNull();
  });

  it("dominance allows clear vertical with small horizontal noise", () => {
    /* 50 > 20 * 1.15 */
    expect(resolveSocialActionToastVerticalDismiss(20, -50)).toBe("up");
  });

  it("P: action-button targets detected", () => {
    const makeEl = (closestHit: Element | null) =>
      ({
        closest: () => closestHit,
      }) as unknown as Element;
    expect(isSocialActionToastControlTarget(makeEl({} as Element))).toBe(true);
    expect(isSocialActionToastControlTarget(makeEl(null))).toBe(false);
  });
});

describe("SocialActionToast vertical + X contracts", () => {
  const src = readFileSync(
    resolve(__dirname, "../../components/social/SocialActionToast.tsx"),
    "utf8"
  );
  const swipeSrc = readFileSync(
    resolve(__dirname, "../social/socialActionToastSwipe.ts"),
    "utf8"
  );
  const callSites = readFileSync(
    resolve(__dirname, "./socialActionToastCallSites.test.ts"),
    "utf8"
  );

  it("A: X renders", () => {
    expect(src).toMatch(/social-action-toast-close/);
    expect(src).toMatch(/aria-label="Dismiss"/);
    expect(src).toMatch(/PiX/);
  });

  it("B/C: X uses dismiss path only (beginVerticalExit / onDismiss)", () => {
    expect(src).toMatch(/handleCloseClick/);
    expect(src).toMatch(/beginVerticalExit\("up"\)/);
  });

  it("J/K: exiting-up / exiting-down states", () => {
    expect(src).toMatch(/social-action-toast--exiting-up/);
    expect(src).toMatch(/social-action-toast--exiting-down/);
  });

  it("free-drag / axis-lock / distance-dismiss removed", () => {
    expect(swipeSrc).not.toMatch(/AXIS_LOCK|DISMISS_DISTANCE_PX|freezeX|shouldDismissSocialActionToast/);
    expect(src).not.toMatch(/freezeX|freezeY|shouldDismissSocialActionToast/);
    expect(src).not.toMatch(/social-action-toast--dragging/);
    expect(swipeSrc).toMatch(/resolveSocialActionToastVerticalDismiss/);
  });

  it("Q: text clipping fix remains", () => {
    expect(src).not.toMatch(/leading-none/);
    expect(src).not.toMatch(/\btruncate\b/);
    expect(src).toMatch(/leading-\[1\.25\]/);
    expect(src).toMatch(/overflow-x-hidden/);
    expect(src).toMatch(/py-0\.5/);
  });

  it("R: generic top toast call-site tests still exist", () => {
    expect(callSites).toMatch(/People Connect remains generic/);
    expect(callSites).toMatch(/Group Create\/Manage remains generic/);
  });
});
