/**
 * PASS B.1.1 — scannable video validation toasts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE,
  VIDEO_READ_FAILED_USER_MESSAGE,
  VIDEO_TOO_LARGE_USER_MESSAGE,
  VIDEO_TOO_LONG_USER_MESSAGE,
  getCreateVideoValidationToastContent,
  isCreateVideoDurationOverLimit,
  MAX_CREATE_VIDEO_DURATION_SECONDS,
  MAX_CREATE_VIDEO_SOURCE_BYTES,
  messageForCreateVideoAcquisitionFailure,
} from "./createDraftVideo/createVideoConstraints";
import { ADD_VIDEO_FAILED_USER_MESSAGE } from "./createDraftVideo/localVideoAsset";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PASS B.1.1 — scannable video validation toasts", () => {
  it("A: TOO_LONG renders Video too long", () => {
    const content = getCreateVideoValidationToastContent("too_long");
    expect(content?.primary).toBe("Video too long");
  });

  it("B: TOO_LONG emphasizes 90 seconds max", () => {
    const content = getCreateVideoValidationToastContent("too_long");
    expect(content?.action).toBe("90 seconds max");
  });

  it("C: TOO_LARGE renders Video too large", () => {
    const content = getCreateVideoValidationToastContent("too_large");
    expect(content?.primary).toBe("Video too large");
  });

  it("D: TOO_LARGE emphasizes 200 MB max", () => {
    const content = getCreateVideoValidationToastContent("too_large");
    expect(content?.action).toBe("200 MB max");
  });

  it("E: unsupported renders Format not supported", () => {
    const content = getCreateVideoValidationToastContent("unsupported_format");
    expect(content?.primary).toBe("Format not supported");
  });

  it("F: unsupported emphasizes Use MP4 or MOV", () => {
    const content = getCreateVideoValidationToastContent("unsupported_format");
    expect(content?.action).toBe("Use MP4 or MOV");
  });

  it("G: generic read failure remains ordinary error copy", () => {
    expect(getCreateVideoValidationToastContent("read_failed")).toBeNull();
    expect(messageForCreateVideoAcquisitionFailure("read_failed")).toBe(
      VIDEO_READ_FAILED_USER_MESSAGE,
    );
    expect(VIDEO_READ_FAILED_USER_MESSAGE).toBe(
      "Couldn't read the selected media.",
    );
  });

  it("H: generic add failure remains ordinary error copy", () => {
    expect(getCreateVideoValidationToastContent("persist_failed")).toBeNull();
    expect(messageForCreateVideoAcquisitionFailure("persist_failed")).toBe(
      ADD_VIDEO_FAILED_USER_MESSAGE,
    );
    expect(ADD_VIDEO_FAILED_USER_MESSAGE).toBe(
      "Couldn't add this video. Please try again.",
    );
  });

  it("I: actionable value uses theme-aware accent treatment", () => {
    const toastSrc = read("src/lib/showCreateVideoValidationToast.tsx");
    expect(toastSrc).toContain("data-validation-action");
    expect(toastSrc).toContain("--create-accent-icon-fg");
    expect(toastSrc).toContain("--brand-readable");
  });

  it("J: validation toast has stronger theme-aware border", () => {
    const toastSrc = read("src/lib/showCreateVideoValidationToast.tsx");
    expect(toastSrc).toContain("data-create-video-validation-toast");
    expect(toastSrc).toContain("border");
    expect(toastSrc).toMatch(/white_40%|white\/40/);
  });

  it("K: light mode does not use white border", () => {
    const toastSrc = read("src/lib/showCreateVideoValidationToast.tsx");
    expect(toastSrc).toContain(
      "app-light:border-[color-mix(in_oklab,var(--text)_30%,transparent)]",
    );
    expect(toastSrc).not.toMatch(/app-light:border-white/);
  });

  it("L: full accessible message is preserved", () => {
    expect(getCreateVideoValidationToastContent("too_long")?.accessibleMessage)
      .toBe(VIDEO_TOO_LONG_USER_MESSAGE);
    expect(
      getCreateVideoValidationToastContent("too_large")?.accessibleMessage,
    ).toBe("Video is too large. Maximum 200 megabytes.");
    expect(
      getCreateVideoValidationToastContent("unsupported_format")
        ?.accessibleMessage,
    ).toBe(VIDEO_FORMAT_UNSUPPORTED_USER_MESSAGE);
    const toastSrc = read("src/lib/showCreateVideoValidationToast.tsx");
    expect(toastSrc).toContain("aria-label={structured.accessibleMessage}");
  });

  it("M: validation rules themselves unchanged", () => {
    expect(MAX_CREATE_VIDEO_DURATION_SECONDS).toBe(90);
    expect(isCreateVideoDurationOverLimit(90)).toBe(false);
    expect(isCreateVideoDurationOverLimit(91)).toBe(true);
    expect(MAX_CREATE_VIDEO_SOURCE_BYTES).toBe(200 * 1024 * 1024);
    expect(VIDEO_TOO_LONG_USER_MESSAGE).toBe(
      "Video is too long. Maximum 90 seconds.",
    );
    expect(VIDEO_TOO_LARGE_USER_MESSAGE).toBe(
      "Video is too large. Maximum 200 MB.",
    );
  });

  it("wired via typed reasons (not string parsing)", () => {
    const toastSrc = read("src/lib/showCreateVideoValidationToast.tsx");
    expect(toastSrc).toContain("getCreateVideoValidationToastContent(reason)");
    const picker = read("src/hooks/useCreatePostMediaPicker.tsx");
    expect(picker).toContain(
      "showCreateVideoValidationToast(videoFailure.reason)",
    );
    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain('showCreateVideoValidationToast("too_long")');
  });
});
