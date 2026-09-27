import type { PairUpCandidate } from "../../lib/people/types";

export const DEV_MOCK_OPPORTUNITY_PREFIX = "dev-mock:";

/**
 * DEV-only: explicit opt-in Mine deck fixtures.
 * Never auto-enabled for empty Mine — real empty/loading/error must show.
 *
 * Activate:   localStorage.setItem("echoPeopleMineFixtures", "1"); location.reload()
 * Deactivate: localStorage.removeItem("echoPeopleMineFixtures"); location.reload()
 *             (or set to any value other than "1")
 *
 * Mock opportunity / creator / source IDs use DEV_MOCK_OPPORTUNITY_PREFIX and are
 * gated out of social mutation RPCs via isDevMockCandidate.
 */
export const PEOPLE_MINE_DEV_FIXTURES_STORAGE_KEY = "echoPeopleMineFixtures";

export function isPeopleMineDevFixturesForced(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(PEOPLE_MINE_DEV_FIXTURES_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * DEV-only: Mine drag→x motion probe (diagnostic rectangle).
 *
 * Activate:   localStorage.setItem("echoPeopleMineMotionProbe", "1"); location.reload()
 * Deactivate: localStorage.removeItem("echoPeopleMineMotionProbe"); location.reload()
 */
export const PEOPLE_MINE_MOTION_PROBE_STORAGE_KEY = "echoPeopleMineMotionProbe";

export function isPeopleMineMotionProbeEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(PEOPLE_MINE_MOTION_PROBE_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * Mine real portrait animation (incoming/outgoing photo stacks on Embla progress).
 *
 * Enabled by default in DEV and production (Android/iOS Capacitor builds).
 * When enabled, the single-image proxy visual is suppressed so the two
 * presentations never overlap. Proxy / probe / fixtures stay DEV-only.
 *
 * DEV override off: localStorage.setItem("echoPeopleMineRealIncoming", "0"); location.reload()
 * DEV override on:  localStorage.setItem("echoPeopleMineRealIncoming", "1"); location.reload()
 * Production does not require localStorage — always on.
 */
export const PEOPLE_MINE_REAL_INCOMING_STORAGE_KEY =
  "echoPeopleMineRealIncoming";

export function isPeopleMineRealIncomingEnabled(): boolean {
  // Production / Capacitor: ship the approved animation.
  if (!import.meta.env.DEV) return true;
  try {
    if (typeof localStorage === "undefined") return true;
    const raw = localStorage.getItem(PEOPLE_MINE_REAL_INCOMING_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  } catch {
    return true;
  }
}

/**
 * DEV-only: Mine adjacent-candidate image proxy (progress → x + rotate + scale).
 *
 * Default ON in DEV when real-incoming experiment is off.
 * Explicit off: localStorage.setItem("echoPeopleMineIncomingProxy", "0"); location.reload()
 * Explicit on:  localStorage.setItem("echoPeopleMineIncomingProxy", "1"); location.reload()
 *               (or removeItem after having set "0")
 *
 * When real-incoming is enabled, this returns false (no visual overlap).
 * When both probe + proxy flags are set (and real-incoming off), proxy wins.
 * Production builds (`vite build`) keep this OFF — import.meta.env.DEV is false.
 */
export const PEOPLE_MINE_INCOMING_PROXY_STORAGE_KEY =
  "echoPeopleMineIncomingProxy";

export function isPeopleMineIncomingProxyEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  // Real-slide experiment owns the presentation while active.
  if (isPeopleMineRealIncomingEnabled()) return false;
  try {
    if (typeof localStorage === "undefined") return true;
    const raw = localStorage.getItem(PEOPLE_MINE_INCOMING_PROXY_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    // No override → ON in DEV
    return true;
  } catch {
    return true;
  }
}

/** Plan context above the carousel: relative schedule + source caption only. */
export type MatchDeckSourceDisplay = {
  caption: string;
  scheduleLabel: string;
  scheduleLabelKind?:
    | "today"
    | "tomorrow"
    | "next_weekday"
    | "in_days"
    | "posted_ago"
    | "passed";
};

/**
 * Optional profile fields the real `list_pair_up_candidates` payload does not
 * return. DEV mocks populate these purely to evaluate the card overlay layout.
 */
export type MatchDeckMockProfile = {
  photos: string[];
  age?: number | null;
  gender?: string | null;
  about?: string | null;
};

/** Same Unsplash URLs already used by ActivityImagesModal / launcher DEV faces. */
const PHOTO_A =
  "https://plus.unsplash.com/premium_photo-1677000666741-17c3c57139a2?w=600";
const PHOTO_B =
  "https://images.unsplash.com/photo-1728044849256-ad00ec91e794?q=80&w=1974";
const PHOTO_C =
  "https://plus.unsplash.com/premium_photo-1681841594224-ad729a249113?w=600";
const PHOTO_D =
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600";
const PHOTO_E =
  "https://images.unsplash.com/photo-1605926637512-c8b131444a4b?w=600";

/** Shared person across two opportunities (photo index keyed by creator). */
const SHARED_CREATOR_ID = `${DEV_MOCK_OPPORTUNITY_PREFIX}user-shared-alex`;
const SHARED_PROFILE_ID = `${DEV_MOCK_OPPORTUNITY_PREFIX}profile-shared-alex`;

export function isDevMockCandidate(row: {
  opportunity_id: string;
}): boolean {
  return row.opportunity_id.startsWith(DEV_MOCK_OPPORTUNITY_PREFIX);
}

function mockCandidate(args: {
  id: string;
  displayName: string;
  username: string;
  note: string | null;
  avatarUrl: string;
  profilePhotos?: string[];
  bio?: string | null;
  creatorId?: string;
  profileId?: string | null;
}): PairUpCandidate {
  return {
    opportunity_id: `${DEV_MOCK_OPPORTUNITY_PREFIX}${args.id}`,
    source_post_id: `${DEV_MOCK_OPPORTUNITY_PREFIX}source-${args.id}`,
    creator_id: args.creatorId ?? `${DEV_MOCK_OPPORTUNITY_PREFIX}user-${args.id}`,
    description: args.note,
    discoverable_until: "",
    created_at: "",
    display_name: args.displayName,
    username: args.username,
    avatar_url: args.avatarUrl,
    profile_photos: args.profilePhotos ?? [],
    echo_preset: null,
    expressed_by_me: false,
    profile_id: args.profileId ?? null,
    bio: args.bio ?? null,
    source_caption: null,
    source_type: null,
    source_created_at: null,
    source_selected_dates: null,
    source_is_recurring: null,
    source_recurrence_days: null,
  };
}

export const DEV_MATCH_DECK_MOCKS: PairUpCandidate[] = import.meta.env.DEV
  ? [
      // 3 photos + bio + note
      mockCandidate({
        id: "1",
        displayName: "Alex Chen",
        username: "alexc",
        note: "Looking for a hiking buddy this weekend.",
        avatarUrl: PHOTO_B,
        profilePhotos: [PHOTO_B, PHOTO_D, PHOTO_E],
        bio: "Trail runner, slow coffee, terrible at chess.",
        creatorId: SHARED_CREATOR_ID,
        profileId: SHARED_PROFILE_ID,
      }),
      // 2 photos + bio + note
      mockCandidate({
        id: "2",
        displayName: "Jordan Blake",
        username: "jordanb",
        note: "Down for coffee or a long walk.",
        avatarUrl: PHOTO_C,
        profilePhotos: [PHOTO_C, PHOTO_A],
        bio: "Will walk 10k for a good pastry.",
      }),
      // 1 photo, missing bio + note (empty-note divider)
      mockCandidate({
        id: "3",
        displayName: "Sam Ortiz",
        username: "samortiz",
        note: null,
        avatarUrl: PHOTO_A,
        profilePhotos: [PHOTO_A],
        bio: null,
      }),
      // 2 photos, short note
      mockCandidate({
        id: "4",
        displayName: "Riley Park",
        username: "rileypark",
        note: "New in town — open to events.",
        avatarUrl: PHOTO_E,
        profilePhotos: [PHOTO_E, PHOTO_B],
        bio: "Just moved here, show me the good spots.",
      }),
      // Long caption fixture (source display); 2 photos
      mockCandidate({
        id: "5",
        displayName: "Casey Nguyen",
        username: "caseyn",
        note: "Free after 6 if the weather holds.",
        avatarUrl: PHOTO_D,
        profilePhotos: [PHOTO_D, PHOTO_C],
        bio: "Weeknight plans preferred.",
      }),
      // Same person as #1, different opportunity (person-keyed photo index)
      mockCandidate({
        id: "1b",
        displayName: "Alex Chen",
        username: "alexc",
        note: "Also free for a quieter museum afternoon.",
        avatarUrl: PHOTO_B,
        profilePhotos: [PHOTO_B, PHOTO_D, PHOTO_E],
        bio: "Trail runner, slow coffee, terrible at chess.",
        creatorId: SHARED_CREATOR_ID,
        profileId: SHARED_PROFILE_ID,
      }),
    ]
  : [];

export const DEV_MOCK_SOURCE_BY_ID: Record<string, MatchDeckSourceDisplay> =
  import.meta.env.DEV
    ? {
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}1`]: {
          caption: "Sunset ridge hike before the light goes",
          scheduleLabel: "Tomorrow",
          scheduleLabelKind: "tomorrow",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}2`]: {
          caption: "Neighborhood coffee crawl",
          scheduleLabel: "Next Saturday",
          scheduleLabelKind: "next_weekday",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}3`]: {
          caption: "Birthday dinner, bring an appetite",
          scheduleLabel: "in 9 days",
          scheduleLabelKind: "in_days",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}4`]: {
          caption: "Farmers market morning",
          scheduleLabel: "Today",
          scheduleLabelKind: "today",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}5`]: {
          caption:
            "Long community picnic with music, lawn games, and a potluck table that somehow always needs one more dessert contribution from whoever is free",
          scheduleLabel: "This Sunday",
          scheduleLabelKind: "next_weekday",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}1b`]: {
          caption: "Quiet museum afternoon — same person, other plan",
          scheduleLabel: "Friday",
          scheduleLabelKind: "next_weekday",
        },
      }
    : {};

export const DEV_MOCK_PROFILE_BY_ID: Record<string, MatchDeckMockProfile> =
  import.meta.env.DEV
    ? {
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}1`]: {
          photos: [PHOTO_B, PHOTO_D, PHOTO_E],
          age: 28,
          gender: "Woman",
          about: "Trail runner, slow coffee, terrible at chess.",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}2`]: {
          photos: [PHOTO_C, PHOTO_A],
          age: 31,
          gender: "Man",
          about: "Will walk 10k for a good pastry.",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}3`]: {
          photos: [PHOTO_A],
          age: null,
          gender: null,
          about: null,
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}4`]: {
          photos: [PHOTO_E, PHOTO_B],
          age: 24,
          gender: null,
          about: "Just moved here, show me the good spots.",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}5`]: {
          photos: [PHOTO_D, PHOTO_C],
          age: 27,
          gender: null,
          about: "Weeknight plans preferred.",
        },
        [`${DEV_MOCK_OPPORTUNITY_PREFIX}1b`]: {
          photos: [PHOTO_B, PHOTO_D, PHOTO_E],
          age: 28,
          gender: "Woman",
          about: "Trail runner, slow coffee, terrible at chess.",
        },
      }
    : {};
