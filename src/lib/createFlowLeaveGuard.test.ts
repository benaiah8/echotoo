import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDIT_POST_DATA_KEY } from "./editPostBootstrap";
import {
  CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY,
  CREATE_FLOW_RESUMED_LOCAL_DRAFT_VALUE,
  markCreateFlowResumedLocalDraft,
} from "./draftEntryGate";
import {
  buildFreshCreateLeaveBaseline,
  clearFreshCreateLeaveBaseline,
  establishFreshCreateLeaveBaseline,
  FRESH_CREATE_LEAVE_BASELINE_KEY,
} from "./createFlowFreshLeaveBaseline";
import {
  cleanupEmptyFreshCreateDraftIfNeeded,
  hasCreateDraftSettingsDriftFromBaseline,
  hasMeaningfulCreateDraftContent,
  shouldConfirmCreateFlowLeave,
  shouldOfferCreateDraftEntryDialog,
} from "./createFlowLeaveGuard";
import { DRAFT_META_KEY, hasAnyDraftData } from "./drafts";

const DRAFT_ACTIVITIES_KEY = "draftActivities";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

function writeMeta(meta: Record<string, unknown>) {
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
}

function writeActivities(activities: unknown[]) {
  localStorage.setItem(DRAFT_ACTIVITIES_KEY, JSON.stringify(activities));
}

function clearCreateLocalState() {
  localStorage.removeItem(DRAFT_META_KEY);
  localStorage.removeItem(DRAFT_ACTIVITIES_KEY);
  localStorage.removeItem("draftCategories");
  localStorage.removeItem(EDIT_POST_DATA_KEY);
  localStorage.removeItem("draftSavedAt");
  sessionStorage.removeItem(CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY);
  clearFreshCreateLeaveBaseline();
}

