import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEOPLE_MINE_NOTE_COLLAPSED_LINES,
  PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX,
  PEOPLE_MINE_NOTE_RESERVE_H_PX,
  PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX,
} from "./peopleCandidateMediaPresentation";
import { peopleIdentityMovedPastTapThreshold } from "./mineIdentityGesture";

const SHARED_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleExpandableNote.tsx"),
  "utf8"
);
const MINE_WRAP_SRC = readFileSync(
  resolve(__dirname, "../../components/people/MineOpportunityNote.tsx"),
  "utf8"
);
const SLIDE_SRC = readFileSync(
  resolve(
    __dirname,
    "../../components/people/PeopleCanonicalCandidatePresentation.tsx"
  ),
  "utf8"
);
const DUO_SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/PeopleDuoCandidateSlide.tsx"),
  "utf8"
);
const PLANS_SLIDE_SRC = readFileSync(
  resolve(__dirname, "../../components/people/PeopleOpenPlanCandidateSlide.tsx"),
  "utf8"
);
const COPY_SRC = readFileSync(
  resolve(__dirname, "../../pages/people/peopleUiCopy.ts"),
  "utf8"
);

describe("MineOpportunityNote (shared PeopleExpandableNote)", () => {
  it("short note: no expansion affordance until overflow is measured", () => {
    expect(SHARED_SRC).toContain("scrollHeight > el.clientHeight");
    expect(SHARED_SRC).toContain("showControl");
    expect(SHARED_SRC).toContain("canExpand || expanded");
  });

  it("long note collapsed = 3 lines (Mine + shared)", () => {
    expect(PEOPLE_MINE_NOTE_COLLAPSED_LINES).toBe(3);
    expect(SHARED_SRC).toContain("line-clamp-3");
    expect(SHARED_SRC).not.toMatch(/line-clamp-2/);
    expect(MINE_WRAP_SRC).toContain("PEOPLE_MINE_NOTE_RESERVE_H_PX");
    expect(MINE_WRAP_SRC).toContain('expansionMode="floating"');
    expect(PEOPLE_MINE_NOTE_RESERVE_H_PX).toBeGreaterThanOrEqual(70);
  });

  it("removes generic Opportunity Note title; shows person + Note label", () => {
    expect(COPY_SRC).not.toContain('duoNoteFloatingTitle: "Opportunity note"');
    expect(COPY_SRC).not.toMatch(/Opportunity [Nn]ote/);
    expect(MINE_WRAP_SRC).not.toContain("duoNoteFloatingTitle");
    expect(SHARED_SRC).not.toContain("Opportunity note");
    expect(SHARED_SRC).toContain("data-people-expandable-note-floating-name");
    expect(SHARED_SRC).toContain(
      "data-people-expandable-note-floating-note-label"
    );
    expect(COPY_SRC).toContain('duoNoteSectionLabel: "Note"');
    expect(MINE_WRAP_SRC).toContain("duoNoteSectionLabel");
    expect(MINE_WRAP_SRC).toContain("personDisplayName");
    expect(SLIDE_SRC).toContain("personDisplayName={displayName}");
    expect(DUO_SLIDE_SRC).toContain("displayName={name}");
  });

  it("shows avatar via shared Avatar; never username", () => {
    expect(SHARED_SRC).toContain('from "../ui/Avatar"');
    expect(SHARED_SRC).toContain("FLOATING_AVATAR_PX = 32");
    expect(SHARED_SRC).toContain("snap.avatarUrl");
    expect(SHARED_SRC).toContain("snap.userId");
    expect(MINE_WRAP_SRC).toContain("personAvatarUrl");
    expect(MINE_WRAP_SRC).toContain("personUserId");
    expect(SLIDE_SRC).toContain(
      "personAvatarUrl={showIdentity ? avatarUrl : null}"
    );
    expect(SLIDE_SRC).toContain(
      "personUserId={showIdentity ? personKey : null}"
    );
    expect(DUO_SLIDE_SRC).toContain("avatarUrl={candidate.avatar_url}");
    expect(DUO_SLIDE_SRC).toContain("personKey={personKey}");
    expect(SHARED_SRC).not.toMatch(/\busername\b|@handle|@\$\{/);
    expect(MINE_WRAP_SRC).not.toMatch(/\busername\b/);
    expect(MINE_WRAP_SRC).not.toContain("candidate.username");
    expect(SLIDE_SRC).not.toContain("personDisplayName={candidate.username}");
  });

  it("divider removed; header→body gap preserved as spacer", () => {
    expect(SHARED_SRC).toContain(
      "data-people-expandable-note-floating-header-gap"
    );
    expect(SHARED_SRC).toContain("h-3.5 shrink-0");
    // Floating header must not use border-b divider.
    const headerBlock = SHARED_SRC.match(
      /data-people-expandable-note-floating-header[\s\S]*?data-people-expandable-note-floating-body/
    )?.[0];
    expect(headerBlock).toBeTruthy();
    expect(headerBlock).not.toContain("border-b");
  });

  it("panel is narrower than prior frame-width presentation", () => {
    expect(SHARED_SRC).toContain("PEOPLE_EXPANDABLE_NOTE_FLOATING_PANEL_MAX_W");
    expect(SHARED_SRC).toContain(
      "min(calc(var(--people-mine-frame-w, 22rem) - 32px), calc(100vw - 48px))"
    );
    expect(SHARED_SRC).not.toContain(
      "max-w-[min(100%,var(--people-mine-frame-w,22rem))]"
    );
  });

  it("dismiss layer provides one backdrop blur/scrim; panel has no blur", () => {
    expect(SHARED_SRC).toContain("data-people-expandable-note-scrim");
    expect(SHARED_SRC).toContain("backdrop-blur-[6px]");
    expect(SHARED_SRC).toContain("color-mix(in_oklab,var(--bg)_40%");
    // Scrim owns the only backdrop-blur; panel surface is opaque glass mix.
    expect(SHARED_SRC).toContain(
      "bg-[color-mix(in_oklab,var(--surface)_94%,var(--glass-bg))]"
    );
    const scrimIdx = SHARED_SRC.indexOf("data-people-expandable-note-scrim");
    const panelIdx = SHARED_SRC.indexOf(
      'data-people-expandable-note-floating-panel="true"'
    );
    expect(scrimIdx).toBeGreaterThan(0);
    expect(panelIdx).toBeGreaterThan(scrimIdx);
    const afterPanel = SHARED_SRC.slice(panelIdx, panelIdx + 800);
    expect(afterPanel).not.toContain("backdrop-blur");
  });

  it("tap opens floating note (portal dialog), not inline growth", () => {
    expect(SHARED_SRC).toContain('expansionMode = "inline"');
    expect(SHARED_SRC).toContain("createPortal");
    expect(SHARED_SRC).toContain('role="dialog"');
    expect(SHARED_SRC).toContain("data-people-expandable-note-floating-panel");
    expect(SHARED_SRC).toContain("floatingOpen");
    expect(SHARED_SRC).toContain("inlineExpanded");
    expect(SHARED_SRC).toMatch(
      /maxHeight: inlineExpanded[\s\S]*people-mine-surplus-pad-bottom/
    );
    expect(MINE_WRAP_SRC).toContain('expansionMode="floating"');
  });

  it("portrait/carousel: Mine slide does not reclaim surplus on expand", () => {
    expect(SLIDE_SRC).toContain('height: "var(--people-mine-surplus-pad-top, 0px)"');
    expect(SLIDE_SRC).not.toContain("noteExpanded");
    expect(SLIDE_SRC).not.toContain(
      "max(0px, calc(var(--people-mine-surplus-pad-top, 0px) - 16px))"
    );
    expect(SLIDE_SRC).toContain("MineOpportunityNote");
  });

  it("outside tap closes via dismiss layer without bubbling to carousel", () => {
    expect(SHARED_SRC).toContain("data-people-expandable-note-dismiss");
    expect(SHARED_SRC).toContain("onDismissLayerClick");
    expect(SHARED_SRC).toContain("stopOverlayPointer");
    expect(SHARED_SRC).toMatch(
      /onDismissLayerClick[\s\S]*?e\.stopPropagation\(\)[\s\S]*?closeFloating/
    );
  });

  it("close button + Escape + Android/system Back dismiss", () => {
    expect(SHARED_SRC).toContain("data-people-expandable-note-floating-close");
    expect(SHARED_SRC).toContain("useInviteOverlaySyntheticHistory");
    expect(SHARED_SRC).toContain("PEOPLE_EXPANDABLE_NOTE_FLOATING_HISTORY_MARKER");
    expect(COPY_SRC).toContain("duoNoteClose");
    expect(MINE_WRAP_SRC).toContain("duoNoteClose");
  });

  it("candidate change closes; stale identity cannot leak into another note", () => {
    expect(SHARED_SRC).toContain("resetKey");
    expect(SHARED_SRC).toContain("setExpanded(false)");
    expect(SHARED_SRC).toContain("setFloatingSnapshot");
    expect(SHARED_SRC).toContain("FloatingSnapshot");
    expect(SHARED_SRC).toContain("identityKey");
    expect(SHARED_SRC).toContain("floatingPerson.identityKey !== resetKey");
    expect(SHARED_SRC).toContain("floatingSnapshot.resetKey === resetKey");
    expect(SHARED_SRC).toContain("data-people-expandable-note-identity");
    expect(MINE_WRAP_SRC).toContain("identityKey: resetKey");
    expect(SLIDE_SRC).toContain("noteResetKey");
    expect(DUO_SLIDE_SRC).toContain("opportunity_id");
  });

  it("long text scrolls inside bounded floating panel", () => {
    expect(SHARED_SRC).toContain("data-people-expandable-note-floating-body");
    expect(SHARED_SRC).toContain("overflow-y-auto");
    expect(SHARED_SRC).toContain("overscroll-contain");
    expect(SHARED_SRC).toContain('maxHeight: "min(52dvh, calc(100dvh - 14rem))"');
    expect(MINE_WRAP_SRC).toContain("PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX");
    expect(PEOPLE_MINE_NOTE_EXPANDED_TEXT_MAX_H_PX).toBeGreaterThan(80);
    expect(SHARED_SRC).not.toMatch(/fullscreen|ActionSheet|bottom.?sheet/i);
  });

  it("Plans uses canonical floating note (anonymous header)", () => {
    expect(PLANS_SLIDE_SRC).toContain("PeopleCanonicalCandidatePresentation");
    expect(PLANS_SLIDE_SRC).toContain("identityVisible={false}");
    expect(MINE_WRAP_SRC).toContain("anonymousIdentity");
    expect(MINE_WRAP_SRC).toContain('expansionMode="floating"');
    expect(PLANS_SLIDE_SRC).not.toContain("noteExpanded");
    expect(PLANS_SLIDE_SRC).not.toContain("data-people-plans-chrome");
  });

  it("expand control is accessible; Note label uses people-display italic", () => {
    expect(SHARED_SRC).toContain("aria-expanded");
    expect(SHARED_SRC).toContain('aria-haspopup={isFloating ? "dialog"');
    expect(SHARED_SRC).toContain("aria-modal");
    expect(SHARED_SRC).toContain("--font-people-display");
    expect(SHARED_SRC).toContain("italic");
    expect(MINE_WRAP_SRC).toContain("duoNoteExpand");
  });

  it("does not stopPropagation on pointerdown (Embla drag preserved)", () => {
    expect(SHARED_SRC).toMatch(
      /onPointerDown = useCallback\(\(e: ReactPointerEvent\) => \{[\s\S]*?originRef/
    );
    const downMatch = SHARED_SRC.match(
      /onPointerDown = useCallback\(\(e: ReactPointerEvent\) => \{([\s\S]*?)\}, \[\]\)/
    );
    expect(downMatch?.[1] ?? "").not.toMatch(/e\.stopPropagation/);
    expect(SHARED_SRC).toContain("peopleIdentityMovedPastTapThreshold");
    expect(
      peopleIdentityMovedPastTapThreshold({ x: 0, y: 0 }, 11, 0)
    ).toBe(true);
    expect(
      peopleIdentityMovedPastTapThreshold({ x: 0, y: 0 }, 5, 5)
    ).toBe(false);
    expect(PEOPLE_PHOTO_TAP_MOVE_THRESHOLD_PX).toBe(10);
  });

  it("empty notes stay safe", () => {
    expect(MINE_WRAP_SRC).toContain("duoNoteEmpty");
    expect(SHARED_SRC).toContain("data-people-duo-note-empty");
  });

  it("Mine wrapper does not reimplement expand/collapse", () => {
    expect(MINE_WRAP_SRC).not.toContain("useState");
    expect(MINE_WRAP_SRC).not.toContain("setExpanded");
    expect(MINE_WRAP_SRC).toContain('from "./PeopleExpandableNote"');
  });
});
