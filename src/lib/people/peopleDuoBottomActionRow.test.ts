/**
 * Duo bottom Heart/Comment — shared PeopleActionStateButton at 52px.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (node: unknown) => node,
  };
});

import PeopleDuoBottomActionRow from "../../components/people/PeopleDuoBottomActionRow";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const base = {
  canGoPrev: true,
  canGoNext: true,
  onPrev: () => {},
  onNext: () => {},
  connectLabel: "Connect",
  heartState: "idle" as const,
  onHeart: () => {},
  messageLabel: "Message",
  onMessage: () => {},
};

describe("PeopleDuoBottomActionRow shared actions", () => {
  it("renders idle Heart and Comment via PeopleActionStateButton at 52px", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleDuoBottomActionRow, base)
    );
    expect(html).toContain("data-people-duo-bottom-action-row");
    expect(html).toContain("data-people-duo-heart-comment-pill");
    expect(html).toContain('data-people-action-kind="heart"');
    expect(html).toContain('data-people-action-kind="comment"');
    expect(html).toContain('data-people-action-size="52"');
    expect(html).toContain('data-people-action-state="idle"');
    expect(html).toContain('data-people-action-icon="outline"');
    expect(html).toContain("bg-[var(--text)]/10");
    expect(html).not.toContain("var(--brand)_96%");
    expect(html).not.toContain("YELLOW_ACTION");
  });

  it("shows active Heart and sent Comment chrome", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleDuoBottomActionRow, {
        ...base,
        heartState: "active",
        commentState: "active",
        commentConfirmedState: "active",
      })
    );
    expect(html).toContain('data-people-action-kind="heart"');
    expect(html).toContain('data-people-action-visual="active"');
    expect(html).toContain("text-[rgb(225,29,72)]");
    expect(html).toContain("text-black");
    expect(html).toContain('data-people-action-icon="fill"');
  });

  it("maps busy Heart to pending and keeps confirmed active icon", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleDuoBottomActionRow, {
        ...base,
        heartState: "busy",
      })
    );
    expect(html).toContain('data-people-action-state="pending"');
    expect(html).toContain("shadow-[inset_0_0_0_1px_currentColor]");
  });

  it("disables Comment when messageDisabled without inventing a sent state", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleDuoBottomActionRow, {
        ...base,
        messageDisabled: true,
      })
    );
    expect(html).toContain('data-people-action-kind="comment"');
    expect(html).toContain('data-people-action-state="disabled"');
    expect(html).not.toMatch(
      /data-people-action-kind="comment"[^>]*data-people-action-visual="active"/
    );
  });

  it("preserves nav, wash, and portal layout; does not own comment store", () => {
    const src = read("components/people/PeopleDuoBottomActionRow.tsx");
    expect(src).toContain("PeopleActionStateButton");
    expect(src).toContain("size={52}");
    expect(src).toContain("h-[52px]");
    expect(src).toContain("createPortal");
    expect(src).toContain("data-people-duo-action-cluster-wash");
    expect(src).toContain("data-people-duo-nav-feedback");
    expect(src).toContain("NAV_SLOT_PX = 48");
    expect(src).not.toContain("duoCommentState");
    expect(src).not.toContain("routeDuoCommentTap");
    expect(src).not.toContain("YELLOW_ACTION");
    expect(src).not.toContain("unlike");
    expect(src).not.toContain("withdraw");
  });

  it("leaves Overlay handlers and PeopleActionStateButton ownership untouched", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const btn = read("components/people/PeopleActionStateButton.tsx");
    const css = read("components/people/PeopleActionStateButton.css");
    expect(overlay).toContain("PeopleDuoBottomActionRow");
    expect(overlay).toContain("onHeart={() => {");
    expect(overlay).toContain("handleConnect");
    expect(overlay).toContain("handleFeedMessage");
    expect(overlay).toContain("duoCommentVisual");
    expect(overlay).toContain("applyDuoCommentListFlags");
    expect(overlay).toContain("commentState={duoBottomCommentVisual.state}");
    expect(overlay).toContain(
      "commentConfirmedState={duoBottomCommentVisual.confirmedState}"
    );
    expect(overlay).toContain("messageBusy={duoBottomCommentBusy}");
    expect(overlay).toContain("duoBottomCommentVisual.disabled");
    expect(overlay).toContain("current.duo_commented_by_me");
    expect(overlay).toContain("current?.viewer_has_active_pair_up");
    expect(btn).toContain("people-action-ripple");
    expect(css).toContain("520ms");
  });
});
