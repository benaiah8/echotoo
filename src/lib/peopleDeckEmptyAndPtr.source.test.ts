/**
 * People PTR ownership + shared empty-state card contracts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PEOPLE_DECK_PREFETCH_REMAINING } from "./people/matchDeckNavigation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("People PTR ownership + empty cards", () => {
  const carousel = read("pages/people/MatchDeckCarousel.tsx");
  const overlay = read("pages/people/MatchDeckOverlay.tsx");
  const plans = read("pages/people/OpenPlanDeckBody.tsx");
  const groups = read("pages/people/GroupUpDeckBody.tsx");
  const emptyCard = read("components/people/PeopleDeckEmptyCard.tsx");
  const copy = read("pages/people/peopleUiCopy.ts");
  const ptr = read("hooks/useHomePullToRefresh.ts");
  const media = read("lib/people/peopleCandidateMediaPresentation.ts");
  const nav = read("lib/people/matchDeckNavigation.ts");

  it("1–4: PTR can begin on populated Duo/Discover/Plans/Groups New surfaces", () => {
    // Vertical feed scroll root — PTR still owned by MatchDeckOverlay surface.
    expect(overlay).toContain("data-people-ptr-surface");
    expect(overlay).toContain("useHomePullToRefresh");
    expect(overlay).toContain('kind: "groups_new"');
    expect(overlay).toContain("hardRefreshPeopleDeckScope");
    expect(overlay).toContain("PeopleFeedList");
    expect(plans).toContain("PeopleFeedList");
    expect(groups).toContain("PeopleFeedList");
  });

  it("5–6: axis lock remains on shared PTR hook", () => {
    expect(ptr).toContain("dy > 10 && dy > Math.abs(dx) * 1.2");
    expect(ptr).toContain("Math.abs(dx) > 10 && Math.abs(dx) > dy");
    // Legacy Embla file still documents PTR non-block on pointerDown (unused by feed).
    expect(carousel).toContain("Do NOT acquire PTR block here");
  });

  it("7–8: lightbox/fullscreen + Create cover still block PTR", () => {
    expect(overlay).toContain("acquirePullToRefreshBlock");
    expect(overlay).toContain("peopleTabsCovered");
    expect(read("components/ImageLightbox.tsx")).toContain(
      "acquirePullToRefreshBlock"
    );
    expect(read("components/PublishedMediaFullscreenViewer.tsx")).toContain(
      "acquirePullToRefreshBlock"
    );
  });

  it("9–12: empty Duo/Discover/Plans/Groups New use shared card", () => {
    expect(overlay).toContain("<PeopleDeckEmptyCard");
    expect(overlay).toContain('emptyKind = isDiscoverScope ? ("discover"');
    expect(overlay).toContain('("duo" as const)');
    expect(plans).toContain('kind="plans"');
    expect(plans).toContain("<PeopleDeckEmptyCard");
    expect(groups).toContain('kind="groups_new"');
    expect(groups).toContain("<PeopleDeckEmptyCard");
  });

  it("13: Groups Yours empty remains text-only", () => {
    expect(groups).toContain("groupUpBrowseYoursEmpty");
    expect(groups).toMatch(
      /browseTab === "yours"[\s\S]*groupUpBrowseYoursEmpty/
    );
    expect(groups).not.toMatch(
      /browseTab === "yours"[\s\S]{0,200}PeopleDeckEmptyCard/
    );
  });

  it("14–15: shared geometry + gradient edge reused", () => {
    expect(emptyCard).toContain("computePeopleDiscoverCardMetrics");
    expect(emptyCard).toContain('chromeProfile: "mine"');
    expect(emptyCard).toContain("fullWidthSlide: true");
    expect(emptyCard).toContain("PEOPLE_MINE_CARD_RADIUS");
    expect(emptyCard).toContain("PEOPLE_MINE_DEPTH_SHADOW");
    expect(emptyCard).toContain("peopleMineCardTransform");
    expect(emptyCard).toContain("peopleMineUnseenEdgeRingStyle");
    expect(emptyCard).not.toContain("PEOPLE_MINE_UNSEEN_EDGE_GRADIENT");
    expect(emptyCard).toContain("PEOPLE_EDGE_CARD_SURFACE_CLASS");
    expect(emptyCard).toContain("#f2efe6_94%");
    expect(emptyCard).toContain("data-people-deck-carousel-host");
    expect(media).toContain("export function peopleMineUnseenEdgeRingStyle");
  });

  it("16: empty states use shared empty card (no edge-nav zero state)", () => {
    expect(overlay).toContain("<PeopleDeckEmptyCard");
    expect(plans).toContain("<PeopleDeckEmptyCard");
    expect(groups).toContain("<PeopleDeckEmptyCard");
    expect(plans).toContain("isTrueCaughtUpState");
    expect(groups).toContain("isTrueCaughtUpState");
  });

  it("17: empty card remains inside PTR surface + card-stack peeks", () => {
    const ptrIdx = overlay.indexOf('data-people-ptr-surface="true"');
    const emptyIdx = overlay.indexOf("<PeopleDeckEmptyCard");
    expect(ptrIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(ptrIdx);
    expect(emptyCard).toContain("pointer-events-none");
    expect(emptyCard).toContain("data-people-deck-empty");
    expect(emptyCard).toContain("data-people-deck-empty-backing");
    expect(emptyCard).toContain('STACK_BACKING_ROLES');
  });

  it("18–21: empty gating truthful", () => {
    expect(overlay).toContain("isTrueCaughtUpState");
    expect(overlay).toContain("!peoplePtrRefreshing");
    expect(overlay).toContain("!showLoading");
    expect(overlay).toContain("!showError");
    expect(overlay).toContain("trueCaughtUp");
    expect(overlay).toContain("PeopleDuoCardSkeleton");
    expect(overlay).toContain("isDiscoverScope");
    expect(plans).toContain("isTrueCaughtUpState");
    expect(plans).toContain("deckLoadError");
    expect(groups).toContain("isTrueCaughtUpState");
    expect(groups).toContain("deckLoadError");
    expect(nav).toContain("visibleCount === 0");
    expect(nav).toContain("!options.hasMore");
    expect(nav).toContain("!options.loadMoreInFlight");
  });

  it("22–25: copy + CTAs", () => {
    expect(copy).toContain('deckEmpty: "No Duos yet"');
    expect(copy).toContain(
      "Find an event you'd like to attend and tap Duo to meet others going too."
    );
    expect(copy).toContain("Explore events");
    expect(overlay).toContain("handleEmptyExploreHome");
    expect(overlay).toContain("Paths.home");
    expect(copy).toContain('discoverEmpty: "Nothing to discover yet"');
    expect(overlay).toMatch(
      /isDiscoverScope[\s\S]*ctaLabel=\{[\s\S]*undefined/
    );
    expect(copy).toContain('openPlansEmpty: "No open plans yet"');
    expect(copy).toContain(
      "Open Plans will appear here as people start making plans. You can start one from a place post."
    );
    expect(copy).toContain("Create a plan");
    expect(plans).toContain("enterCreateAsDefaultPost");
    expect(copy).toContain('groupUpBrowseNewEmpty: "No groups to join yet"');
    expect(copy).toContain(
      "Start a Group Up from a post, or explore what others are planning."
    );
    expect(copy).toContain('groupUpBrowseYoursEmptyTitle: "No groups yet"');
    expect(copy).toContain(
      "Groups you've joined or requested to join will appear here."
    );
    expect(copy).toContain("Explore posts");
    expect(groups).toContain("Paths.home");
    expect(groups).toContain("groupUpBrowseYoursEmptyTitle");
    expect(emptyCard).toContain('duo: "🤝"');
    expect(emptyCard).toContain('discover: "✨"');
    expect(emptyCard).toContain('plans: "🗓️"');
    expect(emptyCard).toContain('groups_new: "👥"');
  });

  it("26–28: no DB/RPC churn; seen-sync + page size/prefetch unchanged", () => {
    expect(PEOPLE_DECK_PREFETCH_REMAINING).toBe(8);
    expect(read("hooks/usePairUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useOpenPlanCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("hooks/useGroupUpCandidates.ts")).toContain(
      "options?.limit ?? 20"
    );
    expect(read("lib/people/peopleDeckSeenSync.ts")).toContain(
      "people_deck_seen"
    );
    expect(emptyCard).not.toContain("supabase");
    expect(emptyCard).not.toContain("rpc(");
  });
});
