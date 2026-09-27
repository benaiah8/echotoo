import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapDraftMediaOrderToPublished } from "./createDraftMediaOrder";
import { LOCAL_DRAFT_VIDEO_MEDIA_ID } from "./createDraftVideo/types";
import {
  GENERIC_PUBLISH_FAILED_MESSAGE,
  isCanonicalPublishedVideoMediaId,
  isPublishedVideoMediaIdRequiredError,
  PUBLISHED_VIDEO_MEDIA_ID_REQUIRED_MESSAGE,
  resolvePublishedVideoMediaId,
} from "./resolvePublishedVideoMediaId";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const REMOTE_MEDIA = "11111111-1111-4111-8111-111111111111";

describe("PASS PV1.1 — mediaId handoff", () => {
  it("A: fresh upload result mediaId is preferred", () => {
    const id = resolvePublishedVideoMediaId({
      uploadResultMediaId: REMOTE_MEDIA,
      draftRemoteMediaId: null,
      videoJobMediaId: LOCAL_DRAFT_VIDEO_MEDIA_ID,
    });
    expect(id).toBe(REMOTE_MEDIA);
  });

  it("B: reused remoteMediaId reaches resolver without upload return", () => {
    const id = resolvePublishedVideoMediaId({
      uploadResultMediaId: null,
      draftRemoteMediaId: REMOTE_MEDIA,
      videoJobMediaId: LOCAL_DRAFT_VIDEO_MEDIA_ID,
    });
    expect(id).toBe(REMOTE_MEDIA);
  });

  it("C: React state timing is not required (stale draft-local job ignored)", () => {
    const id = resolvePublishedVideoMediaId({
      uploadResultMediaId: REMOTE_MEDIA,
      draftRemoteMediaId: REMOTE_MEDIA,
      videoJobMediaId: LOCAL_DRAFT_VIDEO_MEDIA_ID,
    });
    expect(id).toBe(REMOTE_MEDIA);
    expect(isCanonicalPublishedVideoMediaId(LOCAL_DRAFT_VIDEO_MEDIA_ID)).toBe(
      false,
    );
  });

  it("D: video-only media_order gets post_media.id", () => {
    const order = mapDraftMediaOrderToPublished(
      [{ kind: "video", clientId: "local-1" }],
      REMOTE_MEDIA,
    );
    expect(order).toEqual([{ kind: "video", mediaId: REMOTE_MEDIA }]);
  });

  it("E: image → video → image exact order", () => {
    const order = mapDraftMediaOrderToPublished(
      [
        { kind: "image", clientId: "a", url: "https://cdn/a.jpg" },
        { kind: "video", clientId: "v" },
        { kind: "image", clientId: "b", url: "https://cdn/b.jpg" },
      ],
      REMOTE_MEDIA,
    );
    expect(order).toEqual([
      { kind: "image", url: "https://cdn/a.jpg" },
      { kind: "video", mediaId: REMOTE_MEDIA },
      { kind: "image", url: "https://cdn/b.jpg" },
    ]);
  });

  it("F: Bunny video id is never used as mediaOrder mediaId source", () => {
    // Handoff must prefer post_media.id from upload/draft remoteMediaId,
    // never DraftVideo.remoteVideoId (Bunny guid).
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain(
      "draftRemoteMediaId: readDraftVideoMeta()?.remoteMediaId",
    );
    expect(page).toContain("publishedVideoMediaId");
    expect(page).not.toMatch(
      /resolvePublishedVideoMediaId\(\{[\s\S]*remoteVideoId/,
    );
    const provider = read(
      "src/components/create/CreatePostMediaProvider.tsx",
    );
    expect(provider).toContain("mediaId: result.mediaId");
    expect(provider).not.toContain("mediaId: result.videoId");
  });

  it("G: localId / draft-local never used as mediaOrder mediaId", () => {
    expect(isCanonicalPublishedVideoMediaId(LOCAL_DRAFT_VIDEO_MEDIA_ID)).toBe(
      false,
    );
    expect(isCanonicalPublishedVideoMediaId("pending")).toBe(false);
    expect(
      resolvePublishedVideoMediaId({
        uploadResultMediaId: null,
        draftRemoteMediaId: null,
        videoJobMediaId: LOCAL_DRAFT_VIDEO_MEDIA_ID,
      }),
    ).toBeNull();
  });

  it("H: missing genuine mediaId still trips invariant", () => {
    expect(() =>
      mapDraftMediaOrderToPublished(
        [{ kind: "video", clientId: "v" }],
        null,
      ),
    ).toThrow(/Published video mediaId is required/);
    expect(
      isPublishedVideoMediaIdRequiredError(
        new Error(PUBLISHED_VIDEO_MEDIA_ID_REQUIRED_MESSAGE),
      ),
    ).toBe(true);
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("isPublishedVideoMediaIdRequiredError");
    expect(page).toContain("GENERIC_PUBLISH_FAILED_MESSAGE");
    expect(GENERIC_PUBLISH_FAILED_MESSAGE).toBe("Publish failed");
  });

  it("I/J: upload success + payload failure keeps remotes; retry skips forced re-upload", () => {
    const provider = read(
      "src/components/create/CreatePostMediaProvider.tsx",
    );
    // Cleanup only after successful publish path (not on create failure).
    expect(provider).toContain("cleanupDraftVideoAfterPublish");
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page.indexOf("cleanupDraftVideoAfterPublish")).toBeGreaterThan(
      page.indexOf("executeCreateFlowPublish"),
    );
    expect(page).toContain("needsPublishTimeVideoUpload(videoJob)");
    const needs = read("src/lib/createPostVideoUpload.ts");
    expect(needs).toContain("export function needsPublishTimeVideoUpload");
  });

  it("K: owner payload includes media_order + publishedVideoMediaId field", () => {
    const publish = read("src/lib/createFlowPublish.ts");
    expect(publish).toContain("media_order");
    expect(publish).toContain("publishedVideoMediaId");
    expect(publish).not.toMatch(/videoMediaId\?:/);
    const provider = read(
      "src/components/create/CreatePostMediaProvider.tsx",
    );
    expect(provider).toContain("return { ok: true, mediaId: result.mediaId }");
    expect(provider).toContain(
      "Return mediaId synchronously for this Publish transaction",
    );
  });
});

describe("PASS PV1.1 — publish progress pill", () => {
  it("L: Uploading media · N% label retained", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("Uploading media");
    expect(page).toContain("`Uploading media${pct}`");
  });

  it("M/N: progress pill fill + neutral (not error/red)", () => {
    const dialog = read("src/components/ui/ConfirmDialog.tsx");
    expect(dialog).toContain("data-publish-progress-pill");
    expect(dialog).toContain("rounded-full");
    expect(dialog).toContain("inlineAlertProgress");
    expect(dialog).toContain("width: `${pct}%`");
    expect(dialog).toContain("app-dark:bg-white");
    expect(dialog).toContain("bg-[var(--text)]");
    // Progress branch must not reuse danger red shell.
    const progressFnStart = dialog.indexOf("function PublishProgressPill");
    const progressFn = dialog.slice(progressFnStart, progressFnStart + 2500);
    expect(progressFn).not.toContain("border-red");
    expect(progressFn).not.toContain("text-red");
  });

  it("O/P: Cancel upload + busy CTA are pill-shaped", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("pillButtons");
    expect(page).toContain('"Cancel upload"');
    const dialog = read("src/components/ui/ConfirmDialog.tsx");
    expect(dialog).toContain('shape === "pill" ? "rounded-full"');
    expect(dialog).toContain('isLoading ? "Loading..."');
  });

  it("Q: UGC warning cards unchanged", () => {
    const page = read("src/pages/CreateFinalizePage.tsx");
    expect(page).toContain("No hashtags added");
    expect(page).not.toContain("No date added");
    expect(page).not.toContain("No location added");
    expect(page).toContain("PiWarning");
    expect(page).toContain("FINALIZE_PUBLISH_UGC_INLINE_ALERT_COPY");
    expect(page).toContain('inlineAlertVariant={');
    // UGC still uses danger path
    expect(page).toMatch(/publishModalUgcInline\s*\?\s*"danger"/);
  });

  it("R: dark/light contrast tokens covered", () => {
    const dialog = read("src/components/ui/ConfirmDialog.tsx");
    expect(dialog).toContain("app-dark:bg-white app-dark:text-neutral-950");
    expect(dialog).toContain("bg-[var(--text)] text-[var(--bg)]");
    expect(dialog).toContain("app-dark:border-white/30");
    expect(dialog).toContain("border-[var(--text)]/22");
  });
});
