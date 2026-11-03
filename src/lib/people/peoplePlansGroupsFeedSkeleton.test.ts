/**
 * Plans/Groups feed skeleton — Plans Discover geometry; Groups feed-row.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PeoplePlansGroupsFeedSkeleton from "../../components/people/PeoplePlansGroupsFeedSkeleton";
import { PEOPLE_FEED_MEDIA_RADIUS } from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function markup(
  variant: "initial" | "pagination",
  surface: "plans" | "groups" = "groups"
): string {
  return renderToStaticMarkup(
    createElement(PeoplePlansGroupsFeedSkeleton, { variant, surface })
  );
}

describe("PeoplePlansGroupsFeedSkeleton", () => {
  it("uses two rows for initial load and one for pagination", () => {
    const initial = markup("initial", "plans");
    const page = markup("pagination", "plans");
    expect(
      initial.match(/data-people-plans-groups-feed-skeleton-row/g)?.length
    ).toBe(2);
    expect(
      page.match(/data-people-plans-groups-feed-skeleton-row/g)?.length
    ).toBe(1);
  });

  it("Open Plans surface matches Discover 4:5 portrait + info card", () => {
    const html = markup("initial", "plans");
    expect(html).toContain('data-people-plans-groups-feed-skeleton-surface="plans"');
    expect(html).toContain('data-people-plans-skeleton-layout="discover"');
    expect(html).toContain("min(100%, var(--people-discover-photo-max-w, 26rem))");
    expect(html).toContain("var(--people-discover-photo-aspect, 4 / 5)");
    expect(html).toContain(PEOPLE_FEED_MEDIA_RADIUS);
    expect(html).toContain("data-people-plans-skeleton-info-card");
    expect(html).toContain("rounded-xl");
    expect(html).toContain("people-plans-groups-feed-shimmer");
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("data-people-plans-skeleton-note-accent");
    expect(html).toContain('data-people-personal-note-accent="true"');
    expect(html).toContain("border-l-2");
    expect(html).toContain("px-3 py-2");
    expect(html).toContain(
      "bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))]"
    );
    expect(html).toContain(
      "app-dark:bg-[color-mix(in_oklab,white_11%,var(--surface))]"
    );
    expect(html).not.toContain("See post");
    expect(html).not.toContain("data-people-see-post");
    expect(html).not.toMatch(/aspect-ratio:\s*3\s*\/\s*4/);
    expect(html).not.toContain("I'm down");
  });

  it("Groups surface uses one unified card with creator inside", () => {
    const html = markup("initial", "groups");
    expect(html).toContain('data-people-plans-groups-feed-skeleton-surface="groups"');
    expect(html).toContain('data-people-plans-skeleton-layout="text-first"');
    expect(html).toContain("data-people-groups-skeleton-card");
    expect(html).toContain("data-people-groups-skeleton-info-card");
    expect(html).toContain("data-people-groups-skeleton-creator");
    expect(html).toContain("h-8 w-8");
    expect(html).toContain("rounded-full");
    expect(html).toContain("rounded-xl");
    expect(html).toContain("mb-3");
    expect(html).toContain('data-people-group-up-list-gap="12"');
    expect(html).toContain("data-people-groups-skeleton-description");
    expect(html).toContain("data-people-groups-skeleton-meta");
    expect(html).toContain("data-people-groups-skeleton-caption");
    expect(html).toContain("data-people-groups-skeleton-source-caption-accent");
    expect(html).toContain("border-l-2");
    expect(html).toContain("data-people-groups-skeleton-rail");
    expect(html).toContain("h-11 w-11");
    expect(html).not.toContain("border-t border-[var(--border)]");
    expect(html).not.toMatch(/aspect-ratio:\s*3\s*\/\s*4/);
    expect(html).not.toMatch(/aspect-ratio:\s*4\s*\/\s*5/);
    expect(html).not.toContain("data-people-plans-skeleton-note-accent");
    expect(html).not.toContain("data-people-personal-note-accent");
    expect(html).not.toContain("min(100%, var(--people-discover-photo-max-w");

    const cardAt = html.indexOf("data-people-groups-skeleton-card");
    const creatorAt = html.indexOf("data-people-groups-skeleton-creator");
    expect(creatorAt).toBeGreaterThan(cardAt);
  });

  it("uses co-located CSS with reduced-motion static plate and light theme", () => {
    const css = read(
      "components/people/PeoplePlansGroupsFeedSkeleton.css"
    );
    expect(css).toContain(".people-plans-groups-feed-shimmer");
    expect(css).toContain("html.theme-light .people-plans-groups-feed-shimmer");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
    expect(css).toContain("social-shelf-resolving-shimmer");
  });

  it("wires Plans surface on Open Plans and Groups surface on Group Up", () => {
    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(plans).toContain('surface="plans"');
    expect(plans).toContain("PeoplePlansGroupsFeedSkeleton");
    expect(groups).toContain("PeoplePlansGroupsFeedSkeleton");
    expect(groups).toContain('surface="groups"');
    expect(groups).not.toContain('surface="plans"');
    expect(plans).not.toContain("PeopleDiscoverFeedSkeleton");
    expect(groups).not.toContain("PeopleDiscoverFeedSkeleton");
  });

  it("documents responsive column max width for 320/390/430 hosts", () => {
    const skel = read(
      "components/people/PeoplePlansGroupsFeedSkeleton.tsx"
    );
    const layout = read("lib/people/peopleFeedLayout.ts");
    expect(skel).toContain("people-feed-max-w");
    expect(skel).toContain("people-feed-gutter");
    expect(layout).toContain("PEOPLE_FEED_MAX_W_PX = 640");
  });
});
