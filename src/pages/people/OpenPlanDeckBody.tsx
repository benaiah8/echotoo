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
import { useCreateChooser } from "../../context/CreateChooserContext";
import PeopleDeckEmptyCard from "../../components/people/PeopleDeckEmptyCard";
import type { MatchDeckScopeSnapshot } from "../../lib/matchDeckSession";
import {
  PEOPLE_DECK_PREFETCH_REMAINING,
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
import type { OpenPlanCandidate } from "../../lib/people/types";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import PeopleFeedList from "../../components/people/PeopleFeedList";
import PeopleOpenPlanFeedCard from "../../components/people/PeopleOpenPlanFeedCard";
import PeoplePlansGroupsFeedSkeleton from "../../components/people/PeoplePlansGroupsFeedSkeleton";
import { peopleFeedContentTopPad } from "../../lib/people/peopleFeedLayout";
import OpenPlanRequestNoteComposer, {
  classifyOpenPlanRequestStatus,
  emitOpenPlanComposerToast,
  openOpenPlanRequestComposer,
  openPlanHeartIntent,
  openPlanRequestComposerStillValid,
  runOpenPlanRequestSubmit,
  type OpenPlanRequestComposerContext,
  type OpenPlanRequestComposerState,
} from "../../components/people/OpenPlanRequestNoteComposer";
import { peopleUiCopy } from "./peopleUiCopy";
import { resolveOpenPlanShellActionState } from "./peopleShellPrimaryAction";
import type { PeopleShellPrimaryAction } from "./peopleShellPrimaryAction";
import { formatOpenPlanSchedule } from "../../lib/openPlanSchedule";
import { getPostScheduleLabel } from "../../lib/postScheduleLabel";
import {
  peopleDebugBumpRender,
  peopleDebugRecord,
  peopleDebugSetContext,
} from "../../lib/people/peopleDeckDebug";

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

/** Privacy-safe composer snapshot — never includes a host display name. */
function composerContextFromRow(
  row: OpenPlanCandidate
): OpenPlanRequestComposerContext {
  const scheduleLabel = row.occurs_at
    ? formatOpenPlanSchedule(
        row.occurs_at,
        row.occurs_time_explicit !== false
      ) || null
    : null;
  const scheduleLabelKind = row.occurs_at
    ? getPostScheduleLabel({
        type: "hangout",
        createdAt: row.occurs_at,
        selectedDates: [row.occurs_at],
      }).kind
    : null;
  return {
    identitySource: identitySourceFor(row),
    caption: row.source_caption?.trim() || null,
    scheduleLabel,
    scheduleLabelKind,
    feedNeutralEchoSeed: row.opportunity_id,
  };
}

export default function OpenPlanDeckBody({
  deck,
  scopeSnap,
  patchScope,
  onRemoveCandidate,
  onPrimaryActionChange,
  authUserId = null,
  seenEpoch = 0,
  onSeenMarked,
}: {
  deck: UseOpenPlanCandidatesResult;
  scopeSnap: MatchDeckScopeSnapshot;
  patchScope: (patch: Partial<MatchDeckScopeSnapshot>) => void;
  /** Single shared removal path: hook remove + removedIds. */
  onRemoveCandidate: (opportunityId: string) => void;
  onPrimaryActionChange?: (action: PeopleShellPrimaryAction | null) => void;
  authUserId?: string | null;
  /** Shared People deck seen-history epoch (bumps on mark). */
  seenEpoch?: number;
  onSeenMarked?: () => void;
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

  const { enterCreateAsDefaultPost } = useCreateChooser();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composer, setComposer] = useState<OpenPlanRequestComposerState | null>(
    null
  );
  const submitFlightRef = useRef(false);
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
  const plansSeenIds = useMemo(() => {
    void seenEpoch;
    if (!authUserId) return new Set<string>();
    return getPairUpSeenOpportunityIdSet(authUserId, "open_plans");
  }, [authUserId, seenEpoch]);
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

  useEffect(() => {
    if (!composer || submitFlightRef.current) return;
    if (!openPlanRequestComposerStillValid(composer, deckRows)) {
      setComposer(null);
    }
  }, [composer, deckRows]);

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

    if (
      authUserId &&
      snap.activeOrderedIds.length === 0 &&
      !isPeopleDeckSeenBootstrapReady(authUserId, "open_plans")
    ) {
      return;
    }

    const eligibleOrdered = sourceRows
      .map((row) => row.opportunity_id)
      .filter(Boolean);
    const nextActive = rebuildPairUpActiveOrderedIds({
      eligibleOrdered,
      previousActive: snap.activeOrderedIds,
      currentId: snap.currentOpportunityId,
      seenIds: plansSeenIds,
      retiredIds: snap.retiredIds,
    });

    let nextCurrent = snap.currentOpportunityId;
    if (nextCurrent && !eligibleIds.has(nextCurrent)) {
      nextCurrent = resolveNearestOpportunityId(
        preOrder,
        eligibleIds,
        nextCurrent
      );
    } else if (nextCurrent == null && nextActive.length > 0) {
      nextCurrent =
        snap.activeOrderedIds.length === 0
          ? firstUnseenOpportunityId(nextActive, plansSeenIds)
          : (nextActive[0] ?? null);
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
  }, [authUserId, patchScope, plansSeenIds, seenEpoch, sourceRows]);

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
    const allLoadedSeen =
      deckRows.length > 0 &&
      deckRows.every((row) => plansSeenIds.has(row.opportunity_id));
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
      deck: "openPlanDeckBody",
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
    deckRows,
    hasMore,
    index,
    loadMore,
    loadMoreInFlight,
    plansSeenIds,
  ]);

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

  const openRequestComposer = useCallback(
    (opportunityId: string) => {
      if (submitFlightRef.current) return;
      const row = deckRows.find((r) => r.opportunity_id === opportunityId);
      if (!row) return;
      const context = composerContextFromRow(row);
      setComposer((prev) =>
        openOpenPlanRequestComposer(prev, opportunityId, context)
      );
    },
    [deckRows]
  );

  const submitOpenPlanRequest = useCallback(
    async (id: string, draft: string) => {
      const outcome = await runOpenPlanRequestSubmit({
        flight: submitFlightRef,
        opportunityId: id,
        draft,
        request: (id, options) =>
          requestOpenPlan(id, {
            identityVisibleToHost: true,
            note: options.note,
          }),
        onStart: () => setBusyId(id),
      });
      if (outcome.status === "skipped") return;
      try {
        const toastCopy = {
          accepted: peopleUiCopy.openPlansAlreadyAccepted,
          error: peopleUiCopy.openPlansRequestError,
        };
        const notify = {
          info: (message: string) => {
            toast(message);
          },
          accepted: (message: string) => {
            toast(message);
          },
          error: (message: string) => {
            toast.error(message);
          },
        };
        if (outcome.status === "error") {
          emitOpenPlanComposerToast("error", notify, toastCopy);
          return;
        }
        const status = String(outcome.result.status ?? "");
        const kind = classifyOpenPlanRequestStatus(status);
        if (kind === "pending") {
          patchRequestStatus(id, "pending");
          emitOpenPlanComposerToast("pending", notify, toastCopy);
        } else if (kind === "accepted") {
          onRemoveCandidate(id);
          emitOpenPlanComposerToast("accepted", notify, toastCopy);
        } else {
          onRemoveCandidate(id);
          void refresh();
          emitOpenPlanComposerToast("refresh", notify, toastCopy);
        }
        setComposer(null);
      } finally {
        setBusyId(null);
      }
    },
    [onRemoveCandidate, patchRequestStatus, refresh]
  );

  const handleImDown = useCallback(() => {
    if (!current || controlsLocked) return;
    if (current.my_request_status === "pending") return;
    openRequestComposer(current.opportunity_id);
  }, [controlsLocked, current, openRequestComposer]);

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

  const listTopChromePad = peopleFeedContentTopPad();

  if (loading && !hasLoaded && deckRows.length === 0) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: listTopChromePad }}
        data-people-open-plans-initial-loading="true"
        data-people-feed-out-of-list-chrome="true"
      >
        <PeoplePlansGroupsFeedSkeleton variant="initial" surface="plans" />
      </div>
    );
  }

  if (error && deckRows.length === 0) {
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
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--text)]/60"
        style={{ paddingTop: listTopChromePad }}
        data-people-feed-out-of-list-chrome="true"
      >
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
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: listTopChromePad }}
        data-people-feed-out-of-list-chrome="true"
      >
        <PeopleDeckEmptyCard
          kind="plans"
          title={peopleUiCopy.openPlansEmpty}
          body={peopleUiCopy.openPlansEmptyBody}
          ctaLabel={peopleUiCopy.openPlansEmptyCta}
          onCta={() => enterCreateAsDefaultPost()}
        />
      </div>
    );
  }

  const handlePlansHeart = async (row: OpenPlanCandidate) => {
    if (controlsLocked) return;
    const id = row.opportunity_id;
    if (busyId === id) return;
    if (row.my_request_status === "pending") {
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
      return;
    }
    if (openPlanHeartIntent(row.my_request_status) === "compose") {
      openRequestComposer(id);
    }
  };

  return (
    <>
    <PeopleFeedList
      topChromePad={listTopChromePad}
      orderedIds={deckRows.map((r) => r.opportunity_id)}
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
      onRowVisible={(opportunityId) => {
        if (!authUserId || !opportunityId) return;
        markLocalPeopleDeckSeenAndEnqueue(authUserId, "open_plans", opportunityId);
        onSeenMarked?.();
      }}
      focusedId={current?.opportunity_id ?? null}
      onFocusedIdChange={(id) => {
        patchScope({ currentOpportunityId: id });
      }}
      scrollToId={scopeSnap.currentOpportunityId}
    >
      {deckRows.map((row) => {
        const pendingRow = row.my_request_status === "pending";
        const busy = busyId === row.opportunity_id;
        const scheduleLabel = row.occurs_at
          ? formatOpenPlanSchedule(
              row.occurs_at,
              row.occurs_time_explicit !== false
            ) || null
          : null;
        return (
          <PeopleOpenPlanFeedCard
            key={row.opportunity_id}
            opportunityId={row.opportunity_id}
            identitySource={identitySourceFor(row)}
            feedNeutralEchoSeed={row.opportunity_id}
            photoIndex={photoIndexById[row.opportunity_id] ?? 0}
            onPhotoIndexChange={(next) =>
              setPhotoIndexFor(row.opportunity_id, next)
            }
            isCurrent={row.opportunity_id === current?.opportunity_id}
            caption={row.source_caption}
            scheduleLabel={scheduleLabel}
            note={row.description?.trim() || null}
            isUnseen={!plansSeenIds.has(row.opportunity_id)}
            heartLabel={
              pendingRow
                ? peopleUiCopy.openPlansWithdraw
                : peopleUiCopy.openPlansImDown
            }
            heartState={
              busy ? "busy" : pendingRow ? "pending" : "idle"
            }
            onHeart={() => {
              void handlePlansHeart(row);
            }}
          />
        );
      })}
    </PeopleFeedList>
    {composer ? (
      <OpenPlanRequestNoteComposer
        open
        draft={composer.draft}
        busy={busyId != null && busyId === composer.opportunityId}
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
          emitOpenPlanComposerToast(
            "cancel",
            {
              info: (message) => {
                toast(message);
              },
              accepted: (message) => {
                toast(message);
              },
              error: (message) => {
                toast.error(message);
              },
            },
            {
              accepted: peopleUiCopy.openPlansAlreadyAccepted,
              error: peopleUiCopy.openPlansRequestError,
            }
          );
        }}
        onDismiss={() => {
          if (submitFlightRef.current) return;
          setComposer(null);
        }}
        onSubmit={(draft) => {
          void submitOpenPlanRequest(composer.opportunityId, draft);
        }}
      />
    ) : null}
    </>
  );
}
