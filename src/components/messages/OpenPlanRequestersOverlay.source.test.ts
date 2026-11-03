import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isOpenPlanRequestNotPendingError,
  OPEN_PLAN_REQUEST_NOT_PENDING_MESSAGE,
} from "./OpenPlanRequestersOverlay";

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

  it("caps the inner scroller at six compact list rows and keeps Load more inside it", () => {
    const src = readOverlay();
    expect(src).toContain("REQUESTER_ROW_BASE_HEIGHT_PX = 76");
    expect(src).toContain("REQUESTER_LIST_PAD_Y_PX = 28");
    expect(src).toContain("REQUESTER_LIST_MAX_VISIBLE_ROWS = 6");
    expect(28 + 6 * 76).toBe(484);
    expect(src).toContain(
      "maxHeight: `min(${REQUESTER_LIST_SCROLL_MAX_PX}px, calc(82vh - 7.5rem))`"
    );
    expect(src).toContain('className="flex min-w-0 flex-col"');
    expect(src).toContain('data-open-plan-requester-list="true"');
    expect(src).not.toContain("grid grid-cols-2");
    expect(src).not.toContain("min-[360px]:grid-cols-3");
    expect(src).toContain("Load more");
    expect(src).toContain("hasMore");
    const headerIdx = src.indexOf("data-pending-count-badge");
    const listIdx = src.indexOf("ref={listScrollRef}");
    const stackIdx = src.indexOf('data-open-plan-requester-list="true"');
    const loadMoreIdx = src.indexOf("Load more");
    expect(headerIdx).toBeGreaterThan(0);
    expect(listIdx).toBeGreaterThan(headerIdx);
    expect(stackIdx).toBeGreaterThan(listIdx);
    expect(loadMoreIdx).toBeGreaterThan(stackIdx);
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

  it("refreshes requesters when Accept hits a not-pending request", () => {
    const src = readOverlay();
    const acceptFn = src.slice(
      src.indexOf("const handleAccept"),
      src.indexOf("<BottomDrawer")
    );
    expect(acceptFn).toContain("isOpenPlanRequestNotPendingError(err)");
    expect(acceptFn).toContain("openPlanIncomingRequestUnavailable");
    expect(acceptFn).toContain("removeRequest(requestId)");
    expect(acceptFn).toContain("void refresh()");
    expect(acceptFn).toContain("openPlanIncomingAcceptError");
    expect(src).toContain("refresh,");
    expect(isOpenPlanRequestNotPendingError(
      new Error(OPEN_PLAN_REQUEST_NOT_PENDING_MESSAGE)
    )).toBe(true);
    expect(
      isOpenPlanRequestNotPendingError({
        message: `PGRST: ${OPEN_PLAN_REQUEST_NOT_PENDING_MESSAGE}`,
      })
    ).toBe(true);
    expect(isOpenPlanRequestNotPendingError(new Error("network down"))).toBe(
      false
    );
  });

  it("disables drawer swipe while profile preview is open", () => {
    const src = readOverlay();
    expect(src).toContain("active: sheetVisible && !profilePreview");
    expect(src).toContain("engageSwipe: sheetVisible && !profilePreview");
  });
});

