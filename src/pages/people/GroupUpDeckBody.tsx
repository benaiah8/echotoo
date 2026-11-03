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
import PeopleDeckEmptyCard from "../../components/people/PeopleDeckEmptyCard";
import { Paths } from "../../router/Paths";
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
import PeopleFeedList from "../../components/people/PeopleFeedList";
import PeopleGroupUpFeedCard from "../../components/people/PeopleGroupUpFeedCard";
import PeoplePlansGroupsFeedSkeleton from "../../components/people/PeoplePlansGroupsFeedSkeleton";
import { PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX } from "../../components/people/PeopleGroupsBrowseToggle";
import GroupUpRequestNoteComposer, {
  emitGroupUpComposerToast,
  groupUpHeartIntent,
  groupUpRequestComposerStillValid,
  openGroupUpRequestComposer,
  trimGroupUpRequestNote,
  type GroupUpRequestComposerContext,
  type GroupUpRequestComposerState,
} from "../../components/people/GroupUpRequestNoteComposer";
import { peopleFeedContentTopPad } from "../../lib/people/peopleFeedLayout";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import { peopleUiCopy } from "./peopleUiCopy";
import {
  resolveGroupUpShellActionState,
  type PeopleShellPrimaryAction,
} from "./peopleShellPrimaryAction";
import {
  peopleDebugBumpRender,
  peopleDebugRecord,
  peopleDebugSetContext,
} from "../../lib/people/peopleDeckDebug";

type JoinFlight = {
  undoRequested: boolean;
};

type MutationKind = "request" | "withdraw";

type ProceedRequestOutcome = "skipped" | "ok" | "error";

function identitySourceFor(row: GroupUpCandidate): ProfileIdentityMediaSource {
  return {
    profile_photos: [],
    echo_preset: row.organizer_echo_preset,
    avatar_url: row.organizer_avatar_url,
    display_name: null,
    username: null,
  };
}

