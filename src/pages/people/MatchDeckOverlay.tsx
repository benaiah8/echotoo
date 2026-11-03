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
  withdrawDiscoverPairUpInterest,
  withdrawDuoPairUpInterest,
} from "../../api/services/pairUp";
import {
  getProfileByUserId,
  getViewerAuthUserId,
} from "../../api/services/follows";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { PiHeartFill } from "react-icons/pi";
import "./DuoMatchToast.css";
import "./DuoHeartActionFeedback.css";
import type { UseGroupUpCandidatesResult } from "../../hooks/useGroupUpCandidates";
import type { UseOpenPlanCandidatesResult } from "../../hooks/useOpenPlanCandidates";
import {
  releaseDiscoverCommentRetention,
  retainDiscoverCommentCandidate,
  type UsePairUpCandidatesResult,
} from "../../hooks/usePairUpCandidates";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import { interleavePairUpCandidates } from "../../lib/interleavePairUpCandidates";
import type { GroupUpCandidate, PairUpCandidate } from "../../lib/people/types";
import {
  consumeMatchDeckSession,
  emptyGroupUpDeckScopeSnapshot,
  emptyMatchDeckScopeSnapshot,
  invalidateMatchDeckSessionScopeAfterHardRefresh,
  suspendMatchDeckSession,
  type GroupUpDeckScopeSnapshot,
  type MatchDeckPairUpScope,
  type MatchDeckScopeSnapshot,
  type MatchDeckSessionMode,
} from "../../lib/matchDeckSession";
import {
  PEOPLE_DECK_PREFETCH_REMAINING,
  filterOrderedIdsToEligible,
  indexOfOpportunity,
  isTrueCaughtUpState,
  pruneActiveOrderedIds,
  resolveNearestOpportunityId,
  shouldLoadMoreForEmptyWindow,
} from "../../lib/people/matchDeckNavigation";
import {
  firstUnseenOpportunityId,
  getPairUpSeenOpportunityIdSet,
  rebuildPairUpActiveOrderedIds,
  type PairUpSeenScope,
} from "../../lib/people/peoplePairUpSeenHistory";
import {
  awaitPeopleDeckSeenBootstrap,
  bumpPeopleDeckSeenHydrateGeneration,
  flushAllPeopleDeckSeenOutboxes,
  flushPeopleDeckSeenOutbox,
  forceHydratePeopleDeckSeen,
  hydratePeopleDeckSeen,
  isPeopleDeckSeenBootstrapReady,
  markLocalPeopleDeckSeenAndEnqueue,
} from "../../lib/people/peopleDeckSeenSync";
import {
  bumpPeopleHardRefreshGeneration,
  isPeopleHardRefreshScope,
  runPeopleDeckHardRefresh,
  type PeopleHardRefreshScope,
} from "../../lib/people/peopleDeckHardRefresh";
import { PEOPLE_TAB_REFRESH_EVENT } from "../../lib/homeRefreshEvents";
import { useHomePullToRefresh } from "../../hooks/useHomePullToRefresh";
import { acquirePullToRefreshBlock } from "../../lib/pullToRefreshBlock";
import { supabase } from "../../lib/supabaseClient";
import {
  hasP2pDiscoverIntroSeen,
  setP2pDiscoverIntroSeen,
} from "../../lib/p2pDiscoverIntroSeen";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import {
  getPairUpJoinStatus,
  seedKnownActivePairUpBeforeDetail,
} from "../../lib/pairUpJoinStore";
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
  resolveMineFrontDisplayUrl,
  resolveMineFrontPhotoPath,
} from "../../lib/people/mineFrontPhotoPath";
import {
  resolveMineAtmosphereWarmSettlement,
  shouldRunMineAtmosphereWarmWatch,
} from "../../lib/people/mineAtmosphereWarmReadiness";
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
import {
  messagesConversationPath,
  Paths,
} from "../../router/Paths";
import PeopleDeckEmptyCard from "../../components/people/PeopleDeckEmptyCard";
import PeopleDuoCardSkeleton from "../../components/skeletons/PeopleDuoCardSkeleton";
import { useTabVisibility } from "../../router/PersistentTabContainer.new";
import PeopleDuoModeTransition from "./PeopleDuoModeTransition";
import {
  isPairUpPrimaryScope,
  type PeoplePrimaryScope,
} from "../../lib/people/peopleDuoModeTransition";
import OpenPlanDeckBody from "./OpenPlanDeckBody";
import GroupUpDeckBody from "./GroupUpDeckBody";
import PeopleFeedTopNav from "./PeopleFeedTopNav";
import PeopleFeedList from "../../components/people/PeopleFeedList";
import PeopleDiscoverPersonRow from "../../components/people/PeopleDiscoverPersonRow";
import PeopleDiscoverOpportunityBox from "../../components/people/PeopleDiscoverOpportunityBox";
import PeopleDiscoverFeedSkeleton from "../../components/people/PeopleDiscoverFeedSkeleton";
import PeopleGroupsBrowseToggle, {
  PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX,
} from "../../components/people/PeopleGroupsBrowseToggle";
import MatchDeckCarousel from "./MatchDeckCarousel";
import PeopleDuoBottomActionRow from "../../components/people/PeopleDuoBottomActionRow";
import MineEdgeNavCards from "../../components/people/MineEdgeNavCards";
import PeopleDuoCandidateSlide from "./PeopleDuoCandidateSlide";
import MineCandidateProfileOverlay from "../../components/people/MineCandidateProfileOverlay";
import {
  groupDiscoverOpportunities,
  type DiscoverPersonAppearance,
} from "../../lib/people/groupDiscoverOpportunities";
import {
  clampDiscoverPhotoIndex,
} from "../../lib/people/discoverProfilePhotoSelection";
import {
  adaptDuoPresentationIdentity,
  peopleDuoModernDisplayPhotoCount,
} from "../../lib/people/duoPresentationIdentity";
import {
  buildDiscoverIdentityByPersonKey,
} from "../../lib/people/mergeDiscoverPersonIdentity";
import { discoverNeutralEchoSeedForPerson } from "../../lib/people/peopleFeedLayout";
import { normalizeProfilePhotos } from "../../lib/profilePhotos";
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
import { runDiscoverHeartAction } from "../../lib/people/discoverHeartActions";
import {
  getDiscoverHeartRevision,
  readDiscoverHeartPhase,
  subscribeDiscoverHeart,
} from "../../lib/people/discoverHeartState";
import {
  peopleDuoModernScrollTopInset,
  peopleFeedContentBottomPad,
  peopleFeedContentTopPad,
  peopleFeedCssVars,
} from "../../lib/people/peopleFeedLayout";
import {
  PEOPLE_DUO_MODERN_ACTION_ROW_H_PX,
  peopleDuoModernTabBandPad,
  type PeopleFlatDestination,
} from "./peopleShellLayout";
import type { PeopleShellPrimaryAction } from "./peopleShellPrimaryAction";
import { resolvePairUpShellActionState } from "./peopleShellPrimaryAction";
import { openPeopleCommentComposer } from "../../lib/people/peopleCommentComposerStore";
import {
  resolveActivatedDuoComment,
  routeDuoCommentTap,
} from "../../lib/people/duoCommentActions";
import {
  duoHeartPressKind,
  runDuoHeartWithdrawal,
} from "../../lib/people/duoHeartActions";
import {
  DUO_HEART_FEEDBACK_MS,
  duoHeartErrorFeedbackVisible,
  duoHeartFeedbackShouldClear,
  duoHeartFeedbackText,
  type DuoHeartFeedback,
} from "../../lib/people/duoHeartActionFeedback";
import {
  duoHeartPressStartsConnect,
  pairUpIngestExcludesExpressedInterest,
} from "../../lib/people/duoHeartVisibility";
import {
  applyDuoCommentListFlags,
  duoCommentStateKey,
  duoCommentVisual,
  getDuoCommentRevision,
  getDuoCommentSnapshot,
  getDuoCommentViewerId,
  subscribeDuoCommentState,
} from "../../lib/people/duoCommentState";
import { useTabActive } from "../../router/PersistentTabContainer.new";
import type { MineEdgeNavCardsHandle } from "../../components/people/MineEdgeNavCards";
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
import { showDuoAlreadyMatchedToast } from "../../lib/showDuoAlreadyMatchedToast";
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

type DeckMode = MatchDeckSessionMode;
type ActionPhase = "idle" | "expressing" | "completing" | "completeFailed";
type DiscoverDialog = null | "intro";

export type DuoMatchConfirm = {
  conversationId: string;
  otherUserId: string;
  displayName: string | null;
  viewerId: string;
};

export type DuoMatchCompleteDecision =
  | Omit<DuoMatchConfirm, "displayName" | "viewerId">
  | "navigate"
  | "error";

export const DUO_MATCH_TOAST_MS = 5000;
export const DUO_MATCH_HEART_PULSE_MS = 480;

/** Duo shows a toast. Discover and Profile still navigate immediately. */
export function duoMatchConfirmAfterComplete(input: {
  scope: string;
  failed: boolean;
  completion: { conversation_id: string; other_user_id: string } | null;
}): DuoMatchCompleteDecision {
  if (input.failed || !input.completion) return "error";
  const conversationId = input.completion.conversation_id.trim();
  const otherUserId = input.completion.other_user_id.trim();
  if (!conversationId || !otherUserId) return "error";
  if (input.scope !== "my_plans") return "navigate";
  return { conversationId, otherUserId };
}

export function duoMatchHeartPulseMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DUO_MATCH_HEART_PULSE_MS;
}

export function duoMatchToastBody(displayName: string | null | undefined): string {
  const name = displayName?.replace(/\s+/g, " ").trim() ?? "";
  if (!name || name.length > 60) return "You matched with this person!";
  return `You matched with ${name}!`;
}

export function duoMatchToastNavigationAllowed(input: {
  toast: DuoMatchConfirm | null;
  viewerId: string | null;
  alreadyNavigated: boolean;
}): boolean {
  if (!input.toast || input.alreadyNavigated) return false;
  if (!input.viewerId || input.toast.viewerId !== input.viewerId) return false;
  return Boolean(input.toast.conversationId);
}

/** Duo success paints the toast and red Heart before the matched card leaves. */
export const DUO_MATCH_REVEAL_STEPS = [
  "toast",
  "pulse",
  "hold",
  "remove",
  "clear-pulse",
  "idle",
] as const;

export type DuoMatchRevealStep = (typeof DUO_MATCH_REVEAL_STEPS)[number];

export function duoMatchRevealKeepsCandidate(step: DuoMatchRevealStep): boolean {
  return step === "toast" || step === "pulse" || step === "hold";
}

/**
 * The hold may remove only the opportunity that started it.
 * Viewer change and a newer match cancel removal. Message now still removes
 * that same opportunity after navigation has begun.
 */
export function duoMatchHoldShouldRemove(input: {
  holdGeneration: number;
  liveGeneration: number;
  holdViewerId: string;
  liveViewerId: string | null;
  navigated: boolean;
}): boolean {
  if (input.liveViewerId !== input.holdViewerId) return false;
  if (input.liveGeneration !== input.holdGeneration && !input.navigated) return false;
  return true;
}

