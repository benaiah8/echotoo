import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileSocialOpportunity } from "../people/types";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sample(
  overrides: Partial<ProfileSocialOpportunity> = {}
): ProfileSocialOpportunity {
  return {
    source_post_id: "post-1",
    source_type: "hangout",
    source_caption: "Friday hang",
    source_cover_url: null,
    source_author_id: "author-1",
    source_author_profile_id: null,
    source_author_display_name: "Author One",
    source_author_username: "author1",
    source_author_avatar_url: null,
    source_selected_dates: ["2099-01-01T12:00:00.000Z"],
    source_recurrence_days: null,
    source_is_recurring: false,
    created_at: "2099-01-01T00:00:00.000Z",
    duo: {
      opportunity_id: "opp-1",
      viewer_duo_joined: false,
    },
    group: null,
    ...overrides,
  };
}

describe("profile social opportunities usage optimization (source)", () => {
  it("Discover toggle does not clear profile_social_opps:{viewer}:*", () => {
    const src = readSrc("src/api/services/pairUp.ts");
    const fnStart = src.indexOf("export async function setP2pDiscoverEnabled");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf("\nexport async function", fnStart + 1);
    const body = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
    expect(body).not.toContain("invalidateProfileSocialOpportunities");
    expect(body).not.toContain("profile_social_opps");
    expect(body).toContain("invalidatePairUpDeckKind");
    expect(body).toContain("p2p_discover_enabled");
    expect(body).toContain("profile:updated");
  });

  it("Profile Connect patches only the owner rail and does not broad-invalidate", () => {
    const src = readSrc("src/api/services/profileSocialOpportunities.ts");
    const fnStart = src.indexOf("export async function connectProfilePairUp");
    expect(fnStart).toBeGreaterThan(-1);
    const body = src.slice(fnStart);
    expect(body).toContain("patchCachedProfileSocialOpportunity");
    expect(body).toContain("profileOwnerUserId");
    expect(body).not.toContain("invalidateProfileSocialOpportunitiesForViewer");
    expect(body).not.toContain("listProfileSocialOpportunities");
    expect(src).toContain("PROFILE_SOCIAL_OPPORTUNITY_LIMIT = 8");
  });

  it("hook does not force RPC on profile:updated; no polling/timers", () => {
    const src = readSrc("src/hooks/useProfileSocialOpportunities.ts");
    expect(src).not.toContain('addEventListener("profile:updated"');
    expect(src).not.toContain("addEventListener('profile:updated'");
    expect(src).not.toContain("setInterval");
    expect(src).not.toContain("setTimeout");
    expect(src).toContain("isCachedProfileSocialOpportunitiesSoftStale");
    expect(src).toContain("getCachedProfileSocialOpportunities");
  });

  it("rail mounts at most PROFILE_SOCIAL_OPPORTUNITY_LIMIT cards", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityRail.tsx"
    );
    expect(src).toContain("PROFILE_SOCIAL_OPPORTUNITY_LIMIT");
    expect(src).toContain(
      "opportunities.slice(0, PROFILE_SOCIAL_OPPORTUNITY_LIMIT)"
    );
  });
});

