import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  companyAnnouncementsHaveUnread,
  isCompanyAnnouncementActiveAt,
  patchCompanyAnnouncementsSeen,
  selectActiveCompanyAnnouncements,
} from "./companyAnnouncementActive";
import {
  bindCompanyAnnouncementViewer,
  clearCompanyAnnouncementStore,
  closeCompanyAnnouncementModal,
  getCompanyAnnouncementStoreState,
  getCompanyAnnouncementsHaveUnread,
  hydrateCompanyAnnouncements,
  markLoadedCompanyAnnouncementsSeen,
  openCompanyAnnouncementModal,
} from "./companyAnnouncementStore";
import type { CompanyAnnouncementRuntimeItem } from "../types/companyAnnouncement";

vi.mock("../api/services/companyAnnouncementsRuntime", () => ({
  fetchCompanyAnnouncementsRuntime: vi.fn(),
  markCompanyAnnouncementsSeen: vi.fn(),
}));

import {
  fetchCompanyAnnouncementsRuntime,
  markCompanyAnnouncementsSeen,
} from "../api/services/companyAnnouncementsRuntime";

const fetchMock = vi.mocked(fetchCompanyAnnouncementsRuntime);
const markMock = vi.mocked(markCompanyAnnouncementsSeen);

const NOW = Date.parse("2026-09-24T12:00:00.000Z");

function row(
  overrides: Partial<{
    id: string;
    is_active: boolean;
    starts_at: string | null;
    expires_at: string | null;
    created_at: string;
    is_seen: boolean;
  }> = {}
) {
  return {
    id: overrides.id ?? "a1",
    is_active: overrides.is_active ?? true,
    starts_at: overrides.starts_at ?? null,
    expires_at: overrides.expires_at ?? null,
    created_at: overrides.created_at ?? "2026-09-24T11:00:00.000Z",
    is_seen: overrides.is_seen ?? false,
  };
}

describe("companyAnnouncementActive window", () => {
  it("excludes inactive", () => {
    expect(
      isCompanyAnnouncementActiveAt(row({ is_active: false }), NOW)
    ).toBe(false);
  });

  it("excludes future starts_at", () => {
    expect(
      isCompanyAnnouncementActiveAt(
        row({ starts_at: "2026-09-24T13:00:00.000Z" }),
        NOW
      )
    ).toBe(false);
  });

  it("excludes expired", () => {
    expect(
      isCompanyAnnouncementActiveAt(
        row({ expires_at: "2026-09-24T11:59:00.000Z" }),
        NOW
      )
    ).toBe(false);
  });

  it("includes active current announcement", () => {
    expect(
      isCompanyAnnouncementActiveAt(
        row({
          starts_at: "2026-09-24T10:00:00.000Z",
          expires_at: "2026-09-25T00:00:00.000Z",
        }),
        NOW
      )
    ).toBe(true);
  });

  it("orders newest first and bounds results", () => {
    const selected = selectActiveCompanyAnnouncements(
      [
        row({ id: "old", created_at: "2026-09-20T00:00:00.000Z" }),
        row({ id: "new", created_at: "2026-09-24T11:00:00.000Z" }),
        row({ id: "mid", created_at: "2026-09-22T00:00:00.000Z" }),
        row({ id: "inactive", is_active: false }),
      ],
      NOW,
      2
    );
    expect(selected.map((r) => r.id)).toEqual(["new", "mid"]);
  });
});