describe("createFlowLeaveGuard — fresh empty exit", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
    clearCreateLocalState();
  });

  afterEach(() => {
    clearCreateLocalState();
    vi.unstubAllGlobals();
  });

  it("untouched fresh Place (experience) with default ratings is clean", () => {
    const publishPostId = "11111111-1111-4111-8111-111111111111";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      ownerUserId: "user-1",
      createPostType: "experience",
      caption: "",
      tags: [],
      visibility: "public",
      ratingEnabled: true,
      selectedDates: [],
      isRecurring: false,
      recurrenceDays: [],
      pendingStartTime: null,
      rsvpEnabled: false,
    });
    writeActivities([]);

    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("untouched fresh Event (hangout) with default ratings off is clean", () => {
    const publishPostId = "22222222-2222-4222-8222-222222222222";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "hangout",
      }),
    );
    writeMeta({
      publishPostId,
      createPostType: "hangout",
      visibility: "public",
      ratingEnabled: false,
      caption: "",
      tags: [],
      selectedDates: [],
    });

    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("implied baseline without session baseline: default Place ratings alone are clean", () => {
    writeMeta({
      publishPostId: "33333333-3333-4333-8333-333333333333",
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("picker open/cancel and focus-only leave no draftMeta schedule — still clean", () => {
    const publishPostId = "44444444-4444-4444-8444-444444444444";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
      // Uncommitted sheet working copies are never persisted.
      selectedDates: [],
      pendingStartTime: null,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("meaningful caption dirties; clearing caption returns clean", () => {
    const publishPostId = "55555555-5555-4555-8555-555555555555";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "hangout",
      }),
    );
    writeMeta({
      publishPostId,
      createPostType: "hangout",
      visibility: "public",
      ratingEnabled: false,
      caption: "Hello",
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(true);

    writeMeta({
      publishPostId,
      createPostType: "hangout",
      visibility: "public",
      ratingEnabled: false,
      caption: "   ",
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("saved dates and location media carriers are meaningful", () => {
    expect(
      hasMeaningfulCreateDraftContent(
        {
          selectedDates: ["2026-09-20T16:00:00.000Z"],
        },
        [],
      ),
    ).toBe(true);

    expect(
      hasMeaningfulCreateDraftContent({}, [
        {
          title: "Stop 1",
          location: "Addis",
          images: [],
        },
      ]),
    ).toBe(true);

    expect(
      hasMeaningfulCreateDraftContent(
        {
          draftImages: [
            {
              localId: "img-1",
              fileName: "a.jpg",
              mimeType: "image/jpeg",
              size: 10,
              localStorageKind: "idb-blob",
              localReference: "ref-1",
            },
          ],
        } as never,
        [],
      ),
    ).toBe(true);
  });

  it("visibility-only Friends dirties; revert to public cleans", () => {
    const publishPostId = "66666666-6666-4666-8666-666666666666";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      createPostType: "experience",
      visibility: "friends",
      ratingEnabled: true,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(true);

    writeMeta({
      publishPostId,
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("rating-only change dirties; revert to type default cleans", () => {
    const publishPostId = "77777777-7777-4777-8777-777777777777";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "hangout",
        ratingEnabled: false,
      }),
    );
    writeMeta({
      publishPostId,
      createPostType: "hangout",
      visibility: "public",
      ratingEnabled: true,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(true);

    writeMeta({
      publishPostId,
      createPostType: "hangout",
      visibility: "public",
      ratingEnabled: false,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(false);
  });

  it("Place default ratings on is not drift; toggling off then on restores clean", () => {
    const baseline = buildFreshCreateLeaveBaseline({
      createPostType: "experience",
    });
    expect(baseline.ratingEnabled).toBe(true);
    expect(
      hasCreateDraftSettingsDriftFromBaseline(
        { ratingEnabled: true, visibility: "public", createPostType: "experience" },
        baseline,
      ),
    ).toBe(false);
    expect(
      hasCreateDraftSettingsDriftFromBaseline(
        { ratingEnabled: false, visibility: "public", createPostType: "experience" },
        baseline,
      ),
    ).toBe(true);
  });

  it("resumed draft always confirms even when content looks empty", () => {
    markCreateFlowResumedLocalDraft();
    expect(sessionStorage.getItem(FRESH_CREATE_LEAVE_BASELINE_KEY)).toBeNull();
    writeMeta({
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(true);
  });

  it("published edit always confirms", () => {
    localStorage.setItem(EDIT_POST_DATA_KEY, JSON.stringify({ id: "post-1" }));
    expect(shouldConfirmCreateFlowLeave()).toBe(true);
  });

  it("cleanup removes empty fresh scaffolding matching baseline publishPostId", () => {
    const publishPostId = "88888888-8888-4888-8888-888888888888";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      ownerUserId: "user-1",
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
      caption: "",
      tags: [],
    });
    writeActivities([]);
    expect(hasAnyDraftData()).toBe(true);

    expect(cleanupEmptyFreshCreateDraftIfNeeded()).toBe(true);
    expect(hasAnyDraftData()).toBe(false);
    expect(sessionStorage.getItem(FRESH_CREATE_LEAVE_BASELINE_KEY)).toBeNull();
  });

  it("cleanup does not touch another draft publishPostId", () => {
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId: "99999999-9999-4999-8999-999999999999",
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
    });
    expect(cleanupEmptyFreshCreateDraftIfNeeded()).toBe(false);
    expect(hasAnyDraftData()).toBe(true);
  });

  it("cleanup does not run for resumed drafts", () => {
    sessionStorage.setItem(
      CREATE_FLOW_RESUMED_LOCAL_DRAFT_KEY,
      CREATE_FLOW_RESUMED_LOCAL_DRAFT_VALUE,
    );
    writeMeta({
      publishPostId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createPostType: "experience",
      ratingEnabled: true,
      visibility: "public",
    });
    expect(cleanupEmptyFreshCreateDraftIfNeeded()).toBe(false);
    expect(hasAnyDraftData()).toBe(true);
  });

  it("cleanup does not run when settings drifted", () => {
    const publishPostId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      createPostType: "experience",
      visibility: "friends",
      ratingEnabled: true,
    });
    expect(shouldConfirmCreateFlowLeave()).toBe(true);
    expect(cleanupEmptyFreshCreateDraftIfNeeded()).toBe(false);
    expect(hasAnyDraftData()).toBe(true);
  });
});

describe("shouldOfferCreateDraftEntryDialog — empty shell vs real draft", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
    clearCreateLocalState();
  });

  afterEach(() => {
    clearCreateLocalState();
    vi.unstubAllGlobals();
  });

  it("Case A: owned scaffolding only does not offer entry dialog", () => {
    const publishPostId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      ownerUserId: "user-1",
      createPostType: "experience",
      visibility: "public",
      ratingEnabled: true,
      caption: "",
      tags: [],
    });
    writeActivities([]);
    expect(hasAnyDraftData()).toBe(true);
    expect(shouldOfferCreateDraftEntryDialog()).toBe(false);
    expect(cleanupEmptyFreshCreateDraftIfNeeded()).toBe(true);
    expect(hasAnyDraftData()).toBe(false);
  });

  it("Case B: caption offers entry dialog", () => {
    writeMeta({
      publishPostId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ownerUserId: "user-1",
      createPostType: "experience",
      caption: "Hello",
      visibility: "public",
      ratingEnabled: true,
    });
    writeActivities([]);
    expect(shouldOfferCreateDraftEntryDialog()).toBe(true);
  });

  it("Case C: media-only offers entry dialog", () => {
    writeMeta({
      publishPostId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ownerUserId: "user-1",
      createPostType: "experience",
      caption: "",
      visibility: "public",
      ratingEnabled: true,
      draftImages: [{ localId: "img-1" }],
    });
    writeActivities([]);
    expect(shouldOfferCreateDraftEntryDialog()).toBe(true);
  });

  it("Case D: Event draft with dates offers dialog (resume keeps hangout via gate)", () => {
    writeMeta({
      publishPostId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      ownerUserId: "user-1",
      createPostType: "hangout",
      caption: "",
      visibility: "public",
      ratingEnabled: false,
      selectedDates: ["2026-09-20T18:00:00.000Z"],
    });
    writeActivities([]);
    expect(shouldOfferCreateDraftEntryDialog()).toBe(true);
    expect(hasMeaningfulCreateDraftContent(JSON.parse(
      localStorage.getItem(DRAFT_META_KEY)!,
    ), [])).toBe(true);
  });

  it("settings drift alone offers entry dialog", () => {
    const publishPostId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    establishFreshCreateLeaveBaseline(
      buildFreshCreateLeaveBaseline({
        publishPostId,
        createPostType: "experience",
      }),
    );
    writeMeta({
      publishPostId,
      ownerUserId: "user-1",
      createPostType: "experience",
      visibility: "friends",
      ratingEnabled: true,
      caption: "",
    });
    expect(shouldOfferCreateDraftEntryDialog()).toBe(true);
  });
});
