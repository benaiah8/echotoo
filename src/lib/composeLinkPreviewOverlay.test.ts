import { describe, expect, it } from "vitest";
import {
  COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS,
  COMPOSE_LINK_PREVIEW_TYPE_CLASS,
  composeTextHasLinkPreview,
} from "../components/ui/ComposeLinkPreviewOverlay";
import { tokenizeSafeHttpUrlsInText } from "./safeHttpUrlText";

describe("compose caption link preview", () => {
  it("detects preview-worthy captions", () => {
    expect(composeTextHasLinkPreview("hello")).toBe(false);
    expect(composeTextHasLinkPreview("Visit echo.too.com today")).toBe(true);
  });

  it("preview tokens keep exact matched text for overlay sync", () => {
    const segs = tokenizeSafeHttpUrlsInText("Go www.echotoo.com now");
    const url = segs.find((s) => s.kind === "url");
    expect(url).toMatchObject({
      kind: "url",
      value: "www.echotoo.com",
      href: "https://www.echotoo.com/",
    });
  });

  it("exports distinct caption vs section type classes", () => {
    expect(COMPOSE_LINK_PREVIEW_TYPE_CLASS).toBe(
      "create-finalize-caption-compose-type",
    );
    expect(COMPOSE_LINK_PREVIEW_SECTION_TYPE_CLASS).toBe(
      "create-finalize-section-compose-type",
    );
  });
});
