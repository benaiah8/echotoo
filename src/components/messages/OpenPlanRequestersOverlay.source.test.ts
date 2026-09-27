import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readOverlay(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/components/messages/OpenPlanRequestersOverlay.tsx"
    ),
    "utf8"
  );
}

function readTile(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/components/messages/OpenPlanRequesterDrawerTile.tsx"
    ),
    "utf8"
  );
}

function readAvatar(): string {
  return readFileSync(
    join(process.cwd(), "src/components/messages/OpenPlanAnonymousAvatar.tsx"),
    "utf8"
  );
}

function readChrome(): string {
  return readFileSync(
    join(process.cwd(), "src/components/AppFloatingChrome.tsx"),
    "utf8"
  );
}

function readPush(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/components/notifications/NativePushForegroundBridge.tsx"
    ),
    "utf8"
  );
}

function readProfileOverlay(): string {
  return readFileSync(
    join(process.cwd(), "src/components/messages/RequesterProfileOverlay.tsx"),
    "utf8"
  );
}

function readMineOverlay(): string {
  return readFileSync(
    join(process.cwd(), "src/components/people/MineCandidateProfileOverlay.tsx"),
    "utf8"
  );
}

function readHook(): string {
  return readFileSync(
    join(process.cwd(), "src/hooks/useOpenPlanRequesters.ts"),
    "utf8"
  );
}

describe("OpenPlanRequestersOverlay presentation", () => {
  it("reuses Group swipe geometry on the portal root without modifying BottomDrawer", () => {
    const src = readOverlay();
    expect(src).toContain("useOverlayContentSwipeDismiss");
    expect(src).toContain("startZoneMaxXVw: 1");
    expect(src).toContain("startZoneMaxPx: 10000");
    expect(src).toContain("leftInsetPx: 0");
    expect(src).toContain("commitThresholdPx: 48");
    expect(src).toContain("horizontalLockPx: 12");
    expect(src).toContain('touchAction: "pan-y"');
    expect(src).toContain("onOverlayPointerDownCapture");
    expect(src).toContain("overlayStyle={overlaySwipeStyle}");
    expect(src).toContain("data-requesters-swipe-panel");
    expect(src).not.toContain("{...panelSwipeProps}");
    expect(src).not.toContain("style={contentSwipeMotionStyle}");
    expect(src).not.toContain("useOverlayEdgeSwipeDismiss");
  });

  it("caps the inner scroller at four named rows and keeps Load more inside it", () => {
    const src = readOverlay();
    expect(src).toContain("REQUESTER_TILE_HEIGHT_PX = 140");
    expect(src).toContain("REQUESTER_GRID_ROW_GAP_PX = 24");
    expect(src).toContain("REQUESTER_LIST_PAD_Y_PX = 28");
    expect(src).toContain("REQUESTER_GRID_MAX_VISIBLE_ROWS = 4");
    expect(28 + 4 * 140 + 3 * 24).toBe(660);
    expect(src).toContain(
      "maxHeight: `min(${REQUESTER_LIST_FOUR_ROW_MAX_PX}px, calc(82vh - 7.5rem))`"
    );
    expect(src).toContain("grid grid-cols-2 gap-x-2 gap-y-6 min-[360px]:grid-cols-3");
    expect(src).toContain("Load more");
    expect(src).toContain("hasMore");
    const headerIdx = src.indexOf("data-pending-count-badge");
    const listIdx = src.indexOf("ref={listScrollRef}");
    const gridIdx = src.indexOf(
      "grid grid-cols-2 gap-x-2 gap-y-6 min-[360px]:grid-cols-3"
    );
    const loadMoreIdx = src.indexOf("Load more");
    expect(headerIdx).toBeGreaterThan(0);
    expect(listIdx).toBeGreaterThan(headerIdx);
    expect(gridIdx).toBeGreaterThan(listIdx);
    expect(loadMoreIdx).toBeGreaterThan(gridIdx);
  });

  it("opens Mine-style profile overlay and Accept still closes before DM", () => {
    const src = readOverlay();
    expect(src).toContain("RequesterProfileOverlay");
    expect(src).toContain("resolveOpenPlanRequesterProfileOpenKey");
    expect(src).toContain("setProfilePreview");
    expect(src).toContain("acceptOpenPlanRequest");
    expect(src).toContain("closeOpenPlanRequestersOverlay()");
    expect(src).toContain("messagesConversationPath(conversationId)");
    expect(src).toContain("busyIdRef.current");
    expect(src).toContain("remainingOpenPlanAcceptPatchInputs");
    expect(src).toContain("isMessagesConversationPath");
    expect(src).not.toContain("profileByUsername");
    expect(src).not.toContain("declineOpenPlan");
    expect(src).not.toContain("request.username");
    expect(src).not.toContain("request.bio");
    const acceptFn = src.slice(
      src.indexOf("const handleAccept"),
      src.indexOf("<BottomDrawer")
    );
    expect(acceptFn).toContain("closeOpenPlanRequestersOverlay()");
    expect(acceptFn).toContain("navigate(messagesConversationPath");
    expect(acceptFn).toContain("setProfilePreview(null)");
    const closeIdx = acceptFn.indexOf("closeOpenPlanRequestersOverlay()");
    const navIdx = acceptFn.indexOf("navigate(messagesConversationPath");
    expect(closeIdx).toBeGreaterThan(0);
    expect(navIdx).toBeGreaterThan(closeIdx);
    expect(src).toContain("openPlanIncomingAccept");
    expect(src).toContain("onAccept: () => void handleAccept(profilePreview.requestId)");
  });

  it("disables drawer swipe while profile preview is open", () => {
    const src = readOverlay();
    expect(src).toContain("active: sheetVisible && !profilePreview");
    expect(src).toContain("engageSwipe: sheetVisible && !profilePreview");
  });
});

