/**
 * Duo-modern portrait paint gating and first-paint loader contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("peopleDuoPortraitPaint", () => {
  it("photosKey resets front and slot paint readiness", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    const reset = media.slice(media.indexOf("Person / photo-list change"));
    expect(reset).toContain("setFrontPaintReady(false)");
    expect(reset).toContain("setSlotPaintReady(new Set())");
    expect(reset).toContain("setMineFailedPhotos(new Set())");
  });

  it("unready stack photos stay mounted but opacity-gated", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain('slotReady ? "" : "opacity-0"');
    expect(media).toContain('data-people-duo-photo-paint-ready={slotReady ? "true" : "false"}');
    expect(media).toContain("loading={loadAttrs.loading}");
    expect(media).toContain("mineStackImageLoadingAttrs");
    expect(media).toContain("bindImgNode");
    expect(media).toContain("applyMineStackImgNode");
  });

  it("current front-only first-paint loader is distinct from tap-pending", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("data-people-duo-front-paint-loading");
    expect(media).toContain("showDuoFrontPaintLoader");
    expect(media).toContain("phase !== \"pending\"");
    expect(media).toContain("data-people-mine-photo-pending");
    expect(media).toContain('role === "front"');
    expect(media).toContain("mineStackPose === \"duoModern\"");
    expect(media).not.toMatch(
      /showDuoFrontPaintLoader[\s\S]{0,200}role !== "front"/
    );
  });

  it("reduced-motion loader uses CSS static shimmer, not a spinner", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    const css = read("index.css");
    const start = media.indexOf("function DuoFrontPaintLoader");
    const end = media.indexOf("export default function PeopleCandidateMedia");
    const loader = media.slice(start, end);
    expect(loader).toContain("people-duo-portrait-shimmer");
    expect(loader).toContain("data-people-duo-front-paint-pulse");
    expect(loader).toContain("data-people-duo-front-paint-shimmer");
    expect(loader).not.toContain("animate-spin");
    expect(loader).not.toContain("animate-pulse");
    expect(css).toContain(".people-duo-portrait-shimmer");
    expect(css).toContain("animation: social-shelf-resolving-shimmer");
    const duoReduce = css.slice(css.lastIndexOf("people-duo-portrait-shimmer::before"));
    expect(duoReduce).toContain("animation: none");
    expect(duoReduce).toContain("color-mix(in oklab, var(--text) 22%, transparent)");
  });

  it("Echo and legacy Duo paths gate on mounted paint, not URL existence", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("duoModernPaintGate");
    expect(media).toContain("legacyFacePaintReady");
    expect(media).toContain("data-people-duo-echo-paint-ready");
    expect(media).toContain("data-people-duo-legacy-paint-ready");
    expect(media).toContain("isMountedPhotoPaintReady(node)");
    expect(media).not.toContain(
      "const ready = Boolean(path && avatarDisplayUrl(path))"
    );
  });

  it("intentional empty / missing Echo src does not keep a loader", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("EmptyFallback");
    expect(media).toContain("if (!src)");
    expect(media).toContain("onMineAtmosphereChange({");
    expect(media).toContain("ready: true");
  });

  it("failed photo leaves loading and uses existing Echo/empty fallback", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("mineFailedPhotos");
    expect(media).toContain("setMineLegacyFailed(true)");
    expect(media).toContain("FeedEchoCompact");
    expect(media).toContain("paintGate={mineStackPose === \"duoModern\"}");
  });

  it("does not treat warm-cache as paint-ready", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain(
      "Do not treat warm-cache alone as ready; only the real element counts."
    );
    expect(media).toContain("isMountedPhotoPaintReady");
    expect(media).not.toContain("isMineFrontUrlWarmed");
  });

  it("swipe, stack, scroll, and wash tokens stay frozen", () => {
    const pres = read("lib/people/peopleCandidateMediaPresentation.ts");
    const row = read("components/people/PeopleDuoBottomActionRow.tsx");
    expect(pres).toContain("PEOPLE_DUO_MODERN_SCENE_BLUR_PX = 9.6");
    expect(pres).toContain("PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE");
    expect(row).toContain("var(--bg)_90%");
    expect(row).toContain("var(--app-canvas)_90%");
    expect(pres).toContain("peopleDuoModernCardOpacity");
    expect(pres).toContain("peopleDuoModernCardTransform");
  });
});
