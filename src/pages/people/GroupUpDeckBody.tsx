/**
 * Group Up People deck body: New / Yours browse tabs + carousel.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  classifyGroupUpRequestError,
  requestGroupUp,
  withdrawGroupUpRequest,
} from "../../api/services/groupUp";
import type { UseGroupUpCandidatesResult } from "../../hooks/useGroupUpCandidates";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import type { RootState } from "../../app/store";
import {
  GROUP_UP_JOIN_PHOTO_PROMPT_DESCRIPTION,
  GROUP_UP_JOIN_PHOTO_PROMPT_TITLE,
} from "../../lib/pairUpPhotoPromptCopy";
import {
  isPairUpPhotoPromptOpen,
  openPairUpPhotoPrompt,
  subscribePairUpPhotoPrompt,
} from "../../lib/pairUpPhotoPromptStore";
import { isPeoplePhotoPromptBypassed } from "../../lib/peoplePhotoPromptSession";
import { resolvePhotoPromptOffer } from "../../lib/peoplePhotoPromptPolicy";
import type {
  GroupUpBrowseTab,
  GroupUpDeckScopeSnapshot,
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
} from "../../lib/people/peoplePairUpSeenHistory";
import {
  isPeopleDeckSeenBootstrapReady,
  markLocalPeopleDeckSeenAndEnqueue,
} from "../../lib/people/peopleDeckSeenSync";
import { groupUpRowMatchesBrowseTab } from "../../lib/groupUpBrowse";
import { groupUpDeckRowId } from "../../lib/groupUpDeckRowId";
import { lookupGroupPublishedMedia } from "../../lib/groupUpPublishedMedia";
import { GROUP_ACTIVE_MEMBER_CAP } from "../../lib/groupActiveMemberCap";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import { ensurePublishedMediaCacheForDetailHandoff } from "../../lib/publishedMedia";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import {
  getPostScheduleLabel,
  type PostScheduleLabelKind,
} from "../../lib/postScheduleLabel";
import type { GroupUpCandidate } from "../../lib/people/types";
import {
  canOpenGroupSourcePost,
  resolveGroupSourcePostInitialMediaKey,
} from "../../lib/people/groupSourcePostOpen";
import { resolveGroupHostProfileOpenKey } from "../../lib/people/resolveGroupHostProfileOpenKey";
import {
  dismissGroupUpRequestToast,
  showGroupUpRequestToast,
} from "../../lib/showGroupUpRequestToast";
import { messagesConversationPath } from "../../router/Paths";
import MatchDeckCarousel from "./MatchDeckCarousel";
import PeopleGroupUpCandidateSlide from "../../components/people/PeopleGroupUpCandidateSlide";
import MineEdgeNavCards, {
  type MineEdgeNavCardsHandle,
} from "../../components/people/MineEdgeNavCards";
import type { PeopleMineAtmosphereReport } from "../../components/people/PeopleCandidateMedia";
import { peopleUiCopy } from "./peopleUiCopy";
import {
  resolveGroupUpShellActionState,
  type PeopleShellPrimaryAction,
} from "./peopleShellPrimaryAction";
import { isPeopleMineRealIncomingEnabled } from "./matchDeckDevMocks";
import {
  createMineButtonFlightLatch,
  flushMineButtonLatch,
  planMineButtonStep,
  queueMineButtonTarget,
  releaseMineButtonLatchOnIndexDiverge,
  type MineButtonFlightLatch,
} from "../../lib/people/mineEdgeNavGesture";
import {
  createMineMotionProbeController,
  type MineMotionProbeController,
} from "../../lib/people/mineMotionProbeProgress";
import {
  peopleDebugBumpRender,
  peopleDebugRecord,
  peopleDebugSetContext,
} from "../../lib/people/peopleDeckDebug";

const EMPTY_GROUP_MEDIA: import("../../lib/publishedMedia").PublishedMediaItem[] =
  [];

type JoinFlight = {
  undoRequested: boolean;
};

type MutationKind = "request" | "withdraw";

function occursLabelFor(row: GroupUpCandidate): string | null {
  if (!row.occurs_at) return null;
  return formatSocialOccursSchedule(
    row.occurs_at,
    row.occurs_time_explicit !== false
  );
}

function scheduleMetaFor(row: GroupUpCandidate): {
  label: string | null;
  kind: PostScheduleLabelKind | null;
} {
  if (row.source_unavailable) return { label: null, kind: null };
  const occurs = occursLabelFor(row);
  if (occurs) return { label: occurs, kind: null };
  if (row.source_type !== "hangout") return { label: null, kind: null };
  const result = getPostScheduleLabel({
    type: row.source_type,
    createdAt: row.created_at,
    selectedDates: row.source_selected_dates,
    isRecurring: row.source_is_recurring,
    recurrenceDays: row.source_recurrence_days,
  });
  return {
    label: result.label?.trim() || null,
    kind: result.kind,
  };
}

function requestErrorToast(
  kind: ReturnType<typeof classifyGroupUpRequestError>
): void {
  switch (kind) {
    case "full":
      toast.error(peopleUiCopy.groupUpBrowseFull);
      break;
    case "already_member":
      toast.error(peopleUiCopy.groupUpBrowseAlreadyMember);
      break;
    case "declined":
      toast.error(peopleUiCopy.groupUpBrowseDeclined);
      break;
    case "blocked":
      toast.error(peopleUiCopy.groupUpBrowseBlocked);
      break;
    case "unavailable":
      toast.error(peopleUiCopy.groupUpBrowseUnavailable);
      break;
    default:
      toast.error(peopleUiCopy.groupUpBrowseRequestError);
  }
}

export default function GroupUpDeckBody({
  deck,
  scopeSnap,
  patchScope,
  onRemoveCandidate,
  onSuspendSession,
  onPrimaryActionChange,
  onAtmosphereChange,
  onAtmosphereIdentityKeyChange,
  onOpenHostProfile,
  seenEpoch = 0,
  onSeenMarked,
}: {
  deck: UseGroupUpCandidatesResult;
  scopeSnap: GroupUpDeckScopeSnapshot;
  patchScope: (patch: Partial<GroupUpDeckScopeSnapshot>) => void;
  onRemoveCandidate: (opportunityId: string) => void;
  onSuspendSession: () => void;
  onPrimaryActionChange?: (action: PeopleShellPrimaryAction | null) => void;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
  onAtmosphereIdentityKeyChange?: (identityKey: string | null) => void;
  onOpenHostProfile?: (candidate: GroupUpCandidate) => void;
  seenEpoch?: number;
  onSeenMarked?: () => void;
}) {
  peopleDebugBumpRender("groupUpDeckBody");

  const navigate = useNavigate();
  const location = useLocation();
  const {
    candidates,
    publishedMediaByPostId,
    hasMore,
    loading,
    error,
    hasLoaded,
    refresh,
    loadMore,
    patchViewerState,
  } = deck;

  const browseTab = scopeSnap.browseTab;
  const currentOpportunityId =
    scopeSnap.currentOpportunityIdByTab[browseTab] ?? null;

  const [joinResolving, setJoinResolving] = useState(false);
  const { ensureAuthed } = useAuthActionGate();
  const authUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null
  );
  const photoPromptOpen = useSyncExternalStore(
    subscribePairUpPhotoPrompt,
    isPairUpPhotoPromptOpen
  );
  const loadMoreInFlightRef = useRef(false);
  const [loadMoreInFlight, setLoadMoreInFlight] = useState(false);
  const lastValidIndexRef = useRef(0);
  const orderedIdsRef = useRef<{ new: string[]; yours: string[] }>({
    new: [],
    yours: [],
  });
  const scopeSnapRef = useRef(scopeSnap);
  scopeSnapRef.current = scopeSnap;
  const joinFlightRef = useRef<Map<string, JoinFlight>>(new Map());
  const mutationRef = useRef<Map<string, MutationKind>>(new Map());
  const [mutationIds, setMutationIds] = useState<Set<string>>(() => new Set());

  const removedIds = useMemo(
    () => new Set(scopeSnap.removedIds),
    [scopeSnap.removedIds]
  );
  const visitedIds = useMemo(
    () => new Set(scopeSnap.visitedIds),
    [scopeSnap.visitedIds]
  );
  const retiredIds = useMemo(
    () => new Set(scopeSnap.retiredIdsByTab[browseTab] ?? []),
    [browseTab, scopeSnap.retiredIdsByTab]
  );
  /** Groups New only — Yours never participates in seen/unseen browsing. */
  const groupsNewSeenIds = useMemo(() => {
    void seenEpoch;
    if (!authUserId || browseTab !== "new") return new Set<string>();
    return getPairUpSeenOpportunityIdSet(authUserId, "groups_new");
  }, [authUserId, browseTab, seenEpoch]);

  const browsable = useMemo(
    () => candidates.filter((row) => !removedIds.has(groupUpDeckRowId(row))),
    [candidates, removedIds]
  );

  const tabSourceRows = useMemo(() => {
    const tabRows = browsable.filter((row) =>
      groupUpRowMatchesBrowseTab(row, browseTab)
    );
    const byId = new Map(tabRows.map((row) => [groupUpDeckRowId(row), row]));
    const ordered: GroupUpCandidate[] = [];
    const seen = new Set<string>();
    for (const id of orderedIdsRef.current[browseTab]) {
      if (retiredIds.has(id)) continue;
      const row = byId.get(id);
      if (!row) continue;
      ordered.push(row);
      seen.add(id);
    }
    for (const row of tabRows) {
      const deckId = groupUpDeckRowId(row);
      if (seen.has(deckId)) continue;
      if (retiredIds.has(deckId)) continue;
      ordered.push(row);
    }
    orderedIdsRef.current[browseTab] = ordered.map((row) =>
      groupUpDeckRowId(row)
    );
    return ordered;
  }, [browsable, browseTab, retiredIds]);

  const deckRows = useMemo(() => {
    const byId = new Map(
      tabSourceRows.map((row) => [groupUpDeckRowId(row), row])
    );
    const active = scopeSnap.activeOrderedIdsByTab[browseTab] ?? [];
    if (active.length === 0) return tabSourceRows;
    const rows: GroupUpCandidate[] = [];
    for (const id of active) {
      const row = byId.get(id);
      if (row) rows.push(row);
    }
    return rows;
  }, [browseTab, scopeSnap.activeOrderedIdsByTab, tabSourceRows]);

  const foundIndex = indexOfOpportunity(deckRows, currentOpportunityId);
  if (foundIndex >= 0) {
    lastValidIndexRef.current = foundIndex;
  }
  const index =
    foundIndex >= 0
      ? foundIndex
      : currentOpportunityId == null
        ? 0
        : lastValidIndexRef.current;
  const current = foundIndex >= 0 ? deckRows[foundIndex] : null;

  const patchTabOpportunity = useCallback(
    (tab: GroupUpBrowseTab, opportunityId: string | null) => {
      patchScope({
        currentOpportunityIdByTab: {
          ...scopeSnap.currentOpportunityIdByTab,
          [tab]: opportunityId,
        },
      });
    },
    [patchScope, scopeSnap.currentOpportunityIdByTab]
  );

  const tryBeginMutation = useCallback(
    (opportunityId: string, kind: MutationKind): boolean => {
      if (!opportunityId) return false;
      if (mutationRef.current.has(opportunityId)) return false;
      mutationRef.current.set(opportunityId, kind);
      setMutationIds((prev) => {
        const next = new Set(prev);
        next.add(opportunityId);
        return next;
      });
      return true;
    },
    []
  );

  const endMutation = useCallback((opportunityId: string) => {
    mutationRef.current.delete(opportunityId);
    setMutationIds((prev) => {
      if (!prev.has(opportunityId)) return prev;
      const next = new Set(prev);
      next.delete(opportunityId);
      return next;
    });
  }, []);

  useEffect(() => {
    peopleDebugRecord("deck:mount", { deck: "groupUpDeckBody" });
    peopleDebugSetContext({ mode: "groups", deck: "groupUpDeckBody" });
    return () => {
      peopleDebugRecord("deck:unmount", { deck: "groupUpDeckBody" });
    };
  }, []);

  useEffect(() => {
    peopleDebugSetContext({ scope: browseTab });
  }, [browseTab]);

  useEffect(() => {
    const eligibleIds = new Set(
      tabSourceRows.map((row) => groupUpDeckRowId(row))
    );
    const snap = scopeSnapRef.current;
    const preOrder =
      (snap.activeOrderedIdsByTab[browseTab] ?? []).length > 0
        ? snap.activeOrderedIdsByTab[browseTab]
        : orderedIdsRef.current[browseTab];

    let nextActive: string[];
    if (browseTab === "new") {
      if (
        authUserId &&
        (snap.activeOrderedIdsByTab.new ?? []).length === 0 &&
        !isPeopleDeckSeenBootstrapReady(authUserId, "groups_new")
      ) {
        return;
      }
      const eligibleOrdered = tabSourceRows
        .map((row) => groupUpDeckRowId(row))
        .filter(Boolean);
      nextActive = rebuildPairUpActiveOrderedIds({
        eligibleOrdered,
        previousActive: snap.activeOrderedIdsByTab.new ?? [],
        currentId: snap.currentOpportunityIdByTab.new ?? null,
        seenIds: groupsNewSeenIds,
        retiredIds: snap.retiredIdsByTab.new ?? [],
      });
    } else {
      nextActive = filterOrderedIdsToEligible(
        snap.activeOrderedIdsByTab[browseTab] ?? [],
        eligibleIds
      );
      const activeSet = new Set(nextActive);
      const retired = new Set(snap.retiredIdsByTab[browseTab] ?? []);
      for (const row of tabSourceRows) {
        const id = groupUpDeckRowId(row);
        if (activeSet.has(id) || retired.has(id)) continue;
        nextActive.push(id);
        activeSet.add(id);
      }
    }

    let nextCurrent = snap.currentOpportunityIdByTab[browseTab] ?? null;
    if (nextCurrent && !eligibleIds.has(nextCurrent)) {
      nextCurrent = resolveNearestOpportunityId(
        preOrder,
        eligibleIds,
        nextCurrent
      );
    } else if (nextCurrent == null && nextActive.length > 0) {
      if (
        browseTab === "new" &&
        (snap.activeOrderedIdsByTab.new ?? []).length === 0
      ) {
        nextCurrent = firstUnseenOpportunityId(nextActive, groupsNewSeenIds);
      } else {
        nextCurrent = nextActive[0] ?? null;
      }
    }

    const prevActive = snap.activeOrderedIdsByTab[browseTab] ?? [];
    const activeChanged =
      nextActive.length !== prevActive.length ||
      nextActive.some((id, i) => id !== prevActive[i]);
    const currentChanged =
      nextCurrent !== (snap.currentOpportunityIdByTab[browseTab] ?? null);
    if (!activeChanged && !currentChanged) return;

    patchScope({
      ...(activeChanged
        ? {
            activeOrderedIdsByTab: {
              ...snap.activeOrderedIdsByTab,
              [browseTab]: nextActive,
            },
          }
        : {}),
      ...(currentChanged
        ? {
            currentOpportunityIdByTab: {
              ...snap.currentOpportunityIdByTab,
              [browseTab]: nextCurrent,
            },
          }
        : {}),
    });
  }, [authUserId, browseTab, groupsNewSeenIds, patchScope, seenEpoch, tabSourceRows]);

  useEffect(() => {
    const snap = scopeSnapRef.current;
    const active = snap.activeOrderedIdsByTab[browseTab] ?? [];
    const currentId = snap.currentOpportunityIdByTab[browseTab] ?? null;
    const pruned = pruneActiveOrderedIds(active, currentId);
    if (!pruned) return;
    const prevRetired = snap.retiredIdsByTab[browseTab] ?? [];
    const retiredSet = new Set(prevRetired);
    const nextRetired = [...prevRetired];
    for (const id of pruned.retired) {
      if (retiredSet.has(id)) continue;
      retiredSet.add(id);
      nextRetired.push(id);
    }
    patchScope({
      activeOrderedIdsByTab: {
        ...snap.activeOrderedIdsByTab,
        [browseTab]: pruned.kept,
      },
      retiredIdsByTab: {
        ...snap.retiredIdsByTab,
        [browseTab]: nextRetired,
      },
    });
  }, [browseTab, currentOpportunityId, patchScope]);

  useEffect(() => {
    const id =
      foundIndex >= 0
        ? deckRows[foundIndex]
          ? groupUpDeckRowId(deckRows[foundIndex])
          : null
        : currentOpportunityId;
    if (!id || visitedIds.has(id)) return;
    patchScope({ visitedIds: [...scopeSnap.visitedIds, id] });
  }, [
    currentOpportunityId,
    deckRows,
    foundIndex,
    patchScope,
    scopeSnap.visitedIds,
    visitedIds,
  ]);

  useEffect(() => {
    const remaining = deckRows.length - index - 1;
    const emptyNeedsPage = shouldLoadMoreForEmptyWindow({
      visibleCount: deckRows.length,
      hasMore,
      loadMoreInFlight,
    });
    const allLoadedSeen =
      browseTab === "new" &&
      deckRows.length > 0 &&
      deckRows.every((row) => groupsNewSeenIds.has(groupUpDeckRowId(row)));
    if (
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
      deck: "groupUpDeckBody",
      browseTab,
      emptyNeedsPage,
      allLoadedSeen,
    });
    loadMoreInFlightRef.current = true;
    setLoadMoreInFlight(true);
    void loadMore()
      .catch(() => {})
      .finally(() => {
        loadMoreInFlightRef.current = false;
        setLoadMoreInFlight(false);
      });
  }, [
    browseTab,
    deckRows,
    groupsNewSeenIds,
    hasMore,
    index,
    loadMore,
    loadMoreInFlight,
  ]);

  const goToIndex = useCallback(
    (next: number) => {
      if (joinResolving || photoPromptOpen) return;
      const clamped = Math.max(0, Math.min(deckRows.length - 1, next));
      const row = deckRows[clamped];
      const id = row ? groupUpDeckRowId(row) : null;
      const previousId =
        scopeSnapRef.current.currentOpportunityIdByTab[browseTab] ?? null;
      if (
        browseTab === "new" &&
        authUserId &&
        previousId &&
        id &&
        previousId !== id
      ) {
        markLocalPeopleDeckSeenAndEnqueue(authUserId, "groups_new", previousId);
        onSeenMarked?.();
      }
      patchTabOpportunity(browseTab, id || null);
    },
    [
      authUserId,
      browseTab,
      deckRows,
      joinResolving,
      onSeenMarked,
      patchTabOpportunity,
      photoPromptOpen,
    ]
  );

  const handleOpenGroup = useCallback(() => {
    if (!current) return;
    navigate(messagesConversationPath(current.conversation_id), {
      state: { backgroundLocation: location },
    });
  }, [current, location, navigate]);

  const runWithdraw = useCallback(
    async (target: GroupUpCandidate) => {
      const id = target.opportunity_id?.trim() || "";
      if (!id) return;
      if (!tryBeginMutation(id, "withdraw")) return;

      dismissGroupUpRequestToast(id);
      const prevRequestId = target.request_id;
      const snap = scopeSnapRef.current;
      const preOrder =
        (snap.activeOrderedIdsByTab.yours ?? []).length > 0
          ? snap.activeOrderedIdsByTab.yours
          : orderedIdsRef.current.yours;
      const remainingYours = preOrder.filter((oid) => oid !== id);
      const yoursNeighbor = resolveNearestOpportunityId(
        preOrder,
        remainingYours,
        id
      );
      const newActive = [
        ...(snap.activeOrderedIdsByTab.new ?? []).filter((oid) => oid !== id),
        id,
      ];

      patchScope({
        currentOpportunityIdByTab: {
          ...snap.currentOpportunityIdByTab,
          yours: yoursNeighbor,
          new: id,
        },
        activeOrderedIdsByTab: {
          ...snap.activeOrderedIdsByTab,
          yours: remainingYours,
          new: newActive,
        },
      });
      patchViewerState(id, { viewer_state: "none", request_id: null });

      try {
        const request = await withdrawGroupUpRequest(id);
        const status = String(request.status ?? "");
        if (status === "withdrawn") {
          patchViewerState(id, { viewer_state: "none", request_id: null });
        } else {
          patchViewerState(id, {
            viewer_state: "pending",
            request_id: prevRequestId,
          });
          patchScope({
            currentOpportunityIdByTab: {
              ...scopeSnapRef.current.currentOpportunityIdByTab,
              yours: id,
            },
          });
        }
      } catch {
        patchViewerState(id, {
          viewer_state: "pending",
          request_id: prevRequestId,
        });
        patchScope({
          currentOpportunityIdByTab: {
            ...scopeSnapRef.current.currentOpportunityIdByTab,
            yours: id,
          },
        });
        toast.error(peopleUiCopy.groupUpBrowseWithdrawError);
      } finally {
        endMutation(id);
      }
    },
    [endMutation, patchScope, patchViewerState, tryBeginMutation]
  );

  const runUndoJoin = useCallback(
    (target: GroupUpCandidate) => {
      const id = target.opportunity_id?.trim() || "";
      if (!id) return;
      const flight = joinFlightRef.current.get(id);
      const focusNew = () => {
        const snap = scopeSnapRef.current;
        const yoursPre =
          (snap.activeOrderedIdsByTab.yours ?? []).length > 0
            ? snap.activeOrderedIdsByTab.yours
            : orderedIdsRef.current.yours;
        const remainingYours = yoursPre.filter((oid) => oid !== id);
        const yoursNeighbor = resolveNearestOpportunityId(
          yoursPre,
          remainingYours,
          id
        );
        const newActive = [
          ...(snap.activeOrderedIdsByTab.new ?? []).filter((oid) => oid !== id),
          id,
        ];
        patchScope({
          currentOpportunityIdByTab: {
            ...snap.currentOpportunityIdByTab,
            yours: yoursNeighbor,
            new: id,
          },
          activeOrderedIdsByTab: {
            ...snap.activeOrderedIdsByTab,
            yours: remainingYours,
            new: newActive,
          },
        });
      };

      if (flight) {
        flight.undoRequested = true;
        patchViewerState(id, { viewer_state: "none", request_id: null });
        focusNew();
        dismissGroupUpRequestToast(id);
        return;
      }
      if (!tryBeginMutation(id, "withdraw")) return;
      patchViewerState(id, { viewer_state: "none", request_id: null });
      focusNew();
      void (async () => {
        try {
          await withdrawGroupUpRequest(id);
          patchViewerState(id, { viewer_state: "none", request_id: null });
        } catch {
          toast.error(peopleUiCopy.undoError);
        } finally {
          endMutation(id);
        }
      })();
    },
    [endMutation, patchScope, patchViewerState, tryBeginMutation]
  );

  const proceedRequest = useCallback(
    async (target: GroupUpCandidate) => {
      const id = target.opportunity_id?.trim() || "";
      if (!id) return;
      if (!tryBeginMutation(id, "request")) return;

      const prevState = target.viewer_state;
      const prevRequestId = target.request_id;
      const flight: JoinFlight = { undoRequested: false };
      joinFlightRef.current.set(id, flight);

      const snap = scopeSnapRef.current;
      const preOrder =
        (snap.activeOrderedIdsByTab.new ?? []).length > 0
          ? snap.activeOrderedIdsByTab.new
          : orderedIdsRef.current.new;
      const remainingNew = preOrder.filter((oid) => oid !== id);
      const newNeighbor = resolveNearestOpportunityId(
        preOrder,
        remainingNew,
        id
      );
      const yoursActive = [
        ...(snap.activeOrderedIdsByTab.yours ?? []).filter((oid) => oid !== id),
        id,
      ];

      patchScope({
        currentOpportunityIdByTab: {
          ...snap.currentOpportunityIdByTab,
          new: newNeighbor,
          yours: id,
        },
        activeOrderedIdsByTab: {
          ...snap.activeOrderedIdsByTab,
          new: remainingNew,
          yours: yoursActive,
        },
      });
      patchViewerState(id, { viewer_state: "pending", request_id: null });

      try {
        const request = await requestGroupUp(id);
        const status = String(request.status ?? "");

        if (flight.undoRequested) {
          if (status === "pending") {
            try {
              await withdrawGroupUpRequest(id);
            } catch {
              toast.error(peopleUiCopy.undoError);
            }
          }
          patchViewerState(id, { viewer_state: "none", request_id: null });
          patchTabOpportunity("new", id);
          return;
        }

        if (status === "pending") {
          patchViewerState(id, {
            viewer_state: "pending",
            request_id: request.id,
          });
          showGroupUpRequestToast(id, () => {
            runUndoJoin(target);
          });
          return;
        }

        if (status === "accepted") {
          onRemoveCandidate(id);
          toast(peopleUiCopy.groupUpBrowseAlreadyMember);
          return;
        }

        onRemoveCandidate(id);
      } catch (err) {
        if (!flight.undoRequested) {
          patchViewerState(id, {
            viewer_state: prevState,
            request_id: prevRequestId,
          });
          const kind = classifyGroupUpRequestError(err);
          if (
            kind === "unavailable" ||
            kind === "already_member" ||
            kind === "declined"
          ) {
            onRemoveCandidate(id);
          }
          requestErrorToast(kind);
        }
      } finally {
        joinFlightRef.current.delete(id);
        endMutation(id);
      }
    },
    [
      endMutation,
      onRemoveCandidate,
      patchScope,
      patchTabOpportunity,
      patchViewerState,
      runUndoJoin,
      tryBeginMutation,
    ]
  );

  const handleJoin = useCallback(async () => {
    if (!current) return;
    if (browseTab !== "new") return;
    if (current.viewer_state !== "none") return;
    if (current.source_unavailable) return;
    if (current.member_count >= GROUP_ACTIVE_MEMBER_CAP) return;
    const target = current;
    const id = target.opportunity_id?.trim() || "";
    if (!id) return;
    if (mutationIds.has(id)) return;
    if (joinResolving || photoPromptOpen) return;

    if (!ensureAuthed()) return;

    const userId = authUserId;
    if (!userId) return;

    if (isPeoplePhotoPromptBypassed()) {
      await proceedRequest(target);
      return;
    }

    setJoinResolving(true);
    try {
      const profile = resolvePhotoPromptOffer(userId, "group_up_request", false);
      if (!profile) {
        await proceedRequest(target);
        return;
      }

      const opened = openPairUpPhotoPrompt({
        intentKey: `group-up-request:${id}`,
        profileId: profile.profileId,
        userId: profile.userId,
        photos: profile.photos,
        title: GROUP_UP_JOIN_PHOTO_PROMPT_TITLE,
        description: GROUP_UP_JOIN_PHOTO_PROMPT_DESCRIPTION,
        onContinue: () => {
          void proceedRequest(target);
        },
      });
      if (!opened) {
        return;
      }
    } finally {
      setJoinResolving(false);
    }
  }, [
    authUserId,
    browseTab,
    current,
    ensureAuthed,
    joinResolving,
    mutationIds,
    photoPromptOpen,
    proceedRequest,
  ]);

  const handleWithdrawCurrent = useCallback(() => {
    if (!current) return;
    if (current.viewer_state !== "pending") return;
    void runWithdraw(current);
  }, [current, runWithdraw]);

  const [mediaIndexById, setMediaIndexById] = useState<Record<string, number>>(
    {}
  );
  const setMediaIndexFor = useCallback((opportunityId: string, next: number) => {
    setMediaIndexById((prev) => {
      if (prev[opportunityId] === next) return prev;
      return { ...prev, [opportunityId]: next };
    });
  }, []);

  const handleSeePost = useCallback(() => {
    if (!current || !canOpenGroupSourcePost(current)) return;
    const sourcePostId = current.source_post_id?.trim() || "";
    const sourceType = current.source_type;
    if (!sourcePostId || !sourceType) return;
    const deckId = groupUpDeckRowId(current);
    const mediaLookup = lookupGroupPublishedMedia(
      publishedMediaByPostId,
      sourcePostId,
      current.source_unavailable
    );
    const media = mediaLookup.items;
    const idx = mediaIndexById[deckId] ?? 0;
    const initialMediaKey = resolveGroupSourcePostInitialMediaKey(media, idx);

    if (media.length > 0) {
      ensurePublishedMediaCacheForDetailHandoff({
        postId: sourcePostId,
        viewerUserId: authUserId,
        items: media,
        source: "feed",
      });
    }
    onSuspendSession();
    navigateToPostDetailInApp(
      navigate,
      location,
      sourceType,
      sourcePostId,
      {
        ...(initialMediaKey ? { initialMediaKey } : {}),
      },
    );
  }, [
    authUserId,
    current,
    location,
    mediaIndexById,
    navigate,
    onSuspendSession,
    publishedMediaByPostId,
  ]);

  const isPending = current?.viewer_state === "pending";
  const currentDeckId = current ? groupUpDeckRowId(current) : "";
  const joinDisabled =
    !current ||
    browseTab !== "new" ||
    current.source_unavailable ||
    current.member_count >= GROUP_ACTIVE_MEMBER_CAP ||
    current.viewer_state !== "none" ||
    joinResolving ||
    photoPromptOpen ||
    (currentDeckId ? mutationIds.has(currentDeckId) : false) ||
    !current.opportunity_id;
  const withdrawDisabled =
    !current ||
    !isPending ||
    !current.opportunity_id ||
    mutationIds.has(current.opportunity_id);

  const controlsLocked = joinResolving || photoPromptOpen;

  const groupsPrepareRef = useRef<
    ((destinationIndex: number, opts?: { jump?: boolean }) => void) | null
  >(null);
  const groupsIndexRef = useRef(index);
  groupsIndexRef.current = index;
  const groupsButtonLatchRef = useRef<MineButtonFlightLatch>(
    createMineButtonFlightLatch()
  );
  const groupsRealIncomingEnabled = isPeopleMineRealIncomingEnabled();
  const groupsMotionProbeCtrlRef = useRef<MineMotionProbeController | null>(
    null
  );
  const groupsEdgeNavCardsRef = useRef<MineEdgeNavCardsHandle>({
    prev: null,
    next: null,
  });
  if (
    groupsRealIncomingEnabled &&
    (!groupsMotionProbeCtrlRef.current ||
      groupsMotionProbeCtrlRef.current.mode !== "proxy")
  ) {
    groupsMotionProbeCtrlRef.current = createMineMotionProbeController("proxy");
  }
  if (!groupsRealIncomingEnabled) {
    groupsMotionProbeCtrlRef.current = null;
  }

  useEffect(() => {
    const prev = groupsButtonLatchRef.current;
    const next = releaseMineButtonLatchOnIndexDiverge(prev, index);
    if (next !== prev) groupsButtonLatchRef.current = next;
  }, [index]);

  useEffect(() => {
    if (deckRows.length <= 0) {
      groupsButtonLatchRef.current = createMineButtonFlightLatch();
    }
  }, [deckRows.length]);

  const startGroupsButtonStep = useCallback(
    (destinationIndex: number) => {
      const len = deckRows.length;
      const planned = planMineButtonStep(
        groupsButtonLatchRef.current,
        destinationIndex,
        groupsIndexRef.current,
        len,
        !controlsLocked
      );
      groupsButtonLatchRef.current = planned.latch;
      if (!planned.shouldNavigate) return;
      groupsPrepareRef.current?.(planned.clamped, { jump: true });
      if (controlsLocked) {
        groupsButtonLatchRef.current = {
          flightActive: false,
          pendingTarget: groupsButtonLatchRef.current.pendingTarget,
          flightDest: null,
        };
        return;
      }
      goToIndex(planned.clamped);
    },
    [controlsLocked, deckRows.length, goToIndex]
  );

  const flushGroupsButtonPending = useCallback(() => {
    const { latch, nextStep } = flushMineButtonLatch(
      groupsButtonLatchRef.current,
      groupsIndexRef.current,
      deckRows.length
    );
    groupsButtonLatchRef.current = latch;
    if (nextStep == null) return;
    startGroupsButtonStep(nextStep);
  }, [deckRows.length, startGroupsButtonStep]);

  if (groupsMotionProbeCtrlRef.current) {
    groupsMotionProbeCtrlRef.current.onFlightSettled = flushGroupsButtonPending;
  }

  useEffect(() => {
    const latch = groupsButtonLatchRef.current;
    if (!latch.flightActive || latch.flightDest == null) return;
    if (index !== latch.flightDest) return;
    groupsButtonLatchRef.current = {
      ...latch,
      flightActive: false,
      flightDest: null,
    };
    flushGroupsButtonPending();
  }, [index, flushGroupsButtonPending]);

  const goGroupsPrev = useCallback(() => {
    const len = deckRows.length;
    if (len <= 0) return;
    const latch = groupsButtonLatchRef.current;
    if (latch.flightActive) {
      const base = latch.pendingTarget ?? groupsIndexRef.current;
      const pending = Math.max(0, base - 1);
      groupsButtonLatchRef.current = queueMineButtonTarget(latch, pending, len);
      return;
    }
    startGroupsButtonStep(Math.max(0, groupsIndexRef.current - 1));
  }, [deckRows.length, startGroupsButtonStep]);

  const goGroupsNext = useCallback(() => {
    const len = deckRows.length;
    if (len <= 0) return;
    const latch = groupsButtonLatchRef.current;
    if (latch.flightActive) {
      const base = latch.pendingTarget ?? groupsIndexRef.current;
      const pending = Math.min(len - 1, base + 1);
      groupsButtonLatchRef.current = queueMineButtonTarget(latch, pending, len);
      return;
    }
    startGroupsButtonStep(Math.min(len - 1, groupsIndexRef.current + 1));
  }, [deckRows.length, startGroupsButtonStep]);

  const canGroupsGoPrev = !controlsLocked && index > 0;
  const canGroupsGoNext = !controlsLocked && index < deckRows.length - 1;

  useEffect(() => {
    if (!onAtmosphereIdentityKeyChange) return;
    if (!current) {
      onAtmosphereIdentityKeyChange(null);
      return;
    }
    onAtmosphereIdentityKeyChange(groupUpDeckRowId(current));
  }, [current, onAtmosphereIdentityKeyChange]);

  useEffect(() => {
    return () => onAtmosphereIdentityKeyChange?.(null);
  }, [onAtmosphereIdentityKeyChange]);

  useEffect(() => {
    if (!onPrimaryActionChange) return;
    const state = resolveGroupUpShellActionState({
      browseTab,
      viewerState: current?.viewer_state,
      hasCurrent: Boolean(current),
    });
    const busy =
      Boolean(
        current &&
          current.opportunity_id &&
          mutationIds.has(current.opportunity_id)
      ) || joinResolving;

    if (state.labelKey === "request") {
      onPrimaryActionChange({
        label: peopleUiCopy.groupUpShellRequest,
        onPress: () => {
          void handleJoin();
        },
        disabled: joinDisabled,
        busy,
        tone: state.tone,
        icon: state.icon,
      });
    } else if (state.labelKey === "requested") {
      onPrimaryActionChange({
        label: peopleUiCopy.groupUpBrowseRequested,
        onPress: () => {
          void handleWithdrawCurrent();
        },
        disabled: withdrawDisabled,
        busy,
        tone: state.tone,
        icon: state.icon,
      });
    } else if (state.labelKey === "open") {
      onPrimaryActionChange({
        label: peopleUiCopy.groupUpShellOpen,
        onPress: () => handleOpenGroup(),
        disabled: false,
        tone: state.tone,
        icon: state.icon,
      });
    } else {
      onPrimaryActionChange({
        label: peopleUiCopy.groupUpShellRequest,
        onPress: () => {},
        disabled: true,
        tone: "muted",
        icon: state.icon,
      });
    }
  }, [
    browseTab,
    current,
    handleJoin,
    handleOpenGroup,
    handleWithdrawCurrent,
    joinDisabled,
    joinResolving,
    mutationIds,
    onPrimaryActionChange,
    withdrawDisabled,
  ]);

  useEffect(() => {
    return () => onPrimaryActionChange?.(null);
  }, [onPrimaryActionChange]);

  const retryBtnClass = [
    "flex min-h-11 min-w-[7.5rem] items-center justify-center rounded-full px-4",
    "bg-[var(--brand)] text-[var(--brand-ink)]",
    "text-[13px] font-semibold",
    "transition active:scale-[0.94]",
  ].join(" ");

  if (loading && !hasLoaded && deckRows.length === 0 && browsable.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60">
        Loading…
      </div>
    );
  }

  if (error && deckRows.length === 0 && browsable.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[var(--text)]/70">
          {peopleUiCopy.deckLoadError}
        </p>
        <button
          type="button"
          className={retryBtnClass}
          onClick={() => void refresh()}
        >
          {peopleUiCopy.deckRetryLoad}
        </button>
      </div>
    );
  }

  const trueCaughtUpBrowsable = isTrueCaughtUpState({
    visibleCount: browsable.length,
    hasLoaded,
    hasMore,
    loadMoreInFlight,
  });
  if (trueCaughtUpBrowsable) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60">
        {peopleUiCopy.groupUpBrowseEmpty}
      </div>
    );
  }

  if (
    hasLoaded &&
    browsable.length === 0 &&
    (hasMore || loadMoreInFlight)
  ) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60">
        Loading…
      </div>
    );
  }

  const tabEmpty =
    isTrueCaughtUpState({
      visibleCount: deckRows.length,
      hasLoaded,
      hasMore,
      loadMoreInFlight,
    }) ||
    (deckRows.length === 0 && !hasMore && !loadMoreInFlight && hasLoaded);

  const tabEmptyCopy =
    browseTab === "new"
      ? peopleUiCopy.groupUpBrowseNewEmpty
      : peopleUiCopy.groupUpBrowseYoursEmpty;

  if (tabEmpty || deckRows.length === 0) {
    if (deckRows.length === 0 && (hasMore || loadMoreInFlight)) {
      return (
        <p className="m-auto px-6 text-center text-[15px] text-[var(--text)]/60">
          Loading…
        </p>
      );
    }
    return (
      <p className="m-auto px-6 text-center text-[15px] text-[var(--text)]/80">
        {tabEmptyCopy}
      </p>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MineEdgeNavCards
        canGoPrev={canGroupsGoPrev}
        canGoNext={canGroupsGoNext}
        onPrev={goGroupsPrev}
        onNext={goGroupsNext}
        fixedRailsGeometry
        cardsRef={
          groupsRealIncomingEnabled ? groupsEdgeNavCardsRef : undefined
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MatchDeckCarousel
          index={index}
          onIndexChange={goToIndex}
          items={deckRows}
          locked={controlsLocked}
          layout="duo"
          duoInFlowChrome
          duoPresentation="mine"
          mineMotionProbeRef={
            groupsRealIncomingEnabled ? groupsMotionProbeCtrlRef : undefined
          }
          mineProxyProgrammaticPrepareRef={groupsPrepareRef}
          mineEdgeNavCardsRef={
            groupsRealIncomingEnabled ? groupsEdgeNavCardsRef : undefined
          }
          renderItem={(item, meta) => {
            const row = item as GroupUpCandidate;
            const deckId = groupUpDeckRowId(row);
            const mediaLookup = lookupGroupPublishedMedia(
              publishedMediaByPostId,
              row.source_post_id,
              row.source_unavailable
            );
            const media =
              mediaLookup.status === "pending"
                ? EMPTY_GROUP_MEDIA
                : mediaLookup.items;
            const schedule = scheduleMetaFor(row);
            return (
              <PeopleGroupUpCandidateSlide
                candidate={row}
                mediaItems={media}
                mediaPending={mediaLookup.status === "pending"}
                mediaIndex={mediaIndexById[deckId] ?? 0}
                onMediaIndexChange={(next) => setMediaIndexFor(deckId, next)}
                isCurrent={meta.isCurrent}
                withPhoto={meta.withPhoto}
                scheduleLabel={schedule.label}
                scheduleLabelKind={schedule.kind}
                isUnseen={
                  browseTab === "new" && !groupsNewSeenIds.has(deckId)
                }
                onSeePost={
                  meta.isCurrent && canOpenGroupSourcePost(row)
                    ? handleSeePost
                    : undefined
                }
                onOpenHostProfile={
                  meta.isCurrent &&
                  onOpenHostProfile &&
                  resolveGroupHostProfileOpenKey(row)
                    ? () => onOpenHostProfile(row)
                    : undefined
                }
                onAtmosphereChange={onAtmosphereChange}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
