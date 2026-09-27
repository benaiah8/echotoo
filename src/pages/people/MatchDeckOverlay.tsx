import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  completePairUpMatch,
  setP2pDiscoverEnabled,
} from "../../api/services/pairUp";
import {
  getProfileByUserId,
  getViewerAuthUserId,
} from "../../api/services/follows";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import type { UseGroupUpCandidatesResult } from "../../hooks/useGroupUpCandidates";
import type { UseOpenPlanCandidatesResult } from "../../hooks/useOpenPlanCandidates";
import type { UsePairUpCandidatesResult } from "../../hooks/usePairUpCandidates";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import { interleavePairUpCandidates } from "../../lib/interleavePairUpCandidates";
import type { GroupUpCandidate, PairUpCandidate } from "../../lib/people/types";
import {
  consumeMatchDeckSession,
  emptyGroupUpDeckScopeSnapshot,
  emptyMatchDeckScopeSnapshot,
  suspendMatchDeckSession,
  type GroupUpDeckScopeSnapshot,
  type MatchDeckPairUpScope,
  type MatchDeckScopeSnapshot,
  type MatchDeckSessionMode,
} from "../../lib/matchDeckSession";
import {
  filterOrderedIdsToEligible,
  indexOfOpportunity,
  isTrueCaughtUpState,
  pruneActiveOrderedIds,
  resolveNearestOpportunityId,
  shouldLoadMoreForEmptyWindow,
} from "../../lib/people/matchDeckNavigation";
import {
  hasP2pDiscoverIntroSeen,
  setP2pDiscoverIntroSeen,
} from "../../lib/p2pDiscoverIntroSeen";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import { releaseAllPublishedListVideoOwnership } from "../../lib/publishedMedia";
import { isPairUpPhotoPromptOpen, subscribePairUpPhotoPrompt } from "../../lib/pairUpPhotoPromptStore";
import { getCachedProfile, primeProfileCache } from "../../lib/profileCache";
import {
  clearMineFrontImageWarmState,
  isMineFrontImageWarmDone,
  mineImageWarmOffsets,
  warmMineFrontImage,
  warmMineFrontImages,
  type MineWarmDirection,
} from "../../lib/people/mineCandidateImageWarm";
import {
  resolveMineAtmosphereWarmSettlement,
  shouldRunMineAtmosphereWarmWatch,
} from "../../lib/people/mineAtmosphereWarmReadiness";
import {
  resolveMineFrontDisplayUrl,
  resolveMineFrontPhotoPath,
} from "../../lib/people/mineFrontPhotoPath";
import {
  messagesConversationPath,
} from "../../router/Paths";
import MatchDeckCarousel from "./MatchDeckCarousel";
import PeopleDuoCandidateSlide from "./PeopleDuoCandidateSlide";
import PeopleDuoModeTransition from "./PeopleDuoModeTransition";
import {
  isPairUpPrimaryScope,
  type PeoplePrimaryScope,
} from "../../lib/people/peopleDuoModeTransition";
import OpenPlanDeckBody from "./OpenPlanDeckBody";
import GroupUpDeckBody from "./GroupUpDeckBody";
import PeopleBottomDock from "./PeopleBottomDock";
import MineCandidateProfileOverlay from "../../components/people/MineCandidateProfileOverlay";
import MineEdgeNavCards, {
  type MineEdgeNavCardsHandle,
} from "../../components/people/MineEdgeNavCards";
import MineAtmosphereCrossfade from "../../components/people/MineAtmosphereCrossfade";
import type { PeopleMineAtmosphereReport } from "../../components/people/PeopleCandidateMedia";
import {
  applyMineAtmosphereReady,
  clearMineAtmosphereCrossfade,
  completeMineAtmosphereCrossfade,
  createMineAtmosphereCrossfadeState,
  type MineAtmosphereCrossfadeState,
} from "../../lib/people/mineAtmosphereCrossfade";
import { shouldApplyMineAtmosphereReport } from "../../lib/people/mineAtmosphereIdentitySync";
import { prefersPeopleMotionReduce } from "../../lib/people/peopleCandidateMediaPresentation";
import { resolvePairUpProfileOpenKey } from "../../lib/people/resolvePairUpProfileOpenKey";
import {
  createMineCandidateProfileOpenContext,
  isMineCandidateProfileOpenContext,
} from "../../lib/people/mineCandidateProfileOpenContext";
import {
  createGroupHostProfileOpenContext,
  type PeopleEmbeddedProfileOpen,
} from "../../lib/people/groupHostProfileOpenContext";
import { runMinePairUpConnect } from "../../lib/people/runMinePairUpConnect";
import {
  PEOPLE_BACK_EDGE_INSET_PX,
  PEOPLE_BACK_SIZE_PX,
  peopleShellContentBottomPad,
  peopleShellContentTopPad,
  peopleShellMineContentBottomPad,
  peopleShellMineContentTopPad,
  type PeopleFlatDestination,
} from "./peopleShellLayout";
import type { PeopleShellPrimaryAction } from "./peopleShellPrimaryAction";
import { resolvePairUpShellActionState } from "./peopleShellPrimaryAction";
import { PiGlobe } from "react-icons/pi";
import {
  DEV_MATCH_DECK_MOCKS,
  DEV_MOCK_PROFILE_BY_ID,
  DEV_MOCK_SOURCE_BY_ID,
  isDevMockCandidate,
  isPeopleMineDevFixturesForced,
  isPeopleMineIncomingProxyEnabled,
  isPeopleMineMotionProbeEnabled,
  isPeopleMineRealIncomingEnabled,
} from "./matchDeckDevMocks";
import { peopleUiCopy } from "./peopleUiCopy";
import { showDiscoverTurnedOnToast } from "../../lib/showDiscoverPrefToast";
import {
  peopleDebugBumpRender,
  peopleDebugRecord,
  peopleDebugSetContext,
} from "../../lib/people/peopleDeckDebug";
import {
  createMineButtonFlightLatch,
  flushMineButtonLatch,
  planMineButtonStep,
  queueMineButtonTarget,
  releaseMineButtonLatchOnIndexDiverge,
  type MineButtonFlightLatch,
} from "../../lib/people/mineEdgeNavGesture";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import {
  applyMineMotionProbeAdjacentMedia,
  createMineMotionProbeController,
  markMineMotionProbeSideReady,
  MINE_INCOMING_PROXY_CSS_TOP,
  type MineMotionProbeController,
} from "../../lib/people/mineMotionProbeProgress";
import {
  PEOPLE_MINE_CARD_RADIUS,
  PEOPLE_MINE_FRONT_SHADOW,
} from "../../lib/people/peopleCandidateMediaPresentation";
import {
  buildPeopleSourceContextMap,
  getPeopleSourceContext,
  normalizePeopleSourceContext,
} from "../../lib/people/peopleSourceContext";
import { pairUpPersonKey } from "../../lib/people/pairUpPersonKey";

/** DEV proxy: same identity media pipeline as Mine portrait — no new fetch. */
function resolveMineProxyImageUrl(
  source: ProfileIdentityMediaSource,
  photoIndex: number,
): string | null {
  return resolveMineFrontDisplayUrl(source, photoIndex);
}

/** Front display URLs for Mine warm window around an authoritative index. */
function collectMineWarmFrontUrls(args: {
  items: readonly PairUpCandidate[];
  atIndex: number;
  photoIndexByPersonKey: Record<string, number>;
  identitySourceFor: (row: PairUpCandidate) => ProfileIdentityMediaSource;
  direction?: MineWarmDirection;
  extraIndices?: readonly number[];
}): string[] {
  const {
    items,
    atIndex,
    photoIndexByPersonKey,
    identitySourceFor,
    direction = "forward",
  } = args;
  const ordered: number[] = [];
  const seen = new Set<number>();
  const addIndex = (i: number) => {
    if (i < 0 || i >= items.length || seen.has(i)) return;
    seen.add(i);
    ordered.push(i);
  };

  // Current first, then pending/extras (rapid NEXT ahead of commit), then window.
  addIndex(atIndex);
  for (const i of args.extraIndices ?? []) {
    addIndex(i);
  }
  for (const off of mineImageWarmOffsets(direction)) {
    if (off === 0) continue;
    addIndex(atIndex + off);
  }

  const urls: string[] = [];
  for (const i of ordered) {
    const row = items[i];
    if (!row) continue;
    const photoIdx = photoIndexByPersonKey[pairUpPersonKey(row)] ?? 0;
    const url = resolveMineProxyImageUrl(identitySourceFor(row), photoIdx);
    if (url) urls.push(url);
  }
  return urls;
}

const PREFETCH_REMAINING = 3;

type DeckMode = MatchDeckSessionMode;
type ActionPhase = "idle" | "expressing" | "completing" | "completeFailed";
type DiscoverDialog = null | "intro";

type DeckProps = Pick<
  UsePairUpCandidatesResult,
  | "candidates"
  | "hasMore"
  | "loading"
  | "error"
  | "hasLoaded"
  | "refresh"
  | "loadMore"
  | "express"
>;

const EMPTY_PAIR_UP_DECK: DeckProps = {
  candidates: [],
  hasMore: false,
  loading: false,
  error: null,
  hasLoaded: false,
  refresh: async () => {},
  loadMore: async () => {},
  express: async () => {
    throw new Error("Deck not ready");
  },
};

const PROFILE_ID_RE = /^[0-9a-f-]{36}$/i;

