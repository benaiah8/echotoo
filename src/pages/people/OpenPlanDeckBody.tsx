/**
 * Open Plans People deck body: carousel + I'm down / Withdraw.
 * Mounted only when activeScope === open_plans.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  requestOpenPlan,
  withdrawOpenPlanRequest,
} from "../../api/services/openPlans";
import type { UseOpenPlanCandidatesResult } from "../../hooks/useOpenPlanCandidates";
import type { MatchDeckScopeSnapshot } from "../../lib/matchDeckSession";
import {
  filterOrderedIdsToEligible,
  indexOfOpportunity,
  isTrueCaughtUpState,
  pruneActiveOrderedIds,
  resolveNearestOpportunityId,
  shouldLoadMoreForEmptyWindow,
} from "../../lib/people/matchDeckNavigation";
import type { OpenPlanCandidate } from "../../lib/people/types";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
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
import MatchDeckCarousel from "./MatchDeckCarousel";
import PeopleOpenPlanCandidateSlide from "../../components/people/PeopleOpenPlanCandidateSlide";
import MineEdgeNavCards, {
  type MineEdgeNavCardsHandle,
} from "../../components/people/MineEdgeNavCards";
import type { PeopleMineAtmosphereReport } from "../../components/people/PeopleCandidateMedia";
import { peopleUiCopy } from "./peopleUiCopy";
import { resolveOpenPlanShellActionState } from "./peopleShellPrimaryAction";
import type { PeopleShellPrimaryAction } from "./peopleShellPrimaryAction";
import { isPeopleMineRealIncomingEnabled } from "./matchDeckDevMocks";
import {
  peopleDebugBumpRender,
  peopleDebugRecord,
  peopleDebugSetContext,
} from "../../lib/people/peopleDeckDebug";

const PREFETCH_REMAINING = 3;

const secondaryControlClass = [
  "flex min-h-11 min-w-[7.5rem] items-center justify-center rounded-full px-4",
  "border border-[var(--text)]/18",
  "bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] text-[var(--text)]",
  "text-[13px] font-semibold",
  "transition active:scale-[0.94]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

function identitySourceFor(row: OpenPlanCandidate): ProfileIdentityMediaSource {
  return {
    profile_photos: row.profile_photos,
    echo_preset: row.echo_preset,
    avatar_url: row.avatar_url,
    display_name: null,
    username: null,
  };
}

export default function OpenPlanDeckBody({
  deck,
  scopeSnap,
  patchScope,
  onRemoveCandidate,
  onPrimaryActionChange,
  onAtmosphereChange,
  onAtmosphereIdentityKeyChange,
}: {
  deck: UseOpenPlanCandidatesResult;
  scopeSnap: MatchDeckScopeSnapshot;
  patchScope: (patch: Partial<MatchDeckScopeSnapshot>) => void;
  /** Single shared removal path: hook remove + removedIds. */
  onRemoveCandidate: (opportunityId: string) => void;
  onPrimaryActionChange?: (action: PeopleShellPrimaryAction | null) => void;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
  onAtmosphereIdentityKeyChange?: (identityKey: string | null) => void;
}) {
  peopleDebugBumpRender("openPlanDeckBody");

  const {
    candidates,
    hasMore,
    loading,
    error,
    hasLoaded,
    refresh,
    loadMore,
    patchRequestStatus,
  } = deck;

  const [busyId, setBusyId] = useState<string | null>(null);
  const loadMoreInFlightRef = useRef(false);
  const [loadMoreInFlight, setLoadMoreInFlight] = useState(false);
  const lastValidIndexRef = useRef(0);
  const orderedIdsRef = useRef<string[]>([]);
  const scopeSnapRef = useRef(scopeSnap);
  scopeSnapRef.current = scopeSnap;

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
  const photoIndexById = scopeSnap.photoIndexById;

  const sourceRows = useMemo(() => {
    const browsable = candidates.filter(
      (row) => !removedIds.has(row.opportunity_id)
    );
    const byId = new Map(browsable.map((row) => [row.opportunity_id, row]));
    const ordered: OpenPlanCandidate[] = [];
    const seen = new Set<string>();
    for (const id of orderedIdsRef.current) {
      if (retiredIds.has(id)) continue;
      const row = byId.get(id);
      if (!row) continue;
      ordered.push(row);
      seen.add(id);
    }
    for (const row of browsable) {
      if (seen.has(row.opportunity_id) || retiredIds.has(row.opportunity_id)) continue;
      ordered.push(row);
    }
    orderedIdsRef.current = ordered.map((row) => row.opportunity_id);
    return ordered;
  }, [candidates, removedIds, retiredIds]);

  const deckRows = useMemo(() => {
    const byId = new Map(sourceRows.map((row) => [row.opportunity_id, row]));
    const active = scopeSnap.activeOrderedIds;
    if (active.length === 0) return sourceRows;
    const rows: OpenPlanCandidate[] = [];
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
  const current = foundIndex >= 0 ? deckRows[foundIndex] : null;
  const controlsLocked = busyId != null;

  const prevOpenPlanDebugRef = useRef({
    index,
    currentOpportunityId: scopeSnap.currentOpportunityId,
  });

  useEffect(() => {
    peopleDebugRecord("deck:mount", { deck: "openPlanDeckBody" });
    peopleDebugSetContext({ mode: "open_plans", deck: "openPlanDeckBody" });
    return () => {
      peopleDebugRecord("deck:unmount", { deck: "openPlanDeckBody" });
    };
  }, []);

  useEffect(() => {
    const prev = prevOpenPlanDebugRef.current;
    if (prev.index !== index) {
      peopleDebugRecord("deck:index", {
        from: prev.index,
        to: index,
        deckRowsLen: deckRows.length,
        deck: "openPlanDeckBody",
      });
    }
    if (prev.currentOpportunityId !== scopeSnap.currentOpportunityId) {
      peopleDebugRecord("deck:currentOpportunityId", {
        from: prev.currentOpportunityId?.slice(0, 8) ?? null,
        to: scopeSnap.currentOpportunityId?.slice(0, 8) ?? null,
        index,
        deck: "openPlanDeckBody",
      });
    }
    prevOpenPlanDebugRef.current = {
      index,
      currentOpportunityId: scopeSnap.currentOpportunityId,
    };
  }, [index, scopeSnap.currentOpportunityId, deckRows.length]);

  useEffect(() => {
    const eligibleIds = new Set(sourceRows.map((row) => row.opportunity_id));
    const snap = scopeSnapRef.current;
    const preOrder =
      snap.activeOrderedIds.length > 0
        ? snap.activeOrderedIds
        : orderedIdsRef.current;

    const nextActive = filterOrderedIdsToEligible(
      snap.activeOrderedIds,
      eligibleIds
    );
    const activeSet = new Set(nextActive);
    for (const row of sourceRows) {
      const id = row.opportunity_id;
      if (activeSet.has(id) || snap.retiredIds.includes(id)) continue;
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

    patchScope({
      ...(activeChanged ? { activeOrderedIds: nextActive } : {}),
      ...(currentChanged ? { currentOpportunityId: nextCurrent } : {}),
    });
  }, [patchScope, sourceRows]);

  useEffect(() => {
    const snap = scopeSnapRef.current;
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
    patchScope({
      activeOrderedIds: pruned.kept,
      retiredIds: nextRetired,
    });
  }, [patchScope, scopeSnap.currentOpportunityId]);

  useEffect(() => {
    const id =
      foundIndex >= 0
        ? deckRows[foundIndex]?.opportunity_id
        : scopeSnap.currentOpportunityId;
    if (!id || visitedIds.has(id)) return;
    patchScope({ visitedIds: [...scopeSnap.visitedIds, id] });
  }, [
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
      hasMore,
      loadMoreInFlight,
    });
    if (
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
      deck: "openPlanDeckBody",
      emptyNeedsPage,
    });
    loadMoreInFlightRef.current = true;
    setLoadMoreInFlight(true);
    void loadMore()
      .catch(() => {})
      .finally(() => {
        loadMoreInFlightRef.current = false;
        setLoadMoreInFlight(false);
      });
  }, [deckRows.length, hasMore, index, loadMore, loadMoreInFlight]);

  const goToIndex = useCallback(
    (next: number) => {
      if (controlsLocked) return;
      const clamped = Math.max(0, Math.min(deckRows.length - 1, next));
      const id = deckRows[clamped]?.opportunity_id ?? null;
      patchScope({ currentOpportunityId: id });
    },
    [controlsLocked, deckRows, patchScope]
  );

  const plansPrepareRef = useRef<
    ((destinationIndex: number, opts?: { jump?: boolean }) => void) | null
  >(null);
  const plansIndexRef = useRef(index);
  plansIndexRef.current = index;
  const plansButtonLatchRef = useRef<MineButtonFlightLatch>(
    createMineButtonFlightLatch()
  );

  const plansRealIncomingEnabled = isPeopleMineRealIncomingEnabled();
  const plansMotionProbeCtrlRef = useRef<MineMotionProbeController | null>(
    null
  );
  const plansEdgeNavCardsRef = useRef<MineEdgeNavCardsHandle>({
    prev: null,
    next: null,
  });
  if (
    plansRealIncomingEnabled &&
    (!plansMotionProbeCtrlRef.current ||
      plansMotionProbeCtrlRef.current.mode !== "proxy")
  ) {
    plansMotionProbeCtrlRef.current = createMineMotionProbeController("proxy");
  }
  if (!plansRealIncomingEnabled) {
    plansMotionProbeCtrlRef.current = null;
  }

  useEffect(() => {
    const prev = plansButtonLatchRef.current;
    const next = releaseMineButtonLatchOnIndexDiverge(prev, index);
    if (next !== prev) {
      plansButtonLatchRef.current = next;
    }
  }, [index]);

  useEffect(() => {
    if (deckRows.length <= 0) {
      plansButtonLatchRef.current = createMineButtonFlightLatch();
    }
  }, [deckRows.length]);

  const startPlansButtonStep = useCallback(
    (destinationIndex: number) => {
      const len = deckRows.length;
      const planned = planMineButtonStep(
        plansButtonLatchRef.current,
        destinationIndex,
        plansIndexRef.current,
        len,
        !controlsLocked
      );
      plansButtonLatchRef.current = planned.latch;
      if (!planned.shouldNavigate) return;
      plansPrepareRef.current?.(planned.clamped, { jump: true });
      if (controlsLocked) {
        plansButtonLatchRef.current = {
          flightActive: false,
          pendingTarget: plansButtonLatchRef.current.pendingTarget,
          flightDest: null,
        };
        return;
      }
      goToIndex(planned.clamped);
    },
    [controlsLocked, deckRows.length, goToIndex]
  );

  const flushPlansButtonPending = useCallback(() => {
    const { latch, nextStep } = flushMineButtonLatch(
      plansButtonLatchRef.current,
      plansIndexRef.current,
      deckRows.length
    );
    plansButtonLatchRef.current = latch;
    if (nextStep == null) return;
    startPlansButtonStep(nextStep);
  }, [deckRows.length, startPlansButtonStep]);

  if (plansMotionProbeCtrlRef.current) {
    plansMotionProbeCtrlRef.current.onFlightSettled = flushPlansButtonPending;
  }

  // After index settles on button dest, flush queued hops (backup if no probe).
  useEffect(() => {
    const latch = plansButtonLatchRef.current;
    if (!latch.flightActive || latch.flightDest == null) return;
    if (index !== latch.flightDest) return;
    plansButtonLatchRef.current = {
      ...latch,
      flightActive: false,
      flightDest: null,
    };
    flushPlansButtonPending();
  }, [index, flushPlansButtonPending]);

  const goPlansPrev = useCallback(() => {
    const len = deckRows.length;
    if (len <= 0) return;
    const latch = plansButtonLatchRef.current;
    if (latch.flightActive) {
      const base = latch.pendingTarget ?? plansIndexRef.current;
      const pending = Math.max(0, base - 1);
      plansButtonLatchRef.current = queueMineButtonTarget(latch, pending, len);
      return;
    }
    startPlansButtonStep(Math.max(0, plansIndexRef.current - 1));
  }, [deckRows.length, startPlansButtonStep]);

  const goPlansNext = useCallback(() => {
    const len = deckRows.length;
    if (len <= 0) return;
    const latch = plansButtonLatchRef.current;
    if (latch.flightActive) {
      const base = latch.pendingTarget ?? plansIndexRef.current;
      const pending = Math.min(len - 1, base + 1);
      plansButtonLatchRef.current = queueMineButtonTarget(latch, pending, len);
      return;
    }
    startPlansButtonStep(Math.min(len - 1, plansIndexRef.current + 1));
  }, [deckRows.length, startPlansButtonStep]);

  const canPlansGoPrev = !controlsLocked && index > 0;
  const canPlansGoNext = !controlsLocked && index < deckRows.length - 1;

  const setPhotoIndexFor = useCallback(
    (opportunityId: string, nextIndex: number) => {
      patchScope({
        photoIndexById: {
          ...photoIndexById,
          [opportunityId]: nextIndex,
        },
      });
    },
    [patchScope, photoIndexById]
  );

  const handleImDown = useCallback(async () => {
    if (!current || controlsLocked) return;
    if (current.my_request_status === "pending") return;
    const id = current.opportunity_id;
    setBusyId(id);
    try {
      const request = await requestOpenPlan(id, {
        identityVisibleToHost: true,
      });
      const status = String(request.status ?? "");
      if (status === "pending") {
        patchRequestStatus(id, "pending");
      } else if (status === "accepted") {
        onRemoveCandidate(id);
        toast(peopleUiCopy.openPlansAlreadyAccepted);
      } else {
        onRemoveCandidate(id);
        void refresh();
      }
    } catch {
      toast.error(peopleUiCopy.openPlansRequestError);
    } finally {
      setBusyId(null);
    }
  }, [
    controlsLocked,
    current,
    onRemoveCandidate,
    patchRequestStatus,
    refresh,
  ]);

  const handleWithdraw = useCallback(async () => {
    if (!current || controlsLocked) return;
    if (current.my_request_status !== "pending") return;
    const id = current.opportunity_id;
    setBusyId(id);
    try {
      const request = await withdrawOpenPlanRequest(id);
      const status = String(request.status ?? "");
      if (status === "closed") {
        onRemoveCandidate(id);
      } else if (status === "withdrawn") {
        patchRequestStatus(id, null);
      } else {
        void refresh();
      }
    } catch {
      toast.error(peopleUiCopy.openPlansWithdrawError);
    } finally {
      setBusyId(null);
    }
  }, [
    controlsLocked,
    current,
    onRemoveCandidate,
    patchRequestStatus,
    refresh,
  ]);

  const pending = current?.my_request_status === "pending";
  const actionBusy = busyId === current?.opportunity_id;

  useEffect(() => {
    if (!onPrimaryActionChange) return;
    const state = resolveOpenPlanShellActionState({
      hasCurrent: Boolean(current),
      pending: Boolean(pending),
    });
    if (state.labelKey === "none") {
      onPrimaryActionChange({
        label: peopleUiCopy.openPlansImDown,
        onPress: () => {},
        disabled: true,
        tone: "muted",
        icon: state.icon,
      });
    } else if (state.labelKey === "withdraw") {
      onPrimaryActionChange({
        label: peopleUiCopy.openPlansWithdraw,
        onPress: () => {
          void handleWithdraw();
        },
        disabled: actionBusy,
        busy: actionBusy,
        tone: state.tone,
        icon: state.icon,
      });
    } else {
      onPrimaryActionChange({
        label: peopleUiCopy.openPlansImDown,
        onPress: () => {
          void handleImDown();
        },
        disabled: !current || actionBusy,
        busy: actionBusy,
        tone: state.tone,
        icon: state.icon,
      });
    }
  }, [
    actionBusy,
    current,
    handleImDown,
    handleWithdraw,
    onPrimaryActionChange,
    pending,
  ]);

  useEffect(() => {
    return () => onPrimaryActionChange?.(null);
  }, [onPrimaryActionChange]);

  useEffect(() => {
    if (!onAtmosphereIdentityKeyChange) return;
    if (!current) {
      onAtmosphereIdentityKeyChange(null);
      return;
    }
    onAtmosphereIdentityKeyChange(current.opportunity_id);
  }, [current, onAtmosphereIdentityKeyChange]);

  useEffect(() => {
    return () => onAtmosphereIdentityKeyChange?.(null);
  }, [onAtmosphereIdentityKeyChange]);

  if (loading && !hasLoaded && deckRows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60">
        Loading…
      </div>
    );
  }

  if (error && deckRows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[var(--text)]/70">
          {peopleUiCopy.deckLoadError}
        </p>
        <button
          type="button"
          className={secondaryControlClass}
          onClick={() => void refresh()}
        >
          {peopleUiCopy.deckRetryLoad}
        </button>
      </div>
    );
  }

  if (
    hasLoaded &&
    deckRows.length === 0 &&
    (hasMore || loadMoreInFlight)
  ) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60">
        Loading…
      </div>
    );
  }

  if (
    isTrueCaughtUpState({
      visibleCount: deckRows.length,
      hasLoaded,
      hasMore,
      loadMoreInFlight,
    })
  ) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60">
        {peopleUiCopy.openPlansEmpty}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {deckRows.length > 0 ? (
        <MineEdgeNavCards
          canGoPrev={canPlansGoPrev}
          canGoNext={canPlansGoNext}
          onPrev={goPlansPrev}
          onNext={goPlansNext}
          fixedRailsGeometry
          cardsRef={
            plansRealIncomingEnabled ? plansEdgeNavCardsRef : undefined
          }
        />
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <MatchDeckCarousel
          index={index}
          onIndexChange={goToIndex}
          locked={controlsLocked}
          layout="duo"
          duoInFlowChrome
          duoPresentation="mine"
          mineMotionProbeRef={
            plansRealIncomingEnabled ? plansMotionProbeCtrlRef : undefined
          }
          mineProxyProgrammaticPrepareRef={plansPrepareRef}
          mineEdgeNavCardsRef={
            plansRealIncomingEnabled ? plansEdgeNavCardsRef : undefined
          }
          items={deckRows}
          renderItem={(item, meta) => {
            const row = item as OpenPlanCandidate;
            return (
              <PeopleOpenPlanCandidateSlide
                candidate={row}
                identitySource={identitySourceFor(row)}
                photoIndex={photoIndexById[row.opportunity_id] ?? 0}
                onPhotoIndexChange={(next) =>
                  setPhotoIndexFor(row.opportunity_id, next)
                }
                isCurrent={meta.isCurrent}
                withPhoto={meta.withPhoto}
                neighborSide={meta.neighborSide}
                onAtmosphereChange={onAtmosphereChange}
              />
            );
          }}
        />
      </div>
    </div>
  );
}