/**
 * A stale pin may restore a card only while completion is unfinished.
 * Idle and expressing decks use the server list alone.
 */
export function matchDeckShouldRestorePinnedCandidate(input: {
  phase: "idle" | "expressing" | "completing" | "completeFailed";
  pinnedOpportunityId: string | null;
  deckHasOpportunity: boolean;
}): boolean {
  if (!input.pinnedOpportunityId || input.deckHasOpportunity) return false;
  return input.phase === "completing" || input.phase === "completeFailed";
}

/** An older completion may release only the pin it still owns. */
export function matchPinReleaseAllowed(input: {
  holdSequence: number;
  liveSequence: number;
  holdOpportunityId: string;
  pinnedOpportunityId: string | null;
}): boolean {
  if (input.liveSequence !== input.holdSequence) return false;
  return input.pinnedOpportunityId === input.holdOpportunityId;
}

/**
 * A failed completion belongs to the viewer who started it.
 * The first authenticated id and a repeat of the same id leave that state alone.
 */
export function duoMatchFailedCompletionShouldClear(input: {
  previousViewerId: string | null;
  nextViewerId: string | null;
  phase: "idle" | "expressing" | "completing" | "completeFailed";
}): boolean {
  if (!input.previousViewerId) return false;
  if (input.previousViewerId === input.nextViewerId) return false;
  return input.phase === "completeFailed";
}

/** Pulse forces the matched Heart red. The next card keeps its own interest. */
export function duoDeckHeartAfterMatchReveal(input: {
  visibleOpportunityId: string | null;
  matchedOpportunityId: string;
  pulseOpportunityId: string | null;
  expressedByMe: boolean;
  completionLocked: boolean;
}): "active" | "idle" | "disabled" {
  if (!input.visibleOpportunityId) return "disabled";
  if (
    input.pulseOpportunityId === input.visibleOpportunityId &&
    input.pulseOpportunityId === input.matchedOpportunityId
  ) {
    return "active";
  }
  if (input.completionLocked) return "disabled";
  return input.expressedByMe ? "active" : "idle";
}

type DeckProps = Pick<
  UsePairUpCandidatesResult,
  | "candidates"
  | "hasMore"
  | "loading"
  | "error"
  | "hasLoaded"
  | "refresh"
  | "hardRefresh"
  | "loadMore"
  | "express"
  | "noteDiscoverHeartExpressed"
  | "noteDuoHeartWithdrawn"
>;