describe("seen / unread reporting", () => {
  it("reports seen vs unread", () => {
    expect(
      companyAnnouncementsHaveUnread([{ is_seen: true }, { is_seen: false }])
    ).toBe(true);
    expect(companyAnnouncementsHaveUnread([{ is_seen: true }])).toBe(false);
  });

  it("new announcement becomes unread relative to empty prior", () => {
    const prior: Array<{ id: string; is_seen: boolean }> = [];
    const next = [{ id: "n1", is_seen: false }];
    expect(companyAnnouncementsHaveUnread(prior)).toBe(false);
    expect(companyAnnouncementsHaveUnread(next)).toBe(true);
  });

  it("another user's read model does not affect current user rows", () => {
    // Mirrors RPC: is_seen is computed only for auth.uid() join.
    type Read = { user_id: string; announcement_id: string };
    const reads: Read[] = [
      { user_id: "user-b", announcement_id: "a1" },
    ];
    const isSeenFor = (userId: string, announcementId: string) =>
      reads.some(
        (r) => r.user_id === userId && r.announcement_id === announcementId
      );
    expect(isSeenFor("user-a", "a1")).toBe(false);
    expect(isSeenFor("user-b", "a1")).toBe(true);
  });

  it("patchCompanyAnnouncementsSeen is idempotent on already-seen", () => {
    const items = [
      { id: "a1", is_seen: true },
      { id: "a2", is_seen: false },
    ];
    const once = patchCompanyAnnouncementsSeen(items, ["a1", "a2"]);
    const twice = patchCompanyAnnouncementsSeen(once, ["a1", "a2"]);
    expect(once.every((i) => i.is_seen)).toBe(true);
    expect(twice).toEqual(once);
  });
});

describe("companyAnnouncementStore", () => {
  beforeEach(() => {
    clearCompanyAnnouncementStore();
    fetchMock.mockReset();
    markMock.mockReset();
  });

  it("hydrate loads items and unread indicator", async () => {
    const items: CompanyAnnouncementRuntimeItem[] = [
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: false,
      },
    ];
    fetchMock.mockResolvedValue(items);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    expect(getCompanyAnnouncementsHaveUnread()).toBe(true);
    expect(getCompanyAnnouncementStoreState().items).toHaveLength(1);
  });

  it("mark seen patches local cache and clears unread after success", async () => {
    fetchMock.mockResolvedValue([
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: false,
      },
    ]);
    markMock.mockResolvedValue(undefined);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    expect(getCompanyAnnouncementsHaveUnread()).toBe(true);

    const result = await markLoadedCompanyAnnouncementsSeen();
    expect(result.ok).toBe(true);
    expect(markMock).toHaveBeenCalledWith(["a1"]);
    expect(getCompanyAnnouncementsHaveUnread()).toBe(false);
    expect(getCompanyAnnouncementStoreState().items[0]?.is_seen).toBe(true);
  });

  it("mark seen failure does not patch local is_seen", async () => {
    fetchMock.mockResolvedValue([
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: false,
      },
    ]);
    markMock.mockRejectedValue(new Error("network"));
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    const result = await markLoadedCompanyAnnouncementsSeen();
    expect(result.ok).toBe(false);
    expect(getCompanyAnnouncementsHaveUnread()).toBe(true);
  });

  it("mark seen is idempotent when already seen", async () => {
    fetchMock.mockResolvedValue([
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: true,
      },
    ]);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    const result = await markLoadedCompanyAnnouncementsSeen();
    expect(result.ok).toBe(true);
    expect(markMock).not.toHaveBeenCalled();
  });

  it("logout / clear removes user-specific state", async () => {
    fetchMock.mockResolvedValue([
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: false,
      },
    ]);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    clearCompanyAnnouncementStore();
    expect(getCompanyAnnouncementStoreState().userId).toBeNull();
    expect(getCompanyAnnouncementStoreState().items).toEqual([]);
    expect(getCompanyAnnouncementsHaveUnread()).toBe(false);
  });

  it("account switch clears prior user items", async () => {
    fetchMock.mockResolvedValue([
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: false,
      },
    ]);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    bindCompanyAnnouncementViewer("user-b");
    expect(getCompanyAnnouncementStoreState().userId).toBe("user-b");
    expect(getCompanyAnnouncementStoreState().items).toEqual([]);
    expect(getCompanyAnnouncementsHaveUnread()).toBe(false);
  });

  it("user close does not globally deactivate (no admin write; items stay for others)", async () => {
    const item: CompanyAnnouncementRuntimeItem = {
      id: "a1",
      title: "T",
      message: "M",
      starts_at: null,
      expires_at: null,
      created_at: "2026-09-24T11:00:00.000Z",
      is_seen: false,
    };
    fetchMock.mockResolvedValue([item]);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    openCompanyAnnouncementModal();
    expect(getCompanyAnnouncementStoreState().modalOpen).toBe(true);
    closeCompanyAnnouncementModal();
    expect(getCompanyAnnouncementStoreState().modalOpen).toBe(false);
    // Still in shared store until runtime says otherwise — close ≠ is_active false.
    expect(getCompanyAnnouncementStoreState().items).toHaveLength(1);
    expect(getCompanyAnnouncementStoreState().items[0]?.id).toBe("a1");
    const storeSrc = await import("fs").then((fs) =>
      fs.readFileSync(
        new URL("./companyAnnouncementStore.ts", import.meta.url),
        "utf8"
      )
    );
    expect(storeSrc).not.toMatch(/companyAnnouncementsAdmin/);
    expect(storeSrc).not.toMatch(/is_active:\s*false/);
  });

  it("inactive announcement disappears from store after runtime refresh", async () => {
    fetchMock.mockResolvedValueOnce([
      {
        id: "a1",
        title: "T",
        message: "M",
        starts_at: null,
        expires_at: null,
        created_at: "2026-09-24T11:00:00.000Z",
        is_seen: false,
      },
    ]);
    bindCompanyAnnouncementViewer("user-a");
    await hydrateCompanyAnnouncements({ force: true });
    expect(getCompanyAnnouncementsHaveUnread()).toBe(true);

    fetchMock.mockResolvedValueOnce([]);
    await hydrateCompanyAnnouncements({ force: true });
    expect(getCompanyAnnouncementStoreState().items).toEqual([]);
    expect(getCompanyAnnouncementsHaveUnread()).toBe(false);
  });
});

