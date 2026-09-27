import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readOverlay(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/components/messages/GroupUpRequestersOverlay.tsx"
    ),
    "utf8"
  );
}

function readTile(): string {
  return readFileSync(
    join(
      process.cwd(),
      "src/components/messages/GroupUpRequesterDrawerTile.tsx"
    ),
    "utf8"
  );
}

function readDrawer(): string {
  return readFileSync(
    join(process.cwd(), "src/components/ui/BottomDrawer.tsx"),
    "utf8"
  );
}

describe("GroupUpRequestersOverlay presentation", () => {
  it("uses the Create Group inset BottomDrawer layout", () => {
    const src = readOverlay();
    expect(src).toContain("transparentSheet");
    expect(src).toContain("glassPeoplePanelClass");
    expect(src).toContain("max-w-lg");
    expect(src).toContain('contentClassName="px-3 pt-1 sm:px-4"');
    expect(src).toContain("bodyScrollable={false}");
    expect(src).toContain('portalClassName="z-[130]"');
    expect(src).not.toContain('contentClassName="px-0 pt-0"');
  });

  it("keeps a compact header with numeric count, title, optional description, and schedule", () => {
    const src = readOverlay();
    expect(src).toContain("opening.groupTitle");
    expect(src).toContain("opening.description?.trim()");
    expect(src).toContain("truncate text-[15px] font-semibold");
    expect(src).toContain("line-clamp-2");
    expect(src).toContain("data-pending-count-badge");
    expect(src).toContain("pendingBadge");
    expect(src).toContain('pendingCount > 99 ? "99+"');
    expect(src).toContain("formatSocialOccursSchedule");
    expect(src).toContain("opening.occursAt");
    expect(src).toContain("opening.occursTimeExplicit !== false");
    expect(src).toContain("data-group-occurs-label");
    expect(src).toContain("bg-[var(--green-bg)]");
    expect(src).toContain("text-[var(--green-text)]");
    expect(src).not.toContain("green-border");
    const headerIdx = src.indexOf("data-pending-count-badge");
    const dateIdx = src.indexOf("data-group-occurs-label");
    const listIdx = src.indexOf("ref={listScrollRef}");
    expect(headerIdx).toBeGreaterThan(0);
    expect(dateIdx).toBeGreaterThan(headerIdx);
    expect(listIdx).toBeGreaterThan(dateIdx);
    expect(src).not.toContain("formatGroupUpRequestCountLabel");
    expect(src).not.toContain("groupUpRequestGroupLabel");
    expect(src).not.toContain("uppercase tracking-wide");
    expect(src).not.toContain('" request"');
    expect(src).not.toContain('" requests"');
  });

  it("removes View post and the header divider from this drawer", () => {
    const src = readOverlay();
    expect(src).not.toContain("groupUpRequestGroupViewPost");
    expect(src).not.toContain("navigateToPostDetailInApp");
    expect(src).not.toContain("PiArrowSquareOutBold");
    expect(src).not.toContain("handleViewPost");
    expect(src).not.toContain("border-b border-[var(--border)]/40 px-3");
  });

  it("renders a 2/3-column requester grid without a diagonal capsule", () => {
    const src = readOverlay();
    expect(src).toContain("grid grid-cols-2 gap-x-2 gap-y-6 min-[360px]:grid-cols-3");
    expect(src).toContain("GroupUpRequesterDrawerTile");
    expect(src).toContain("key={row.request_id}");
    expect(src).not.toContain("GroupUpRequesterDrawerRow");
    expect(src).not.toContain("ACTION_PILL_ROTATE_DEG");
    expect(src).not.toContain("data-action-capsule");
  });

  it("increases description-to-grid spacing without extra spacers", () => {
    const src = readOverlay();
    expect(src).toContain(
      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-4"
    );
    expect(src).not.toContain("overflow-x-hidden overscroll-contain px-2 pb-3 pt-1");
    expect(src).not.toContain("h-2.5 shrink-0");
    expect(src).not.toContain("mt-3 grid");
  });

  it("caps the inner requester scroller at four grid rows without a forced height", () => {
    const src = readOverlay();
    expect(src).toContain("REQUESTER_TILE_HEIGHT_PX = 138");
    expect(src).toContain("REQUESTER_GRID_ROW_GAP_PX = 24");
    expect(src).toContain("REQUESTER_LIST_PAD_Y_PX = 28");
    expect(src).toContain("REQUESTER_GRID_MAX_VISIBLE_ROWS = 4");
    expect(src).toContain("REQUESTER_LIST_FOUR_ROW_MAX_PX");
    expect(28 + 4 * 138 + 3 * 24).toBe(652);
    expect(src).toContain(
      "maxHeight: `min(${REQUESTER_LIST_FOUR_ROW_MAX_PX}px, calc(82vh - 7.5rem))`"
    );
    expect(src).not.toContain("h-[652px]");
    expect(src).not.toContain("min-h-[652px]");
    expect(src).not.toContain("ResizeObserver");
    expect(src).toContain("Load more");
    expect(src).toContain("hasMore");
    expect(src).toContain("overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-4");
    expect(src).toContain('touchAction: "pan-y"');
    expect(src).toContain("startZoneMaxXVw: 1");
    expect(src).toContain("onOverlayPointerDownCapture");
    const headerIdx = src.indexOf("data-pending-count-badge");
    const listIdx = src.indexOf("ref={listScrollRef}");
    const gridIdx = src.indexOf("grid grid-cols-2 gap-x-2 gap-y-6 min-[360px]:grid-cols-3");
    expect(headerIdx).toBeGreaterThan(0);
    expect(listIdx).toBeGreaterThan(headerIdx);
    expect(gridIdx).toBeGreaterThan(listIdx);
  });

  it("reuses content swipe-to-close on the BottomDrawer portal while the sheet is visible", () => {
    const src = readOverlay();
    expect(src).toContain("useOverlayContentSwipeDismiss");
    expect(src).not.toContain("useOverlayEdgeSwipeDismiss");
    expect(src).toContain("startZoneMaxXVw: 1");
    expect(src).toContain("startZoneMaxPx: 10000");
    expect(src).toContain("leftInsetPx: 0");
    expect(src).toContain("commitThresholdPx: 48");
    expect(src).toContain("horizontalLockPx: 12");
    expect(src).not.toContain("startZoneMaxXVw: 0.45");
    expect(src).not.toContain("startZoneMaxPx: 180");
    expect(src).not.toContain("isNativeApp");
    expect(src).toContain("allowButtonTargets: false");
    expect(src).toContain("REQUESTERS_CONTENT_SWIPE_EXCLUDE_SELECTOR");
    expect(src).toContain('"button"');
    expect(src).toContain("'[role=\"button\"]'");
    expect(src).toContain('"a[href]"');
    expect(src).toContain('"[data-no-overlay-swipe]"');
    expect(src).toContain("active: sheetVisible");
    expect(src).toContain("engageSwipe: sheetVisible");
    expect(src).toContain("onSwipeCommit: handleSwipeCommit");
    expect(src).toContain("closeGroupUpRequestersOverlay()");
    expect(src).toContain("onOverlayPointerDownCapture={onOverlayPointerDownCapture}");
    expect(src).toContain("overlayStyle={overlaySwipeStyle}");
    expect(src).toContain('touchAction: "pan-y"');
    expect(src).toContain("data-requesters-swipe-panel");
    expect(src).toContain("echoGroupRequestSwipeRecord");
    expect(src).toContain("onDebugEvent");
    expect(src).not.toContain("{...panelSwipeProps}");
    expect(src).not.toContain("onPointerDownCapture={onPanelPointerDownCapture}");
    expect(src).not.toContain("style={contentSwipeMotionStyle}");
    expect(src).not.toContain("touch-pan-x");
    expect(src).not.toContain('touchAction: "pan-x"');
  });

  it("applies overlay swipe motion on the BottomDrawer portal without a second gesture system", () => {
    const drawer = readDrawer();
    expect(drawer).toContain("overlayStyle?: React.CSSProperties");
    expect(drawer).toContain("onOverlayPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>");
    expect(drawer).toContain("style={overlayStyle}");
    expect(drawer).toContain("onPointerDownCapture={onOverlayPointerDownCapture}");
    expect(drawer).toContain("if (!onOverlayPointerDownCapture)");
    expect(drawer).toContain("e.preventDefault()");
  });

  it("opens Mine-style profile overlay instead of /u navigation", () => {
    const src = readOverlay();
    expect(src).toContain("getTabFromPath");
    expect(src).toContain('sheetVisible = held && tab === "messages"');
    expect(src).toContain("open={sheetVisible}");
    expect(src).toContain("enabled: held");
    expect(src).toContain("RequesterProfileOverlay");
    expect(src).toContain("resolveGroupUpRequesterProfileOpenKey");
    expect(src).toContain("setProfilePreview");
    expect(src).not.toContain("profileByUsername");
    expect(src).not.toContain("navigate(profileByUsername");
    expect(src).not.toContain('tab === "messages" || tab === "other-profile"');
    expect(src).toContain('if (tab === "messages") return');
    expect(src).toContain("closeGroupUpRequestersOverlay()");
    expect(src).toContain("listScrollTopRef");
    expect(src).toContain("groupUpIncomingAccept");
    expect(src).toContain("profilePreview.requestId");
    expect(src).toContain("profilePreview.requestedAt");
  });

  it("preserves accept/decline handlers, busy protection, and cache-first requesters", () => {
    const src = readOverlay();
    expect(src).toContain("acceptGroupUpRequest");
    expect(src).toContain("declineGroupUpRequest");
    expect(src).toContain("busyIdRef.current");
    expect(src).toContain("setBusyId");
    expect(src).toContain("removeRequest");
    expect(src).toContain("removeRequest(requestId)");
    expect(src).toContain("useGroupUpRequesters");
    expect(src).toContain("enabled: held");
    expect(src).not.toContain("useEnsureGroupUpRequestersCached");
    expect(src).not.toContain("getProfileByUserId");
    expect(src).not.toContain("force: true");
    expect(src).not.toContain("fetch(");
  });
});

