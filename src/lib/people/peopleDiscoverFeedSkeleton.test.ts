/**
 * Discover loading skeleton matches the live portrait + opportunity card.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PeopleDiscoverFeedSkeleton from "../../components/people/PeopleDiscoverFeedSkeleton";
import {
  PEOPLE_DISCOVER_MEDIA_INSET_BORDER,
  PEOPLE_FEED_MEDIA_RADIUS,
} from "./peopleFeedLayout";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function markup(variant: "initial" | "pagination"): string {
  return renderToStaticMarkup(
    createElement(PeopleDiscoverFeedSkeleton, { variant })
  );
}

describe("PeopleDiscoverFeedSkeleton", () => {
  it("uses two rows for the first load and one for pagination", () => {
    const initial = markup("initial");
    const page = markup("pagination");
    expect(initial.match(/data-people-discover-feed-skeleton-row/g)?.length).toBe(
      2
    );
    expect(page.match(/data-people-discover-feed-skeleton-row/g)?.length).toBe(1);
    expect(initial).toContain('data-people-discover-feed-skeleton-count="2"');
    expect(page).toContain('data-people-discover-feed-skeleton-count="1"');
    expect(initial).toContain('data-people-discover-feed-skeleton-variant="initial"');
    expect(page).toContain(
      'data-people-discover-feed-skeleton-variant="pagination"'
    );
    expect(initial).toContain(
      'data-people-discover-feed-skeleton-column="feed"'
    );
    expect(page).toContain(
      'data-people-discover-feed-skeleton-column="list-inner"'
    );
  });

  it("matches live 4:5 portrait, opp box, compact See Post, and top-right actions", () => {
    const html = markup("pagination");
    expect(html).toContain("min(100%, var(--people-discover-photo-max-w, 26rem))");
    expect(html).toContain("var(--people-discover-photo-aspect, 4 / 5)");
    expect(html).toContain(PEOPLE_FEED_MEDIA_RADIUS);
    expect(html).toContain(PEOPLE_DISCOVER_MEDIA_INSET_BORDER);
    expect(html).toContain("justify-center");
    expect(html).toContain("people-discover-feed-shimmer");
    expect(html).toContain("data-people-discover-skeleton-meta");
    expect(html).toContain("data-people-discover-skeleton-caption");
    expect(html).toContain(
      'data-people-discover-skeleton-caption-lines="3"'
    );
    expect(html).toContain("data-people-discover-skeleton-see-post");
    expect(html).toContain("h-5 w-[4.75rem]");
    expect(html).toContain("rounded-md");
    expect(html).not.toContain("h-7 w-[5.5rem]");
    expect(html).not.toContain("rounded-full border");
    expect(html).not.toContain("data-people-discover-skeleton-note-divider");
    expect(html).toContain("rounded-xl");
    expect(html).toContain('data-people-discover-opp-pad="px-3"');
    expect(html).toContain(
      'data-people-discover-opp-actions-align="top-right"'
    );
    expect(html).toContain("data-people-discover-skeleton-heart");
    expect(html).toContain("data-people-discover-skeleton-comment");
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("disabled");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("bg-[var(--text)]/10");
    expect(html).toContain("app-dark:bg-white/14");
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain("SkeletonCircle");
  });

  it("initial column uses feed max-width and gutter; pagination does not double-pad", () => {
    const initial = markup("initial");
    const page = markup("pagination");
    expect(initial).toContain("var(--people-feed-max-w, 640px)");
    expect(initial).toContain("var(--people-feed-gutter, var(--gutter))");
    expect(initial).toContain("mx-auto");
    expect(page).not.toContain("var(--people-feed-max-w, 640px)");
    expect(page).not.toContain("var(--people-feed-gutter, var(--gutter))");
  });

  it("keeps theme-aware reflective shimmer and reduced-motion static plate", () => {
    const css = read("components/people/PeopleDiscoverFeedSkeleton.css");
    expect(css).toContain(".people-discover-feed-shimmer");
    expect(css).toContain("html.theme-light .people-discover-feed-shimmer");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
    expect(css).toContain("social-shelf-resolving-shimmer");
  });

  it("parity with live Discover person row and opportunity box geometry", () => {
    const box = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    const row = read("components/people/PeopleDiscoverPersonRow.tsx");
    const skel = read("components/people/PeopleDiscoverFeedSkeleton.tsx");

    expect(box).toContain('inline-flex h-5 max-w-full shrink-0');
    expect(box).toContain("rounded-md border");
    expect(box).toContain("text-[10px]");
    expect(box).toContain(
      'data-people-discover-opp-actions-align="top-right"'
    );
    expect(box).toContain("mt-1.5");
    expect(row).toContain('aspectRatio: "var(--people-discover-photo-aspect, 4 / 5)"');
    expect(row).toContain("mt-3 flex min-w-0 flex-col gap-2");
    expect(skel).toContain("mt-3 flex min-w-0 flex-col gap-2");
    expect(skel).toContain("SEE_POST_PULSE");
    expect(skel).toContain("h-5 w-[4.75rem]");
    expect(skel).not.toContain("note-divider");
    expect(skel).not.toMatch(/import .*PeopleActionStateButton/);
    expect(skel).not.toContain("PeopleCandidateMedia");
  });

  it("wires Discover loading only, and leaves Duo, Plans, and Groups on their own placeholders", () => {
    const skeleton = read("components/people/PeopleDiscoverFeedSkeleton.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const list = read("components/people/PeopleFeedList.tsx");
    const media = read("components/people/PeopleCandidateMedia.tsx");
    const feedRow = read("components/people/PeopleFeedRow.tsx");
    const plans = read("pages/people/OpenPlanDeckBody.tsx");
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(skeleton).not.toContain("PeopleCandidateMedia");
    expect(media).not.toContain("PeopleDiscoverFeedSkeleton");
    expect(feedRow).toContain('aspectRatio: "3 / 4"');
    expect(feedRow).toContain("40vh");
    expect(overlay).toContain('<PeopleDiscoverFeedSkeleton variant="initial" />');
    expect(overlay).toContain('loadMorePlaceholder="discover"');
    expect(overlay).toContain("<PeopleDuoCardSkeleton />");
    expect(list).toContain('loadMorePlaceholder = "text"');
    expect(list).toContain('<PeopleDiscoverFeedSkeleton variant="pagination" />');
    expect(list).toContain('loadMoreInFlight');
    expect(plans).not.toContain("loadMorePlaceholder");
    expect(groups).not.toContain("loadMorePlaceholder");
    expect(plans).not.toContain("PeopleDiscoverFeedSkeleton");
    expect(groups).not.toContain("PeopleDiscoverFeedSkeleton");
    expect(overlay).not.toContain("PeoplePlansGroupsFeedSkeleton");
  });
});