describe("OpenPlanRequesterDrawerTile gated identity", () => {
  it("stacks name over sent date, far-right Chat pill, full-width divider, and note", () => {
    const src = readTile();
    const overlay = readOverlay();
    const copy = readFileSync(
      join(process.cwd(), "src/pages/people/peopleUiCopy.ts"),
      "utf8"
    );
    expect(src).toContain("OpenPlanAnonymousAvatar");
    expect(src).toContain("openPlanIncomingAccept");
    expect(src).toContain("resolveOpenPlanRequesterNameLabel");
    expect(src).toContain("neutralEchoSeed={request.request_id}");
    const nameLabel = readFileSync(
      join(process.cwd(), "src/lib/openPlanRequesterNameLabel.ts"),
      "utf8"
    );
    expect(nameLabel).toContain("openPlanRequesterNameHidden");
    expect(nameLabel).toContain("openPlanRequesterNameMissing");
    expect(nameLabel).toContain("request.display_name");
    expect(src).toContain("formatRequestedAt");
    expect(src).toContain("data-open-plan-request-sent");
    expect(src).toContain('data-open-plan-requester-top="true"');
    expect(src).toContain('data-open-plan-requester-row="true"');
    expect(src).toContain('data-open-plan-requester-divider="true"');
    expect(src).toContain("group-last/op-req:hidden");
    expect(src).toContain("h-px w-full shrink-0 bg-[var(--border)]");
    expect(src).not.toContain("color-mix(in_oklab,var(--text)_18%");
    expect(src).not.toContain("white_22%");
    expect(src).toContain("flex-col justify-center");
    expect(overlay).toContain("group/op-req");
    expect(src).toContain("text-[14px] font-semibold");
    expect(src).toContain("min-h-11");
    expect(src).toContain("h-7");
    expect(src).toContain("data-open-plan-accept-pill");
    expect(src).toContain("onAccept(request.request_id)");
    expect(src).toContain('className="w-full break-words');
    expect(src).toContain("truncate");
    expect(src).toContain("onProfile");
    expect(src).toContain("resolveOpenPlanRequesterProfileOpenKey");
    expect(src).toContain("deckOpenProfile");
    expect(copy).toContain('openPlanIncomingAccept: "Chat"');
    expect(src).not.toContain("PiCheck");
    expect(src).not.toContain("PiX");
    expect(src).not.toContain("request.username");
    expect(src).not.toContain("request.bio");
    expect(src).not.toContain('from "../ui/Avatar"');
    expect(src).not.toContain("userId={");
    expect(src).not.toContain("onDecline");
    expect(src).not.toContain("items-baseline gap-1.5");
    expect(src).not.toContain("acceptOpenPlanRequest");
    expect(src).not.toContain("border-b border-[var(--border)]");
    const topIdx = src.indexOf('data-open-plan-requester-top="true"');
    const acceptIdx = src.indexOf("data-open-plan-accept-pill");
    const noteIdx = src.indexOf("data-open-plan-request-note");
    const dividerIdx = src.indexOf('data-open-plan-requester-divider="true"');
    expect(topIdx).toBeGreaterThan(0);
    expect(acceptIdx).toBeGreaterThan(topIdx);
    expect(noteIdx).toBeGreaterThan(acceptIdx);
    expect(dividerIdx).toBeGreaterThan(noteIdx);
  });
});

describe("OpenPlanAnonymousAvatar", () => {
  it("prefers photo then Echo (including neutral seed) before question-mark", () => {
    const src = readAvatar();
    expect(src).toContain("resolveProfileIdentityMedia");
    expect(src).toContain("resolvePeopleFeedEchoPreset");
    expect(src).toContain("neutralEchoSeed");
    expect(src).toContain("avatarDisplayUrl");
    expect(src).toContain("?");
    expect(src).toContain('alt=""');
    expect(src).toContain("aria-hidden");
    expect(src).not.toContain('from "../ui/Avatar"');
    expect(src).not.toContain("userId={");
    expect(src).not.toContain("display_name");
    expect(src).not.toContain("username");
    expect(src).not.toContain("profileIdentityInitial");
    expect(src).not.toContain("requester_id");
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

describe("Open Plan requesters DEV list preview", () => {
  it("is gated to import.meta.env.DEV and never writes to Supabase", () => {
    const preview = readFileSync(
      join(process.cwd(), "src/pages/dev/OpenPlanRequestersListPreview.tsx"),
      "utf8"
    );
    const router = readFileSync(
      join(process.cwd(), "src/router/AppRouter.tsx"),
      "utf8"
    );
    const paths = readFileSync(
      join(process.cwd(), "src/router/Paths.ts"),
      "utf8"
    );
    expect(paths).toContain('devOpenPlanRequestersList: "/dev/open-plan-requesters-list"');
    expect(router).toContain("OpenPlanRequestersListPreview");
    expect(router).toContain("Paths.devOpenPlanRequestersList");
    expect(router).toContain("import.meta.env.DEV");
    expect(preview).toContain("if (!import.meta.env.DEV) return null");
    expect(preview).toContain("FIXTURE_POOL");
    expect(preview).toContain("OpenPlanRequesterDrawerTile");
    expect(preview).toContain("1 | 5 | 10 | 20");
    expect(preview).toContain("data-preview-count");
    expect(preview).toContain("preset:owl_01");
    expect(preview).not.toContain("listOpenPlanRequesters");
    expect(preview).not.toContain("acceptOpenPlanRequest");
    expect(preview).not.toContain("setCachedOpenPlanRequesters");
    expect(preview).not.toContain("supabase");
  });
});