describe("GroupUpRequesterDrawerTile presentation", () => {
  it("shows a truncated display name without bio, username, or a fake note", () => {
    const src = readTile();
    expect(src).toContain("request.display_name");
    expect(src).toContain("truncate text-center text-[11px] font-medium");
    expect(src).toContain("groupUpIncomingSomeone");
    expect(src).not.toContain("request.bio");
    expect(src).not.toContain("@{");
    expect(src).not.toContain("`@${");
  });

  it("uses a 56px circular Avatar matching Group Members tiles", () => {
    const src = readTile();
    expect(src).toContain("AVATAR_PX = 56");
    expect(src).toContain('from "../ui/Avatar"');
    expect(src).toContain("size={AVATAR_PX}");
    expect(src).toContain("h-14 w-14");
    expect(src).toContain("rounded-full");
    expect(src).toContain("requester_user_id");
    expect(src).toContain("deckOpenProfile");
    expect(src).toContain("onProfile(request)");
  });

  it("groups Accept/Decline in one compact pill with independent 44px targets", () => {
    const src = readTile();
    expect(src).toContain("data-requester-action-pill");
    expect(src).toContain("inline-flex items-center rounded-full");
    expect(src).toContain("PiCheck");
    expect(src).toContain("PiX");
    expect(src).toContain("aria-label={peopleUiCopy.groupUpIncomingAccept}");
    expect(src).toContain("aria-label={peopleUiCopy.groupUpIncomingDecline}");
    expect(src).toContain(
      'className="flex h-11 w-11 shrink-0 items-center justify-center'
    );
    expect(src).toContain("h-8 w-8");
    expect(src).toContain("e.stopPropagation()");
    expect(src).not.toContain("data-action-capsule");
    expect(src).not.toContain("ACTION_PILL_ROTATE_DEG");
    expect(src).not.toContain("rotate(");
    expect(src).not.toContain("min-w-[6.5rem]");
    expect((src.match(/h-11 w-11/g) ?? []).length).toBe(2);
  });
});