const EMPTY_PAIR_UP_DECK: DeckProps = {
  candidates: [],
  hasMore: false,
  loading: false,
  error: null,
  hasLoaded: false,
  refresh: async () => {},
  hardRefresh: async () => {},
  loadMore: async () => {},
  express: async () => {
    throw new Error("Deck not ready");
  },
  noteDiscoverHeartExpressed: () => {},
  noteDuoHeartWithdrawn: () => {},
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
    restored?.activeScope ?? "discover"
  );
  /** Visual Duo pane scope (lags during vertical mode transition). */
  const [contentScope, setContentScope] = useState<MatchDeckPairUpScope>(
    restored?.activeScope ?? "discover"
  );
  /** Per-row heart in-flight (feed). */
  const [heartBusyId, setHeartBusyId] = useState<string | null>(null);
  const [duoActionFeedback, setDuoActionFeedback] = useState<DuoHeartFeedback | null>(
    null
  );
  const duoActionFeedbackRef = useRef<DuoHeartFeedback | null>(null);
  const duoActionFeedbackGenRef = useRef(0);
  const duoActionFeedbackTimerRef = useRef<number | null>(null);
  duoActionFeedbackRef.current = duoActionFeedback;
  const isPeopleTabVisible = useTabActive("people");
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
  /** Duo-only shell wash — two-layer opacity crossfade. */
  const [mineAtmosphere, setMineAtmosphere] =
    useState<MineAtmosphereCrossfadeState>(createMineAtmosphereCrossfadeState);
  const mineAtmosphereIdentityRef = useRef<string | null>(null);
  const mineAtmosphereWarmWatchGenRef = useRef(0);
  const mineAtmosphereWarmPrevIdentityRef = useRef<string | null>(null);
  const [pinned, setPinned] = useState<PairUpCandidate | null>(null);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const completeSeqRef = useRef(0);
  const [discoverEnabled, setDiscoverEnabled] = useState(true);
  const [discoverDialog, setDiscoverDialog] = useState<DiscoverDialog>(null);
  const [duoMatchConfirm, setDuoMatchConfirm] = useState<DuoMatchConfirm | null>(
    null
  );
  const [duoMatchPulseId, setDuoMatchPulseId] = useState<string | null>(null);
  const duoMatchConfirmRef = useRef<DuoMatchConfirm | null>(null);
  const duoMatchNavRef = useRef(false);
  const duoMatchTimerRef = useRef<number | null>(null);
  const duoMatchGenRef = useRef(0);
  const duoMatchToastGenRef = useRef(0);
  const previousAuthUserIdRef = useRef<string | null>(null);
  const [discoverEnableBusy, setDiscoverEnableBusy] = useState(false);
  /** One-shot Discover list scroll restore (enter category / remount) — not focus churn. */
  const [discoverScrollRestoreToken, setDiscoverScrollRestoreToken] =
    useState(0);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  /** Bumps when People seen history writes so visuals/order refresh. */
  const [pairUpSeenEpoch, setPairUpSeenEpoch] = useState(0);
  /** Bumps when fresh-device seen bootstrap settles for a scope. */
  const [seenBootstrapEpoch, setSeenBootstrapEpoch] = useState(0);
  const { activeTab: peopleShellActiveTab, covered: peopleTabsCovered } =
    useTabVisibility();
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
  const discoverHeartRevision = useSyncExternalStore(
    subscribeDiscoverHeart,
    getDiscoverHeartRevision
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
    noteDiscoverHeartExpressed,
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
  const isPairUpSeenScope =
    contentScope === "my_plans" || contentScope === "discover";
  const pairUpSeenScope: PairUpSeenScope | null = isPairUpSeenScope
    ? contentScope
    : null;
  const pairUpSeenIds = useMemo(() => {
    void pairUpSeenEpoch;
    if (!authUserId || !pairUpSeenScope) return new Set<string>();
    return getPairUpSeenOpportunityIdSet(authUserId, pairUpSeenScope);
  }, [authUserId, pairUpSeenScope, pairUpSeenEpoch]);
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
  const contentScopeRef = useRef(contentScope);
  contentScopeRef.current = contentScope;

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
    const { data: authSub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        const next = session?.user?.id?.trim() || null;
        setAuthUserId((prev) => {
          if (prev !== next) {
            // Invalidate in-flight hydrate/flush/hard-refresh for the previous account.
            bumpPeopleDeckSeenHydrateGeneration();
            bumpPeopleHardRefreshGeneration();
          }
          return next;
        });
      }
    );
    return () => {
      cancelled = true;
      window.removeEventListener("profile:updated", onUpdated);
      void authSub.subscription.unsubscribe();
    };
  }, []);

  // Cold open defaults to Discover (does not toggle discoverability).
  // Session restore remounts prior lazy scopes when needed.
  useEffect(() => {
    const scope = restored?.activeScope ?? "discover";
    if (scope === "discover" || !restored) {
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

  /**
   * Mark the settled owned current for a browsing identity.
   * Used on scope leave / People tab leave / Detail suspend — not Create cover.
   */
  const markSettledCurrentSeenForIdentity = useCallback(
    (identity: string) => {
      if (!authUserId) return false;
      if (
        identity === "my_plans" ||
        identity === "discover" ||
        identity === "open_plans"
      ) {
        const id =
          scopeStateRef.current[identity as MatchDeckPairUpScope]
            .currentOpportunityId;
        if (!id) return false;
        return markLocalPeopleDeckSeenAndEnqueue(authUserId, identity, id);
      }
      if (identity === "groups_new") {
        const id =
          groupUpScopeRef.current.currentOpportunityIdByTab.new ?? null;
        if (!id) return false;
        return markLocalPeopleDeckSeenAndEnqueue(authUserId, "groups_new", id);
      }
      return false;
    },
    [authUserId]
  );

  const markSettledCurrentSeen = useCallback(() => {
    const identity =
      modeRef.current === "groups"
        ? groupUpScopeRef.current.browseTab === "new"
          ? "groups_new"
          : "groups_yours"
        : activeScopeRef.current;
    if (markSettledCurrentSeenForIdentity(identity)) {
      setPairUpSeenEpoch((n) => n + 1);
    }
  }, [markSettledCurrentSeenForIdentity]);

  const bumpPairUpSeenEpoch = useCallback(() => {
    setPairUpSeenEpoch((n) => n + 1);
  }, []);

  /** People primary browsing identity — Groups Yours is never a seen scope. */
  const peopleBrowsingIdentity =
    mode === "groups"
      ? groupUpScope.browseTab === "new"
        ? "groups_new"
        : "groups_yours"
      : activeScope;

  /** Active People seen scope for hydrate (null for Groups Yours). */
  const hydrateSeenScope: PairUpSeenScope | null =
    peopleBrowsingIdentity === "my_plans" ||
    peopleBrowsingIdentity === "discover" ||
    peopleBrowsingIdentity === "open_plans" ||
    peopleBrowsingIdentity === "groups_new"
      ? peopleBrowsingIdentity
      : null;

  const [peopleRefreshEpoch, setPeopleRefreshEpoch] = useState(0);
  const [ptrSurfaceEl, setPtrSurfaceEl] = useState<HTMLDivElement | null>(
    null
  );
  const hardRefreshScopeRef = useRef<PeopleHardRefreshScope | null>(null);
  hardRefreshScopeRef.current = hydrateSeenScope;
  const authUserIdRef = useRef(authUserId);
  authUserIdRef.current = authUserId;
  const peopleTabsCoveredRef = useRef(peopleTabsCovered);
  peopleTabsCoveredRef.current = peopleTabsCovered;
  /** True when People is the interactive surface (not Create-covered). */
  const peopleHardRefreshActive =
    peopleShellActiveTab === "people" && !peopleTabsCovered;
  const peopleHardRefreshActiveRef = useRef(peopleHardRefreshActive);
  peopleHardRefreshActiveRef.current = peopleHardRefreshActive;
  const mineProfileOpenRef = useRef(mineProfileOpen);
  mineProfileOpenRef.current = mineProfileOpen;

  const applyHardRefreshDeckReset = useCallback(
    (scope: PeopleHardRefreshScope) => {
      if (scope === "groups_new") {
        setGroupUpScope((prev) => ({
          ...prev,
          currentOpportunityIdByTab: {
            ...prev.currentOpportunityIdByTab,
            new: null,
          },
          activeOrderedIdsByTab: {
            ...prev.activeOrderedIdsByTab,
            new: [],
          },
          retiredIdsByTab: {
            ...prev.retiredIdsByTab,
            new: [],
          },
        }));
        invalidateMatchDeckSessionScopeAfterHardRefresh({
          kind: "groups_new",
        });
      } else {
        setScopeState((prev) => ({
          ...prev,
          [scope]: emptyMatchDeckScopeSnapshot(),
        }));
        orderedIdsRef.current[scope] = [];
        invalidateMatchDeckSessionScopeAfterHardRefresh({
          kind: "pairUp",
          scope,
        });
      }
      setPairUpSeenEpoch((n) => n + 1);
      setSeenBootstrapEpoch((n) => n + 1);
    },
    []
  );

  const hardRefreshPeopleDeckScope = useCallback(
    async (scope: PeopleHardRefreshScope): Promise<void> => {
      const uid = authUserIdRef.current;
      if (!uid) return;
      if (!peopleHardRefreshActiveRef.current) return;
      if (peopleTabsCoveredRef.current) return;

      const candidateRefresh = async () => {
        if (scope === "my_plans") {
          await myPlans.hardRefresh();
          return;
        }
        if (scope === "discover") {
          onRequestDiscoverMount();
          const deck = discover;
          if (!deck) throw new Error("Discover not ready");
          await deck.hardRefresh();
          return;
        }
        if (scope === "open_plans") {
          onRequestOpenPlansMount();
          const deck = openPlans;
          if (!deck) throw new Error("Open Plans not ready");
          await deck.hardRefresh();
          return;
        }
        onRequestGroupUpsMount();
        const deck = groupUps;
        if (!deck) throw new Error("Groups not ready");
        await deck.hardRefresh();
      };

      const result = await runPeopleDeckHardRefresh({
        userId: uid,
        scope,
        flushOutbox: () =>
          flushPeopleDeckSeenOutbox({ userId: uid, scope }),
        forceHydrateSeen: () => forceHydratePeopleDeckSeen(uid, scope),
        hardRefreshCandidates: candidateRefresh,
        applyDeckReset: () => applyHardRefreshDeckReset(scope),
        isStillActive: () =>
          peopleHardRefreshActiveRef.current &&
          !peopleTabsCoveredRef.current &&
          authUserIdRef.current === uid &&
          hardRefreshScopeRef.current === scope,
      });

      setPeopleRefreshEpoch((n) => n + 1);
      if (result === "candidate_failed") {
        // Keep old deck; seen may have merged. Soft toast only on hard fail.
        toast.error(peopleUiCopy.deckLoadError);
      }
    },
    [
      applyHardRefreshDeckReset,
      discover,
      groupUps,
      myPlans,
      onRequestDiscoverMount,
      onRequestGroupUpsMount,
      onRequestOpenPlansMount,
      openPlans,
    ]
  );

  const hardRefreshPeopleDeckScopeRef = useRef(hardRefreshPeopleDeckScope);
  hardRefreshPeopleDeckScopeRef.current = hardRefreshPeopleDeckScope;

  /** People tab re-tap → same hard refresh as pull (active supported scope only). */
  useEffect(() => {
    const onTabRefresh = () => {
      if (!peopleHardRefreshActiveRef.current) return;
      const scope = hardRefreshScopeRef.current;
      if (!scope || !isPeopleHardRefreshScope(scope)) return;
      void hardRefreshPeopleDeckScopeRef.current(scope);
    };
    window.addEventListener(PEOPLE_TAB_REFRESH_EVENT, onTabRefresh);
    return () => {
      window.removeEventListener(PEOPLE_TAB_REFRESH_EVENT, onTabRefresh);
    };
  }, []);

  const ptrEnabled =
    peopleHardRefreshActive &&
    Boolean(hydrateSeenScope) &&
    !mineProfileOpen &&
    !photoPromptOpen &&
    !(mode === "p2p" && activeScope !== contentScope);

  const {
    pullPx: peoplePullPx,
    pullProgress: peoplePullProgress,
    isRefreshing: peoplePtrRefreshing,
  } = useHomePullToRefresh({
    enabled: ptrEnabled,
    onCommit: () => {
      const scope = hardRefreshScopeRef.current;
      if (!scope) return;
      return hardRefreshPeopleDeckScopeRef.current(scope);
    },
    refreshEpoch: peopleRefreshEpoch,
    /**
     * Discover / Plans / Groups scroll inside `[data-people-feed-list]`.
     * Read live each gesture — never stub 0 (that stole mid-feed scrolls on Android).
     * Duo has no feed list → 0 so PTR still works on the carousel surface.
     */
    getScrollTop: () => {
      const surface = ptrSurfaceEl;
      if (!surface) return 0;
      const list = surface.querySelector("[data-people-feed-list]");
      return list instanceof HTMLElement ? list.scrollTop : 0;
    },
    touchTarget: ptrSurfaceEl,
  });

  useEffect(() => {
    if (!mineProfileOpen && !photoPromptOpen) return;
    return acquirePullToRefreshBlock();
  }, [mineProfileOpen, photoPromptOpen]);

  useEffect(() => {
    if (peopleHardRefreshActive) return;
    bumpPeopleHardRefreshGeneration();
  }, [peopleHardRefreshActive]);

  /** Scope open: bootstrap gate (fresh device) + hydrate (cooldown). */
  useEffect(() => {
    if (!authUserId || !hydrateSeenScope) return;
    let cancelled = false;
    void (async () => {
      const result = await awaitPeopleDeckSeenBootstrap({
        userId: authUserId,
        scope: hydrateSeenScope,
      });
      if (cancelled) return;
      setSeenBootstrapEpoch((n) => n + 1);
      if (result === "ready" || result === "local") {
        setPairUpSeenEpoch((n) => n + 1);
      }
      if (result === "local") {
        const late = await hydratePeopleDeckSeen({
          userId: authUserId,
          scope: hydrateSeenScope,
          force: false,
        });
        if (cancelled) return;
        if (late === "merged") setPairUpSeenEpoch((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, hydrateSeenScope]);

  /** Background / resume: best-effort flush; hydrate obeys cooldown. */
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    const onHidden = () => {
      if (document.hidden) {
        void flushAllPeopleDeckSeenOutboxes(authUserId);
      }
    };
    document.addEventListener("visibilitychange", onHidden);

    let removeAppListener: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (cancelled) return;
            if (!isActive) {
              void flushAllPeopleDeckSeenOutboxes(authUserId);
              return;
            }
            void flushAllPeopleDeckSeenOutboxes(authUserId);
            if (hydrateSeenScope) {
              void hydratePeopleDeckSeen({
                userId: authUserId,
                scope: hydrateSeenScope,
                force: false,
              }).then((r) => {
                if (!cancelled && r === "merged") {
                  setPairUpSeenEpoch((n) => n + 1);
                }
              });
            }
          }
        );
        removeAppListener = () => {
          void handle.remove();
        };
      } catch {
        /* web / no capacitor */
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onHidden);
      removeAppListener?.();
    };
  }, [authUserId, hydrateSeenScope]);

  const prevPeopleBrowsingIdentityRef = useRef(peopleBrowsingIdentity);
  useEffect(() => {
    const prev = prevPeopleBrowsingIdentityRef.current;
    if (prev === peopleBrowsingIdentity) return;
    prevPeopleBrowsingIdentityRef.current = peopleBrowsingIdentity;
    if (markSettledCurrentSeenForIdentity(prev)) {
      setPairUpSeenEpoch((n) => n + 1);
    }
    // Flush outbox for the scope we left (not Groups Yours).
    if (
      authUserId &&
      (prev === "my_plans" ||
        prev === "discover" ||
        prev === "open_plans" ||
        prev === "groups_new")
    ) {
      void flushPeopleDeckSeenOutbox({
        userId: authUserId,
        scope: prev,
      });
    }
  }, [authUserId, markSettledCurrentSeenForIdentity, peopleBrowsingIdentity]);

  /**
   * Leave People tab → mark settled current + flush all outboxes.
   * Create cover keeps activeTab === "people" (`peopleTabsCovered`) — must NOT mark/flush-as-leave.
   */
  const prevPeopleTabActiveRef = useRef(peopleShellActiveTab === "people");
  useEffect(() => {
    const peopleTabActive = peopleShellActiveTab === "people";
    const prev = prevPeopleTabActiveRef.current;
    prevPeopleTabActiveRef.current = peopleTabActive;
    // Create cover: activeTab stays "people" while covered — no leave mark.
    if (peopleTabsCovered && peopleTabActive) return;
    if (prev && !peopleTabActive) {
      markSettledCurrentSeen();
      void flushAllPeopleDeckSeenOutboxes(authUserId);
    }
  }, [
    authUserId,
    markSettledCurrentSeen,
    peopleShellActiveTab,
    peopleTabsCovered,
  ]);

  const suspendDeckSession = useCallback(() => {
    markSettledCurrentSeen();
    void flushAllPeopleDeckSeenOutboxes(authUserId);
    suspendMatchDeckSession({
      mode,
      activeScope,
      scopes: scopeState,
      groupUp: groupUpScope,
    });
  }, [
    activeScope,
    authUserId,
    groupUpScope,
    markSettledCurrentSeen,
    mode,
    scopeState,
  ]);

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
      if (
        pairUpIngestExcludesExpressedInterest(
          contentScope,
          row.expressed_by_me
        )
      ) {
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
  const isDuoAtmosphereScope =
    mode === "p2p" && contentScope === "my_plans";
  const isDuoDeckScope = isDuoAtmosphereScope;
  /** Mine + Discover: PairUp data / Connect / profile owners. */
  const isCanonicalPairUpScope =
    mode === "p2p" &&
    (contentScope === "my_plans" || contentScope === "discover");
  /**
   * Mine + Discover + Plans + Groups: shared canonical feed shell.
   */
  const isCanonicalPeopleScope =
    mode === "groups" ||
    (mode === "p2p" &&
      (contentScope === "my_plans" ||
        contentScope === "discover" ||
        contentScope === "open_plans"));
  void isCanonicalPeopleScope;

  const mineAtmosphereIdentityKey = useMemo(() => {
    if (!isDuoAtmosphereScope) return null;
    const row = current;
    if (!row) return null;
    return `${row.opportunity_id}:${pairUpPersonKey(row)}`;
  }, [current, isDuoAtmosphereScope]);

  useLayoutEffect(() => {
    mineAtmosphereIdentityRef.current = mineAtmosphereIdentityKey;
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

    // Fresh-device gate: do not establish first current before seen hydrate settles.
    void seenBootstrapEpoch;
    if (
      (contentScope === "my_plans" || contentScope === "discover") &&
      !useDevMocks &&
      authUserId &&
      snap.activeOrderedIds.length === 0 &&
      !isPeopleDeckSeenBootstrapReady(authUserId, contentScope)
    ) {
      return;
    }

    let nextActive: string[];
    if (
      (contentScope === "my_plans" || contentScope === "discover") &&
      !useDevMocks
    ) {
      const eligibleOrdered = sourceRows
        .map((row) => row.opportunity_id)
        .filter(Boolean);
      nextActive = rebuildPairUpActiveOrderedIds({
        eligibleOrdered,
        previousActive: snap.activeOrderedIds,
        currentId: snap.currentOpportunityId,
        seenIds: pairUpSeenIds,
        retiredIds: snap.retiredIds,
      });
    } else {
      nextActive = filterOrderedIdsToEligible(
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
    }

    let nextCurrent = snap.currentOpportunityId;
    if (nextCurrent && !eligibleIds.has(nextCurrent)) {
      nextCurrent = resolveNearestOpportunityId(
        preOrder,
        eligibleIds,
        nextCurrent
      );
    } else if (nextCurrent == null && nextActive.length > 0) {
      if (
        (contentScope === "my_plans" || contentScope === "discover") &&
        !useDevMocks &&
        snap.activeOrderedIds.length === 0
      ) {
        nextCurrent = firstUnseenOpportunityId(nextActive, pairUpSeenIds);
      } else {
        nextCurrent = nextActive[0] ?? null;
      }
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
  }, [
    authUserId,
    contentScope,
    pairUpSeenIds,
    patchScope,
    seenBootstrapEpoch,
    sourceRows,
    useDevMocks,
  ]);

  useEffect(() => {
    /* Discover vertical feed: never prune above the viewport — shrinks DOM and jumps scroll. */
    if (contentScope === "discover") return;
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
    const allLoadedSeen =
      isPairUpSeenScope &&
      !useDevMocks &&
      deckRows.length > 0 &&
      deckRows.every((row) => pairUpSeenIds.has(row.opportunity_id));
    if (
      useDevMocks ||
      loadMoreInFlight ||
      !hasMore ||
      (!emptyNeedsPage &&
        remaining > PEOPLE_DECK_PREFETCH_REMAINING &&
        !allLoadedSeen)
    ) {
      return;
    }
    peopleDebugRecord("deck:prefetchTrigger", {
      remaining,
      index,
      deckRowsLen: deckRows.length,
      scope: activeScope,
      emptyNeedsPage,
      allLoadedSeen,
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
    deckRows,
    hasMore,
    index,
    isPairUpSeenScope,
    loadMore,
    loadMoreInFlight,
    pairUpSeenIds,
    useDevMocks,
  ]);

  useEffect(() => {
    for (const row of candidates) {
      primeCandidateProfilePreview(row);
    }
  }, [candidates]);

  const clearDuoMatchTimer = useCallback(() => {
    if (duoMatchTimerRef.current != null) {
      window.clearTimeout(duoMatchTimerRef.current);
      duoMatchTimerRef.current = null;
    }
  }, []);

  const clearDuoMatchHeartPulse = useCallback(() => {
    setDuoMatchPulseId(null);
    delete document.documentElement.dataset.duoMatchHeartPulse;
  }, []);

  const dismissDuoMatchToast = useCallback(() => {
    if (duoMatchNavRef.current) return;
    clearDuoMatchTimer();
    duoMatchGenRef.current += 1;
    duoMatchConfirmRef.current = null;
    setDuoMatchConfirm(null);
    clearDuoMatchHeartPulse();
    setPhase("idle");
  }, [clearDuoMatchHeartPulse, clearDuoMatchTimer]);

  const runComplete = useCallback(
    async (
      opportunityId: string,
      scope: "my_plans" | "discover",
      displayName?: string | null,
      onDuoConfirmed?: () => void
    ) => {
      if (duoMatchNavRef.current) return;
      const viewerId = authUserIdRef.current;
      const completeSeq = ++completeSeqRef.current;
      const releaseOwnedPin = () => {
        if (
          matchPinReleaseAllowed({
            holdSequence: completeSeq,
            liveSequence: completeSeqRef.current,
            holdOpportunityId: opportunityId,
            pinnedOpportunityId: pinnedRef.current?.opportunity_id ?? null,
          })
        ) {
          setPinned(null);
        }
      };
      setPhase("completing");
      try {
        const done = await completePairUpMatch(opportunityId);
        const decision = duoMatchConfirmAfterComplete({
          scope,
          failed: false,
          completion: done,
        });
        if (decision === "error") {
          setPhase("completeFailed");
          toast.error(peopleUiCopy.deckCompleteError);
          return;
        }
        if (decision === "navigate") {
          if (completeSeqRef.current === completeSeq) {
            releaseOwnedPin();
            setPhase("idle");
          }
          navigate(messagesConversationPath(done.conversation_id), {
            state: {
              backgroundLocation: openLocationRef.current,
              otherUserId: done.other_user_id,
            },
          });
          return;
        }
        if (!viewerId || authUserIdRef.current !== viewerId) {
          if (completeSeqRef.current === completeSeq) {
            releaseOwnedPin();
            setPhase("idle");
          }
          return;
        }
        const generation = duoMatchGenRef.current + 1;
        duoMatchGenRef.current = generation;
        clearDuoMatchTimer();
        const confirm: DuoMatchConfirm = {
          ...decision,
          displayName: displayName?.trim() || null,
          viewerId,
        };
        duoMatchConfirmRef.current = confirm;
        duoMatchToastGenRef.current = generation;
        setDuoMatchConfirm(confirm);
        setDuoMatchPulseId(opportunityId);
        const reduced =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduced) {
          document.documentElement.dataset.duoMatchHeartPulse = "1";
        }
        duoMatchTimerRef.current = window.setTimeout(() => {
          if (duoMatchGenRef.current !== generation) return;
          if (duoMatchNavRef.current) return;
          duoMatchConfirmRef.current = null;
          setDuoMatchConfirm(null);
        }, DUO_MATCH_TOAST_MS);
        const pulseMs = duoMatchHeartPulseMs(reduced);
        await new Promise((resolve) => window.setTimeout(resolve, pulseMs));
        if (
          !duoMatchHoldShouldRemove({
            holdGeneration: generation,
            liveGeneration: duoMatchGenRef.current,
            holdViewerId: viewerId,
            liveViewerId: authUserIdRef.current,
            navigated: duoMatchNavRef.current,
          })
        ) {
          if (duoMatchToastGenRef.current === generation) {
            clearDuoMatchTimer();
            duoMatchConfirmRef.current = null;
            setDuoMatchConfirm(null);
            clearDuoMatchHeartPulse();
            if (
              authUserIdRef.current !== viewerId &&
              completeSeqRef.current === completeSeq
            ) {
              releaseOwnedPin();
              setPhase("idle");
            }
          }
          return;
        }
        onDuoConfirmed?.();
        clearDuoMatchHeartPulse();
        if (completeSeqRef.current === completeSeq) {
          releaseOwnedPin();
          setPhase("idle");
        }
      } catch {
        clearDuoMatchHeartPulse();
        setPhase("completeFailed");
        toast.error(peopleUiCopy.deckCompleteError);
      }
    },
    [clearDuoMatchHeartPulse, clearDuoMatchTimer, navigate]
  );

  const openDuoMatchConversation = useCallback(() => {
    const confirm = duoMatchConfirmRef.current;
    if (
      !duoMatchToastNavigationAllowed({
        toast: confirm,
        viewerId: authUserIdRef.current,
        alreadyNavigated: duoMatchNavRef.current,
      }) ||
      !confirm
    ) {
      return;
    }
    duoMatchNavRef.current = true;
    clearDuoMatchTimer();
    duoMatchGenRef.current += 1;
    duoMatchConfirmRef.current = null;
    setDuoMatchConfirm(null);
    clearDuoMatchHeartPulse();
    if (duoActionFeedbackTimerRef.current != null) {
      window.clearTimeout(duoActionFeedbackTimerRef.current);
      duoActionFeedbackTimerRef.current = null;
    }
    duoActionFeedbackGenRef.current += 1;
    duoActionFeedbackRef.current = null;
    setDuoActionFeedback(null);
    navigate(messagesConversationPath(confirm.conversationId), {
      state: {
        backgroundLocation: openLocationRef.current,
        otherUserId: confirm.otherUserId,
      },
    });
  }, [clearDuoMatchHeartPulse, clearDuoMatchTimer, navigate]);

  useEffect(() => {
    return () => {
      duoMatchGenRef.current += 1;
      if (duoMatchTimerRef.current != null) {
        window.clearTimeout(duoMatchTimerRef.current);
        duoMatchTimerRef.current = null;
      }
      delete document.documentElement.dataset.duoMatchHeartPulse;
      if (duoActionFeedbackTimerRef.current != null) {
        window.clearTimeout(duoActionFeedbackTimerRef.current);
        duoActionFeedbackTimerRef.current = null;
      }
      duoActionFeedbackGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const currentToast = duoMatchConfirmRef.current;
    if (currentToast && currentToast.viewerId !== authUserId) {
      dismissDuoMatchToast();
    }
  }, [authUserId, dismissDuoMatchToast]);

  useEffect(() => {
    const previousViewerId = previousAuthUserIdRef.current;
    previousAuthUserIdRef.current = authUserId;
    if (
      !duoMatchFailedCompletionShouldClear({
        previousViewerId,
        nextViewerId: authUserId,
        phase,
      })
    ) {
      return;
    }
    setPhase("idle");
    setPinned(null);
  }, [authUserId, phase]);

  const carouselItems = useMemo(() => {
    const deckHasOpportunity = pinned
      ? deckRows.some((row) => row.opportunity_id === pinned.opportunity_id)
      : false;
    if (
      !matchDeckShouldRestorePinnedCandidate({
        phase,
        pinnedOpportunityId: pinned?.opportunity_id ?? null,
        deckHasOpportunity,
      }) ||
      !pinned
    ) {
      return deckRows;
    }
    const next = [...deckRows];
    next.splice(Math.min(index, next.length), 0, pinned);
    return next;
  }, [deckRows, index, phase, pinned]);

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
      const previousId = scopeStateRef.current[contentScope].currentOpportunityId;
      if (
        (contentScope === "my_plans" || contentScope === "discover") &&
        authUserId &&
        previousId &&
        id &&
        previousId !== id
      ) {
        markLocalPeopleDeckSeenAndEnqueue(authUserId, contentScope, previousId);
        setPairUpSeenEpoch((n) => n + 1);
      }
      patchScope(contentScope, { currentOpportunityId: id });
      return true;
    },
    [
      authUserId,
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
   * Production real-incoming portrait choreography — Duo Embla only.
   * Discover is vertical; DEV proxy/probe fixtures stay my_plans-only below.
   */
  const mineRealIncomingEnabled =
    contentScope === "my_plans" &&
    mode === "p2p" &&
    isPeopleMineRealIncomingEnabled();
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

  const clearDuoActionFeedback = useCallback(() => {
    if (duoActionFeedbackTimerRef.current != null) {
      window.clearTimeout(duoActionFeedbackTimerRef.current);
      duoActionFeedbackTimerRef.current = null;
    }
    duoActionFeedbackGenRef.current += 1;
    duoActionFeedbackRef.current = null;
    setDuoActionFeedback(null);
  }, []);

  const showDuoActionFeedback = useCallback(
    (kind: DuoHeartFeedback["kind"], opportunityId: string, viewerId: string) => {
      if (!opportunityId || !viewerId) return;
      if (duoActionFeedbackTimerRef.current != null) {
        window.clearTimeout(duoActionFeedbackTimerRef.current);
        duoActionFeedbackTimerRef.current = null;
      }
      const generation = duoActionFeedbackGenRef.current + 1;
      duoActionFeedbackGenRef.current = generation;
      const next: DuoHeartFeedback = {
        kind,
        opportunityId,
        viewerId,
        generation,
      };
      duoActionFeedbackRef.current = next;
      setDuoActionFeedback(next);
      duoActionFeedbackTimerRef.current = window.setTimeout(() => {
        if (duoActionFeedbackGenRef.current !== generation) return;
        duoActionFeedbackRef.current = null;
        setDuoActionFeedback(null);
        duoActionFeedbackTimerRef.current = null;
      }, DUO_HEART_FEEDBACK_MS);
    },
    []
  );

  useEffect(() => {
    const feedback = duoActionFeedbackRef.current;
    if (
      !duoHeartFeedbackShouldClear({
        feedback,
        viewerId: authUserId,
        scope: contentScope,
        currentOpportunityId: current?.opportunity_id ?? null,
      })
    ) {
      return;
    }
    clearDuoActionFeedback();
  }, [authUserId, clearDuoActionFeedback, contentScope, current]);

  const removeCompletedPairUpCandidate = useCallback(
    (scope: "my_plans" | "discover", leavingId: string) => {
      if (scope === "discover") releaseDiscoverCommentRetention(leavingId);
      if (
        authUserId &&
        leavingId &&
        (scope === "my_plans" || scope === "discover")
      ) {
        markLocalPeopleDeckSeenAndEnqueue(authUserId, scope, leavingId);
        setPairUpSeenEpoch((n) => n + 1);
      }
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
    },
    [authUserId]
  );

  const runPairUpConnectForTarget = useCallback(
    async (
      target: PairUpCandidate,
      scope: "my_plans" | "discover",
      options?: { discoverHeart?: boolean }
    ) => {
      if (duoMatchNavRef.current) return;
      if (!options?.discoverHeart && (controlsLocked || phase === "completeFailed")) {
        return;
      }

      const discoverHeart = options?.discoverHeart === true;
      if (
        scope === "my_plans" &&
        !duoHeartPressStartsConnect(target.expressed_by_me)
      ) {
        return;
      }
      await runMinePairUpConnect({
        target,
        scope,
        heartAlreadyPending: discoverHeart,
        host: {
          shouldAbortBeforeStart: () =>
            discoverHeart
              ? photoPromptOpen ||
                readDiscoverHeartPhase(
                  target.opportunity_id,
                  target.expressed_by_me
                ) === "pending"
              : connectInFlightRef.current ||
                connectResolving ||
                photoPromptOpen,
          isDevMock: isDevMockCandidate,
          ensureAuthed,
          authUserId,
          express,
          applyUnmatchedRemoval: (leavingId) => {
            if (scope === "discover") releaseDiscoverCommentRetention(leavingId);
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
            const removeMatched = () => {
              removeCompletedPairUpCandidate(scope, leavingId);
            };
            if (scope === "discover") {
              removeMatched();
              await runComplete(leavingId, scope);
              return;
            }
            await runComplete(
              leavingId,
              scope,
              target.display_name,
              removeMatched
            );
          },
          setPinned,
          setPhaseExpressing: () => {
            if (!discoverHeart) setPhase("expressing");
          },
          setPhaseIdle: () => {
            if (!discoverHeart) setPhase("idle");
          },
          beginFlight: () => {
            if (discoverHeart) return;
            connectInFlightRef.current = true;
            setConnectResolving(true);
          },
          endFlight: () => {
            if (discoverHeart) return;
            connectInFlightRef.current = false;
            setConnectResolving(false);
          },
          onDiscoverHeartExpressed: (opportunityId, expressed) => {
            if (scope !== "discover") return;
            discover?.noteDiscoverHeartExpressed(opportunityId, expressed);
          },
          onDuoUnmatchedConfirmed: (opportunityId) => {
            if (scope !== "my_plans") return;
            const viewerId = authUserIdRef.current;
            if (!viewerId) return;
            showDuoActionFeedback("sent", opportunityId, viewerId);
          },
        },
      });
    },
    [
      authUserId,
      connectResolving,
      controlsLocked,
      discover,
      ensureAuthed,
      express,
      phase,
      photoPromptOpen,
      removeCompletedPairUpCandidate,
      runComplete,
      showDuoActionFeedback,
    ]
  );

  const dropMyPlansCandidate = useCallback((leavingId: string) => {
    setScopeState((prev) => {
      const snap = prev.my_plans;
      if (snap.removedIds.includes(leavingId)) return prev;
      const preOrder =
        snap.activeOrderedIds.length > 0
          ? snap.activeOrderedIds
          : orderedIdsRef.current.my_plans;
      const remainingIds = preOrder.filter((id) => id !== leavingId);
      const neighbor = resolveNearestOpportunityId(
        preOrder,
        remainingIds,
        leavingId
      );
      return {
        ...prev,
        my_plans: {
          ...snap,
          removedIds: [...snap.removedIds, leavingId],
          activeOrderedIds: remainingIds,
          currentOpportunityId: neighbor,
        },
      };
    });
  }, []);

  const withdrawDuoHeart = useCallback(
    async (target: PairUpCandidate) => {
      const viewerId = authUserIdRef.current;
      const opportunityId = target.opportunity_id;
      if (!viewerId || !opportunityId) return;
      const errorFeedbackVisible = () =>
        duoHeartErrorFeedbackVisible({
          capturedViewerId: viewerId,
          capturedOpportunityId: opportunityId,
          liveViewerId: authUserIdRef.current,
          scope: contentScopeRef.current,
          mode: modeRef.current,
          currentOpportunityId:
            scopeStateRef.current.my_plans.currentOpportunityId,
        });
      let owned = false;
      try {
        const result = await runDuoHeartWithdrawal({
          viewerId,
          liveViewerId: () => authUserIdRef.current,
          opportunityId,
          expressedByMe: target.expressed_by_me,
          matchState: target.duo_match_state,
          completionLocked:
            controlsLocked ||
            phase === "completeFailed" ||
            duoMatchNavRef.current,
          withdraw: () => withdrawDuoPairUpInterest(opportunityId),
          onStart: () => {
            owned = true;
            setHeartBusyId(opportunityId);
          },
        });
        if (result.type === "withdrawn") {
          myPlans.noteDuoHeartWithdrawn(opportunityId, viewerId);
          showDuoActionFeedback("withdrawn", opportunityId, viewerId);
          return;
        }
        if (result.type === "matched-interest") {
          if (errorFeedbackVisible()) showDuoAlreadyMatchedToast();
          void myPlans.refresh();
          return;
        }
        if (result.type === "discover-sourced") {
          if (errorFeedbackVisible()) {
            toast.error(peopleUiCopy.duoHeartDiscoverSourced);
          }
          return;
        }
        if (result.type === "failed") {
          if (errorFeedbackVisible()) {
            toast.error(
              result.stale
                ? peopleUiCopy.deckConnectUnavailable
                : peopleUiCopy.duoHeartWithdrawError
            );
          }
          if (result.stale) dropMyPlansCandidate(opportunityId);
        }
      } finally {
        if (owned) {
          setHeartBusyId((busy) =>
            busy === target.opportunity_id ? null : busy
          );
        }
      }
    },
    [controlsLocked, dropMyPlansCandidate, myPlans, phase, showDuoActionFeedback]
  );

  const handleConnect = useCallback(async () => {
    if (!current) return;
    const scope = contentScope;
    if (scope !== "my_plans" && scope !== "discover") return;
    if (scope === "my_plans") {
      const kind = duoHeartPressKind({
        expressedByMe: current.expressed_by_me,
        matchState: current.duo_match_state,
        completionLocked:
          controlsLocked || phase === "completeFailed" || duoMatchNavRef.current,
        pending:
          heartBusyId === current.opportunity_id ||
          connectResolving ||
          connectInFlightRef.current,
      });
      if (kind === "blocked") return;
      if (kind === "withdraw") {
        await withdrawDuoHeart(current);
        return;
      }
      if (kind === "complete") {
        const opportunityId = current.opportunity_id;
        setPinned(current);
        await runComplete(opportunityId, "my_plans", current.display_name, () =>
          removeCompletedPairUpCandidate("my_plans", opportunityId)
        );
        return;
      }
    }
    await runPairUpConnectForTarget(current, scope);
  }, [
    connectResolving,
    contentScope,
    controlsLocked,
    current,
    heartBusyId,
    phase,
    removeCompletedPairUpCandidate,
    runComplete,
    runPairUpConnectForTarget,
    setPinned,
    withdrawDuoHeart,
  ]);

  const handleFeedHeart = useCallback(
    async (row: PairUpCandidate) => {
      const scope = contentScope;
      if (scope !== "my_plans" && scope !== "discover") return;
      if (scope !== "discover") {
        if (heartBusyId || connectResolving || controlsLocked) return;
        setHeartBusyId(row.opportunity_id);
        try {
          await runPairUpConnectForTarget(row, scope);
        } finally {
          setHeartBusyId(null);
        }
        return;
      }

      if (!authUserId || !row.opportunity_id) return;
      const phaseNow = readDiscoverHeartPhase(
        row.opportunity_id,
        row.expressed_by_me
      );
      if (phaseNow === "pending" || phaseNow === "unavailable") return;
      if (phaseNow === "active") {
        const result = await runDiscoverHeartAction({
          viewerId: authUserId,
          opportunityId: row.opportunity_id,
          serverExpressed: true,
          connect: async () => "ignored",
          withdraw: () => withdrawDiscoverPairUpInterest(row.opportunity_id),
        });
        if (result.type === "withdrawn") {
          noteDiscoverHeartExpressed(row.opportunity_id, false);
          return;
        }
        if (result.type === "matched-interest") {
          toast.error(peopleUiCopy.discoverHeartMatched);
          void discover?.refresh();
          return;
        }
        if (result.type === "failed") {
          toast.error(
            result.stale
              ? peopleUiCopy.deckConnectUnavailable
              : peopleUiCopy.discoverHeartWithdrawError
          );
        }
        return;
      }

      await runPairUpConnectForTarget(row, "discover", { discoverHeart: true });
    },
    [
      authUserId,
      contentScope,
      controlsLocked,
      connectResolving,
      discover,
      heartBusyId,
      noteDiscoverHeartExpressed,
      runPairUpConnectForTarget,
    ]
  );

  const handleFeedRowVisible = useCallback(
    (opportunityId: string) => {
      if (!authUserId || !isPairUpSeenScope) return;
      if (!opportunityId) return;
      markLocalPeopleDeckSeenAndEnqueue(
        authUserId,
        contentScope as PairUpSeenScope,
        opportunityId
      );
      setPairUpSeenEpoch((n) => n + 1);
    },
    [authUserId, contentScope, isPairUpSeenScope]
  );

  const discoverAppearancesFreezeRef = useRef<
    DiscoverPersonAppearance<PairUpCandidate>[] | null
  >(null);

  useEffect(() => {
    if (contentScope !== "discover") {
      discoverAppearancesFreezeRef.current = null;
      return;
    }
    /* Entering Discover: restore scroll to saved opportunity once. */
    setDiscoverScrollRestoreToken((n) => n + 1);
  }, [contentScope]);

  const discoverAppearances = useMemo(() => {
    if (contentScope !== "discover") {
      return [] as DiscoverPersonAppearance<PairUpCandidate>[];
    }
    return groupDiscoverOpportunities(deckRows, {
      previous: discoverAppearancesFreezeRef.current,
    });
  }, [contentScope, deckRows]);

  useEffect(() => {
    if (contentScope === "discover") {
      discoverAppearancesFreezeRef.current = discoverAppearances;
    }
  }, [contentScope, discoverAppearances]);

  const discoverAppearancesRef = useRef(discoverAppearances);
  discoverAppearancesRef.current = discoverAppearances;

  const discoverIdentityByPersonKey = useMemo(() => {
    if (contentScope !== "discover") {
      return new Map<string, ProfileIdentityMediaSource>();
    }
    return buildDiscoverIdentityByPersonKey(deckRows);
  }, [contentScope, deckRows]);

  const [discoverFailedPhotoPathsByPersonKey, setDiscoverFailedPhotoPathsByPersonKey] =
    useState<Record<string, string[]>>({});

  useEffect(() => {
    if (contentScope !== "discover") return;
    setDiscoverFailedPhotoPathsByPersonKey((prev) => {
      let next: Record<string, string[]> | null = null;
      for (const [pk, source] of discoverIdentityByPersonKey) {
        const photos = normalizeProfilePhotos(source.profile_photos);
        const failed = (next ?? prev)[pk];
        if (!failed?.length || photos.length === 0) continue;
        if (photos.some((path) => !failed.includes(path))) {
          if (!next) next = { ...prev };
          delete next[pk];
        }
      }
      return next ?? prev;
    });
  }, [contentScope, discoverIdentityByPersonKey]);

  useEffect(() => {
    if (contentScope !== "discover") return;
    let indicesPatch: Record<string, number> | null = null;
    for (const [pk, source] of discoverIdentityByPersonKey) {
      const count = normalizeProfilePhotos(source.profile_photos).length;
      const current = photoIndexByPersonKey[pk] ?? 0;
      const clamped = clampDiscoverPhotoIndex(current, count);
      if (clamped !== current) {
        if (!indicesPatch) indicesPatch = {};
        indicesPatch[pk] = clamped;
      }
    }
    if (indicesPatch) {
      patchScope("discover", {
        photoIndexByPersonKey: {
          ...photoIndexByPersonKey,
          ...indicesPatch,
        },
      });
    }
  }, [
    contentScope,
    discoverIdentityByPersonKey,
    patchScope,
    photoIndexByPersonKey,
  ]);

  const handleDiscoverPhotoLoadFailure = useCallback(
    (personKey: string, failedPath: string | null) => {
      const pk = personKey.trim();
      const path = typeof failedPath === "string" ? failedPath.trim() : "";
      if (!pk || !path) return;
      setDiscoverFailedPhotoPathsByPersonKey((prev) => {
        const existing = prev[pk] ?? [];
        if (existing.includes(path)) return prev;
        return { ...prev, [pk]: [...existing, path] };
      });
    },
    []
  );

  const focusedDiscoverAppearanceKey = useMemo(() => {
    if (contentScope !== "discover") return null;
    const cur = current?.opportunity_id;
    if (cur) {
      const hit = discoverAppearances.find((a) =>
        a.opportunities.some((o) => o.opportunity_id === cur)
      );
      if (hit) return hit.appearanceKey;
    }
    return discoverAppearances[0]?.appearanceKey ?? null;
  }, [contentScope, current?.opportunity_id, discoverAppearances]);

  const handleFeedFocusedIdChange = useCallback(
    (focusId: string) => {
      if (!focusId) return;
      if (contentScope === "discover") {
        const appearance = discoverAppearancesRef.current.find(
          (a) => a.appearanceKey === focusId
        );
        if (appearance) {
          const first = appearance.opportunities[0]?.opportunity_id;
          if (first) {
            patchScope(contentScope, { currentOpportunityId: first });
          }
          return;
        }
      }
      patchScope(contentScope, { currentOpportunityId: focusId });
    },
    [contentScope, patchScope]
  );

  const handleMineProfileConnect = useCallback(async () => {
    if (!isMineCandidateProfileOpenContext(mineProfileOpen)) return;
    await runPairUpConnectForTarget(
      mineProfileOpen.candidate,
      mineProfileOpen.scope
    );
  }, [mineProfileOpen, runPairUpConnectForTarget]);

  const handleRetryComplete = useCallback(() => {
    if (!pinned || phase !== "completeFailed") return;
    if (duoMatchNavRef.current) return;
    const scope = contentScope === "discover" ? "discover" : "my_plans";
    const opportunityId = pinned.opportunity_id;
    void runComplete(opportunityId, scope, pinned.display_name, () =>
      removeCompletedPairUpCandidate(scope, opportunityId)
    );
  }, [contentScope, phase, pinned, removeCompletedPairUpCandidate, runComplete]);

  const identitySourceFor = useCallback(
    (row: PairUpCandidate): ProfileIdentityMediaSource => {
      if (isDevMockCandidate(row)) {
        const mock = DEV_MOCK_PROFILE_BY_ID[row.opportunity_id];
        return {
          profile_photos: mock?.photos ?? [],
          avatar_url: row.avatar_url,
          display_name: row.display_name,
          username: row.username,
          user_id: row.creator_id,
          profile_id: row.profile_id,
        };
      }
      return {
        profile_photos: row.profile_photos,
        echo_preset: row.echo_preset,
        avatar_url: row.avatar_url,
        display_name: row.display_name,
        username: row.username,
        user_id: row.creator_id,
        profile_id: row.profile_id,
      };
    },
    []
  );

  const identitySourceForDuoPresentation = useCallback(
    (row: PairUpCandidate): ProfileIdentityMediaSource =>
      adaptDuoPresentationIdentity(identitySourceFor(row)),
    [identitySourceFor]
  );

  const mineAtmosphereWarmTarget = useMemo(() => {
    if (!isDuoAtmosphereScope) return null;
    if (!mineAtmosphereIdentityKey || !current) return null;
    const personKey = pairUpPersonKey(current);
    const photoIdx = photoIndexByPersonKey[personKey] ?? 0;
    const source = identitySourceForDuoPresentation(current);
    const displayUrl = resolveMineFrontDisplayUrl(source, photoIdx);
    const path = resolveMineFrontPhotoPath(source, photoIdx);
    return {
      identityKey: mineAtmosphereIdentityKey,
      path,
      displayUrl,
    };
  }, [
    current,
    identitySourceForDuoPresentation,
    isDuoAtmosphereScope,
    mineAtmosphereIdentityKey,
    photoIndexByPersonKey,
  ]);

  useEffect(() => {
    if (!isDuoAtmosphereScope) return;

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
      .catch(() => {});

    return () => {
      mineAtmosphereWarmWatchGenRef.current += 1;
    };
  }, [
    applyMineAtmospherePath,
    isDuoAtmosphereScope,
    mineAtmosphereIdentityKey,
    mineAtmosphereWarmTarget,
  ]);

  // Mine: warm front display URLs around the owned index (+ pending button target).
  // ~10-candidate rolling window; ±2 mount radius unchanged.
  warmMineAroundRef.current = (atIndex, extraIndices, direction) => {
    if (!isCanonicalPairUpScope) return;
    const dir = direction ?? mineWarmDirectionRef.current;
    warmMineFrontImages(
      collectMineWarmFrontUrls({
        items: carouselItems,
        atIndex,
        photoIndexByPersonKey,
        identitySourceFor:
          contentScope === "my_plans"
            ? identitySourceForDuoPresentation
            : identitySourceFor,
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
    contentScope,
    identitySourceFor,
    identitySourceForDuoPresentation,
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
      const source =
        contentScope === "my_plans"
          ? identitySourceForDuoPresentation(cand)
          : identitySourceFor(cand);
      return resolveMineProxyImageUrl(source, photoIdx);
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
    identitySourceForDuoPresentation,
    contentScope,
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
      if (authUserId) {
        const ownDuoKnown =
          contentScope === "my_plans" ||
          getPairUpJoinStatus(row.source_post_id) === "joined";
        if (ownDuoKnown) {
          seedKnownActivePairUpBeforeDetail(authUserId, row.source_post_id);
        }
      }
      markSettledCurrentSeen();
      releaseAllPublishedListVideoOwnership();
      navigateToPostDetailInApp(
        navigate,
        location,
        row.source_type!,
        row.source_post_id
      );
    },
    [
      authUserId,
      canSeePostFor,
      contentScope,
      location,
      markSettledCurrentSeen,
      navigate,
    ]
  );

  const showLoading =
    mode === "p2p" &&
    ((loading && interleaved.length === 0 && !pinned && !useDevMocks) ||
      (deckRows.length === 0 &&
        !pinned &&
        !useDevMocks &&
        (hasMore || loadMoreInFlight || (loading && !hasLoaded))) ||
      ((contentScope === "my_plans" || contentScope === "discover") &&
        !useDevMocks &&
        Boolean(authUserId) &&
        !isPeopleDeckSeenBootstrapReady(authUserId, contentScope) &&
        scopeSnap.activeOrderedIds.length === 0 &&
        interleaved.length > 0));
  void seenBootstrapEpoch;
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
    !peoplePtrRefreshing &&
    !current &&
    deckRows.length === 0 &&
    trueCaughtUp;
  const emptyKind = isDiscoverScope ? ("discover" as const) : ("duo" as const);
  const handleEmptyExploreHome = useCallback(() => {
    onClose();
    navigate(Paths.home);
  }, [navigate, onClose]);
  const connectInteractionLocked =
    controlsLocked || connectResolving || photoPromptOpen;

  const openPairUpCommentComposer = useCallback(
    (
      row: PairUpCandidate,
      identitySource: ProfileIdentityMediaSource,
      displayName: string
    ) => {
      const scope = contentScope;
      if (scope !== "my_plans" && scope !== "discover") return;
      if (connectInteractionLocked || photoPromptOpen) return;
      if (!ensureAuthed()) return;

      const recipientUserId = row.creator_id?.trim();
      const sourcePostId = row.source_post_id?.trim();
      if (!recipientUserId || !sourcePostId) {
        toast.error(peopleUiCopy.commentComposerUnavailable);
        return;
      }

      const source = sourceForCandidate(row);
      const sourceType =
        row.source_type === "hangout" || row.source_type === "experience"
          ? row.source_type
          : null;
      const commentDisplayName = displayName.trim() || "Someone";

      const openWritable = () => {
        openPeopleCommentComposer({
          surface: scope === "discover" ? "discover" : "duo",
          opportunityId: row.opportunity_id,
          sourcePostId,
          recipientUserId,
          displayName: commentDisplayName,
          identitySource,
          caption: source.caption || null,
          scheduleLabel: source.scheduleLabel || null,
          scheduleLabelKind: source.scheduleLabelKind ?? null,
          sourceType,
          expressedByMe: Boolean(row.expressed_by_me),
          onDiscoverCommentJoined:
            scope === "discover"
              ? (opportunityId) => {
                  if (opportunityId !== row.opportunity_id) return;
                  retainDiscoverCommentCandidate(row);
                }
              : undefined,
          onAfterMessageDelivered:
            scope === "discover" && !row.expressed_by_me
              ? async () => {
                  await runPairUpConnectForTarget(row, "discover");
                }
              : undefined,
        });
      };

      if (scope === "my_plans") {
        void routeDuoCommentTap({
          rowCommented: row.duo_commented_by_me ?? null,
          identity: {
            surface: "duo",
            opportunityId: row.opportunity_id,
            sourcePostId,
            recipientUserId,
            displayName: commentDisplayName,
            identitySource,
            caption: source.caption || null,
            scheduleLabel: source.scheduleLabel || null,
            scheduleLabelKind: source.scheduleLabelKind ?? null,
            sourceType,
          },
          openComposer: openWritable,
        }).then((outcome) => {
          if (outcome === "unavailable") {
            toast.error(peopleUiCopy.commentComposerUnavailable);
          } else if (outcome === "failed") {
            toast.error("Couldn't open that comment.");
          } else if (outcome === "reopened-join-failed") {
            toast.error(peopleUiCopy.commentComposerSentInterestFailed);
          }
        });
        return;
      }

      openWritable();
    },
    [
      connectInteractionLocked,
      contentScope,
      ensureAuthed,
      photoPromptOpen,
      runPairUpConnectForTarget,
      sourceForCandidate,
    ]
  );

  const handleFeedMessage = useCallback(
    (
      row: PairUpCandidate,
      identitySource: ProfileIdentityMediaSource,
      displayName: string
    ) => {
      openPairUpCommentComposer(row, identitySource, displayName);
    },
    [openPairUpCommentComposer]
  );

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
  void primaryAction;

  const duoBottomHeartState = useMemo((): import("../../components/people/PeopleFeedActionRail").PeopleFeedHeartState => {
    if (!current || showEmpty) return "disabled";
    if (duoMatchPulseId === current.opportunity_id) return "active";
    const heartBusy =
      heartBusyId === current.opportunity_id || connectResolving;
    if (heartBusy) return "busy";
    if (connectInteractionLocked || phase === "completeFailed") {
      return "disabled";
    }
    if (current.expressed_by_me) return "active";
    return "idle";
  }, [
    connectInteractionLocked,
    connectResolving,
    current,
    duoMatchPulseId,
    heartBusyId,
    phase,
    showEmpty,
  ]);

  const duoCommentRevision = useSyncExternalStore(
    subscribeDuoCommentState,
    getDuoCommentRevision,
    getDuoCommentRevision
  );
  const duoCommentViewerId = getDuoCommentViewerId();
  const duoCommentSourcePostId = current?.source_post_id?.trim() || "";
  const duoCommentRecipientId = current?.creator_id?.trim() || "";

  useEffect(() => {
    if (!isDuoDeckScope || !duoCommentViewerId) return;
    if (!duoCommentSourcePostId || !duoCommentRecipientId) return;
    const commented = current?.duo_commented_by_me ?? null;
    applyDuoCommentListFlags({
      viewerId: duoCommentViewerId,
      sourcePostId: duoCommentSourcePostId,
      recipientUserId: duoCommentRecipientId,
      commented,
      viewerHasActivePairUp: current?.viewer_has_active_pair_up ?? null,
    });
    if (commented !== null) return;
    void resolveActivatedDuoComment({
      viewerId: duoCommentViewerId,
      sourcePostId: duoCommentSourcePostId,
      recipientUserId: duoCommentRecipientId,
      listCommented: commented,
    });
  }, [
    isDuoDeckScope,
    duoCommentViewerId,
    duoCommentSourcePostId,
    duoCommentRecipientId,
    current?.duo_commented_by_me,
    current?.viewer_has_active_pair_up,
    current?.opportunity_id,
  ]);

  const duoBottomCommentVisual = useMemo(() => {
    void duoCommentRevision;
    if (!current || showEmpty || !duoCommentSourcePostId || !duoCommentRecipientId) {
      return {
        state: "disabled" as const,
        confirmedState: "idle" as const,
        disabled: true,
      };
    }
    const snapshot = duoCommentViewerId
      ? getDuoCommentSnapshot(
          duoCommentStateKey(
            duoCommentViewerId,
            duoCommentSourcePostId,
            duoCommentRecipientId
          )
        )
      : null;
    return duoCommentVisual({
      snapshot: snapshot ?? {
        state: "unknown",
        pending: false,
        body: null,
        viewerHasActivePairUp: null,
        confirmedBySend: false,
      },
      listCommented: current.duo_commented_by_me ?? null,
    });
  }, [
    current,
    duoCommentRecipientId,
    duoCommentRevision,
    duoCommentSourcePostId,
    duoCommentViewerId,
    showEmpty,
  ]);

  const duoBottomCommentBusy = duoBottomCommentVisual.state === "pending";

  const duoBottomNavDisabled =
    showEmpty || showLoading || showError || !current;

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-transparent"
      aria-label={peopleUiCopy.matchDeck}
      data-people-match-deck-overlay="true"
      data-people-feed-canvas="true"
    >
      {ptrEnabled && (peoplePullPx > 2 || peoplePtrRefreshing) ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(peoplePullProgress * 100)}
          aria-label={
            peoplePtrRefreshing ? "Refreshing People" : "Pull to refresh"
          }
          className="pointer-events-none absolute left-0 right-0 z-[40] flex justify-center"
          style={{
            top: "calc(var(--safe-area-top-layout, 0px) + 3.25rem)",
            opacity: peoplePtrRefreshing
              ? 1
              : Math.min(1, 0.12 + peoplePullProgress * 0.88),
            transition: peoplePtrRefreshing
              ? undefined
              : "opacity 80ms ease-out",
          }}
        >
          <span
            className={`inline-block h-7 w-7 rounded-full border-2 border-[#F7D047]/30 border-t-[#F7D047] ${
              peoplePtrRefreshing ? "animate-spin" : ""
            }`}
            aria-hidden
          />
        </div>
      ) : null}

      {isDuoAtmosphereScope ? (
        <MineAtmosphereCrossfade
          state={mineAtmosphere}
          onFadeComplete={handleMineAtmosphereFadeComplete}
        />
      ) : null}

      {isDuoDeckScope && (carouselItems.length > 0 || showEmpty) ? (
        <MineEdgeNavCards
          canGoPrev={showEmpty ? false : canMineGoPrev}
          canGoNext={showEmpty ? false : canMineGoNext}
          onPrev={goMinePrev}
          onNext={goMineNext}
          fixedRailsGeometry
          visuallyHidden
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

      <PeopleFeedTopNav
        frostedScrollThrough={isDuoDeckScope}
        activeDestination={flatActiveDestination}
        discoverEnabled={discoverEnabled}
        groupsPillState={
          mode !== "groups"
            ? "inactive"
            : groupUpScope.browseTab === "yours"
              ? "yours"
              : "new"
        }
        onSelectDuo={selectDuoMode}
        onSelectDiscover={handleSelectDiscover}
        onSelectPlans={handleSelectOpenPlans}
        onSelectGroups={selectGroupsMode}
      />

      {/* Groups secondary: centered New | Yours under category nav. */}
      {mode === "groups" ? (
        <PeopleGroupsBrowseToggle
          browseTab={groupUpScope.browseTab}
          onToggle={toggleGroupsYoursBrowse}
        />
      ) : null}

      <div
        ref={setPtrSurfaceEl}
        className="relative z-[1] flex min-h-0 w-full flex-1 flex-col overflow-x-hidden"
        data-people-shell-content-pane="true"
        data-people-ptr-surface="true"
        style={{
          ...peopleFeedCssVars(),
          /* Top chrome pad lives on list scrollers (scroll-under). Duo inset is in-slide. */
          paddingTop: 0,
          paddingBottom: isDuoDeckScope ? 0 : peopleFeedContentBottomPad(),
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
                    onOpenHostProfile={openGroupHostProfile}
                    seenEpoch={pairUpSeenEpoch}
                    onSeenMarked={bumpPairUpSeenEpoch}
                  />
                ) : (
                  <p
                    className="m-auto px-6 text-center text-[15px] text-[var(--text)]/60"
                    style={{
                      paddingTop: `calc(${peopleFeedContentTopPad()} + ${PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX}px)`,
                    }}
                    data-people-feed-out-of-list-chrome="true"
                  >
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
                    authUserId={authUserId}
                    seenEpoch={pairUpSeenEpoch}
                    onSeenMarked={bumpPairUpSeenEpoch}
                  />
                ) : (
                  <p
                    className="m-auto px-6 text-center text-[15px] text-[var(--text)]/60"
                    style={{ paddingTop: peopleFeedContentTopPad() }}
                    data-people-feed-out-of-list-chrome="true"
                  >
                    Loading…
                  </p>
                )
              ) : showLoading ? (
                isDiscoverScope ? (
                  <div
                    className="min-h-0 w-full flex-1 overflow-y-auto"
                    style={{ paddingTop: peopleFeedContentTopPad() }}
                    data-people-feed-out-of-list-chrome="true"
                  >
                    <PeopleDiscoverFeedSkeleton variant="initial" />
                  </div>
                ) : (
                  <PeopleDuoCardSkeleton />
                )
              ) : showError ? (
                <div
                  className="m-auto flex flex-col items-center gap-3 px-4 text-center"
                  style={{ paddingTop: peopleFeedContentTopPad() }}
                  data-people-feed-out-of-list-chrome="true"
                >
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
                <div
                  className="relative flex min-h-0 w-full flex-1 flex-col"
                  style={{ paddingTop: peopleFeedContentTopPad() }}
                  data-people-feed-out-of-list-chrome="true"
                >
                  <PeopleDeckEmptyCard
                    kind={emptyKind}
                    title={
                      isDiscoverScope
                        ? peopleUiCopy.discoverEmpty
                        : peopleUiCopy.deckEmpty
                    }
                    body={
                      isDiscoverScope
                        ? peopleUiCopy.discoverEmptyBody
                        : peopleUiCopy.deckEmptyBody
                    }
                    ctaLabel={
                      isDiscoverScope
                        ? undefined
                        : peopleUiCopy.deckEmptyCtaExplore
                    }
                    onCta={
                      isDiscoverScope ? undefined : handleEmptyExploreHome
                    }
                  />
                </div>
              ) : isDiscoverScope ? (
                <PeopleFeedList
                  topChromePad={peopleFeedContentTopPad()}
                  orderedIds={deckRows.map((r) => r.opportunity_id)}
                  hasMore={useDevMocks ? false : hasMore}
                  loadMoreInFlight={loadMoreInFlight}
                  loadMorePlaceholder="discover"
                  onLoadMore={() => {
                    if (useDevMocks || loadMoreInFlight || !hasMore) return;
                    loadMoreInFlightRef.current = true;
                    setLoadMoreInFlight(true);
                    void loadMore()
                      .catch(() => {})
                      .finally(() => {
                        loadMoreInFlightRef.current = false;
                        setLoadMoreInFlight(false);
                      });
                  }}
                  onRowVisible={handleFeedRowVisible}
                  focusedId={focusedDiscoverAppearanceKey}
                  onFocusedIdChange={handleFeedFocusedIdChange}
                  scrollToId={scopeSnap.currentOpportunityId}
                  scrollRestoreToken={discoverScrollRestoreToken}
                >
                  {discoverAppearances.map((appearance) => {
                    const lead = appearance.opportunities[0]!;
                    const personKey = appearance.personKey;
                    const displayName =
                      lead.display_name?.trim() || "Someone";
                    const isFocused =
                      appearance.appearanceKey ===
                      focusedDiscoverAppearanceKey;
                    const mergedIdentity =
                      discoverIdentityByPersonKey.get(personKey) ??
                      identitySourceFor(lead);
                    const discoverFailedPhotoPaths = new Set(
                      discoverFailedPhotoPathsByPersonKey[personKey] ?? []
                    );
                    return (
                      <PeopleDiscoverPersonRow
                        key={appearance.appearanceKey}
                        appearanceKey={appearance.appearanceKey}
                        personKey={personKey}
                        displayName={displayName}
                        identitySource={mergedIdentity}
                        photoIndex={photoIndexByPersonKey[personKey] ?? 0}
                        onPhotoIndexChange={(next) =>
                          setPhotoIndexForPerson(personKey, next)
                        }
                        isFocused={isFocused}
                        withPhoto
                        onOpenProfile={
                          resolvePairUpProfileOpenKey(lead)
                            ? () => openMineProfileForCandidate(lead)
                            : undefined
                        }
                        feedNeutralEchoSeed={discoverNeutralEchoSeedForPerson(
                          personKey
                        )}
                        failedPhotoPaths={discoverFailedPhotoPaths}
                        onPhotoLoadFailure={(path) =>
                          handleDiscoverPhotoLoadFailure(personKey, path)
                        }
                      >
                        {appearance.opportunities.map((candidate) => {
                          const source = sourceForCandidate(candidate);
                          const heartBusy =
                            heartBusyId === candidate.opportunity_id ||
                            (connectResolving &&
                              current?.opportunity_id ===
                                candidate.opportunity_id);
                          const discoverHeartPhase = readDiscoverHeartPhase(
                            candidate.opportunity_id,
                            candidate.expressed_by_me
                          );
                          const discoverHeartState =
                            discoverHeartPhase === "pending" || heartBusy
                              ? "busy"
                              : discoverHeartPhase === "unavailable" ||
                                  phase === "completing" ||
                                  phase === "completeFailed"
                                ? "disabled"
                                : discoverHeartPhase === "active"
                                  ? "active"
                                  : "idle";
                          void discoverHeartRevision;
                          return (
                            <PeopleDiscoverOpportunityBox
                              key={candidate.opportunity_id}
                              opportunityId={candidate.opportunity_id}
                              postType={
                                candidate.source_type === "hangout" ||
                                candidate.source_type === "experience"
                                  ? candidate.source_type
                                  : "hangout"
                              }
                              caption={source.caption || null}
                              scheduleLabel={source.scheduleLabel || null}
                              scheduleLabelKind={source.scheduleLabelKind}
                              note={candidate.description?.trim() || null}
                              displayName={displayName}
                              personKey={personKey}
                              isUnseen={
                                isPairUpSeenScope &&
                                !pairUpSeenIds.has(candidate.opportunity_id)
                              }
                              onSeePost={
                                canSeePostFor(candidate)
                                  ? () => handleSeePostFor(candidate)
                                  : undefined
                              }
                              heartLabel={peopleUiCopy.deckConnectLabel}
                              heartState={discoverHeartState}
                              onHeart={() => {
                                void handleFeedHeart(candidate);
                              }}
                              messageLabel="Message"
                              messageBusy={false}
                              messageDisabled={
                                connectInteractionLocked || photoPromptOpen
                              }
                              sourcePostId={candidate.source_post_id}
                              recipientUserId={candidate.creator_id}
                              duoCommentedByMe={candidate.duo_commented_by_me}
                              viewerHasActivePairUp={
                                candidate.viewer_has_active_pair_up
                              }
                              identitySource={mergedIdentity}
                              onCommentPoolJoined={() => {
                                retainDiscoverCommentCandidate(candidate);
                              }}
                              onMessage={() => {
                                handleFeedMessage(
                                  candidate,
                                  mergedIdentity,
                                  displayName
                                );
                              }}
                            />
                          );
                        })}
                      </PeopleDiscoverPersonRow>
                    );
                  })}
                </PeopleFeedList>
              ) : (
                <div
                  className="relative flex min-h-0 w-full flex-1 flex-col"
                  data-people-duo-deck="true"
                  data-people-presentation="horizontal"
                >
                  <div
                    className="relative flex min-h-0 w-full flex-1 flex-col"
                    data-people-duo-carousel-slot="true"
                  >
                    <MatchDeckCarousel
                      items={carouselItems}
                      index={Math.max(
                        0,
                        Math.min(index, Math.max(0, carouselItems.length - 1))
                      )}
                      onIndexChange={(next) => {
                        void goToIndex(next);
                      }}
                      onCardTap={undefined}
                      layout="duo"
                      duoInFlowChrome
                      duoLayoutModern
                      resolveDuoModernDisplayPhotoCount={(candidate) =>
                        peopleDuoModernDisplayPhotoCount(
                          identitySourceForDuoPresentation(candidate)
                        )
                      }
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
                      renderItem={(candidate, meta) => (
                        <div
                          className="relative h-full w-full"
                          data-people-duo-slide-shell="true"
                          data-people-duo-current={
                            meta.isCurrent ? "true" : "false"
                          }
                        >
                          <PeopleDuoCandidateSlide
                            candidate={candidate}
                            identitySource={identitySourceForDuoPresentation(
                              candidate
                            )}
                            photoIndex={clampDiscoverPhotoIndex(
                              photoIndexByPersonKey[
                                pairUpPersonKey(candidate)
                              ] ?? 0,
                              normalizeProfilePhotos(
                                identitySourceForDuoPresentation(candidate)
                                  .profile_photos
                              ).length
                            )}
                            onPhotoIndexChange={(next) =>
                              setPhotoIndexForPerson(
                                pairUpPersonKey(candidate),
                                next
                              )
                            }
                            isCurrent={meta.isCurrent}
                            withPhoto={meta.withPhoto}
                            neighborSide={meta.neighborSide}
                            scheduleLabel={
                              sourceForCandidate(candidate).scheduleLabel ||
                              null
                            }
                            scheduleLabelKind={
                              sourceForCandidate(candidate).scheduleLabelKind
                            }
                            caption={
                              sourceForCandidate(candidate).caption || null
                            }
                            onSeePost={
                              canSeePostFor(candidate)
                                ? () => handleSeePostFor(candidate)
                                : undefined
                            }
                            postType={
                              candidate.source_type === "hangout" ||
                              candidate.source_type === "experience"
                                ? candidate.source_type
                                : null
                            }
                            layoutVariant="duoModern"
                            presentation="mine"
                            onOpenProfile={
                              resolvePairUpProfileOpenKey(candidate)
                                ? () =>
                                    openMineProfileForCandidate(candidate)
                                : undefined
                            }
                            onMineAtmosphereChange={
                              meta.isCurrent
                                ? handleMineAtmosphereChange
                                : undefined
                            }
                            isUnseen={
                              isPairUpSeenScope &&
                              !pairUpSeenIds.has(candidate.opportunity_id)
                            }
                          />
                        </div>
                      )}
                    />
                  </div>
                </div>
              )
            }
          </PeopleDuoModeTransition>
        </div>
      </div>

      {duoActionFeedback &&
      contentScope === "my_plans" &&
      duoActionFeedback.viewerId === authUserId &&
      current?.opportunity_id === duoActionFeedback.opportunityId ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[46] flex justify-center px-3"
          style={{
            bottom: `calc(${peopleDuoModernTabBandPad()} + ${PEOPLE_DUO_MODERN_ACTION_ROW_H_PX}px + 8px)`,
          }}
          data-duo-heart-action-feedback="true"
        >
          <p className="duo-heart-action-feedback" role="status" aria-live="polite">
            {duoHeartFeedbackText(duoActionFeedback.kind)}
          </p>
        </div>
      ) : null}

      {isDuoDeckScope && isPeopleTabVisible ? (
        <PeopleDuoBottomActionRow
          canGoPrev={!duoBottomNavDisabled && canMineGoPrev}
          canGoNext={!duoBottomNavDisabled && canMineGoNext}
          onPrev={goMinePrev}
          onNext={goMineNext}
          edgeNavCardsRef={
            mineRealIncomingEnabled ? mineEdgeNavCardsRef : undefined
          }
          connectLabel={peopleUiCopy.deckConnectLabel}
          heartState={duoBottomHeartState}
          onHeart={() => {
            void handleConnect();
          }}
          messageLabel="Message"
          commentState={duoBottomCommentVisual.state}
          commentConfirmedState={duoBottomCommentVisual.confirmedState}
          messageBusy={duoBottomCommentBusy}
          messageDisabled={
            duoBottomNavDisabled ||
            connectInteractionLocked ||
            photoPromptOpen ||
            !current?.creator_id?.trim() ||
            !current?.source_post_id?.trim() ||
            duoBottomCommentVisual.disabled
          }
          onMessage={() => {
            if (!current) return;
            handleFeedMessage(
              current,
              identitySourceForDuoPresentation(current),
              current.display_name?.trim() || "Someone"
            );
          }}
          navDisabled={duoBottomNavDisabled || connectInteractionLocked}
        />
      ) : null}

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
      {duoMatchConfirm ? (
        <div
          className="pointer-events-none fixed inset-0 z-[34]"
          data-duo-match-toast="true"
        >
          <div
            className="duo-match-toast-wash pointer-events-none absolute inset-x-0 bottom-0"
            style={{ top: peopleDuoModernScrollTopInset() }}
            aria-hidden
            data-duo-match-toast-wash="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center px-3"
            style={{ top: `calc(${peopleDuoModernScrollTopInset()} + 8px)` }}
            data-duo-match-toast-stage="true"
          >
            <div className="relative inline-flex items-center justify-center overflow-visible">
              <span
                className="duo-match-toast-ripple pointer-events-none absolute left-1/2 top-1/2 z-0"
                aria-hidden
                data-duo-match-toast-ripple="true"
              />
              <div
                className={[
                  "duo-match-toast relative z-10 pointer-events-auto inline-flex h-10 max-w-[min(100vw-24px,17.5rem)]",
                  "items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--bottom-tab-border)] p-1",
                  "bg-[color-mix(in_oklab,var(--surface-2)_78%,var(--surface))] text-[var(--text)] backdrop-blur-xl",
                  "shadow-[0_4px_18px_rgba(0,0,0,0.16)]",
                  "app-dark:border-white/24 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_62%,transparent)]",
                  "app-dark:shadow-[0_6px_22px_rgba(0,0,0,0.42)]",
                ].join(" ")}
                role="status"
                aria-live="polite"
                aria-label={duoMatchToastBody(duoMatchConfirm.displayName)}
                data-duo-match-toast-compact="true"
              >
                <span
                  className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-[var(--brand)]"
                  aria-hidden
                  data-duo-match-toast-heart="true"
                >
                  <PiHeartFill className="h-3.5 w-3.5" />
                </span>
                <p className="min-w-0 shrink truncate px-0.5 text-[13px] font-medium leading-none">
                  It's a Match!
                </p>
                <button
                  type="button"
                  className={[
                    "inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2.5",
                    "text-xs font-semibold",
                    "bg-[var(--bottom-tab-create-active-bg)] text-[var(--bottom-tab-create-active-fg)]",
                    "shadow-[0_1px_0_rgba(0,0,0,0.08)]",
                    "app-dark:shadow-[0_1px_0_rgba(255,255,255,0.12)]",
                  ].join(" ")}
                  onClick={openDuoMatchConversation}
                >
                  Chat now
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
