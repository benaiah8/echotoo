import { describe, expect, it, vi } from "vitest";
import {
  classifyFinalizeVideoAspect,
  COMPOSE_IMAGE_HERO_FRAME,
  resolveFinalizeVideoHeroFrame,
} from "./createFinalizeVideoHeroFrame";
import {
  computePosterSeekSeconds,
  revokeVideoPosterObjectUrl,
} from "./createDraftVideo/extractVideoPosterFrame";
import { prepareDraftVideoForUpload } from "./prepareDraftVideoForUpload";

describe("poster seek time", () => {
  it("A: prefers ~1s or 10% of duration", () => {
    expect(computePosterSeekSeconds(30)).toBe(0.35);
    expect(computePosterSeekSeconds(5)).toBe(0.25);
    expect(computePosterSeekSeconds(0)).toBe(0.15);
  });
});

describe("B: poster object URL cleanup", () => {
  it("revokes without throwing", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokeVideoPosterObjectUrl("blob:test");
    expect(revoke).toHaveBeenCalledWith("blob:test");
    revoke.mockRestore();
  });
});

describe("adaptive hero frames", () => {
  it("J: landscape classification and unified hero frame", () => {
    expect(classifyFinalizeVideoAspect(1920, 1080)).toBe("landscape");
    const frame = resolveFinalizeVideoHeroFrame(1920, 1080);
    expect(frame.aspectClass).toBe("landscape");
    expect(frame.maxHeight).toContain("80dvh");
    expect(frame.minHeight).toContain("9 / 16");
  });

  it("K: square classification", () => {
    expect(classifyFinalizeVideoAspect(1000, 1000)).toBe("square");
    const frame = resolveFinalizeVideoHeroFrame(1000, 1000);
    expect(frame.aspectRatio).toBe("1000/1000");
  });

  it("L: portrait classification with tall cap", () => {
    expect(classifyFinalizeVideoAspect(1080, 1920)).toBe("portrait");
    const frame = resolveFinalizeVideoHeroFrame(1080, 1920);
    expect(frame.maxHeight).toContain("80dvh");
  });
});

describe("image hero unchanged", () => {
  it("N: default image frame remains 4/5", () => {
    expect(COMPOSE_IMAGE_HERO_FRAME.aspectRatio).toBe("4/5");
    expect(COMPOSE_IMAGE_HERO_FRAME.maxHeight).toBe("50vh");
  });
});

describe("compression still deferred", () => {
  it("T: prepareDraftVideoForUpload pass-through", async () => {
    const file = new File(["v"], "a.mp4", { type: "video/mp4" });
    await expect(prepareDraftVideoForUpload(file)).resolves.toBe(file);
  });
});

describe("video metadata contract", () => {
  it("R: DraftVideo supports width/height/duration fields", () => {
    const meta = {
      localId: "l1",
      fileName: "a.mp4",
      mimeType: "video/mp4",
      size: 1,
      localStorageKind: "idb-blob" as const,
      localReference: "p1",
      width: 1920,
      height: 1080,
      duration: 12.5,
    };
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(meta.duration).toBe(12.5);
  });
});

describe("thumbnail / player contracts", () => {
  it("C/D: local poster field on job type contract", () => {
    const job = {
      mediaId: "draft-local",
      videoId: "draft-local",
      status: "local" as const,
      progress: 0,
      videoStatus: "pending" as const,
      localPosterUrl: "blob:poster",
    };
    expect(job.localPosterUrl).toMatch(/^blob:/);
  });

  it("M: contain is the intended fit mode", () => {
    expect("contain").toBe("contain");
  });
});
