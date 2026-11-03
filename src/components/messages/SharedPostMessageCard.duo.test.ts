import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import SharedPostMessageCard from "./SharedPostMessageCard";

const longTitle = "Evening walk along the river with a very long event title that must stay inside the card";

describe("SharedPostMessageCard layout", () => {
  it("renders an ordinary event without a Duo label or type icon", () => {
    const html = renderToStaticMarkup(
      createElement(SharedPostMessageCard, {
        status: "ready",
        data: {
          id: "post-1",
          post_type: "hangout",
          caption: longTitle,
          cover_url: "https://example.com/cover.jpg",
          location_name: "Park",
          schedule_label: "Today",
        },
      })
    );
    expect(html).not.toContain("Duo comment");
    expect(html).toContain("Event");
    expect(html).toContain("Today");
    expect(html).toContain(longTitle);
    expect(html).toContain("See post");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("self-stretch");
    expect(html).not.toContain("Duo comment");
  });

  it("renders a post type label without inventing a date", () => {
    const html = renderToStaticMarkup(
      createElement(SharedPostMessageCard, {
        status: "ready",
        data: {
          id: "post-2",
          post_type: "experience",
          caption: "Quiet cafe",
          cover_url: null,
          location_name: null,
          schedule_label: null,
        },
      })
    );
    expect(html).toContain("Post");
    expect(html).not.toContain("Today");
    expect(html).not.toContain("Duo comment");
  });

  it("keeps an unavailable post free of caption and media", () => {
    const html = renderToStaticMarkup(
      createElement(SharedPostMessageCard, {
        status: "unavailable",
        fallbackPostType: "experience",
      })
    );
    expect(html).toContain("unavailable");
    expect(html).not.toContain("Evening walk");
    expect(html).not.toContain("Duo comment");
    expect(html).not.toContain("object-cover");
  });
});

describe("SharedPostMessageCard source", () => {
  const src = readFileSync(
    join(__dirname, "SharedPostMessageCard.tsx"),
    "utf8"
  );

  it("uses a cover thumbnail and no type icon chip", () => {
    expect(src).toContain("RailCardImageBackdrop");
    expect(src).toContain("compact");
    expect(src).not.toContain("PostTypeMetaChip");
    expect(src).not.toContain("PiCalendarBlank");
    expect(src).toContain("schedule_label");
  });
});

describe("DirectMessagePage Duo comment placement", () => {
  const page = readFileSync(
    join(__dirname, "../../pages/messages/DirectMessagePage.tsx"),
    "utf8"
  );

  it("places the Duo label before the comment bubble and not on the card", () => {
    const shared = page.slice(page.indexOf("{isSharedPost ? ("));
    const labelAt = shared.indexOf("Duo comment");
    const noteAt = shared.indexOf("{sharedNote ? (");
    const cardAt = shared.indexOf("<SharedPostMessageCard");
    expect(labelAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(labelAt);
    expect(cardAt).toBeGreaterThan(noteAt);
    expect(shared).toContain("duoCommentFrameClass");
    expect(page).toContain("#f97316_0%,#eab308_20%,#22c55e_40%,#22d3ee_60%,#3b82f6_80%,#a855f7_100%");
    expect(page).toContain("bg-[var(--bg)]");
    expect(page).toContain("duoCommentBubbleClass(mine)");
    expect(page).not.toContain("from-orange-500 via-amber-400 to-yellow-300");
    expect(shared).not.toContain("duoComment=");
    expect(page).toContain('snap.origin === "duo"');
  });

  it("leaves ordinary text bubbles on the existing class", () => {
    expect(page).toContain("function dmTextBubbleClass");
    expect(page).toContain("<div className={dmTextBubbleClass(mine)}>");
  });
});
