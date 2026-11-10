/**
 * Other Profile rail actions: Heart reuses Profile Connect, Comment reuses
 * the Duo composer, and the card opens Post Detail.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Other Profile Heart + Comment (source)", () => {
  const card = readSrc(
    "src/components/profile/ProfileSocialOpportunityCard.tsx"
  );
  const ownStart = card.indexOf("data-profile-social-own-actions");
  const otherStart = card.indexOf("data-profile-social-other-actions");
  const own = card.slice(ownStart, otherStart);
  const other = card.slice(otherStart);

  it("Own Profile still has Duo and Group only", () => {
    expect(own).toContain("<SocialDuoPill");
    expect(own).toContain("<SocialGroupPill");
    expect(own).toContain("handleOwnDuo");
    expect(own).toContain("handleOwnGroup");
    expect(card).toContain("openPairUpManage(row.source_post_id)");
    expect(card).toContain("openGroupUpManage(");
    expect(own).not.toContain('kind="heart"');
    expect(own).not.toContain('kind="comment"');
    expect(own).not.toContain("handleConnect");
    expect(own).not.toContain("handleComment");
  });

  it("Other Profile shows Heart and Comment only", () => {
    expect(other).toContain('kind="heart"');
    expect(other).toContain('kind="comment"');
    expect(other).toContain("size={44}");
    expect(other).toContain("PeopleActionStateButton");
    expect(other).not.toContain("<SocialDuoPill");
    expect(other).not.toContain("<SocialGroupPill");
    expect(other).not.toContain("ProfileConnectPill");
    expect(other).not.toContain("ProfileGroupRequestPill");
    expect(card).not.toContain("runMinePairUpConnect");
    expect(card).not.toContain("runDiscoverHeartAction");
    expect(card).not.toContain("connectDiscoverPairUp");
    expect(card).not.toContain("withdrawDiscoverPairUpInterest");
    expect(card).not.toContain("withdrawDuoPairUpInterest");
  });

  it("Heart uses the Profile Connect RPC path", () => {
    expect(card).toContain("connectProfilePairUp");
    expect(card).toContain("expressPairUpInterest");
    expect(card).toContain("viewer_duo_joined");
    expect(card).toContain("viewer_duo_interested");
    expect(card).toContain(
      "duoPayload?.viewer_duo_interested === true || viewerProfileConnected"
    );
    expect(other).toContain("void handleConnect()");
    const connectFn = card.slice(
      card.indexOf("const handleConnect"),
      card.indexOf("const handleComment")
    );
    expect(connectFn).toContain("connectProfilePairUp");
    expect(connectFn).toContain("expressPairUpInterest");
    expect(connectFn).not.toContain("connectDiscoverPairUp");
  });

  it("preserves mutual match completion and the photo prompt", () => {
    expect(card).toContain("settleProfileConnect");
    expect(card).toContain("completePairUpMatch");
    expect(card).toContain("messagesConversationPath");
    expect(card).toContain("openPairUpPhotoPrompt");
    expect(card).toContain('"people_connect"');
    expect(card).toContain("PAIR_UP_CONNECT_PHOTO_PROMPT_TITLE");
    expect(card).toContain("showProfileConnectToast");
  });

  it("comment recipient is profileUserId and uses the Duo session store", () => {
    expect(card).toContain("const recipientUserId = profileUserId.trim()");
    expect(card).not.toContain("recipientUserId = row.source_author_id");
    expect(card).toContain('surface: "duo"');
    expect(card).toContain("openPeopleCommentComposer");
    expect(card).toContain("routeDuoCommentTap");
    expect(card).toContain("resolveActivatedDuoComment");
    expect(card).toContain("listCommented: null");
    expect(card).toContain("recipientUserId: profileUserId");
    expect(card).toContain("duoCommentStateKey");
    expect(card).toContain("duoCommentVisual");
    expect(card).toContain("subscribeDuoCommentState");
    expect(card).not.toContain('surface: "discover"');
    expect(card).not.toContain("onAfterMessageDelivered");
    const page = readSrc("src/pages/OtherProfilePage.tsx");
    expect(page).toContain("profileIdentity={profileIdentity}");
    expect(page).toContain("user_id: stableProfile.user_id");
    expect(page).toContain("display_name: stableProfile.display_name");
    const rail = readSrc(
      "src/components/profile/ProfileSocialOpportunityRail.tsx"
    );
    expect(rail).toContain("profileIdentity={profileIdentity}");
  });

  it("group-only cards cannot Heart or Comment", () => {
    expect(card).toContain('const heartButtonState = !hasOwnerDuo');
    expect(card).toContain('? "disabled"');
    expect(card).toContain("disabled={!hasOwnerDuo}");
    expect(card).toContain("if (isSelf || !hasOwnerDuo || !duoPayload || !viewerUserId) return");
    expect(card).toContain("if (connectBusy || !viewerUserId || isSelf || !duoPayload) return");
  });

  it("card tap opens Post Detail; Heart, Comment, and Report do not", () => {
    expect(card).toContain("onClick={openDetail}");
    expect(card).toContain("navigateToPostDetailInApp");
    expect(card).toContain("seedKnownActivePairUpBeforeDetail");
    expect(card).toContain("seedKnownActiveGroupUpBeforeDetail");
    const actions = card.slice(card.indexOf("data-profile-social-actions"));
    expect(actions).toContain("e.stopPropagation()");
    const report = card.slice(card.indexOf('aria-label="Report"'));
    expect(report).toContain("e.stopPropagation()");
  });

  it("Other Profile circles keep a fixed theme background", () => {
    const css = readSrc(
      "src/components/profile/ProfileSocialOpportunityActions.css"
    );
    const button = readSrc(
      "src/components/people/PeopleActionStateButton.tsx"
    );
    expect(card).toContain('import "./ProfileSocialOpportunityActions.css"');
    expect(css).toContain("[data-profile-social-other-actions]");
    expect(css).toContain("background-color: #111111");
    expect(css).toContain("background-color: #ffffff");
    expect(css).toContain("color: #f43f5e");
    expect(css).toContain("color: #e11d48");
    expect(css).toContain(
      '[data-people-action-kind="comment"][data-people-action-visual="active"]'
    );
    expect(css).toContain("width: 32px");
    expect(css).toContain("height: 32px");
    expect(css).not.toContain(
      '[data-people-action-kind="heart"][data-people-action-visual="active"] > svg'
    );
    expect(css).toContain("html.theme-light");
    expect(css).toContain("html:not(.theme-light)");
    expect(css).not.toContain("data-profile-social-own-actions");
    expect(button).toContain("bg-white text-[rgb(225,29,72)]");
    expect(button).toContain("bg-white text-black");
    expect(button).toContain("bg-[var(--text)]/10");
    expect(button).not.toContain("data-profile-social-other-actions");
    expect(button).toContain('"h-9 w-9"');
    expect(button).toContain('"h-6 w-6"');
    expect(button).toContain('size === 52 ? "h-[52px] w-[52px]" : "h-11 w-11"');
    expect(button).toContain("opacity-50");
    expect(other).toContain("size={44}");
    expect(other).toContain("disabled={!hasOwnerDuo}");
  });

  it("stale Connect still invalidates only the viewer+owner rail", () => {
    expect(card).toContain(
      "invalidateProfileSocialOpportunities(viewerUserId, profileUserId)"
    );
    expect(card).not.toContain("invalidateProfileSocialOpportunitiesForViewer");
  });
});