/** Privacy-safe composer snapshot — never includes a host display name. */
function composerContextFromRow(
  row: GroupUpCandidate
): GroupUpRequestComposerContext {
  const schedule = scheduleMetaFor(row);
  const caption =
    row.group_title?.trim() ||
    row.source_caption?.trim() ||
    null;
  const opportunityId = row.opportunity_id?.trim() || "";
  return {
    identitySource: identitySourceFor(row),
    caption,
    scheduleLabel: schedule.label,
    scheduleLabelKind: schedule.kind,
    feedNeutralEchoSeed: opportunityId,
  };
}

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
  const [composer, setComposer] = useState<GroupUpRequestComposerState | null>(
    null
  );
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
  const submitFlightRef = useRef(false);
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
    if (!composer || submitFlightRef.current) return;
    if (!groupUpRequestComposerStillValid(composer, browsable)) {
      setComposer(null);
    }
  }, [browsable, composer]);

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
    async (
      target: GroupUpCandidate,
      draftNote?: string
    ): Promise<ProceedRequestOutcome> => {
      const id = target.opportunity_id?.trim() || "";
      if (!id) return "skipped";
      if (!tryBeginMutation(id, "request")) return "skipped";

      const note = trimGroupUpRequestNote(draftNote ?? "");
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
        const request = await requestGroupUp(
          id,
          note.length > 0 ? { note } : undefined
        );
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
          return "ok";
        }

        if (status === "pending") {
          patchViewerState(id, {
            viewer_state: "pending",
            request_id: request.id,
          });
          showGroupUpRequestToast(id, () => {
            runUndoJoin(target);
          });
          return "ok";
        }

        if (status === "accepted") {
          onRemoveCandidate(id);
          toast(peopleUiCopy.groupUpBrowseAlreadyMember);
          return "ok";
        }

        onRemoveCandidate(id);
        return "ok";
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
        return "error";
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

  const openRequestComposer = useCallback(
    (target: GroupUpCandidate) => {
      if (submitFlightRef.current) return;
      const id = target.opportunity_id?.trim() || "";
      if (!id) return;
      if (target.viewer_state !== "none") return;
      if (target.source_unavailable) return;
      if (target.member_count >= GROUP_ACTIVE_MEMBER_CAP) return;
      if (mutationIds.has(id)) return;
      const context = composerContextFromRow(target);
      setComposer((prev) => openGroupUpRequestComposer(prev, id, context));
    },
    [mutationIds]
  );

  const submitGroupUpRequest = useCallback(
    async (opportunityId: string, draft: string) => {
      if (submitFlightRef.current) return;
      const target =
        candidates.find(
          (row) => (row.opportunity_id?.trim() || "") === opportunityId
        ) ?? null;
      if (!target || target.viewer_state !== "none") return;
      submitFlightRef.current = true;
      try {
        const outcome = await proceedRequest(target, draft);
        if (outcome !== "error") {
          setComposer(null);
        }
      } finally {
        submitFlightRef.current = false;
      }
    },
    [candidates, proceedRequest]
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
      openRequestComposer(target);
      return;
    }

    setJoinResolving(true);
    try {
      const profile = resolvePhotoPromptOffer(userId, "group_up_request", false);
      if (!profile) {
        openRequestComposer(target);
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
          openRequestComposer(target);
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
    openRequestComposer,
    photoPromptOpen,
  ]);

  const handleWithdrawCurrent = useCallback(() => {
    if (!current) return;
    if (current.viewer_state !== "pending") return;
    void runWithdraw(current);
  }, [current, runWithdraw]);

  const [mediaIndexById] = useState<Record<string, number>>(
    {}
  );

  const handleSeePostFor = useCallback(
    (target: GroupUpCandidate) => {
    if (!canOpenGroupSourcePost(target)) return;
    const sourcePostId = target.source_post_id?.trim() || "";
    const sourceType = target.source_type;
    if (!sourcePostId || !sourceType) return;
    const deckId = groupUpDeckRowId(target);
    const mediaLookup = lookupGroupPublishedMedia(
      publishedMediaByPostId,
      sourcePostId,
      target.source_unavailable
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

  const listTopChromePad = `calc(${peopleFeedContentTopPad()} + ${PEOPLE_GROUPS_BROWSE_TOGGLE_CLEARANCE_PX}px)`;

  if (loading && !hasLoaded && deckRows.length === 0 && browsable.length === 0) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: listTopChromePad }}
        data-people-group-up-initial-loading="true"
        data-people-feed-out-of-list-chrome="true"
      >
        <PeoplePlansGroupsFeedSkeleton variant="initial" surface="groups" />
      </div>
    );
  }

  if (error && deckRows.length === 0 && browsable.length === 0) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ paddingTop: listTopChromePad }}
        data-people-feed-out-of-list-chrome="true"
      >
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
    if (browseTab === "new") {
      return (
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ paddingTop: listTopChromePad }}
          data-people-group-up-empty-new="true"
          data-people-feed-out-of-list-chrome="true"
        >
          <PeopleDeckEmptyCard
            kind="groups_new"
            title={peopleUiCopy.groupUpBrowseNewEmpty}
            body={peopleUiCopy.groupUpBrowseNewEmptyBody}
            ctaLabel={peopleUiCopy.groupUpBrowseNewEmptyCta}
            onCta={() => navigate(Paths.home)}
          />
        </div>
      );
    }
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60"
        style={{ paddingTop: listTopChromePad }}
        data-people-feed-out-of-list-chrome="true"
      >
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
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60"
        style={{ paddingTop: listTopChromePad }}
        data-people-feed-out-of-list-chrome="true"
      >
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

  if (tabEmpty || deckRows.length === 0) {
    if (deckRows.length === 0 && (hasMore || loadMoreInFlight)) {
      return (
        <p
          className="m-auto px-6 text-center text-[15px] text-[var(--text)]/60"
          style={{ paddingTop: listTopChromePad }}
          data-people-feed-out-of-list-chrome="true"
        >
          Loading…
        </p>
      );
    }
    if (browseTab === "yours") {
      return (
        <div
          className="m-auto flex max-w-sm flex-col items-center gap-1.5 px-6 text-center"
          style={{ paddingTop: listTopChromePad }}
          data-people-feed-out-of-list-chrome="true"
          data-people-group-up-yours-empty="true"
        >
          <p className="m-0 text-[15px] font-semibold text-[var(--text)]">
            {peopleUiCopy.groupUpBrowseYoursEmptyTitle}
          </p>
          <p className="m-0 text-[14px] text-[var(--text)]/75">
            {peopleUiCopy.groupUpBrowseYoursEmpty}
          </p>
        </div>
      );
    }
    return (
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: listTopChromePad }}
        data-people-feed-out-of-list-chrome="true"
      >
        <PeopleDeckEmptyCard
          kind="groups_new"
          title={peopleUiCopy.groupUpBrowseNewEmpty}
          body={peopleUiCopy.groupUpBrowseNewEmptyBody}
          ctaLabel={peopleUiCopy.groupUpBrowseNewEmptyCta}
          onCta={() => navigate(Paths.home)}
        />
      </div>
    );
  }

  const handleGroupsHeart = (row: GroupUpCandidate) => {
    const intent = groupUpHeartIntent(row.viewer_state);
    if (intent === "compose" && browseTab === "new") {
      openRequestComposer(row);
      return;
    }
    if (intent === "withdraw") {
      void runWithdraw(row);
      return;
    }
    if (intent === "open") {
      navigate(messagesConversationPath(row.conversation_id), {
        state: { backgroundLocation: location },
      });
    }
  };

  return (
    <>
    <PeopleFeedList
      topChromePad={listTopChromePad}
      orderedIds={deckRows.map((row) => groupUpDeckRowId(row))}
      hasMore={hasMore}
      loadMoreInFlight={loadMoreInFlight}
      onLoadMore={() => {
        if (loadMoreInFlight || !hasMore) return;
        loadMoreInFlightRef.current = true;
        setLoadMoreInFlight(true);
        void loadMore()
          .catch(() => {})
          .finally(() => {
            loadMoreInFlightRef.current = false;
            setLoadMoreInFlight(false);
          });
      }}
      onRowVisible={(deckId) => {
        if (browseTab !== "new" || !authUserId || !deckId) return;
        markLocalPeopleDeckSeenAndEnqueue(authUserId, "groups_new", deckId);
        onSeenMarked?.();
      }}
      focusedId={current ? groupUpDeckRowId(current) : null}
      onFocusedIdChange={(id) => {
        patchTabOpportunity(browseTab, id);
      }}
      scrollToId={
        scopeSnap.currentOpportunityIdByTab[browseTab] ?? null
      }
    >
      {deckRows.map((row) => {
        const deckId = groupUpDeckRowId(row);
        const schedule = scheduleMetaFor(row);
        const state = row.viewer_state ?? "none";
        const pending = state === "pending";
        const member = state === "member" || state === "owner";
        const isOwner = state === "owner";
        const creatorName =
          row.organizer_display_name?.trim() ||
          row.organizer_username?.trim() ||
          null;
        const heartLabel = member
          ? peopleUiCopy.groupUpShellOpen
          : pending
            ? peopleUiCopy.groupUpBrowseRequested
            : peopleUiCopy.groupUpShellRequest;
        return (
          <PeopleGroupUpFeedCard
            key={deckId}
            opportunityId={deckId}
            isCurrent={deckId === (current ? groupUpDeckRowId(current) : null)}
            creatorName={creatorName}
            creatorAvatarUrl={row.organizer_avatar_url}
            creatorUserId={row.organizer_user_id}
            onOpenCreatorProfile={
              onOpenHostProfile && resolveGroupHostProfileOpenKey(row)
                ? () => onOpenHostProfile(row)
                : null
            }
            groupTitle={row.group_title}
            groupDescription={row.group_description}
            sourceCaption={row.source_caption}
            scheduleLabel={schedule.label}
            scheduleLabelKind={schedule.kind}
            postType={
              row.source_type === "hangout" || row.source_type === "experience"
                ? row.source_type
                : null
            }
            onSeePost={
              canOpenGroupSourcePost(row)
                ? () => handleSeePostFor(row)
                : null
            }
            showYoursBadge={isOwner}
            isUnseen={browseTab === "new" && !groupsNewSeenIds.has(deckId)}
            heartLabel={heartLabel}
            heartState={
              controlsLocked
                ? "disabled"
                : member
                  ? "active"
                  : pending
                    ? "pending"
                    : "idle"
            }
            onHeart={() => handleGroupsHeart(row)}
            messageLabel={member ? "Open chat" : null}
            onMessage={
              member
                ? () => {
                    navigate(messagesConversationPath(row.conversation_id), {
                      state: { backgroundLocation: location },
                    });
                  }
                : null
            }
          />
        );
      })}
    </PeopleFeedList>
    {composer ? (
      <GroupUpRequestNoteComposer
        open
        draft={composer.draft}
        busy={mutationIds.has(composer.opportunityId)}
        context={{
          identitySource: composer.identitySource,
          caption: composer.caption,
          scheduleLabel: composer.scheduleLabel,
          scheduleLabelKind: composer.scheduleLabelKind,
          feedNeutralEchoSeed: composer.feedNeutralEchoSeed,
        }}
        onDraftChange={(value) => {
          setComposer((prev) => (prev ? { ...prev, draft: value } : prev));
        }}
        onCancel={() => {
          if (submitFlightRef.current) return;
          setComposer(null);
          emitGroupUpComposerToast("cancel", {
            info: (message) => {
              toast(message);
            },
          });
        }}
        onDismiss={() => {
          if (submitFlightRef.current) return;
          setComposer(null);
        }}
        onSubmit={(draft) => {
          void submitGroupUpRequest(composer.opportunityId, draft);
        }}
      />
    ) : null}
    </>
  );
}