describe("connectProfilePairUp cache behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadConnectHarness() {
    vi.doMock("../../lib/supabaseClient", () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { user: { id: "viewer" } } },
            error: null,
          }),
        },
        rpc: vi.fn().mockResolvedValue({
          data: {
            opportunity: {
              id: "mine",
              source_post_id: "post-1",
              status: "active",
              description: null,
              discoverable_until: "2099-02-01T00:00:00.000Z",
              created_at: "2099-01-01T00:00:00.000Z",
            },
            from_opportunity_id: "mine",
            to_opportunity_id: "opp-1",
            matched: false,
          },
          error: null,
        }),
      },
    }));
    vi.doMock("../../lib/pairUpCache", () => ({
      setCachedPairUp: vi.fn(),
      invalidatePairUpDeck: vi.fn(),
    }));
    vi.doMock("../../api/services/pairUp", () => ({
      toPairUpRpcError: (e: unknown) => e,
    }));

    const cache = await import("../profileSocialOpportunityCache");
    cache.__resetProfileSocialOpportunityCacheForTests();
    const { connectProfilePairUp } = await import(
      "../../api/services/profileSocialOpportunities"
    );
    return { cache, connectProfilePairUp };
  }

  it("patches only the relevant viewer+owner key on success", async () => {
    const { cache, connectProfilePairUp } = await loadConnectHarness();

    cache.setCachedProfileSocialOpportunities("viewer", "owner-a", {
      opportunities: [sample({ duo: { opportunity_id: "opp-1", viewer_duo_joined: false } })],
    });
    cache.setCachedProfileSocialOpportunities("viewer", "owner-b", {
      opportunities: [
        sample({
          source_post_id: "post-b",
          duo: { opportunity_id: "opp-b", viewer_duo_joined: false },
        }),
      ],
    });

    await connectProfilePairUp("opp-1", { profileOwnerUserId: "owner-a" });

    const a = cache.getCachedProfileSocialOpportunities("viewer", "owner-a");
    const b = cache.getCachedProfileSocialOpportunities("viewer", "owner-b");
    expect(a?.opportunities[0]?.duo?.viewer_duo_joined).toBe(true);
    expect(b?.opportunities[0]?.duo?.viewer_duo_joined).toBe(false);
    expect(b?.opportunities).toHaveLength(1);
  });

  it("does not clear other owner caches when owner id is omitted", async () => {
    const { cache, connectProfilePairUp } = await loadConnectHarness();

    cache.setCachedProfileSocialOpportunities("viewer", "owner-a", {
      opportunities: [sample()],
    });
    cache.setCachedProfileSocialOpportunities("viewer", "owner-b", {
      opportunities: [
        sample({
          source_post_id: "post-b",
          duo: { opportunity_id: "opp-b", viewer_duo_joined: false },
        }),
      ],
    });

    await connectProfilePairUp("opp-1");

    expect(
      cache.getCachedProfileSocialOpportunities("viewer", "owner-a")
    ).not.toBeNull();
    expect(
      cache.getCachedProfileSocialOpportunities("viewer", "owner-b")
    ).not.toBeNull();
  });
});

describe("profile social opportunity stale invalidation contract", () => {
  it("card invalidates only viewer+owner on stale Connect errors", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    expect(src).toContain(
      "invalidateProfileSocialOpportunities(viewerUserId, profileUserId)"
    );
    expect(src).not.toContain("invalidateProfileSocialOpportunitiesForViewer");
  });
});

describe("cache TTL / dedupe contracts", () => {
  it("keeps 60s hard TTL without scheduling polling", () => {
    const cacheSrc = readSrc("src/lib/profileSocialOpportunityCache.ts");
    expect(cacheSrc).toContain("const TTL_MS = 60_000");
    expect(cacheSrc).not.toContain("setInterval");
    expect(cacheSrc).not.toContain("setTimeout");

    const serviceSrc = readSrc(
      "src/api/services/profileSocialOpportunities.ts"
    );
    expect(serviceSrc).toContain(
      "`profile_social_opps:${viewerUserId}:${profileUserId}`"
    );
    expect(serviceSrc).toContain("requestManager.execute");
  });
});

