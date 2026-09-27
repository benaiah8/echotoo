/**
 * Published immersive fullscreen — manual video-content rotate (not device orientation).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isManualVideoQuarterTurn,
  nextManualVideoRotateDeg,
  normalizeManualVideoRotateDeg,
  resolveManualVideoRotateFitStyle,
  shouldShowPublishedFullscreenVideoRotateControl,
  type ManualVideoRotateDeg,
} from "./publishedMedia/publishedFullscreenVideoManualRotate";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("publishedFullscreenVideoManualRotate helpers", () => {
  it("A: starts / normalizes to 0°", () => {
    expect(normalizeManualVideoRotateDeg(0)).toBe(0);
    expect(normalizeManualVideoRotateDeg(360)).toBe(0);
    expect(normalizeManualVideoRotateDeg(-90)).toBe(270);
  });

  it("B/C: tap cycle 0 → 90 → 180 → 270 → 0", () => {
    let deg: ManualVideoRotateDeg = 0;
    deg = nextManualVideoRotateDeg(deg);
    expect(deg).toBe(90);
    deg = nextManualVideoRotateDeg(deg);
    expect(deg).toBe(180);
    deg = nextManualVideoRotateDeg(deg);
    expect(deg).toBe(270);
    deg = nextManualVideoRotateDeg(deg);
    expect(deg).toBe(0);
  });

  it("N: 90°/270° swap fit dimensions to contain in viewport", () => {
    expect(isManualVideoQuarterTurn(90)).toBe(true);
    expect(isManualVideoQuarterTurn(270)).toBe(true);
    expect(isManualVideoQuarterTurn(0)).toBe(false);
    expect(isManualVideoQuarterTurn(180)).toBe(false);

    const fit90 = resolveManualVideoRotateFitStyle(90, 400, 800);
    expect(fit90.width).toBe(800);
    expect(fit90.height).toBe(400);
    expect(String(fit90.transform)).toContain("rotate(90deg)");

    const fit270 = resolveManualVideoRotateFitStyle(270, 400, 800);
    expect(fit270.width).toBe(800);
    expect(fit270.height).toBe(400);
    expect(String(fit270.transform)).toContain("rotate(270deg)");

    const fit0 = resolveManualVideoRotateFitStyle(0, 400, 800);
    expect(fit0.width).toBe(400);
    expect(fit0.height).toBe(800);
    expect(fit0.transform).toBeUndefined();

    const fit180 = resolveManualVideoRotateFitStyle(180, 400, 800);
    expect(fit180.width).toBe(400);
    expect(fit180.height).toBe(800);
    expect(String(fit180.transform)).toContain("rotate(180deg)");
  });

  it("I/J: rotate control only when open + active video", () => {
    expect(
      shouldShowPublishedFullscreenVideoRotateControl({
        open: true,
        activeIsVideo: true,
      }),
    ).toBe(true);
    expect(
      shouldShowPublishedFullscreenVideoRotateControl({
        open: true,
        activeIsVideo: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPublishedFullscreenVideoRotateControl({
        open: false,
        activeIsVideo: true,
      }),
    ).toBe(false);
  });
});

describe("published fullscreen manual rotate architecture", () => {
  it("viewer owns temporary state + reset on open/activeKey", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("manualVideoRotateDeg");
    expect(viewer).toContain("nextManualVideoRotateDeg");
    expect(viewer).toContain("shouldShowPublishedFullscreenVideoRotateControl");
    expect(viewer).toMatch(
      /useEffect\(\(\) => \{[\s\S]*setManualVideoRotateDeg\(0\)[\s\S]*\}, \[open, activeKey\]\)/,
    );
    expect(viewer).toContain("contentRotateDeg=");
    expect(viewer).toContain("onRequestContentRotate=");
  });

  it("D/E: rotation does not change player key / remount identity", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    // Swiper slides still keyed by media identity only.
    expect(viewer).toContain("key={item.key}");
    expect(viewer).not.toMatch(/key=\{[^}]*manualVideoRotate/);
    expect(viewer).not.toMatch(/key=\{[^}]*contentRotate/);
  });

  it("G/H: player rotates content layer only; chrome/spinner stay outside", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("data-published-video-content-rotate-layer");
    expect(player).toContain("data-published-video-content-rotate-stage");
    expect(player).toContain("resolveManualVideoRotateFitStyle");
    expect(player).toContain('aria-label="Rotate video"');
    expect(player).toContain("PiArrowClockwise");
    // Mute → Rotate vertical stack (placement below mute).
    expect(player).toContain("data-published-video-mute-rotate-stack");
    const muteIdx = player.indexOf("data-published-video-mute");
    const rotateIdx = player.indexOf("data-published-video-rotate");
    expect(muteIdx).toBeGreaterThan(-1);
    expect(rotateIdx).toBeGreaterThan(muteIdx);
    const layerOpen = player.indexOf("data-published-video-content-rotate-layer");
    const layerVideo = player.indexOf("<video", layerOpen);
    const spinner = player.indexOf("VideoPlaybackLoadingSpinner", layerOpen);
    expect(layerOpen).toBeGreaterThan(-1);
    expect(layerVideo).toBeGreaterThan(layerOpen);
    expect(spinner).toBeGreaterThan(layerVideo);
    const layerEnd = player.indexOf(
      "data-published-video-content-rotate-layer",
    );
    const afterLayerBlock = player.indexOf("</div>", player.indexOf("</video>", layerEnd));
    expect(spinner).toBeGreaterThan(afterLayerBlock);
    expect(player).toContain("VIDEO_FULLSCREEN_SCRUB_BOTTOM_CSS");
  });

  it("F: no playback seek/key change tied to rotate", () => {
    const player = read("src/components/detail/PublishedVideoPlayer.tsx");
    expect(player).toContain("contentRotateDeg = 0");
    // ResizeObserver may depend on contentRotateDeg; playback teardown must not.
    expect(player).not.toMatch(
      /tearDownPlayback[\s\S]{0,200}contentRotateDeg/,
    );
    expect(player).not.toMatch(
      /destroyHls[\s\S]{0,120}contentRotateDeg/,
    );
  });

  it("O: status-bar lifecycle unchanged by rotate", () => {
    const viewer = read("src/components/PublishedMediaFullscreenViewer.tsx");
    expect(viewer).toContain("enterPublishedImmersiveStatusBar");
    expect(viewer).toContain("exitPublishedImmersiveStatusBar");
    expect(viewer).not.toMatch(
      /manualVideoRotateDeg[\s\S]{0,120}enterPublishedImmersiveStatusBar/,
    );
    expect(viewer).not.toMatch(
      /manualVideoRotateDeg[\s\S]{0,120}exitPublishedImmersiveStatusBar/,
    );
    const helper = read("src/lib/publishedImmersiveStatusBar.ts");
    expect(helper).not.toContain("contentRotate");
    expect(helper).not.toContain("manualVideoRotate");
  });

  it("P: Create fullscreen unchanged (no manual content rotate)", () => {
    const createFs = read("src/lib/createFinalizeVideoFullscreen.ts");
    expect(createFs).not.toContain("manualVideoRotate");
    expect(createFs).not.toContain("contentRotateDeg");
    const createPlayer = read(
      "src/components/create/CreateFinalizeVideoPlayer.tsx",
    );
    expect(createPlayer).not.toContain("contentRotateDeg");
    expect(createPlayer).not.toContain("onRequestContentRotate");
  });

  it("Q: continuity / orientation config untouched", () => {
    for (const f of [
      "src/lib/publishedMedia/publishedVideoFeedDetailHandoff.ts",
      "src/lib/publishedMedia/publishedVideoHandoffRestore.ts",
      "src/lib/publishedMedia/publishedVideoPlaybackSnapshot.ts",
      "src/lib/publishedMedia/publishedListVideoCoordinator.ts",
    ]) {
      const src = read(f);
      expect(src).not.toContain("manualVideoRotate");
      expect(src).not.toContain("contentRotateDeg");
    }
    expect(read("package.json")).not.toContain("@capacitor/screen-orientation");
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).not.toContain("android:screenOrientation");
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toContain("UIInterfaceOrientationPortrait");
    expect(plist).toContain("UIInterfaceOrientationLandscapeLeft");
  });

  it("Detail/list surfaces do not wire rotate by default", () => {
    const carousel = read("src/components/detail/PublishedMediaCarousel.tsx");
    expect(carousel).not.toContain("onRequestContentRotate");
    expect(carousel).not.toContain("contentRotateDeg");
    const surface = read("src/components/PublishedMediaSurface.tsx");
    expect(surface).not.toContain("onRequestContentRotate");
  });
});
