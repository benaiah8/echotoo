/**
 * Match-context presentation — Duo/P2P + Open Plan shared marker.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatchContextSnapshot } from "../../api/services/messaging";
import MatchContextMessage from "./MatchContextMessage";

function snap(
  partial: Partial<MatchContextSnapshot> & Pick<MatchContextSnapshot, "subtype">
): MatchContextSnapshot {
  return {
    v: 1,
    caption: "",
    occurs_at: null,
    ...partial,
  };
}

function markup(snapshot: MatchContextSnapshot): string {
  return renderToStaticMarkup(
    createElement(MatchContextMessage, { snapshot })
  );
}

describe("MatchContextMessage", () => {
  it("shows the Duo P2P title", () => {
    const html = markup(
      snap({ subtype: "pair_up_match", caption: "Sunset walk" })
    );
    expect(html).toContain("You matched through P2P");
    expect(html).not.toContain("You&#x27;ve connected on this plan");
    expect(html).toContain('data-match-context-subtype="pair_up_match"');
    expect(html).toContain('data-match-context-title="true"');
  });

  it("shows the Open Plan title", () => {
    const html = markup(
      snap({
        subtype: "open_plan_match",
        caption: "Coffee near campus",
        occurs_at: "2026-11-04T16:00:00.000Z",
      })
    );
    // renderToStaticMarkup escapes apostrophe as &#x27;
    expect(html).toContain("You&#x27;ve connected on this plan");
    expect(html).not.toContain("You matched through P2P");
    expect(html).not.toContain("You matched on this Open Plan");
    expect(html).toContain('data-match-context-subtype="open_plan_match"');
  });

  it("clamps captions to two lines with smaller muted regular-weight type", () => {
    const long =
      "Line one of a long source caption that should wrap.\nLine two continues the story.\nLine three is still visible.\nLine four must be truncated by the clamp.";
    const html = markup(snap({ subtype: "pair_up_match", caption: long }));
    expect(html).toContain("line-clamp-2");
    expect(html).not.toContain("line-clamp-3");
    expect(html).toContain('data-match-context-caption="true"');
    expect(html).toContain("Line one of a long source caption");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("text-xs");
    expect(html).toContain("font-normal");
    expect(html).not.toContain("font-medium");
    expect(html).not.toContain("font-semibold leading-snug [overflow-wrap");
    expect(html).toContain("text-[var(--text)]/55");
    expect(html).toContain("app-dark:text-[var(--text)]/58");
  });

  it("omits the caption block when the snapshot caption is empty", () => {
    const html = markup(snap({ subtype: "pair_up_match", caption: "   " }));
    expect(html).toContain("You matched through P2P");
    expect(html).not.toContain("data-match-context-caption");
    expect(html).not.toContain("data-match-context-schedule");
  });

  it("shows an Open Plan schedule label subordinate to the title", () => {
    const html = markup(
      snap({
        subtype: "open_plan_match",
        caption: "Market morning",
        occurs_at: "2026-11-04T16:00:00.000Z",
      })
    );
    expect(html).toContain('data-match-context-schedule="true"');
    expect(html).toContain("tabular-nums");
    expect(html).toMatch(/Nov/);
    const titleIdx = html.indexOf('data-match-context-title="true"');
    const captionIdx = html.indexOf('data-match-context-caption="true"');
    const scheduleIdx = html.indexOf('data-match-context-schedule="true"');
    expect(titleIdx).toBeGreaterThan(0);
    expect(captionIdx).toBeGreaterThan(titleIdx);
    expect(scheduleIdx).toBeGreaterThan(captionIdx);
  });

  it("does not show a schedule for Duo / P2P snapshots", () => {
    const html = markup(
      snap({
        subtype: "pair_up_match",
        caption: "Hangout",
        occurs_at: "2026-11-04T16:00:00.000Z",
      })
    );
    expect(html).not.toContain("data-match-context-schedule");
  });

  it("applies rainbow decoration only to the title pill, not the outer message", () => {
    const html = markup(
      snap({
        subtype: "open_plan_match",
        caption: "Plan",
        occurs_at: "2026-11-04T16:00:00.000Z",
      })
    );
    const src = readFileSync(
      join(__dirname, "MatchContextMessage.tsx"),
      "utf8"
    );

    expect(html).toContain('data-match-context-title-pill="true"');
    expect(html).toContain("linear-gradient(115deg");
    expect(html).toContain("#f97316");
    expect(html).toContain("#a855f7");
    expect(html).toContain("rounded-full");
    expect(html).toContain("app-dark:bg-[color-mix(in_oklab,var(--surface-2)");
    expect(html).toContain("app-dark:text-[var(--text)]/94");
    expect(html).toContain("app-dark:text-[var(--text)]/58");
    expect(html).toContain("app-dark:text-[var(--text)]/52");
    expect(html).toContain("You&#x27;ve connected on this plan");
    expect(html).toContain('data-match-context-schedule="true"');

    // No outer rainbow frame / glass card around the whole marker
    expect(html).not.toContain("data-match-context-frame");
    expect(html).not.toContain("data-match-context-interior");
    expect(src).not.toContain("MATCH_CONTEXT_FRAME_CLASS");
    expect(src).not.toContain("MATCH_CONTEXT_INTERIOR_CLASS");
    expect(src).toContain("MATCH_TITLE_PILL_FRAME_CLASS");
    expect(src).toContain("MATCH_TITLE_PILL_INTERIOR_CLASS");
    expect(src).toContain("You matched through P2P");
    expect(src).toContain("You've connected on this plan");

    // Caption and schedule stay undecorated (no gradient / card chrome on those nodes)
    const captionStart = html.indexOf('data-match-context-caption="true"');
    const captionEnd = html.indexOf("</p>", captionStart);
    const captionChunk = html.slice(captionStart, captionEnd);
    expect(captionChunk).not.toContain("linear-gradient");
    expect(captionChunk).not.toContain("rounded-full");
    expect(captionChunk).toContain("line-clamp-2");
    expect(captionChunk).toContain("text-xs");
    expect(captionChunk).toContain("font-normal");
    expect(captionChunk).toContain("text-[var(--text)]/55");

    const scheduleStart = html.indexOf('data-match-context-schedule="true"');
    const scheduleEnd = html.indexOf("</p>", scheduleStart);
    const scheduleChunk = html.slice(scheduleStart, scheduleEnd);
    expect(scheduleChunk).not.toContain("linear-gradient");
    expect(scheduleChunk).not.toContain("rounded-full");

    expect(src).not.toContain("bg-clip-text");
    expect(src).not.toContain("text-transparent");
    expect(src).not.toContain("animate-");
    expect(src).not.toContain("shadow-");
    expect(src).not.toContain("confetti");
  });

  it("stays presentation-only and does not touch insert or RPC paths", () => {
    const src = readFileSync(
      join(__dirname, "MatchContextMessage.tsx"),
      "utf8"
    );
    const page = readFileSync(
      join(__dirname, "../../pages/messages/DirectMessagePage.tsx"),
      "utf8"
    );
    expect(src).not.toContain("insert_match_context");
    expect(src).not.toContain("acceptOpenPlan");
    expect(src).not.toContain("completePairUp");
    expect(src).not.toContain("supabase");
    expect(page).toContain("MatchContextMessage");
    expect(page).toContain('m.message_kind === "match_context"');
    expect(page).toContain("snapshot={matchSnapshot}");
  });
});
