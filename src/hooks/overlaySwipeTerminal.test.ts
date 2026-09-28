/**
 * Overlay swipe terminal contract. Pure decisions plus source wiring.
 * vitest environment is node (no DOM renderer).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideContentSwipeTerminal,
  decideEdgeSwipeTerminal,
  writeOverlayTranslateRef,
} from "./overlaySwipeTerminal";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const CONTENT_THRESHOLD = 48;

function contentDecision(
  overrides: Partial<Parameters<typeof decideContentSwipeTerminal>[0]> = {},
) {
  return decideContentSwipeTerminal({
    alreadyClaimed: false,
    alreadyCommitted: false,
    mode: "horizontal",
    kind: "up",
    releaseDx: 20,
    commitThresholdPx: CONTENT_THRESHOLD,
    visualActive: true,
    ...overrides,
  });
}

describe("content swipe terminal", () => {
  it("A: short pointerup snaps fully open", () => {
    expect(contentDecision({ kind: "up", releaseDx: 20 })).toBe("snap");
  });

  it("B: short pointercancel snaps fully open", () => {
    expect(contentDecision({ kind: "interrupt", releaseDx: 20 })).toBe("snap");
  });

  it("C: short lost-pointer interruption snaps fully open", () => {
    expect(contentDecision({ kind: "interrupt", releaseDx: 16 })).toBe("snap");
  });

  it("D: interruption with no displacement only clears tracking", () => {
    expect(
      contentDecision({
        kind: "interrupt",
        mode: "undecided",
        releaseDx: 0,
        visualActive: false,
      }),
    ).toBe("clear");
  });

  it("E: pointerup past the threshold commits once", () => {
    expect(contentDecision({ kind: "up", releaseDx: 48 })).toBe("commit");
    expect(
      contentDecision({
        kind: "up",
        releaseDx: 48,
        alreadyCommitted: true,
      }),
    ).toBe("ignore");
  });

  it("F/G: a claimed or committed gesture ignores the follow-up lost pointer", () => {
    expect(
      contentDecision({ kind: "interrupt", releaseDx: 80, alreadyClaimed: true }),
    ).toBe("ignore");
    expect(
      contentDecision({
        kind: "interrupt",
        releaseDx: 80,
        alreadyCommitted: true,
      }),
    ).toBe("ignore");
  });

  it("does not commit merely because pointer ownership was lost", () => {
    expect(contentDecision({ kind: "interrupt", releaseDx: 200 })).toBe("snap");
  });

  it("I: after a snap the next gesture is not claimed", () => {
    let claimed = false;
    let commits = 0;
    const step = (kind: "up" | "interrupt", releaseDx: number) => {
      const decision = contentDecision({
        kind,
        releaseDx,
        alreadyClaimed: claimed,
        alreadyCommitted: commits > 0,
        visualActive: releaseDx > 0,
      });
      if (decision === "ignore") return decision;
      claimed = true;
      const reentry = contentDecision({
        kind: "interrupt",
        releaseDx,
        alreadyClaimed: claimed,
        alreadyCommitted: commits > 0,
        visualActive: true,
      });
      expect(reentry).toBe("ignore");
      if (decision === "commit") {
        commits += 1;
        return decision;
      }
      claimed = false;
      return decision;
    };

    expect(step("up", 20)).toBe("snap");
    expect(step("up", 12)).toBe("snap");
    expect(commits).toBe(0);
    expect(step("up", 80)).toBe("commit");
    expect(step("interrupt", 80)).toBe("ignore");
    expect(commits).toBe(1);
  });
});

describe("edge swipe terminal", () => {
  it("H: translate ref matches the latest drag distance before the decision", () => {
    const ref = { current: 0 };
    writeOverlayTranslateRef(ref, 40);
    writeOverlayTranslateRef(ref, 90);
    expect(ref.current).toBe(90);
    expect(
      decideEdgeSwipeTerminal({
        kind: "up",
        mode: "horizontal",
        translateX: ref.current,
        commitThresholdPx: 100,
        commitRatio: 0.87,
      }),
    ).toBe("commit");
  });

  it("K: edge release under the threshold stays fully open", () => {
    expect(
      decideEdgeSwipeTerminal({
        kind: "up",
        mode: "horizontal",
        translateX: 40,
        commitThresholdPx: 100,
        commitRatio: 0.87,
      }),
    ).toBe("snap");
  });

  it("L: edge release over the threshold commits once", () => {
    expect(
      decideEdgeSwipeTerminal({
        kind: "up",
        mode: "horizontal",
        translateX: 90,
        commitThresholdPx: 100,
        commitRatio: 0.87,
      }),
    ).toBe("commit");
  });

  it("an edge interruption snaps even past the threshold", () => {
    expect(
      decideEdgeSwipeTerminal({
        kind: "interrupt",
        mode: "horizontal",
        translateX: 200,
        commitThresholdPx: 100,
        commitRatio: 0.87,
      }),
    ).toBe("snap");
  });
});

describe("overlay swipe hook wiring", () => {
  const content = read("src/hooks/useOverlayContentSwipeDismiss.ts");
  const edge = read("src/hooks/useOverlayEdgeSwipeDismiss.ts");
  const detail = read("src/components/PostDetailModal.tsx");

  it("content swipe listens for cancel, lost capture, and touchcancel", () => {
    expect(content).toContain('e.type === "pointercancel" ? "interrupt"');
    expect(content).toContain(
      'window.addEventListener("lostpointercapture", onLostPointerCapture, true)',
    );
    expect(content).toContain(
      'window.addEventListener("touchcancel", onTouchCancel, true)',
    );
    expect(content).toContain("if (releasingCaptureRef.current) return;");
    expect(content).toContain("decideContentSwipeTerminal");
  });

  it("claims the terminal before releasePointerCapture and commits only once", () => {
    const finish = content.slice(
      content.indexOf("const finishGesture"),
      content.indexOf("const onWindowPointerMove"),
    );
    const claim = finish.indexOf("terminalClaimedRef.current = true");
    const release = finish.indexOf("releasePointerCapture(pointerId)");
    const commitFlag = finish.indexOf("committedRef.current = true");
    const commitCall = finish.indexOf("onSwipeCommitRef.current()");
    expect(claim).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(claim);
    expect(commitFlag).toBeGreaterThan(release);
    expect(commitCall).toBeGreaterThan(commitFlag);
    expect(finish).toContain("resetGestureTracking()");
    expect(finish.indexOf("resetGestureTracking()")).toBeLessThan(
      finish.indexOf('decision === "snap"'),
    );
  });

  it("J: snap-back still clears the visual flag with the existing transition timer", () => {
    expect(content).toContain("setTransitionMs(SNAP_BACK_MS)");
    expect(content).toContain("visualActiveRef.current = false");
    expect(content).toContain("setIsContentSwipeVisualActive(false)");
    expect(content.match(/setTimeout\(/g)?.length).toBe(2);
  });

  it("H: edge translate ref is written with the live value, not in an effect", () => {
    expect(edge).toContain("writeOverlayTranslateRef(translateRef, next)");
    expect(edge).not.toContain("translateRef.current = translateX");
    expect(edge).toContain("decideEdgeSwipeTerminal");
    expect(edge).toContain('endPointerGesture(e, "up")');
    expect(edge).toContain('endPointerGesture(e, "interrupt")');
    expect(edge).toContain("if (releasingCaptureRef.current) return;");
    expect(edge).toContain("onTouchCancel:");
    expect(edge.match(/setTimeout\(/g)?.length).toBe(2);
  });

  it("M/N: Post Detail carousel and comment exclusions are unchanged", () => {
    expect(detail).toContain('"[data-carousel-control]"');
    expect(detail).toContain('"[data-carousel-control] *"');
    expect(detail).toContain('"[data-no-overlay-swipe]"');
    expect(detail).toContain('"textarea"');
    expect(detail).toContain("commitThresholdPx: 48");
    expect(detail).toContain("horizontalLockPx: 12");
    expect(content).toContain("const VERTICAL_SLOP_PX = 20");
    expect(content).toContain("const VERTICAL_DOMINANCE_OVER_DX = 1.5");
  });

  it("O/Q: Android Back and dismiss navigation stay in Post Detail", () => {
    expect(detail).toContain("subscribeAndroidPostDetailModalBack");
    expect(detail).toContain("playAnimatedDismissRef.current()");
    expect(content).not.toContain("useNavigate");
    expect(edge).not.toContain("useNavigate");
    expect(content).not.toContain("history.push");
    expect(edge).not.toContain("history.push");
  });

  it("P: no fallback timeout was added to either hook", () => {
    expect(content).not.toMatch(/setTimeout\(\(\) => \{\s*setTranslateX\(0\)/);
    expect(edge).not.toMatch(/setTimeout\(\(\) => \{\s*setTranslateX\(0\)/);
  });

  it("I: a committed content swipe blocks the next pointerdown; a snap does not", () => {
    expect(content).toContain('emitDebug("skip", { reason: "committed" })');
    expect(content).toContain("terminalClaimedRef.current = false");
    expect(content).toContain("clearSnapBackTimer()");
  });
});
