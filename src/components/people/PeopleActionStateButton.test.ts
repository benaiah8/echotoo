/**
 * Presentation-only People Heart / Comment button.
 */
import { createElement, type ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PeopleActionStateButton from "./PeopleActionStateButton";

function markup(
  props: Partial<ComponentProps<typeof PeopleActionStateButton>> & {
    kind: "heart" | "comment";
    state: "idle" | "pending" | "active" | "disabled";
  }
): string {
  return renderToStaticMarkup(
    createElement(PeopleActionStateButton, {
      size: 44,
      ariaLabel: props.kind === "heart" ? "Connect" : "Comment",
      ...props,
    })
  );
}

describe("PeopleActionStateButton", () => {
  it("renders both kinds at 44 and 52 with outline idle icons", () => {
    const heart = markup({ kind: "heart", state: "idle", size: 44, ariaLabel: "Connect" });
    const comment = markup({
      kind: "comment",
      state: "idle",
      size: 52,
      ariaLabel: "Comment",
    });
    expect(heart).toContain('data-people-action-kind="heart"');
    expect(heart).toContain('data-people-action-size="44"');
    expect(heart).toContain("h-11 w-11");
    expect(heart).toContain('data-people-action-icon="outline"');
    expect(heart).toContain("bg-[var(--text)]/10");
    expect(heart).toContain("app-dark:bg-white/14");
    expect(comment).toContain('data-people-action-kind="comment"');
    expect(comment).toContain('data-people-action-size="52"');
    expect(comment).toContain("h-[52px] w-[52px]");
    expect(comment).toContain('data-people-action-icon="outline"');
    expect(heart).toContain('type="button"');
    expect(heart).toContain('aria-label="Connect"');
    expect(comment).toContain('aria-label="Comment"');
  });

  it("uses a filled red heart and a filled black comment when active", () => {
    const heart = markup({ kind: "heart", state: "active", ariaLabel: "Connected" });
    const comment = markup({ kind: "comment", state: "active", ariaLabel: "Comment sent" });
    expect(heart).toContain('data-people-action-icon="fill"');
    expect(heart).toContain("bg-white");
    expect(heart).toContain("text-[rgb(225,29,72)]");
    expect(heart).toContain('aria-pressed="true"');
    expect(heart).toContain("h-9 w-9");
    expect(heart).not.toContain("h-6 w-6");
    expect(comment).toContain('data-people-action-icon="fill"');
    expect(comment).toContain("bg-white");
    expect(comment).toContain("text-black");
    expect(heart).not.toContain("text-black");
    expect(comment).not.toContain("text-[rgb(225,29,72)]");
  });

  it("keeps the confirmed icon while pending and blocks another press", () => {
    const pendingActive = markup({
      kind: "heart",
      state: "pending",
      confirmedState: "active",
      ariaLabel: "Connect",
    });
    const pendingIdle = markup({
      kind: "comment",
      state: "pending",
      ariaLabel: "Comment",
    });
    const disabled = markup({
      kind: "heart",
      state: "disabled",
      ariaLabel: "Connect",
    });
    expect(pendingActive).toContain('data-people-action-visual="active"');
    expect(pendingActive).toContain('data-people-action-icon="fill"');
    expect(pendingActive).toContain("h-9 w-9");
    expect(pendingActive).toContain('aria-busy="true"');
    expect(pendingActive).toContain("disabled");
    expect(pendingIdle).toContain('data-people-action-visual="idle"');
    expect(pendingIdle).toContain('data-people-action-icon="outline"');
    expect(pendingIdle).toContain("disabled");
    expect(disabled).toContain("disabled");
    expect(disabled).toContain("opacity-50");
  });

  it("places a contained ripple and turns it off for reduced motion", () => {
    const html = markup({ kind: "heart", state: "idle", ariaLabel: "Connect" });
    const css = readFileSync(
      join(__dirname, "PeopleActionStateButton.css"),
      "utf8"
    );
    const source = readFileSync(
      join(__dirname, "PeopleActionStateButton.tsx"),
      "utf8"
    );
    expect(html).toContain("people-action-ripple");
    expect(html).toContain("people-action-ripple--delay");
    expect(css).toContain("people-action-ripple 520ms ease-out");
    expect(css).toContain("translate(-50%, -50%) scale(");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).toContain("setRippling(true)");
    expect(source).toContain('size === 52');
    expect(source).toContain('"h-[42px] w-[42px]"');
    expect(source).toContain('"h-[26px] w-[26px]"');
    expect(source).toContain('"h-6 w-6"');
    const active52 = markup({
      kind: "comment",
      state: "active",
      size: 52,
      ariaLabel: "Comment sent",
    });
    const pending52 = markup({
      kind: "heart",
      state: "pending",
      size: 52,
      confirmedState: "active",
      ariaLabel: "Connect",
    });
    const idle52 = markup({
      kind: "heart",
      state: "idle",
      size: 52,
      ariaLabel: "Connect",
    });
    expect(active52).toContain("h-[42px] w-[42px]");
    expect(active52).toContain("h-[52px] w-[52px]");
    expect(pending52).toContain("h-[42px] w-[42px]");
    expect(idle52).toContain("h-[26px] w-[26px]");
    expect(idle52).not.toContain("h-[42px]");
  });

  it("stays presentational and does not assume a row layout", () => {
    const source = readFileSync(
      join(__dirname, "PeopleActionStateButton.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(
      /supabase|react-hot-toast|react-router|navigate\(|joinPairUp|leave_pair_up|from "\.\.\/\.\.\/api/
    );
    expect(source).not.toContain("flex-col");
    expect(markup({ kind: "heart", state: "idle", ariaLabel: "Connect" })).toContain(
      "<button"
    );
  });
});