function primeCandidateProfilePreview(row: PairUpCandidate): void {
  if (isDevMockCandidate(row)) return;
  const profileId = row.profile_id?.trim() ?? "";
  const userId = row.creator_id?.trim() ?? "";
  if (!PROFILE_ID_RE.test(profileId) || !PROFILE_ID_RE.test(userId)) return;
  if (getCachedProfile(profileId)) return;
  // Thin identity prime — omit member_no (unknown ≠ known-null).
  primeProfileCache({
    id: profileId,
    user_id: userId,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    xp: null,
    instagram_url: null,
    tiktok_url: null,
    telegram_url: null,
  });
}

export default function MatchDeckOverlay({
  myPlans,
  discover,
  openPlans,
  groupUps,
  onRequestDiscoverMount,
  onRequestOpenPlansMount,
  onRequestGroupUpsMount,
  onClose,
}: {
  myPlans: DeckProps;
  /** Null until Discover has been opened at least once this mount. */
  discover: DeckProps | null;
  /** Null until Open Plans has been opened at least once this mount. */
  openPlans: UseOpenPlanCandidatesResult | null;
  /** Null until Group Up has been opened at least once this mount. */
  groupUps: UseGroupUpCandidatesResult | null;
  onRequestDiscoverMount: () => void;
  onRequestOpenPlansMount: () => void;
  onRequestGroupUpsMount: () => void;
  onClose: () => void;
}) {
  peopleDebugBumpRender("matchDeckOverlay");

  const navigate = useNavigate();
  const location = useLocation();
  const [restored] = useState(() => consumeMatchDeckSession());
  const [mode, setMode] = useState<DeckMode>(restored?.mode ?? "p2p");
  const [activeScope, setActiveScope] = useState<MatchDeckPairUpScope>(
    restored?.activeScope ?? "my_plans"
  );
  /** Visual Duo pane scope (lags during vertical mode transition). */
  const [contentScope, setContentScope] = useState<MatchDeckPairUpScope>(
    restored?.activeScope ?? "my_plans"
  );
  const [scopeState, setScopeState] = useState<
    Record<MatchDeckPairUpScope, MatchDeckScopeSnapshot>
  >(() => ({
    my_plans: restored?.scopes.my_plans ?? emptyMatchDeckScopeSnapshot(),
    discover: restored?.scopes.discover ?? emptyMatchDeckScopeSnapshot(),
    open_plans: restored?.scopes.open_plans ?? emptyMatchDeckScopeSnapshot(),
  }));
  const [groupUpScope, setGroupUpScope] = useState<GroupUpDeckScopeSnapshot>(
    () => restored?.groupUp ?? emptyGroupUpDeckScopeSnapshot()
  );
  const [phase, setPhase] = useState<ActionPhase>("idle");
  /** Mine B3 / Groups host: embedded Profile open context (null = closed). */
  const [mineProfileOpen, setMineProfileOpen] =
    useState<PeopleEmbeddedProfileOpen | null>(null);
  /** Mine shell wash — two-layer opacity crossfade (never blank on identity change). */
  const [mineAtmosphere, setMineAtmosphere] =
    useState<MineAtmosphereCrossfadeState>(createMineAtmosphereCrossfadeState);
  const mineAtmosphereIdentityRef = useRef<string | null>(null);
  const mineAtmosphereWarmWatchGenRef = useRef(0);
  const mineAtmosphereWarmPrevIdentityRef = useRef<string | null>(null);
  const [pinned, setPinned] = useState<PairUpCandidate | null>(null);
  const [discoverEnabled, setDiscoverEnabled] = useState(true);
  const [discoverDialog, setDiscoverDialog] = useState<DiscoverDialog>(null);
  const [discoverEnableBusy, setDiscoverEnableBusy] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [connectResolving, setConnectResolving] = useState(false);
  /** Single-flight: true from Connect tap until mutation settles or photo-gate dismiss. */
  const connectInFlightRef = useRef(false);
  const [deckPrimaryAction, setDeckPrimaryAction] =
    useState<PeopleShellPrimaryAction | null>(null);
  const { ensureAuthed } = useAuthActionGate();
  const photoPromptOpen = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    isPairUpPhotoPromptOpen,
  );

  const isOpenPlansScope = contentScope === "open_plans";
  const activeDeck: DeckProps =
    contentScope === "open_plans"
      ? EMPTY_PAIR_UP_DECK
      : contentScope === "discover"
        ? (discover ?? {
            ...EMPTY_PAIR_UP_DECK,
            loading: true,
            express: async () => {
              throw new Error("Discover not ready");
            },
          })
        : myPlans;
  const {
    candidates,
    hasMore,
    loading,
    error,
    hasLoaded,
    refresh,
    loadMore,
    express,
  } = activeDeck;

  const scopeSnap = scopeState[contentScope];
  const removedIds = useMemo(
    () => new Set(scopeSnap.removedIds),
    [scopeSnap.removedIds]
  );
  const visitedIds = useMemo(
    () => new Set(scopeSnap.visitedIds),
    [scopeSnap.visitedIds]
  );
  const retiredIds = useMemo(
    () => new Set(scopeSnap.retiredIds),
    [scopeSnap.retiredIds]
  );
  const photoIndexByPersonKey = scopeSnap.photoIndexByPersonKey;
  const [loadMoreInFlight, setLoadMoreInFlight] = useState(false);
  const lastValidIndexRef = useRef(0);

  const ingestedIdsRef = useRef({
    my_plans: new Set<string>(),
    discover: new Set<string>(),
    open_plans: new Set<string>(),
  });
  const excludedOnIngestRef = useRef({
    my_plans: new Set<string>(),
    discover: new Set<string>(),
    open_plans: new Set<string>(),
  });
  const orderedIdsRef = useRef({
    my_plans: [] as string[],
    discover: [] as string[],
    open_plans: [] as string[],
  });
  const loadMoreInFlightRef = useRef(false);
  const openLocationRef = useRef(location);
  const activeScopeRef = useRef(activeScope);
  activeScopeRef.current = activeScope;
  const openPlansRef = useRef(openPlans);
  openPlansRef.current = openPlans;
  const groupUpsRef = useRef(groupUps);
  groupUpsRef.current = groupUps;
  const scopeStateRef = useRef(scopeState);
  scopeStateRef.current = scopeState;
  const groupUpScopeRef = useRef(groupUpScope);
  groupUpScopeRef.current = groupUpScope;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const patchScope = useCallback(
    (
      scope: MatchDeckPairUpScope,
      patch: Partial<MatchDeckScopeSnapshot>
    ) => {
      setScopeState((prev) => ({
        ...prev,
        [scope]: { ...prev[scope], ...patch },
      }));
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const applyPref = (value: boolean | null | undefined) => {
      if (cancelled) return;
      const enabled = value !== false;
      setDiscoverEnabled(enabled);
      if (!enabled && activeScopeRef.current === "discover") {
        setActiveScope("my_plans");
        setMode("p2p");
      }
    };
    void (async () => {
      const uid = await getViewerAuthUserId();
      if (cancelled) return;
      setAuthUserId(uid);
      if (!uid) return;
      const me = await getProfileByUserId(uid);
      if (cancelled) return;
      applyPref(me?.p2p_discover_enabled);
    })();
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { profile?: { p2p_discover_enabled?: boolean | null } }
        | undefined;
      if (detail?.profile && "p2p_discover_enabled" in detail.profile) {
        applyPref(detail.profile.p2p_discover_enabled);
      }
    };
    window.addEventListener("profile:updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("profile:updated", onUpdated);
    };
  }, []);

  // Cold open defaults to Mine; restore remounts prior lazy scopes when needed.
  useEffect(() => {
    const scope = restored?.activeScope ?? "my_plans";
    if (scope === "discover") {
      onRequestDiscoverMount();
    }
    if (scope === "open_plans" || restored?.activeScope === "open_plans") {
      onRequestOpenPlansMount();
    }
    if (restored?.mode === "groups") {
      onRequestGroupUpsMount();
    }
  }, [
    restored?.activeScope,
    restored?.mode,
    onRequestDiscoverMount,
    onRequestOpenPlansMount,
    onRequestGroupUpsMount,
  ]);

  const selectDuoMode = useCallback(() => {
    setMode("p2p");
    setActiveScope("my_plans");
  }, []);

  const enterDiscover = useCallback(() => {
    onRequestDiscoverMount();
    setMode("p2p");
    setActiveScope("discover");
  }, [onRequestDiscoverMount]);

  const handleSelectDiscover = useCallback(() => {
    if (discoverEnableBusy) return;

    if (!discoverEnabled) {
      setDiscoverEnableBusy(true);
      void (async () => {
        try {
          await setP2pDiscoverEnabled(true);
          setDiscoverEnabled(true);
          showDiscoverTurnedOnToast({
            onTurnedOff: () => {
              setDiscoverEnabled(false);
            },
          });
          if (authUserId && !hasP2pDiscoverIntroSeen(authUserId)) {
            setDiscoverDialog("intro");
            return;
          }
          enterDiscover();
        } catch {
          toast.error(peopleUiCopy.discoverToggleError);
        } finally {
          setDiscoverEnableBusy(false);
        }
      })();
      return;
    }

    if (authUserId && !hasP2pDiscoverIntroSeen(authUserId)) {
      setDiscoverDialog("intro");
      return;
    }
    enterDiscover();
  }, [authUserId, discoverEnableBusy, discoverEnabled, enterDiscover]);

  const handleSelectOpenPlans = useCallback(() => {
    onRequestOpenPlansMount();
    setMode("p2p");
    setActiveScope("open_plans");
  }, [onRequestOpenPlansMount]);

  const handleIntroContinue = useCallback(() => {
    if (authUserId) setP2pDiscoverIntroSeen(authUserId);
    setDiscoverDialog(null);
    enterDiscover();
  }, [authUserId, enterDiscover]);

  /** One shared removal path: hook list + session removedIds stay in sync. */
  const handleRemoveOpenPlanCandidate = useCallback(
    (opportunityId: string) => {
      if (!opportunityId) return;
      openPlansRef.current?.removeCandidate(opportunityId);
      setScopeState((prev) => {
        const snap = prev.open_plans;
        if (snap.removedIds.includes(opportunityId)) return prev;
        const preOrder =
          snap.activeOrderedIds.length > 0
            ? snap.activeOrderedIds
            : orderedIdsRef.current.open_plans;
        const remainingIds = preOrder.filter((id) => id !== opportunityId);
        const neighbor = resolveNearestOpportunityId(
          preOrder,
          remainingIds,
          opportunityId
        );
        return {
          ...prev,
          open_plans: {
            ...snap,
            removedIds: [...snap.removedIds, opportunityId],
            activeOrderedIds: remainingIds,
            currentOpportunityId:
              snap.currentOpportunityId === opportunityId
                ? neighbor
                : snap.currentOpportunityId,
          },
        };
      });
    },
    []
  );

  const patchOpenPlansScope = useCallback(
    (patch: Partial<MatchDeckScopeSnapshot>) => {
      patchScope("open_plans", patch);
    },
    [patchScope]
  );

  const patchGroupUpScope = useCallback(
    (patch: Partial<GroupUpDeckScopeSnapshot>) => {
      setGroupUpScope((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleSelectGroupsBrowseTab = useCallback(
    (tab: GroupUpDeckScopeSnapshot["browseTab"]) => {
      patchGroupUpScope({ browseTab: tab });
    },
    [patchGroupUpScope]
  );

  const toggleGroupsYoursBrowse = useCallback(() => {
    const next =
      groupUpScope.browseTab === "yours" ? ("new" as const) : ("yours" as const);
    handleSelectGroupsBrowseTab(next);
  }, [groupUpScope.browseTab, handleSelectGroupsBrowseTab]);

  const selectGroupsMode = useCallback(() => {
    onRequestGroupUpsMount();
    if (mode === "groups") {
      /* Already on Groups: re-tap toggles New ↔ Yours (same browseTab as top). */
      toggleGroupsYoursBrowse();
      return;
    }
    /* Entering Groups from Duo/Discover/Plans → normal discovery. */
    handleSelectGroupsBrowseTab("new");
    setMode("groups");
  }, [
    handleSelectGroupsBrowseTab,
    mode,
    onRequestGroupUpsMount,
    toggleGroupsYoursBrowse,
  ]);

  const flatActiveDestination: PeopleFlatDestination =
    mode === "groups"
      ? "groups"
      : activeScope === "discover"
        ? "discover"
        : activeScope === "open_plans"
          ? "plans"
          : "duo";

  /** Drives PeopleDuoModeTransition — Groups included in same order as bottom nav. */
  const activePrimaryScope: PeoplePrimaryScope =
    mode === "groups" ? "groups" : activeScope;

  const onVisualScopeChange = useCallback((scope: PeoplePrimaryScope) => {
    if (isPairUpPrimaryScope(scope)) {
      setContentScope(scope);
    }
  }, []);

  const suspendDeckSession = useCallback(() => {
    suspendMatchDeckSession({
      mode,
      activeScope,
      scopes: scopeState,
      groupUp: groupUpScope,
    });
  }, [activeScope, groupUpScope, mode, scopeState]);

  /** One shared removal path: hook list + session removedIds stay in sync. */
  const handleRemoveGroupUpCandidate = useCallback((opportunityId: string) => {
    if (!opportunityId) return;
    groupUpsRef.current?.removeCandidate(opportunityId);
    setGroupUpScope((prev) => {
      if (prev.removedIds.includes(opportunityId)) return prev;
      const nextCurrent = { ...prev.currentOpportunityIdByTab };
      const nextActive = {
        new: [...(prev.activeOrderedIdsByTab.new ?? [])],
        yours: [...(prev.activeOrderedIdsByTab.yours ?? [])],
      };
      for (const tab of ["new", "yours"] as const) {
        const preOrder = nextActive[tab];
        const remaining = preOrder.filter((id) => id !== opportunityId);
        nextActive[tab] = remaining;
        if (nextCurrent[tab] === opportunityId) {
          nextCurrent[tab] = resolveNearestOpportunityId(
            preOrder,
            remaining,
            opportunityId
          );
        }
      }
      return {
        ...prev,
        removedIds: [...prev.removedIds, opportunityId],
        currentOpportunityIdByTab: nextCurrent,
        activeOrderedIdsByTab: nextActive,
      };
    });
  }, []);

  const browsable = useMemo(() => {
    const ingested = ingestedIdsRef.current[contentScope];
    const excluded = excludedOnIngestRef.current[contentScope];
    for (const row of candidates) {
      if (ingested.has(row.opportunity_id)) continue;
      ingested.add(row.opportunity_id);
      if (row.expressed_by_me) {
        excluded.add(row.opportunity_id);
      }
    }
    return candidates.filter(
      (row) =>
        !excluded.has(row.opportunity_id) && !removedIds.has(row.opportunity_id)
    );
  }, [contentScope, candidates, removedIds]);

  const interleaved = useMemo(() => {
    const next = interleavePairUpCandidates(
      browsable,
      orderedIdsRef.current[contentScope],
      retiredIds
    );
    orderedIdsRef.current[contentScope] = next.map((row) => row.opportunity_id);
    return next;
  }, [contentScope, browsable, retiredIds]);

  // Fixtures only when explicitly forced in DEV — never substitute for empty Mine.
  const useDevMocks =
    import.meta.env.DEV &&
    contentScope === "my_plans" &&
    isPeopleMineDevFixturesForced();

  const mockRows = useMemo(
    () =>
      DEV_MATCH_DECK_MOCKS.filter((row) => !removedIds.has(row.opportunity_id)),
    [removedIds]
  );
  const sourceRows = useDevMocks ? mockRows : interleaved;

  const deckRows = useMemo(() => {
    const byId = new Map(sourceRows.map((row) => [row.opportunity_id, row]));
    const active = scopeSnap.activeOrderedIds;
    if (active.length === 0) return sourceRows;
    const rows: PairUpCandidate[] = [];
    for (const id of active) {
      const row = byId.get(id);
      if (row) rows.push(row);
    }
    return rows;
  }, [scopeSnap.activeOrderedIds, sourceRows]);

  const foundIndex = indexOfOpportunity(
    deckRows,
    scopeSnap.currentOpportunityId
  );
  if (foundIndex >= 0) {
    lastValidIndexRef.current = foundIndex;
  }
  const index =
    foundIndex >= 0
      ? foundIndex
      : scopeSnap.currentOpportunityId == null
        ? 0
        : lastValidIndexRef.current;

  const current =
    pinned ??
    (foundIndex >= 0 ? deckRows[foundIndex] : null);
  const controlsLocked = phase === "expressing" || phase === "completing";
  const isDiscoverScope = contentScope === "discover";
  /** Mine + Discover: PairUp data / Connect / profile owners. */
  const isCanonicalPairUpScope =
    mode === "p2p" &&
    (contentScope === "my_plans" || contentScope === "discover");
  /**
   * Mine + Discover + Plans + Groups: shared canonical shell (padding, Back,
   * compact action, atmosphere). Motion/edges for PairUp live below; Plans /
   * Groups own deck-body motion with the same controller path.
   */
  const isCanonicalPeopleScope =
    mode === "groups" ||
    (mode === "p2p" &&
      (contentScope === "my_plans" ||
        contentScope === "discover" ||
        contentScope === "open_plans"));

  const [plansAtmosphereIdentityKey, setPlansAtmosphereIdentityKey] = useState<
    string | null
  >(null);
  const [groupsAtmosphereIdentityKey, setGroupsAtmosphereIdentityKey] =
    useState<string | null>(null);

  /** Atmosphere identity — keep prior wash until the new front is ready. */
  const mineAtmosphereIdentityKey = useMemo(() => {
    if (!isCanonicalPeopleScope) return null;
    if (mode === "groups") return groupsAtmosphereIdentityKey;
    if (contentScope === "open_plans") return plansAtmosphereIdentityKey;
    const row = current;
    if (!row) return null;
    return `${row.opportunity_id}:${pairUpPersonKey(row)}`;
  }, [
    contentScope,
    current,
    groupsAtmosphereIdentityKey,
    isCanonicalPeopleScope,
    mode,
    plansAtmosphereIdentityKey,
  ]);

  /**
   * Sync authoritative Mine atmosphere identity before child *passive* effects
   * report readiness. Parent useLayoutEffect runs after child layout effects but
   * still before all useEffects — fixing the A→B reject race (child reported B
   * while ref was still A). Do not sync this gate only in useEffect.
   */
  useLayoutEffect(() => {
    mineAtmosphereIdentityRef.current = mineAtmosphereIdentityKey;
    // Leaving Mine / no candidate: clear both layers. Do not blank on A→B alone.
    if (!mineAtmosphereIdentityKey) {
      setMineAtmosphere((prev) => clearMineAtmosphereCrossfade(prev));
    }
  }, [mineAtmosphereIdentityKey]);

  const applyMineAtmospherePath = useCallback((path: string | null) => {
    const reduceMotion = prefersPeopleMotionReduce();
    setMineAtmosphere((prev) =>
      applyMineAtmosphereReady(prev, path, { reduceMotion })
    );
  }, []);

  const handleMineAtmosphereChange = useCallback(
    (report: PeopleMineAtmosphereReport) => {
      if (
        !shouldApplyMineAtmosphereReport({
          reportIdentityKey: report.identityKey,
          authoritativeIdentityKey: mineAtmosphereIdentityRef.current,
          ready: report.ready,
        })
      ) {
        return;
      }
      applyMineAtmospherePath(report.path);
    },
    [applyMineAtmospherePath]
  );

  const handleMineAtmosphereFadeComplete = useCallback((generation: number) => {
    setMineAtmosphere((prev) =>
      completeMineAtmosphereCrossfade(prev, generation)
    );
  }, []);

  const prevOverlayDebugRef = useRef({
    mode,
    activeScope,
    index,
    currentOpportunityId: scopeSnap.currentOpportunityId,
  });

  useEffect(() => {
    peopleDebugRecord("deck:mount", { deck: "matchDeckOverlay" });
    return () => {
      peopleDebugRecord("deck:unmount", { deck: "matchDeckOverlay" });
    };
  }, []);

  useEffect(() => {
    peopleDebugSetContext({
      mode,
      deck: "matchDeckOverlay",
      scope: activeScope,
    });
  }, [mode, activeScope]);

  useEffect(() => {
    const prev = prevOverlayDebugRef.current;
    if (prev.mode !== mode) {
      peopleDebugRecord("deck:mode", { from: prev.mode, to: mode });
    }
    if (prev.activeScope !== activeScope) {
      peopleDebugRecord("deck:scope", {
        from: prev.activeScope,
        to: activeScope,
      });
    }
    if (prev.index !== index) {
      peopleDebugRecord("deck:index", {
        from: prev.index,
        to: index,
        deckRowsLen: deckRows.length,
      });
    }
    if (prev.currentOpportunityId !== scopeSnap.currentOpportunityId) {
      peopleDebugRecord("deck:currentOpportunityId", {
        from: prev.currentOpportunityId?.slice(0, 8) ?? null,
        to: scopeSnap.currentOpportunityId?.slice(0, 8) ?? null,
        index,
      });
    }
    prevOverlayDebugRef.current = {
      mode,
      activeScope,
      index,
      currentOpportunityId: scopeSnap.currentOpportunityId,
    };
  }, [mode, activeScope, index, scopeSnap.currentOpportunityId, deckRows.length]);

  useEffect(() => {
    const eligibleIds = new Set(sourceRows.map((row) => row.opportunity_id));
    const snap = scopeStateRef.current[contentScope];
    const preOrder =
      snap.activeOrderedIds.length > 0
        ? snap.activeOrderedIds
        : orderedIdsRef.current[contentScope];

    const nextActive = filterOrderedIdsToEligible(
      snap.activeOrderedIds,
      eligibleIds
    );
    const activeSet = new Set(nextActive);
    for (const row of sourceRows) {
      const id = row.opportunity_id;
      if (activeSet.has(id)) continue;
      if (snap.retiredIds.includes(id)) continue;
      nextActive.push(id);
      activeSet.add(id);
    }

    let nextCurrent = snap.currentOpportunityId;
    if (nextCurrent && !eligibleIds.has(nextCurrent)) {
      nextCurrent = resolveNearestOpportunityId(
        preOrder,
        eligibleIds,
        nextCurrent
      );
    } else if (nextCurrent == null && nextActive.length > 0) {
      nextCurrent = nextActive[0] ?? null;
    }

    const activeChanged =
      nextActive.length !== snap.activeOrderedIds.length ||
      nextActive.some((id, i) => id !== snap.activeOrderedIds[i]);
    const currentChanged = nextCurrent !== snap.currentOpportunityId;
    if (!activeChanged && !currentChanged) return;

    patchScope(contentScope, {
      ...(activeChanged ? { activeOrderedIds: nextActive } : {}),
      ...(currentChanged ? { currentOpportunityId: nextCurrent } : {}),
    });
  }, [contentScope, patchScope, sourceRows]);

  useEffect(() => {
    const snap = scopeStateRef.current[contentScope];
    const pruned = pruneActiveOrderedIds(
      snap.activeOrderedIds,
      snap.currentOpportunityId
    );
    if (!pruned) return;
    const retiredSet = new Set(snap.retiredIds);
    const nextRetired = [...snap.retiredIds];
    for (const id of pruned.retired) {
      if (retiredSet.has(id)) continue;
      retiredSet.add(id);
      nextRetired.push(id);
    }
    patchScope(contentScope, {
      activeOrderedIds: pruned.kept,
      retiredIds: nextRetired,
    });
  }, [contentScope, patchScope, scopeSnap.currentOpportunityId]);

  useEffect(() => {
    const id =
      foundIndex >= 0
        ? deckRows[foundIndex]?.opportunity_id
        : scopeSnap.currentOpportunityId;
    if (!id) return;
    if (visitedIds.has(id)) return;
    patchScope(contentScope, {
      visitedIds: [...scopeSnap.visitedIds, id],
    });
  }, [
    contentScope,
    deckRows,
    foundIndex,
    patchScope,
    scopeSnap.currentOpportunityId,
    scopeSnap.visitedIds,
    visitedIds,
  ]);

  useEffect(() => {
    const remaining = deckRows.length - index - 1;
    const emptyNeedsPage = shouldLoadMoreForEmptyWindow({
      visibleCount: deckRows.length,
      hasMore: useDevMocks ? false : hasMore,
      loadMoreInFlight,
    });
    if (
      useDevMocks ||
      loadMoreInFlight ||
      !hasMore ||
      (!emptyNeedsPage && remaining > PREFETCH_REMAINING)
    ) {
      return;
    }
    peopleDebugRecord("deck:prefetchTrigger", {
      remaining,
      index,
      deckRowsLen: deckRows.length,
      scope: activeScope,
      emptyNeedsPage,
    });
    loadMoreInFlightRef.current = true;
    setLoadMoreInFlight(true);
    void loadMore()
      .catch(() => {
        /* Keep current cards; retry on next remaining check. */
      })
      .finally(() => {
        loadMoreInFlightRef.current = false;
        setLoadMoreInFlight(false);
      });
  }, [
    activeScope,
    deckRows.length,
    hasMore,
    index,
    loadMore,
    loadMoreInFlight,
    useDevMocks,
  ]);

  useEffect(() => {
    for (const row of candidates) {
      primeCandidateProfilePreview(row);
    }
  }, [candidates]);

  const runComplete = useCallback(
    async (opportunityId: string) => {
      setPhase("completing");
      try {
        const done = await completePairUpMatch(opportunityId);
        navigate(messagesConversationPath(done.conversation_id), {
          state: {
            backgroundLocation: openLocationRef.current,
            otherUserId: done.other_user_id,
          },
        });
      } catch {
        setPhase("completeFailed");
        toast.error(peopleUiCopy.deckCompleteError);
      }
    },
    [navigate]
  );

  const carouselItems = useMemo(() => {
    if (!pinned) return deckRows;
    if (deckRows.some((row) => row.opportunity_id === pinned.opportunity_id)) {
      return deckRows;
    }
    const next = [...deckRows];
    next.splice(Math.min(index, next.length), 0, pinned);
    return next;
  }, [deckRows, index, pinned]);

  const goToIndex = useCallback(
    (next: number): boolean => {
      if (
        controlsLocked ||
        connectResolving ||
        photoPromptOpen ||
        phase === "completeFailed"
      ) {
        return false;
      }
      const clamped = Math.max(0, Math.min(carouselItems.length - 1, next));
      const id = carouselItems[clamped]?.opportunity_id ?? null;
      patchScope(contentScope, { currentOpportunityId: id });
      return true;
    },
    [
      contentScope,
      carouselItems,
      connectResolving,
      controlsLocked,
      patchScope,
      phase,
      photoPromptOpen,
    ]
  );

  const mineEdgeNavLocked =
    controlsLocked ||
    connectResolving ||
    photoPromptOpen ||
    phase === "completeFailed";
  const canMineGoPrev = !mineEdgeNavLocked && index > 0;
  const canMineGoNext =
    !mineEdgeNavLocked && index < carouselItems.length - 1;
  /** Carousel writes prepare(dest, { jump? }): Embla departure lock before goToIndex. */
  const mineProxyProgrammaticPrepareRef = useRef<
    ((destinationIndex: number, opts?: { jump?: boolean }) => void) | null
  >(null);
  const mineIndexRef = useRef(index);
  mineIndexRef.current = index;
  /** Button-flight latch — never leave flightActive true without a completion path. */
  const mineButtonLatchRef = useRef<MineButtonFlightLatch>(
    createMineButtonFlightLatch()
  );
  /** Filled after identitySourceFor — warms front URLs without blocking nav. */
  const warmMineAroundRef = useRef<
    (
      atIndex: number,
      extraIndices?: readonly number[],
      direction?: MineWarmDirection
    ) => void
  >(() => {});
  const mineWarmDirectionRef = useRef<MineWarmDirection>("forward");
  const mineWarmPrevIndexRef = useRef(index);

  // Finger-drag (or other) index ownership diverged from button dest → release latch.
  useEffect(() => {
    const prev = mineButtonLatchRef.current;
    const next = releaseMineButtonLatchOnIndexDiverge(prev, index);
    if (next !== prev) {
      mineButtonLatchRef.current = next;
      peopleDebugRecord("mine:edgeNav", {
        phase: "latch-diverge-release",
        index,
        pending: next.pendingTarget,
      });
    }
  }, [index]);

  // Candidate list length change: drop pending out of range; clear active if empty.
  useEffect(() => {
    const latch = mineButtonLatchRef.current;
    const len = carouselItems.length;
    if (len <= 0) {
      mineButtonLatchRef.current = createMineButtonFlightLatch();
      return;
    }
    if (
      latch.pendingTarget != null &&
      (latch.pendingTarget < 0 || latch.pendingTarget > len - 1)
    ) {
      mineButtonLatchRef.current = {
        ...latch,
        pendingTarget: Math.max(0, Math.min(len - 1, latch.pendingTarget)),
      };
    }
    if (
      latch.flightDest != null &&
      (latch.flightDest < 0 || latch.flightDest > len - 1)
    ) {
      mineButtonLatchRef.current = {
        flightActive: false,
        pendingTarget: mineButtonLatchRef.current.pendingTarget,
        flightDest: null,
      };
    }
  }, [carouselItems.length]);

  // Leave Mine/Discover: drop button queue so stale hops cannot run later.
  useEffect(() => {
    if (isCanonicalPairUpScope) return;
    mineButtonLatchRef.current = createMineButtonFlightLatch();
  }, [isCanonicalPairUpScope]);

  const startMineButtonStep = useCallback(
    (destinationIndex: number) => {
      const len = carouselItems.length;
      const planned = planMineButtonStep(
        mineButtonLatchRef.current,
        destinationIndex,
        mineIndexRef.current,
        len,
        !mineEdgeNavLocked
      );
      mineButtonLatchRef.current = planned.latch;
      peopleDebugRecord("mine:edgeNav", {
        phase: "plan-step",
        clamped: planned.clamped,
        shouldNavigate: planned.shouldNavigate,
        flightActive: planned.latch.flightActive,
        pending: planned.latch.pendingTarget,
        jump: true,
      });
      if (!planned.shouldNavigate) return;

      warmMineAroundRef.current(
        planned.clamped,
        [
          planned.clamped - 1,
          planned.clamped + 1,
          planned.clamped + 2,
          planned.clamped + 3,
          planned.clamped + 4,
        ],
        planned.clamped >= mineIndexRef.current ? "forward" : "backward"
      );
      // Prepare before goToIndex so Embla departure lock precedes scrollTo.
      // All Mine edge-button hops are instant (jump=true); drag is untouched.
      mineProxyProgrammaticPrepareRef.current?.(planned.clamped, {
        jump: true,
      });
      const ok = goToIndex(planned.clamped);
      if (!ok) {
        mineButtonLatchRef.current = {
          flightActive: false,
          pendingTarget: mineButtonLatchRef.current.pendingTarget,
          flightDest: null,
        };
        peopleDebugRecord("mine:edgeNav", {
          phase: "goToIndex-rejected",
          clamped: planned.clamped,
        });
      }
    },
    [carouselItems.length, goToIndex, mineEdgeNavLocked]
  );

  const flushMineButtonPending = useCallback(() => {
    const { latch, nextStep } = flushMineButtonLatch(
      mineButtonLatchRef.current,
      mineIndexRef.current,
      carouselItems.length
    );
    mineButtonLatchRef.current = latch;
    peopleDebugRecord("mine:edgeNav", {
      phase: "flush",
      nextStep,
      pending: latch.pendingTarget,
      index: mineIndexRef.current,
    });
    if (nextStep == null) return;
    startMineButtonStep(nextStep);
  }, [carouselItems.length, startMineButtonStep]);

  const goMinePrev = useCallback(() => {
    const len = carouselItems.length;
    if (len <= 0) return;
    const latch = mineButtonLatchRef.current;
    if (latch.flightActive) {
      const base = latch.pendingTarget ?? mineIndexRef.current;
      const pending = Math.max(0, base - 1);
      mineButtonLatchRef.current = queueMineButtonTarget(latch, pending, len);
      mineWarmDirectionRef.current = "backward";
      warmMineAroundRef.current(
        mineIndexRef.current,
        [pending, pending - 1, pending - 2, pending - 3],
        "backward"
      );
      peopleDebugRecord("mine:edgeNav", {
        phase: "queue-prev",
        pending,
        flightActive: true,
      });
      return;
    }
    const dest = Math.max(0, mineIndexRef.current - 1);
    if (dest === mineIndexRef.current) return;
    startMineButtonStep(dest);
  }, [carouselItems.length, startMineButtonStep]);

  const goMineNext = useCallback(() => {
    const len = carouselItems.length;
    if (len <= 0) return;
    const latch = mineButtonLatchRef.current;
    if (latch.flightActive) {
      const base = latch.pendingTarget ?? mineIndexRef.current;
      const pending = Math.min(len - 1, base + 1);
      mineButtonLatchRef.current = queueMineButtonTarget(latch, pending, len);
      mineWarmDirectionRef.current = "forward";
      warmMineAroundRef.current(
        mineIndexRef.current,
        [pending, pending + 1, pending + 2, pending + 3, pending + 4],
        "forward"
      );
      peopleDebugRecord("mine:edgeNav", {
        phase: "queue-next",
        pending,
        flightActive: true,
      });
      return;
    }
    const dest = Math.min(len - 1, mineIndexRef.current + 1);
    if (dest === mineIndexRef.current) return;
    startMineButtonStep(dest);
  }, [carouselItems.length, startMineButtonStep]);
  /**
   * Production real-incoming portrait choreography — Mine + Discover
   * (canonical PairUp). DEV proxy/probe fixtures stay my_plans-only below.
   */
  const mineRealIncomingEnabled =
    isCanonicalPairUpScope && isPeopleMineRealIncomingEnabled();
  /** DEV-only image proxy — Mine investigation; suppressed when real-incoming on. */
  const mineIncomingProxyEnabled =
    contentScope === "my_plans" &&
    mode === "p2p" &&
    isPeopleMineIncomingProxyEnabled();
  /** DEV-only yellow probe box — Mine investigation only. */
  const mineMotionProbeEnabled =
    !mineIncomingProxyEnabled &&
    !mineRealIncomingEnabled &&
    contentScope === "my_plans" &&
    mode === "p2p" &&
    isPeopleMineMotionProbeEnabled();
  const mineMotionSurfaceEnabled =
    mineIncomingProxyEnabled ||
    mineMotionProbeEnabled ||
    mineRealIncomingEnabled;

  const mineMotionProbeCtrlRef = useRef<MineMotionProbeController | null>(null);
  const mineEdgeNavCardsRef = useRef<MineEdgeNavCardsHandle>({
    prev: null,
    next: null,
  });
  // Flight APIs require mode "proxy"; real-incoming reuses that without mounting
  // the image proxy DOM.
  const mineMotionCtrlMode =
    mineIncomingProxyEnabled || mineRealIncomingEnabled ? "proxy" : "box";
  if (
    mineMotionSurfaceEnabled &&
    (!mineMotionProbeCtrlRef.current ||
      mineMotionProbeCtrlRef.current.mode !== mineMotionCtrlMode)
  ) {
    mineMotionProbeCtrlRef.current =
      createMineMotionProbeController(mineMotionCtrlMode);
  }
  if (!mineMotionSurfaceEnabled) {
    mineMotionProbeCtrlRef.current = null;
  } else if (mineMotionProbeCtrlRef.current) {
    mineMotionProbeCtrlRef.current.onFlightSettled = flushMineButtonPending;
  }

  const bindMineMotionProbeRoot = useCallback(
    (node: HTMLDivElement | null) => {
      const ctrl = mineMotionProbeCtrlRef.current;
      if (!ctrl) return;
      ctrl.root = node;
    },
    []
  );
  const bindMineMotionProxyImg = useCallback(
    (node: HTMLImageElement | null) => {
      const ctrl = mineMotionProbeCtrlRef.current;
      if (!ctrl) return;
      ctrl.img = node;
    },
    []
  );

  const closeMineProfileOverlay = useCallback(() => {
    setMineProfileOpen(null);
  }, []);

  const openMineProfileForCandidate = useCallback(
    (candidate: PairUpCandidate) => {
      if (
        contentScope !== "my_plans" &&
        contentScope !== "discover"
      ) {
        return;
      }
      const ctx = createMineCandidateProfileOpenContext(
        candidate,
        contentScope
      );
      if (!ctx) return;
      setMineProfileOpen(ctx);
    },
    [contentScope]
  );

  const openGroupHostProfile = useCallback((candidate: GroupUpCandidate) => {
    // Same overlay lifecycle as Duo: set open context only.
    // Do NOT suspend/reset groupUpScope, remount the deck, or clear mediaIndex —
    // GroupUpDeckBody stays mounted under the portal; Back restores exact state.
    const ctx = createGroupHostProfileOpenContext(candidate);
    if (!ctx) return;
    setMineProfileOpen(ctx);
  }, []);

  const runPairUpConnectForTarget = useCallback(
    async (
      target: PairUpCandidate,
      scope: "my_plans" | "discover"
    ) => {
      if (controlsLocked || phase === "completeFailed") return;

      await runMinePairUpConnect({
        target,
        scope,
        host: {
          shouldAbortBeforeStart: () =>
            connectInFlightRef.current ||
            connectResolving ||
            photoPromptOpen,
          isDevMock: isDevMockCandidate,
          ensureAuthed,
          authUserId,
          express,
          applyUnmatchedRemoval: (leavingId) => {
            setScopeState((prev) => {
              const snap = prev[scope];
              if (snap.removedIds.includes(leavingId)) return prev;
              const preOrder =
                snap.activeOrderedIds.length > 0
                  ? snap.activeOrderedIds
                  : orderedIdsRef.current[scope];
              const remainingIds = preOrder.filter((id) => id !== leavingId);
              const neighbor = resolveNearestOpportunityId(
                preOrder,
                remainingIds,
                leavingId
              );
              return {
                ...prev,
                [scope]: {
                  ...snap,
                  removedIds: [...snap.removedIds, leavingId],
                  activeOrderedIds: remainingIds,
                  currentOpportunityId: neighbor,
                },
              };
            });
          },
          applyMatchedAndComplete: async (leavingId) => {
            const snap = scopeStateRef.current[scope];
            const preOrder =
              snap.activeOrderedIds.length > 0
                ? snap.activeOrderedIds
                : orderedIdsRef.current[scope];
            const remainingIds = preOrder.filter((id) => id !== leavingId);
            const neighbor = resolveNearestOpportunityId(
              preOrder,
              remainingIds,
              leavingId
            );
            const nextSnap: MatchDeckScopeSnapshot = {
              ...snap,
              removedIds: snap.removedIds.includes(leavingId)
                ? snap.removedIds
                : [...snap.removedIds, leavingId],
              activeOrderedIds: remainingIds,
              currentOpportunityId: neighbor,
            };
            const nextScopes = {
              ...scopeStateRef.current,
              [scope]: nextSnap,
            };
            scopeStateRef.current = nextScopes;
            setScopeState(nextScopes);
            suspendMatchDeckSession({
              mode: modeRef.current,
              activeScope: scope,
              scopes: nextScopes,
              groupUp: groupUpScopeRef.current,
            });
            await runComplete(leavingId);
          },
          setPinned,
          setPhaseExpressing: () => setPhase("expressing"),
          setPhaseIdle: () => setPhase("idle"),
          beginFlight: () => {
            connectInFlightRef.current = true;
            setConnectResolving(true);
          },
          endFlight: () => {
            connectInFlightRef.current = false;
            setConnectResolving(false);
          },
        },
      });
    },
    [
      authUserId,
      connectResolving,
      controlsLocked,
      ensureAuthed,
      express,
      phase,
      photoPromptOpen,
      runComplete,
    ]
  );

  const handleConnect = useCallback(async () => {
    if (!current) return;
    const scope = contentScope;
    if (scope !== "my_plans" && scope !== "discover") return;
    await runPairUpConnectForTarget(current, scope);
  }, [contentScope, current, runPairUpConnectForTarget]);

  const handleMineProfileConnect = useCallback(async () => {
    if (!isMineCandidateProfileOpenContext(mineProfileOpen)) return;
    await runPairUpConnectForTarget(
      mineProfileOpen.candidate,
      mineProfileOpen.scope
    );
  }, [mineProfileOpen, runPairUpConnectForTarget]);

  const handleRetryComplete = useCallback(() => {
    if (!pinned || phase !== "completeFailed") return;
    void runComplete(pinned.opportunity_id);
  }, [phase, pinned, runComplete]);

  const identitySourceFor = useCallback(
    (row: PairUpCandidate): ProfileIdentityMediaSource => {
      if (isDevMockCandidate(row)) {
        const mock = DEV_MOCK_PROFILE_BY_ID[row.opportunity_id];
        return {
          profile_photos: mock?.photos ?? [],
          avatar_url: row.avatar_url,
          display_name: row.display_name,
          username: row.username,
        };
      }
      return {
        profile_photos: row.profile_photos,
        echo_preset: row.echo_preset,
        avatar_url: row.avatar_url,
        display_name: row.display_name,
        username: row.username,
      };
    },
    []
  );

  /** Front photo for warm watch — same photoIndexByPersonKey as portrait + ±2 warm. */
  const mineAtmosphereWarmTarget = useMemo(() => {
    if (!isCanonicalPairUpScope) return null;
    if (!mineAtmosphereIdentityKey || !current) return null;
    const personKey = pairUpPersonKey(current);
    const photoIdx = photoIndexByPersonKey[personKey] ?? 0;
    const source = identitySourceFor(current);
    const displayUrl = resolveMineFrontDisplayUrl(source, photoIdx);
    const path = resolveMineFrontPhotoPath(source, photoIdx);
    return {
      identityKey: mineAtmosphereIdentityKey,
      path,
      displayUrl,
    };
  }, [
    current,
    identitySourceFor,
    isCanonicalPairUpScope,
    mineAtmosphereIdentityKey,
    photoIndexByPersonKey,
  ]);

  /**
   * On candidate identity commit: apply atmosphere when existing warm succeeds
   * (or is already done). Child paint-ready reports remain authoritative for
   * photo cycling; whichever valid signal arrives first wins via apply dedupe.
   */
  useEffect(() => {
    if (!isCanonicalPairUpScope) return;

    const nextIdentity = mineAtmosphereIdentityKey;
    if (
      !shouldRunMineAtmosphereWarmWatch({
        previousIdentityKey: mineAtmosphereWarmPrevIdentityRef.current,
        nextIdentityKey: nextIdentity,
      })
    ) {
      if (!nextIdentity) {
        mineAtmosphereWarmPrevIdentityRef.current = null;
      }
      return;
    }

    mineAtmosphereWarmPrevIdentityRef.current = nextIdentity;
    const target = mineAtmosphereWarmTarget;
    if (!target || target.identityKey !== nextIdentity) return;

    const watchGen = ++mineAtmosphereWarmWatchGenRef.current;
    const { identityKey, path, displayUrl } = target;

    const tryApplyFromWarmSuccess = (applyPath: string) => {
      if (watchGen !== mineAtmosphereWarmWatchGenRef.current) return;
      if (mineAtmosphereIdentityRef.current !== identityKey) return;
      if (
        resolveMineAtmosphereWarmSettlement({
          warmSucceeded: true,
          frontPath: applyPath,
        }) !== "apply-path"
      ) {
        return;
      }
      applyMineAtmospherePath(applyPath);
    };

    // Genuine missing identity media — neutral wash. Not a warm failure.
    if (!path || !displayUrl) {
      if (watchGen === mineAtmosphereWarmWatchGenRef.current) {
        if (mineAtmosphereIdentityRef.current === identityKey) {
          applyMineAtmospherePath(null);
        }
      }
      return () => {
        mineAtmosphereWarmWatchGenRef.current += 1;
      };
    }

    if (isMineFrontImageWarmDone(displayUrl)) {
      tryApplyFromWarmSuccess(path);
      return () => {
        mineAtmosphereWarmWatchGenRef.current += 1;
      };
    }

    void warmMineFrontImage(displayUrl)
      .then(() => tryApplyFromWarmSuccess(path))
      .catch(() => {
        // Ignore warm rejection — portrait readiness remains authoritative.
      });

    return () => {
      mineAtmosphereWarmWatchGenRef.current += 1;
    };
  }, [
    applyMineAtmospherePath,
    isCanonicalPairUpScope,
    mineAtmosphereIdentityKey,
    mineAtmosphereWarmTarget,
  ]);

  // Mine: warm front display URLs around the owned index (+ pending button target).
  // ~10-candidate rolling window; ±2 mount radius unchanged. Does not block Embla.
  warmMineAroundRef.current = (atIndex, extraIndices, direction) => {
    if (!isCanonicalPairUpScope) return;
    const dir = direction ?? mineWarmDirectionRef.current;
    warmMineFrontImages(
      collectMineWarmFrontUrls({
        items: carouselItems,
        atIndex,
        photoIndexByPersonKey,
        identitySourceFor,
        direction: dir,
        extraIndices,
      })
    );
  };

  useEffect(() => {
    if (!isCanonicalPairUpScope) return;
    const prev = mineWarmPrevIndexRef.current;
    if (index > prev) mineWarmDirectionRef.current = "forward";
    else if (index < prev) mineWarmDirectionRef.current = "backward";
    mineWarmPrevIndexRef.current = index;
    const pending = mineButtonLatchRef.current.pendingTarget;
    warmMineAroundRef.current(
      index,
      pending != null ? [pending] : undefined,
      mineWarmDirectionRef.current
    );
  }, [
    carouselItems,
    identitySourceFor,
    index,
    isCanonicalPairUpScope,
    photoIndexByPersonKey,
  ]);

  useEffect(() => {
    return () => {
      clearMineFrontImageWarmState();
    };
  }, []);

  // DEV incoming proxy: resolve adjacent URLs off the scroll hot path.
  // While flightLocked, do not overwrite frozen departure neighbors.
  // Button nav locks via mineProxyProgrammaticPrepareRef BEFORE goToIndex so
  // this effect cannot apply destination neighbors first.
  // Rapid button taps serialize through onFlightSettled (pending target).
  // Settle/lock pass Embla selectedScrollSnap into resyncAdjacent so React
  // index lag cannot poison prev/next identity.
  useEffect(() => {
    const ctrl = mineMotionProbeCtrlRef.current;
    if (!mineIncomingProxyEnabled || !ctrl || ctrl.mode !== "proxy") return;

    const resolveSide = (cand: PairUpCandidate | undefined): string | null => {
      if (!cand) return null;
      const personKey = pairUpPersonKey(cand);
      const photoIdx = photoIndexByPersonKey[personKey] ?? 0;
      return resolveMineProxyImageUrl(identitySourceFor(cand), photoIdx);
    };

    const armSide = (
      side: "prev" | "next",
      url: string | null,
      generation: number
    ) => {
      if (!url) return;
      const img = new Image();
      const markReady = () => {
        markMineMotionProbeSideReady(ctrl, side, url, generation);
      };
      img.onload = markReady;
      img.onerror = () => {
        if (ctrl.mediaGeneration !== generation) return;
        if (side === "prev" && ctrl.prevUrl === url) ctrl.prevReady = false;
        if (side === "next" && ctrl.nextUrl === url) ctrl.nextReady = false;
      };
      img.src = url;
      if (img.complete && img.naturalWidth > 0) markReady();
    };

    const syncLiveAdjacent = (authoritativeIndex?: number) => {
      if (ctrl.flightLocked) return;
      const at =
        typeof authoritativeIndex === "number" &&
        Number.isFinite(authoritativeIndex)
          ? Math.max(
              0,
              Math.min(
                Math.max(carouselItems.length - 1, 0),
                Math.floor(authoritativeIndex)
              )
            )
          : index;
      const prevUrl = resolveSide(carouselItems[at - 1]);
      const nextUrl = resolveSide(carouselItems[at + 1]);
      applyMineMotionProbeAdjacentMedia(ctrl, { prevUrl, nextUrl });
      const generation = ctrl.mediaGeneration;
      if (!ctrl.prevReady) armSide("prev", ctrl.prevUrl, generation);
      if (!ctrl.nextReady) armSide("next", ctrl.nextUrl, generation);
    };

    ctrl.resyncAdjacent = syncLiveAdjacent;

    if (ctrl.flightLocked) {
      // Flight active: keep frozen URLs; only continue loading the same ones.
      const generation = ctrl.mediaGeneration;
      if (!ctrl.prevReady) armSide("prev", ctrl.prevUrl, generation);
      if (!ctrl.nextReady) armSide("next", ctrl.nextUrl, generation);
    } else {
      syncLiveAdjacent();
    }

    return () => {
      if (ctrl.resyncAdjacent === syncLiveAdjacent) {
        ctrl.resyncAdjacent = null;
      }
    };
  }, [
    mineIncomingProxyEnabled,
    carouselItems,
    index,
    photoIndexByPersonKey,
    identitySourceFor,
  ]);

  const sourceContextMap = useMemo(
    () => buildPeopleSourceContextMap(interleaved),
    [interleaved]
  );

  const setPhotoIndexForPerson = useCallback(
    (personKey: string, nextIndex: number) => {
      const key = personKey.trim();
      if (!key) return;
      patchScope(contentScope, {
        photoIndexByPersonKey: {
          ...photoIndexByPersonKey,
          [key]: nextIndex,
        },
      });
    },
    [contentScope, patchScope, photoIndexByPersonKey]
  );

  const sourceForCandidate = useCallback(
    (row: PairUpCandidate) => {
      if (isDevMockCandidate(row)) {
        const mock = DEV_MOCK_SOURCE_BY_ID[row.opportunity_id];
        if (mock) {
          return {
            caption: mock.caption,
            scheduleLabel: mock.scheduleLabel,
            scheduleLabelKind: mock.scheduleLabelKind ?? null,
          };
        }
      }
      const fromMap = getPeopleSourceContext(
        sourceContextMap,
        row.source_post_id
      );
      if (fromMap) {
        return {
          caption: fromMap.caption,
          scheduleLabel: fromMap.scheduleLabel,
          scheduleLabelKind: fromMap.scheduleLabelKind,
        };
      }
      const normalized = normalizePeopleSourceContext(row);
      return {
        caption: normalized.caption,
        scheduleLabel: normalized.scheduleLabel,
        scheduleLabelKind: normalized.scheduleLabelKind,
      };
    },
    [sourceContextMap]
  );

  const canSeePostFor = useCallback((row: PairUpCandidate) => {
    return (
      !isDevMockCandidate(row) &&
      (row.source_type === "hangout" || row.source_type === "experience")
    );
  }, []);

  const handleSeePostFor = useCallback(
    (row: PairUpCandidate) => {
      if (!canSeePostFor(row)) return;
      // Duo/Discover cards show person photos, not source-post PublishedMediaItem
      // keys — Detail opens without initialMediaKey (Detail resolves its own media).
      releaseAllPublishedListVideoOwnership();
      navigateToPostDetailInApp(
        navigate,
        location,
        row.source_type!,
        row.source_post_id
      );
    },
    [canSeePostFor, location, navigate]
  );

  const showLoading =
    mode === "p2p" &&
    ((loading && interleaved.length === 0 && !pinned && !useDevMocks) ||
      (deckRows.length === 0 &&
        !pinned &&
        !useDevMocks &&
        (hasMore || loadMoreInFlight || (loading && !hasLoaded))));
  const showError =
    mode === "p2p" && Boolean(error) && interleaved.length === 0 && !pinned;
  const trueCaughtUp =
    mode === "p2p" &&
    !useDevMocks &&
    isTrueCaughtUpState({
      visibleCount: deckRows.length,
      hasLoaded,
      hasMore,
      loadMoreInFlight,
    });
  const showEmpty =
    mode === "p2p" &&
    !showLoading &&
    !showError &&
    !current &&
    deckRows.length === 0 &&
    (trueCaughtUp || useDevMocks || !hasLoaded);
  const emptyCopy = isDiscoverScope
    ? peopleUiCopy.discoverEmpty
    : trueCaughtUp
      ? peopleUiCopy.deckCaughtUp
      : hasLoaded
        ? peopleUiCopy.deckEmpty
        : peopleUiCopy.deckNoActive;
  const connectInteractionLocked =
    controlsLocked || connectResolving || photoPromptOpen;

  const pairUpPrimaryAction = useMemo((): PeopleShellPrimaryAction | null => {
    if (mode === "groups" || isOpenPlansScope) return null;
    if (showLoading || showError || showEmpty) {
      const state = resolvePairUpShellActionState({
        hasCurrent: false,
        locked: true,
        completeFailed: false,
      });
      return {
        label: peopleUiCopy.deckConnectLabel,
        onPress: () => {},
        disabled: true,
        tone: state.tone,
        icon: state.icon,
      };
    }
    const state = resolvePairUpShellActionState({
      hasCurrent: Boolean(current),
      locked: connectInteractionLocked,
      completeFailed: phase === "completeFailed",
    });
    if (state.labelKey === "retry") {
      return {
        label: peopleUiCopy.deckRetryComplete,
        onPress: () => handleRetryComplete(),
        disabled: state.disabled,
        tone: state.tone,
        icon: state.icon,
      };
    }
    if (state.labelKey === "none") {
      return {
        label: peopleUiCopy.deckConnectLabel,
        onPress: () => {},
        disabled: true,
        tone: "muted",
        icon: "connect",
      };
    }
    return {
      label: peopleUiCopy.deckConnectLabel,
      onPress: () => {
        void handleConnect();
      },
      disabled: state.disabled,
      busy: connectResolving,
      tone: state.tone,
      icon: state.icon,
    };
  }, [
    connectInteractionLocked,
    connectResolving,
    current,
    handleConnect,
    handleRetryComplete,
    isOpenPlansScope,
    mode,
    phase,
    showEmpty,
    showError,
    showLoading,
  ]);

  const primaryAction =
    mode === "groups" || isOpenPlansScope
      ? deckPrimaryAction ?? {
          label:
            mode === "groups"
              ? peopleUiCopy.groupUpShellRequest
              : peopleUiCopy.openPlansImDown,
          onPress: () => {},
          disabled: true,
          tone: "muted" as const,
          icon: mode === "groups" ? ("request" as const) : ("im_down" as const),
        }
      : pairUpPrimaryAction;

  const mineCompactConnect = isCanonicalPeopleScope;

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[var(--bg)]"
      aria-label={peopleUiCopy.matchDeck}
      data-people-match-deck-overlay="true"
    >
      {isCanonicalPeopleScope ? (
        <MineAtmosphereCrossfade
          state={mineAtmosphere}
          onFadeComplete={handleMineAtmosphereFadeComplete}
        />
      ) : null}

      {isCanonicalPairUpScope && carouselItems.length > 0 ? (
        <MineEdgeNavCards
          canGoPrev={canMineGoPrev}
          canGoNext={canMineGoNext}
          onPrev={goMinePrev}
          onNext={goMineNext}
          fixedRailsGeometry
          cardsRef={
            mineRealIncomingEnabled ? mineEdgeNavCardsRef : undefined
          }
        />
      ) : null}

      {mineIncomingProxyEnabled ? (
        <div
          ref={bindMineMotionProbeRoot}
          aria-hidden
          data-people-mine-incoming-proxy="true"
          className="pointer-events-none absolute left-0 z-[24] overflow-hidden bg-[var(--surface-2)]"
          style={{
            top: MINE_INCOMING_PROXY_CSS_TOP,
            borderRadius: PEOPLE_MINE_CARD_RADIUS,
            boxShadow: PEOPLE_MINE_FRONT_SHADOW,
            visibility: "hidden",
            transform: "translate3d(-9999px, -9999px, 0)",
            willChange: "transform",
          }}
        >
          <img
            ref={bindMineMotionProxyImg}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover object-center"
          />
        </div>
      ) : mineMotionProbeEnabled ? (
        <div
          ref={bindMineMotionProbeRoot}
          aria-hidden
          data-people-mine-motion-probe="true"
          className="pointer-events-none absolute left-0 z-[24] rounded-md bg-[#e8a317] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{
            top: MINE_INCOMING_PROXY_CSS_TOP,
            width: 40,
            height: 56,
            visibility: "hidden",
            transform: "translate3d(-9999px, -9999px, 0)",
            willChange: "transform",
          }}
        />
      ) : null}

      {/* Groups secondary: text-only "Yours" in discovery; globe circle in Yours.
          Stays in upper-left safe band (caption uses SOURCE_PAD_LEFT clearance). */}
      {mode === "groups" ? (
        groupUpScope.browseTab === "yours" ? (
          <button
            type="button"
            onClick={toggleGroupsYoursBrowse}
            aria-label={peopleUiCopy.groupUpDiscoverControlAria}
            aria-pressed={true}
            data-people-groups-yours-control="true"
            data-people-groups-yours-active="true"
            data-people-groups-yours-slot="former-back"
            data-people-groups-yours-shape="globe-circle"
            className={[
              "absolute z-[32] inline-flex items-center justify-center rounded-full",
              "transition active:scale-[0.94]",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
              "border border-transparent",
              "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
              "text-[var(--text)]",
            ].join(" ")}
            style={{
              top: `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_BACK_EDGE_INSET_PX}px)`,
              left: PEOPLE_BACK_EDGE_INSET_PX,
              width: PEOPLE_BACK_SIZE_PX,
              height: PEOPLE_BACK_SIZE_PX,
              maxWidth: PEOPLE_BACK_SIZE_PX,
            }}
          >
            <PiGlobe className="h-5 w-5" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleGroupsYoursBrowse}
            aria-label={peopleUiCopy.groupUpYoursControlAria}
            aria-pressed={false}
            data-people-groups-yours-control="true"
            data-people-groups-yours-active="false"
            data-people-groups-yours-slot="former-back"
            data-people-groups-yours-shape="text-pill"
            className={[
              "absolute z-[32] inline-flex h-8 max-w-[4.5rem] items-center justify-center rounded-full",
              "px-2.5 transition active:scale-[0.94]",
              "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
              "[-webkit-backdrop-filter:blur(var(--glass-blur))]",
              "border border-transparent",
              "shadow-[0_0_0_2px_var(--bottom-tab-pill-ring)]",
              "text-[var(--text)]",
            ].join(" ")}
            style={{
              top: `calc(var(--safe-area-top-layout, 0px) + ${PEOPLE_BACK_EDGE_INSET_PX}px)`,
              left: PEOPLE_BACK_EDGE_INSET_PX,
            }}
          >
            <span className="text-[12px] font-semibold leading-none tracking-tight">
              {peopleUiCopy.groupUpYoursControlLabel}
            </span>
          </button>
        )
      ) : null}

      <div
        className="relative z-[1] flex min-h-0 w-full flex-1 flex-col overflow-x-hidden"
        data-people-shell-content-pane="true"
        style={{
          // Mine + Discover + Plans: start at Back top so in-slide caption can share that Y.
          // Groups keep the Back-row reserve.
          paddingTop: isCanonicalPeopleScope
            ? peopleShellMineContentTopPad()
            : peopleShellContentTopPad(),
          paddingBottom: isCanonicalPeopleScope
            ? peopleShellMineContentBottomPad()
            : peopleShellContentBottomPad(),
        }}
      >
        <div
          className="people-shell-pane flex min-h-0 w-full flex-1 flex-col"
          data-people-shell-pane="true"
          data-people-primary-active={activePrimaryScope}
        >
          <PeopleDuoModeTransition
            activeScope={activePrimaryScope}
            onVisualScopeChange={onVisualScopeChange}
          >
            {(visualScope) =>
              visualScope === "groups" ? (
                groupUps ? (
                  <GroupUpDeckBody
                    key={`groups:${groupUpScope.browseTab}`}
                    deck={groupUps}
                    scopeSnap={groupUpScope}
                    patchScope={patchGroupUpScope}
                    onRemoveCandidate={handleRemoveGroupUpCandidate}
                    onSuspendSession={suspendDeckSession}
                    onPrimaryActionChange={setDeckPrimaryAction}
                    onAtmosphereChange={handleMineAtmosphereChange}
                    onAtmosphereIdentityKeyChange={
                      setGroupsAtmosphereIdentityKey
                    }
                    onOpenHostProfile={openGroupHostProfile}
                  />
                ) : (
                  <p className="m-auto text-[15px] text-[var(--text)]/60">
                    Loading…
                  </p>
                )
              ) : visualScope === "open_plans" ? (
                openPlans ? (
                  <OpenPlanDeckBody
                    deck={openPlans}
                    scopeSnap={scopeState.open_plans}
                    patchScope={patchOpenPlansScope}
                    onRemoveCandidate={handleRemoveOpenPlanCandidate}
                    onPrimaryActionChange={setDeckPrimaryAction}
                    onAtmosphereChange={handleMineAtmosphereChange}
                    onAtmosphereIdentityKeyChange={
                      setPlansAtmosphereIdentityKey
                    }
                  />
                ) : (
                  <p className="m-auto text-[15px] text-[var(--text)]/60">
                    Loading…
                  </p>
                )
              ) : showLoading ? (
                <p className="m-auto text-[15px] text-[var(--text)]/60">
                  Loading…
                </p>
              ) : showError ? (
                <div className="m-auto flex flex-col items-center gap-3 px-4 text-center">
                  <p className="text-[15px] text-[var(--text)]/80">
                    {peopleUiCopy.deckLoadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="rounded-full border border-[var(--bottom-tab-border)] px-4 py-2 text-[13px] font-semibold text-[var(--text)]"
                  >
                    {peopleUiCopy.deckRetryLoad}
                  </button>
                </div>
              ) : showEmpty ? (
                <p className="m-auto px-4 text-center text-[15px] text-[var(--text)]/80">
                  {emptyCopy}
                </p>
              ) : (
                <>
                  {/* Mine + Discover: no flex spacers; note→Connect gap lives in
                      peopleShellMineContentBottomPad. */}
                  <MatchDeckCarousel
                    items={carouselItems}
                    index={index}
                    onIndexChange={goToIndex}
                    onCardTap={undefined}
                    layout="duo"
                    duoInFlowChrome
                    duoPresentation="mine"
                    mineMotionProbeRef={
                      mineMotionSurfaceEnabled
                        ? mineMotionProbeCtrlRef
                        : undefined
                    }
                    mineProxyProgrammaticPrepareRef={
                      mineMotionSurfaceEnabled
                        ? mineProxyProgrammaticPrepareRef
                        : undefined
                    }
                    mineEdgeNavCardsRef={
                      mineRealIncomingEnabled
                        ? mineEdgeNavCardsRef
                        : undefined
                    }
                    locked={
                      connectInteractionLocked || phase === "completeFailed"
                    }
                    renderItem={(candidate, meta) => {
                      const mock = isDevMockCandidate(candidate)
                        ? DEV_MOCK_PROFILE_BY_ID[candidate.opportunity_id]
                        : undefined;
                      const source = sourceForCandidate(candidate);
                      const personKey = pairUpPersonKey(candidate);
                      return (
                        <PeopleDuoCandidateSlide
                          candidate={candidate}
                          identitySource={identitySourceFor(candidate)}
                          photoIndex={
                            photoIndexByPersonKey[personKey] ?? 0
                          }
                          onPhotoIndexChange={(next) =>
                            setPhotoIndexForPerson(personKey, next)
                          }
                          isCurrent={meta.isCurrent}
                          withPhoto={meta.withPhoto}
                          scheduleLabel={source.scheduleLabel || null}
                          scheduleLabelKind={source.scheduleLabelKind}
                          caption={source.caption || null}
                          onSeePost={
                            meta.isCurrent && canSeePostFor(candidate)
                              ? () => handleSeePostFor(candidate)
                              : undefined
                          }
                          about={mock?.about}
                          presentation="mine"
                          onOpenProfile={
                            meta.isCurrent &&
                            resolvePairUpProfileOpenKey(candidate)
                              ? () => openMineProfileForCandidate(candidate)
                              : undefined
                          }
                          onMineAtmosphereChange={
                            handleMineAtmosphereChange
                          }
                        />
                      );
                    }}
                  />
                </>
              )
            }
          </PeopleDuoModeTransition>
        </div>
      </div>

      <MineCandidateProfileOverlay
        open={mineProfileOpen}
        connectBusy={connectResolving}
        connectDisabled={
          connectInteractionLocked ||
          phase === "completeFailed" ||
          (isMineCandidateProfileOpenContext(mineProfileOpen) &&
            scopeState[mineProfileOpen.scope].removedIds.includes(
              mineProfileOpen.opportunityId
            ))
        }
        onConnect={() => {
          void handleMineProfileConnect();
        }}
        onClose={closeMineProfileOverlay}
      />

      <PeopleBottomDock
        activeDestination={flatActiveDestination}
        discoverEnabled={discoverEnabled}
        groupsYoursActive={
          mode === "groups" && groupUpScope.browseTab === "yours"
        }
        groupsPillState={
          mode !== "groups"
            ? "inactive"
            : groupUpScope.browseTab === "yours"
              ? "yours"
              : "new"
        }
        onBack={onClose}
        onSelectDuo={selectDuoMode}
        onSelectDiscover={handleSelectDiscover}
        onSelectPlans={handleSelectOpenPlans}
        onSelectGroups={selectGroupsMode}
        primaryAction={primaryAction}
        mineCompactConnect={mineCompactConnect}
      />

      <ConfirmDialog
        open={discoverDialog === "intro"}
        onClose={() => setDiscoverDialog(null)}
        title={peopleUiCopy.discoverIntroTitle}
        message={peopleUiCopy.discoverIntroBody}
        cancelLabel={peopleUiCopy.discoverIntroNotNow}
        confirmLabel={peopleUiCopy.discoverIntroContinue}
        confirmVariant="primary"
        onConfirm={handleIntroContinue}
      />
    </div>
  );
}