describe("modal close contract", () => {
  it("exposes X and backdrop close without touching Activity/Invite stores", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const modal = fs.readFileSync(
      path.join(__dirname, "../components/CompanyAnnouncementModal.tsx"),
      "utf8"
    );
    expect(modal).toContain("onBackdropClick={handleClose}");
    expect(modal).toContain('data-company-announcement-close-x="1"');
    expect(modal).toContain('aria-label="Close"');
    expect(modal).toContain("closeCompanyAnnouncementModal");
    expect(modal).toContain("socialPillExtrusionClassName");
    expect(modal).toContain("max-h-[80vh]");
    expect(modal).toContain("ECHOTOO");
    expect(modal).not.toMatch(/>\s*Announcements\s*</);
    expect(modal).not.toMatch(/btmtabicon/);
    expect(modal).not.toMatch(/notificationCountCache/);
    expect(modal).not.toMatch(/messagesActivitiesAttentionStore/);
    expect(modal).not.toMatch(/companyAnnouncementsAdmin/);
  });
});

describe("isolation from Activity / Invite unread", () => {
  it("company announcement store does not touch notification count cache", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync(
        new URL("./companyAnnouncementStore.ts", import.meta.url),
        "utf8"
      )
    );
    expect(src).not.toMatch(/notificationCountCache/);
    expect(src).not.toMatch(/messagesActivitiesAttentionStore/);
    expect(src).not.toMatch(/inviteUnread/);
    expect(src).not.toMatch(/owlMessages/);
  });

  it("BottomTabPeekOwl uses brand company pip, not Messages amber attention", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const peek = fs.readFileSync(
      path.join(__dirname, "../components/BottomTabPeekOwl.tsx"),
      "utf8"
    );
    const bottom = fs.readFileSync(
      path.join(__dirname, "../components/BottomTab.tsx"),
      "utf8"
    );
    expect(peek).toContain("data-company-announcement-unread");
    expect(peek).toContain("PiMegaphone");
    expect(peek).toContain("UNREAD_ICON_GAP_PX");
    expect(peek).toContain("openCompanyAnnouncementModal()");
    expect(peek).not.toContain("right-[-14px]");
    expect(peek).not.toContain("showMessagesAttention");
    expect(peek).not.toContain("useHasNewActivities");
    expect(bottom).toContain("bg-amber-400");
    expect(bottom).toContain("showMessagesAttention");
  });
});