describe("own Profile rail reuse + caption / self actions (source)", () => {
  it("OwnProfile and OtherProfile mount the shared rail", () => {
    const own = readSrc("src/pages/OwnProfilePage.tsx");
    const other = readSrc("src/pages/OtherProfilePage.tsx");
    expect(own).toContain(
      'import ProfileSocialOpportunityRail from "../components/profile/ProfileSocialOpportunityRail"'
    );
    expect(own).toContain("<ProfileSocialOpportunityRail");
    expect(own).toContain("profileUserId={profile.user_id}");
    expect(other).toContain("<ProfileSocialOpportunityRail");
    expect(own).not.toContain("OwnProfileSocialOpportunityRail");
  });

  it("card matches Home rail geometry with 3-line caption and full-width date", () => {
    const card = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    const css = readSrc("src/index.css");
    expect(card).toContain("w-[38vw]");
    expect(card).toContain("min-w-[180px]");
    expect(card).toContain("max-w-[240px]");
    expect(card).toContain("rounded-[14px]");
    expect(card).toContain("pt-2 px-3 pb-2");
    expect(card).toContain("RAIL_LABEL_ROW_CLASS");
    expect(card).toContain("text-[13px]");
    expect(card).toContain("leading-5");
    expect(card).toContain("WebkitLineClamp: 3");
    expect(card).toContain('minHeight: "60px"');
    expect(card).toContain("whitespace-pre-wrap");
    expect(card).not.toContain("profile-social-opportunity-caption");
    expect(card).not.toContain("leading-[14px]");
    expect(card).not.toContain("OWN_TOP_ROW_CLASS");
    expect(card).not.toContain("temporaryRailFacet");
    expect(card).not.toContain("ownActionPill");
    expect(card).not.toMatch(/caption\.slice\(/);
    expect(css).not.toContain(".profile-social-opportunity-caption");
  });

  it("Own always shows Duo + Group via shared rail pills; Connect only on Other", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    expect(src).toContain("isSelf");
    expect(src).toContain("openPairUpManage");
    expect(src).toContain("openGroupUpManage");
    expect(src).toContain("useDuoSocialAction");
    expect(src).toContain("useGroupSocialAction");
    expect(src).toContain("duoAction.onPress");
    expect(src).toContain("groupAction.onPress");
    expect(src).toContain('from "../social/SocialDuoPill"');
    expect(src).toContain('from "../social/SocialGroupPill"');
    expect(src).toContain('surface="rail"');
    expect(src).toContain("socialRailBareRowClassName");
    expect(src).toContain("socialContrastShelfClusterClassName");
    expect(src).toContain("data-profile-social-own-actions");
    expect(src).toContain("data-profile-social-other-actions");
    expect(src).toContain("deckConnectLabel");
    expect(src).toContain("data-profile-social-connect");
    expect(src).toContain("hasOwnerDuo ? (");
    expect(src).not.toContain("OWN_TOP_ROW_CLASS");
    expect(src).not.toContain("data-profile-social-own-top");
    expect(src).not.toContain("temporaryRailFacet");
    expect(src).not.toContain("ownActionPill");
    expect(src).not.toContain("groupMyGroup");
    expect(src).not.toContain("SocialActionCluster");
  });

  it("source-author identity replaces Social pick; date pill is full width", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    expect(src).toContain("source_author_display_name");
    expect(src).toContain("source_author_username");
    expect(src).toContain("source_author_avatar_url");
    expect(src).toContain("data-profile-social-author");
    expect(src).toContain("data-profile-social-date-pill");
    expect(src).toContain("DATE_PILL_FACE_CLASS");
    expect(src).toContain("rail-card-pill-shadow");
    expect(src).toContain('getPostScheduleLabelClasses(schedule.kind, "rail")');
    expect(src).toContain('from "../ui/Avatar"');
    expect(src).not.toContain("railSocialPickLabel");
    expect(src).not.toContain("Social pick");
    expect(src).not.toContain('data-profile-social-date-pill="own"');
    expect(src).not.toContain('data-profile-social-date-pill="other"');
    expect(src).not.toContain("PROFILE_DATE_PILL");
    expect(src).not.toContain("ACTION_ROW_CLASS");
  });

  it("Other Duo preserves join/leave + Connect; Other Group uses Request states", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    expect(src).toContain("joinPairUp");
    expect(src).toContain("leavePairUp");
    expect(src).toContain("connectProfilePairUp");
    expect(src).toContain("requestGroupUp");
    expect(src).toContain("withdrawGroupUpRequest");
    expect(src).toContain("groupRequest");
    expect(src).toContain("groupRequested");
    expect(src).toContain("groupUpBrowseMemberLabel");
    expect(src).toContain("ProfileGroupRequestPill");
    expect(src).toContain("ProfileConnectPill");
    expect(src).toContain(
      "/* Owner has no Duo — inactive; no viewer create/manage. */"
    );
    expect(src).toContain(
      "/* Owner has no hosted Group — inactive; no viewer create/manage. */"
    );
    // Other absent sides must not call Own create/manage overlays.
    const otherActionsStart = src.indexOf("data-profile-social-other-actions");
    const otherActions = src.slice(otherActionsStart);
    expect(otherActions).not.toContain("openPairUpManage");
    expect(otherActions).not.toContain("openGroupUpManage");
    expect(otherActions).not.toContain("openGroupUpCreate");
  });

  it("both facets render on one card; no single-facet fallback", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    expect(src).toContain("row.duo");
    expect(src).toContain("row.group");
    expect(src).toContain("hasOwnerDuo");
    expect(src).toContain("hasOwnerGroup");
    expect(src).not.toContain("temporaryRailFacet");
    expect(src).not.toContain("ownActionPill");
    expect(src).toContain("<SocialDuoPill");
    expect(src).toContain("<SocialGroupPill");
  });

  it("hook waits for viewer auth before resolving empty; uses shared cache key", () => {
    const hook = readSrc("src/hooks/useProfileSocialOpportunities.ts");
    expect(hook).toContain("if (!viewerUserId)");
    expect(hook).toContain("setLoading(true)");
    expect(hook).toContain("listProfileSocialOpportunities");
    expect(hook).toContain("getCachedProfileSocialOpportunities");
    expect(hook).not.toContain("setInterval");
    const service = readSrc(
      "src/api/services/profileSocialOpportunities.ts"
    );
    expect(service).toContain(
      "`profile_social_opps:${viewerUserId}:${profileUserId}`"
    );
  });

  it("rail keeps unified Home-style skeleton; keys by source_post_id", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityRail.tsx"
    );
    expect(src).toContain("loading && visible.length === 0 ? skeleton : row");
    expect(src).toContain("(!loading && visible.length === 0)");
    expect(src).toContain("useProfileSocialOpportunities");
    expect(src).toContain("border-y");
    expect(src).toContain("key={item.source_post_id}");
    expect(src).toContain("data-profile-social-skeleton");
    expect(src).toContain("rounded-[14px]");
    expect(src).toContain("min-h-[60px]");
    expect(src).not.toContain("isSelfView");
    expect(src).not.toContain("min-h-[176px]");
    expect(src).not.toContain("canScrollLeft");
    expect(src).not.toContain("ResizeObserver");
    expect(src).not.toContain("bg-gradient-to-r");
    expect(src).not.toContain("bg-gradient-to-l");
  });

  it("rail scroll matches Home (no touch-pan-x vertical capture)", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityRail.tsx"
    );
    expect(src).toContain(
      'className="w-full min-w-0 max-w-full overflow-x-auto scroll-hide pt-2.5 pb-3.5"'
    );
    expect(src).not.toContain("touch-pan-x");
    expect(src).not.toContain("overscroll-x-contain");
    expect(src).not.toContain("[-webkit-overflow-scrolling:touch]");
  });

  it("Profile rail card does not mount source cover images", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    expect(src).not.toContain("RailCardImageBackdrop");
    expect(src).not.toContain("imgUrlPublic");
    expect(src).not.toContain("source_cover_url");
    expect(src).not.toContain("railCover");
    expect(src).not.toContain("<img");
    expect(src).toContain('getPostScheduleLabelClasses(schedule.kind, "rail")');
    expect(src).toContain("rail-card-pill-shadow");
  });

  it("Profile Connect patches duo+connected, uses profile connect toast, omits Connect-to-self", () => {
    const src = readSrc(
      "src/components/profile/ProfileSocialOpportunityCard.tsx"
    );
    const toastSrc = readSrc("src/lib/showProfileConnectToast.tsx");
    expect(src).toContain("connectProfilePairUp");
    expect(src).toContain("expressPairUpInterest");
    expect(src).toContain("leavePairUp");
    expect(src).toContain("showProfileDisconnectedToast");
    expect(src).toContain("restoreConnect");
    expect(src).toContain("showProfileConnectToast");
    expect(src).toContain("viewer_profile_connected");
    expect(src).toContain("PiHandPeace");
    expect(src).toContain("PiCheck");
    expect(src).toContain("deckConnectedLabel");
    expect(src).toContain("active={connectActive}");
    expect(src).toContain("socialPillActiveGlowClassName");
    expect(src).toContain("data-profile-social-connect");
    expect(src).toContain("isSelf ? (");
    expect(src).not.toContain("discoverAddedToP2p");
    expect(src).not.toContain("PiHandshake");
    expect(toastSrc).toContain("profileDisconnectedToast");
    expect(toastSrc).toContain("expressPairUpInterest");
    const disconnectFn = toastSrc.slice(
      toastSrc.indexOf("export function showProfileDisconnectedToast")
    );
    expect(disconnectFn).not.toContain("joinToastAddNote");
    expect(disconnectFn).not.toContain("openPairUpNote");
    expect(disconnectFn).not.toContain("PiTrashSimple");
    expect(disconnectFn).toContain("PiArrowCounterClockwise");
    expect(disconnectFn).toContain("dismissAction");
  });
});