describe("OpenPlanRequesterDrawerTile gated identity", () => {
  it("shows photo, gated name or Name hidden, compact Accept, and profile when keyed", () => {
    const src = readTile();
    expect(src).toContain("OpenPlanAnonymousAvatar");
    expect(src).toContain("openPlanIncomingAccept");
    expect(src).toContain("openPlanRequesterNameHidden");
    expect(src).toContain("request.display_name");
    expect(src).toContain("text-[12.5px] font-semibold");
    expect(src).toContain("min-h-11");
    expect(src).toContain("h-7");
    expect(src).toContain("data-open-plan-accept-pill");
    expect(src).toContain("w-[80px] max-w-[82px] min-w-[76px]");
    expect(src).not.toContain("w-full max-w-full");
    expect(src).toContain("truncate");
    expect(src).toContain("onProfile");
    expect(src).toContain("resolveOpenPlanRequesterProfileOpenKey");
    expect(src).toContain("deckOpenProfile");
    expect(src).not.toContain("PiCheck");
    expect(src).not.toContain("PiX");
    expect(src).not.toContain("request.username");
    expect(src).not.toContain("request.bio");
    expect(src).not.toContain('from "../ui/Avatar"');
    expect(src).not.toContain("userId={");
    expect(src).not.toContain("onDecline");
  });
});

describe("OpenPlanAnonymousAvatar", () => {
  it("resolves photo / echo / question-mark without named Avatar", () => {
    const src = readAvatar();
    expect(src).toContain("resolveProfileIdentityMedia");
    expect(src).toContain("avatarDisplayUrl");
    expect(src).toContain("?");
    expect(src).toContain('alt=""');
    expect(src).toContain("aria-hidden");
    expect(src).not.toContain('from "../ui/Avatar"');
    expect(src).not.toContain("userId={");
    expect(src).not.toContain("display_name");
    expect(src).not.toContain("username");
    expect(src).not.toContain("profileIdentityInitial");
  });
});

describe("Open Plan overlay mount and push invalidation", () => {
  it("mounts the overlay from AppFloatingChrome", () => {
    const src = readChrome();
    expect(src).toContain("OpenPlanRequestersOverlay");
    expect(src).toContain("GroupUpRequestersOverlay");
  });

  it("invalidates grouped Open Plan cache and requesters on foreground request push", () => {
    const src = readPush();
    expect(src).toContain("invalidateOpenPlanIncoming");
    expect(src).toContain("invalidateOpenPlanRequestGroups");
    expect(src).toContain("invalidateOpenPlanRequesters");
    expect(src).toContain("routeData.opportunityId");
    expect(src).toContain("NOTIFICATION_KINDS.OPEN_PLAN_REQUEST");
  });
});

describe("Requester profile overlay reuse", () => {
  it("embeds OtherProfilePage with Back|Accept and leaves Mine unchanged", () => {
    const profile = readProfileOverlay();
    const mine = readMineOverlay();
    expect(profile).toContain("OtherProfilePage");
    expect(profile).toContain("embedded");
    expect(profile).toContain("useInviteOverlaySyntheticHistory");
    expect(profile).toContain("useOverlayBackgroundScrollLock");
    expect(profile).toContain('marker: REQUESTER_PROFILE_HISTORY_MARKER');
    expect(profile).toContain("requesterProfileOverlay");
    expect(profile).toContain("acceptAction");
    expect(profile).toContain('data-requester-profile-footer={showAccept ? "back-accept" : "back"}');
    expect(profile).toContain("data-requester-profile-action-pill");
    expect(profile).toContain("glassActionSheetPillClass");
    expect(profile).toContain("REQUESTER_PROFILE_OVERLAY_Z = 140");
    expect(mine).toContain("MINE_PROFILE_OVERLAY_Z = 90");
    expect(mine).not.toContain("acceptAction");
    expect(mine).not.toContain("openPlanIncomingAccept");
    expect(mine).not.toContain("data-requester-profile-action-pill");
    expect(mine).toContain("MINE_CANDIDATE_PROFILE_HISTORY_MARKER");
  });
});

describe("Open Plan requesters soft revalidate", () => {
  it("forces network refresh when soft-stale instead of TTL cache short-circuit", () => {
    const src = readHook();
    expect(src).toContain("void revalidate(true)");
    expect(src).not.toContain("void revalidate(false)");
    expect(src).toContain("isOpenPlanRequestersSoftStale");
    expect(src).toContain("inflightRef");
  });
});
