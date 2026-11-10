/**
 * Profile social-opportunity card — Home Event-rail geometry.
 * One card per source_post_id.
 * Own: manage/create via shared Duo + Group pills.
 * Other: Heart (Profile Connect) + Comment (Duo composer). Group-only rows
 * render both disabled. Duo/Group participation stays on Post Detail.
 * No source cover image (avoids Profile-rail image egress).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PiDotsThreeBold } from "react-icons/pi";
import {
  completePairUpMatch,
  expressPairUpInterest,
} from "../../api/services/pairUp";
import { connectProfilePairUp } from "../../api/services/profileSocialOpportunities";
import type { ProfileSocialOpportunity } from "../../lib/people/types";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import { navigateToPostDetailInApp } from "../../lib/navigateToPostDetailInApp";
import { getPostScheduleLabel } from "../../lib/postScheduleLabel";
import {
  getPostScheduleLabelClasses,
  railScheduleLabelUsesPill,
} from "../../lib/postScheduleLabelStyles";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import { resolvePhotoPromptOffer } from "../../lib/peoplePhotoPromptPolicy";
import { openPairUpPhotoPrompt } from "../../lib/pairUpPhotoPromptStore";
import { isPeoplePhotoPromptBypassed } from "../../lib/peoplePhotoPromptSession";
import {
  PAIR_UP_CONNECT_PHOTO_PROMPT_DESCRIPTION,
  PAIR_UP_CONNECT_PHOTO_PROMPT_TITLE,
} from "../../lib/pairUpPhotoPromptCopy";
import { showPairUpJoinToast } from "../../lib/showPairUpJoinToast";
import { showProfileConnectToast } from "../../lib/showProfileConnectToast";
import {
  seedKnownActiveGroupUpBeforeDetail,
} from "../../lib/groupUpOwnStore";
import {
  seedKnownActivePairUpBeforeDetail,
  setOptimisticPairUpJoinState,
} from "../../lib/pairUpJoinStore";
import {
  patchCachedProfileSocialOpportunity,
  invalidateProfileSocialOpportunities,
} from "../../lib/profileSocialOpportunityCache";
import {
  logPeopleConnectFailureDev,
  peopleConnectUserToastKind,
  type PeopleConnectRpcName,
} from "../../lib/people/peopleConnectHardening";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  retryProfileMatchCompletion,
  settleProfileConnect,
} from "../../lib/profileConnectCompletion";
import { messagesConversationPath } from "../../router/Paths";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import ReportModal from "../ui/ReportModal";
import type { ReportDraft } from "../../types/report";
import { openPairUpManage } from "../../lib/pairUpActiveOverlayStore";
import {
  openGroupUpManage,
  type GroupUpSourceScheduleContext,
} from "../../lib/groupUpActiveOverlayStore";
import {
  getPairUpJoinStatus,
  requestPairUpJoinState,
  subscribePairUpJoinState,
} from "../../lib/pairUpJoinStore";
import { useDuoSocialAction } from "../../hooks/useDuoSocialAction";
import { useGroupSocialAction } from "../../hooks/useGroupSocialAction";
import SocialDuoPill from "../social/SocialDuoPill";
import SocialGroupPill from "../social/SocialGroupPill";
import { SocialShelfSurfaceProvider } from "../../lib/social/socialShelfSurfaceContext";
import {
  socialContrastShelfClusterClassName,
  socialRailBareRowClassName,
} from "../../lib/socialActionUi";
import PeopleActionStateButton, {
  type PeopleActionConfirmedState,
} from "../people/PeopleActionStateButton";
import "./ProfileSocialOpportunityActions.css";
import { openPeopleCommentComposer } from "../../lib/people/peopleCommentComposerStore";
import { routeDuoCommentTap, resolveActivatedDuoComment } from "../../lib/people/duoCommentActions";
import {
  applyDuoCommentListFlags,
  duoCommentStateKey,
  duoCommentVisual,
  getDuoCommentRevision,
  getDuoCommentSnapshot,
  getDuoCommentViewerId,
  subscribeDuoCommentState,
} from "../../lib/people/duoCommentState";
import Avatar from "../ui/Avatar";

/** Home Event rail date row footprint. */
const RAIL_LABEL_ROW_CLASS =
  "flex h-[26px] w-full min-w-0 items-center justify-center";

const DATE_PILL_FACE_CLASS =
  "inline-flex h-full w-full min-w-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap text-center text-[9px] leading-none";

const DATE_PILL_LIFT_CLASS =
  "shadow-[var(--rail-card-pill-shadow)] backdrop-blur-[var(--glass-blur)]";

export default function ProfileSocialOpportunityCard({
  row,
  profileUserId,
  viewerUserId,
  profileIdentity = null,
}: {
  row: ProfileSocialOpportunity;
  profileUserId: string;
  viewerUserId: string | null;
  /** Other Profile owner. Comment recipient identity. Own Profile omits it. */
  profileIdentity?: ProfileIdentityMediaSource | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ensureAuthed } = useAuthActionGate();
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [pendingMatchOpportunityId, setPendingMatchOpportunityId] = useState<
    string | null
  >(null);
  const completeFlightRef = useRef(false);

  const duoPayload = row.duo;
  const groupPayload = row.group;
  const hasOwnerDuo = duoPayload != null;
  const hasOwnerGroup = groupPayload != null;
  const viewerDuoJoined = duoPayload?.viewer_duo_joined === true;
  const viewerProfileConnected =
    duoPayload?.viewer_profile_connected === true;
  const heartActive =
    duoPayload?.viewer_duo_interested === true || viewerProfileConnected;
  const groupTitle = groupPayload?.group_title ?? null;
  const occursAt = groupPayload?.occurs_at ?? null;
  const occursTimeExplicit = groupPayload?.occurs_time_explicit ?? null;

  const sourceSchedule = useMemo((): GroupUpSourceScheduleContext | null => {
    if (row.source_type !== "hangout" && row.source_type !== "experience") {
      return null;
    }
    return {
      postType: row.source_type,
      isRecurring: row.source_is_recurring,
      selectedDates: row.source_selected_dates,
      recurrenceDays: row.source_recurrence_days,
    };
  }, [row]);

  const duoAction = useDuoSocialAction({
    postId: row.source_post_id,
    postType: row.source_type,
    post: null,
    origin: "unavailable",
  });
  const groupAction = useGroupSocialAction({
    postId: row.source_post_id,
    postType: row.source_type,
    post: null,
    sourceCaption: row.source_caption,
    sourceSchedule,
  });

  const pairStatus = useSyncExternalStore(subscribePairUpJoinState, () =>
    getPairUpJoinStatus(row.source_post_id)
  );

  useEffect(() => {
    requestPairUpJoinState(row.source_post_id);
  }, [row.source_post_id]);

  const schedule = useMemo(() => {
    if (occursAt) {
      const label = formatSocialOccursSchedule(
        occursAt,
        occursTimeExplicit !== false
      );
      return {
        label: label || peopleUiCopy.groupUpNoDateSet,
        kind: "in_days" as const,
        highlight: false,
      };
    }
    return getPostScheduleLabel({
      type: row.source_type,
      createdAt: row.created_at,
      selectedDates: row.source_selected_dates,
      isRecurring: row.source_is_recurring,
      recurrenceDays: row.source_recurrence_days,
    });
  }, [occursAt, occursTimeExplicit, row]);

  const caption =
    row.source_caption?.trim() ||
    (row.source_type === "hangout" ? "Event" : "Post");

  const authorName =
    row.source_author_display_name?.trim() ||
    row.source_author_username?.trim() ||
    "User";

  const isSelf =
    !!viewerUserId && !!profileUserId && viewerUserId === profileUserId;

  const duoJoined =
    pairStatus === "joined" ||
    (pairStatus === "pending" && viewerDuoJoined);

  const duoCommentRevision = useSyncExternalStore(
    subscribeDuoCommentState,
    getDuoCommentRevision,
    getDuoCommentRevision
  );
  const duoCommentViewerId = getDuoCommentViewerId();
  const commentKey =
    !isSelf && hasOwnerDuo && duoCommentViewerId
      ? duoCommentStateKey(
          duoCommentViewerId,
          row.source_post_id,
          profileUserId
        )
      : "";

  useEffect(() => {
    if (isSelf || !hasOwnerDuo || !duoCommentViewerId) return;
    applyDuoCommentListFlags({
      viewerId: duoCommentViewerId,
      sourcePostId: row.source_post_id,
      recipientUserId: profileUserId,
      commented: null,
      viewerHasActivePairUp: viewerDuoJoined,
    });
    void resolveActivatedDuoComment({
      viewerId: duoCommentViewerId,
      sourcePostId: row.source_post_id,
      recipientUserId: profileUserId,
      listCommented: null,
    });
  }, [
    isSelf,
    hasOwnerDuo,
    duoCommentViewerId,
    row.source_post_id,
    profileUserId,
    viewerDuoJoined,
  ]);

  const clearProfilePairActionState = useCallback(() => {
    if (!viewerUserId || !duoPayload) return;
    patchCachedProfileSocialOpportunity(
      viewerUserId,
      profileUserId,
      duoPayload.opportunity_id,
      {
        viewer_duo_joined: false,
        viewer_duo_interested: false,
        viewer_profile_connected: false,
      }
    );
  }, [viewerUserId, profileUserId, duoPayload]);


  const openDetail = useCallback(() => {
    if (viewerUserId) {
      if (duoPayload) {
        seedKnownActivePairUpBeforeDetail(viewerUserId, row.source_post_id);
      }
      if (groupPayload) {
        seedKnownActiveGroupUpBeforeDetail(viewerUserId, row.source_post_id);
      }
    }
    navigateToPostDetailInApp(
      navigate,
      location,
      row.source_type,
      row.source_post_id
    );
  }, [
    navigate,
    location,
    row.source_post_id,
    row.source_type,
    viewerUserId,
    duoPayload,
    groupPayload,
  ]);

  const handleOwnDuo = useCallback(() => {
    if (!ensureAuthed()) return;
    // Hosted Own Duo only — never reopen Manage from stale duoAction.active.
    if (hasOwnerDuo) {
      openPairUpManage(row.source_post_id);
      return;
    }
    void duoAction.onPress();
  }, [ensureAuthed, hasOwnerDuo, duoAction, row.source_post_id]);

  const handleOwnGroup = useCallback(() => {
    if (!ensureAuthed()) return;
    // Hosted Own Group only — ignore stale ownsActive after cancel.
    if (hasOwnerGroup) {
      openGroupUpManage(
        row.source_post_id,
        groupTitle || row.source_caption,
        sourceSchedule,
        {
          opportunityId: groupPayload?.opportunity_id ?? null,
        }
      );
      return;
    }
    groupAction.onPress();
  }, [
    ensureAuthed,
    hasOwnerGroup,
    groupAction,
    row.source_post_id,
    row.source_caption,
    groupTitle,
    sourceSchedule,
    groupPayload?.opportunity_id,
  ]);

  const markProfileInterestOnly = useCallback(
    (opportunityId: string) => {
      if (!viewerUserId) return;
      patchCachedProfileSocialOpportunity(
        viewerUserId,
        profileUserId,
        opportunityId,
        {
          viewer_duo_joined: true,
          viewer_duo_interested: true,
          viewer_profile_connected: true,
        }
      );
    },
    [viewerUserId, profileUserId]
  );

  const markProfileConnected = useCallback(
    (opportunityId: string) => {
      if (!viewerUserId) return;
      patchCachedProfileSocialOpportunity(
        viewerUserId,
        profileUserId,
        opportunityId,
        {
          viewer_duo_joined: true,
          viewer_duo_interested: true,
          viewer_profile_connected: true,
        }
      );
    },
    [viewerUserId, profileUserId]
  );

  const runComplete = useCallback(
    async (opportunityId: string): Promise<boolean> => {
      if (completeFlightRef.current) return false;
      completeFlightRef.current = true;
      setConnectBusy(true);
      try {
        const settled = await retryProfileMatchCompletion({
          opportunityId,
          complete: completePairUpMatch,
          markConnected: () => markProfileConnected(opportunityId),
        });
        if (!settled.ok) {
          setPendingMatchOpportunityId(settled.opportunityId);
          toast.error(peopleUiCopy.deckCompleteError);
          return false;
        }
        setPendingMatchOpportunityId(null);
        navigate(messagesConversationPath(settled.completion.conversation_id), {
          state: { fromPeopleMatch: true },
        });
        return true;
      } finally {
        completeFlightRef.current = false;
        setConnectBusy(false);
      }
    },
    [markProfileConnected, navigate]
  );

  const handleConnect = useCallback(async () => {
    if (!ensureAuthed()) return;
    if (connectBusy || !viewerUserId || isSelf || !duoPayload) return;
    if (pendingMatchOpportunityId) {
      await runComplete(pendingMatchOpportunityId);
      return;
    }
    if (heartActive) return;

    const duoOppId = duoPayload.opportunity_id;

    const runConnect = async () => {
      setConnectBusy(true);
      const alreadyInPool = duoJoined || viewerDuoJoined;
      const joinOptimistic = alreadyInPool
        ? null
        : setOptimisticPairUpJoinState(row.source_post_id, true);
      try {
        const result = alreadyInPool
          ? await expressPairUpInterest(duoOppId)
          : await connectProfilePairUp(duoOppId, {
              profileOwnerUserId: profileUserId,
            });

        const settled = await settleProfileConnect({
          matched: result.matched,
          opportunityId: duoOppId,
          markInterestOnly: () => markProfileInterestOnly(duoOppId),
          markConnected: () => markProfileConnected(duoOppId),
          complete: async (opportunityId) => {
            if (completeFlightRef.current) {
              throw new Error("Match completion already in progress");
            }
            completeFlightRef.current = true;
            try {
              return await completePairUpMatch(opportunityId);
            } finally {
              completeFlightRef.current = false;
            }
          },
        });

        if (settled.status === "needs_retry") {
          setPendingMatchOpportunityId(settled.opportunityId);
          toast.error(peopleUiCopy.deckCompleteError);
          return;
        }

        if (settled.status === "completed") {
          setPendingMatchOpportunityId(null);
          navigate(
            messagesConversationPath(settled.completion.conversation_id),
            { state: { fromPeopleMatch: true } }
          );
          return;
        }

        showProfileConnectToast({
          opportunityId: duoOppId,
          sourcePostId: row.source_post_id,
          onLeft: clearProfilePairActionState,
        });
      } catch (err) {
        joinOptimistic?.();
        logPeopleConnectFailureDev({
          rpc: (alreadyInPool
            ? "express_pair_up_interest"
            : "connect_profile_pair_up") as PeopleConnectRpcName,
          err,
          opportunityId: duoOppId,
          sourcePostId: row.source_post_id,
          scope: "profile",
        });
        const toastKind = peopleConnectUserToastKind(err);
        toast.error(
          toastKind === "stale"
            ? peopleUiCopy.deckConnectUnavailable
            : peopleUiCopy.deckExpressError
        );
        if (toastKind === "stale") {
          invalidateProfileSocialOpportunities(viewerUserId, profileUserId);
        }
      } finally {
        setConnectBusy(false);
      }
    };

    if (isPeoplePhotoPromptBypassed()) {
      await runConnect();
      return;
    }

    const profile = resolvePhotoPromptOffer(
      viewerUserId,
      "people_connect",
      false
    );
    if (!profile) {
      await runConnect();
      return;
    }

    setConnectBusy(true);
    const opened = openPairUpPhotoPrompt({
      intentKey: `connect:${duoOppId}:profile`,
      profileId: profile.profileId,
      userId: profile.userId,
      photos: profile.photos,
      title: PAIR_UP_CONNECT_PHOTO_PROMPT_TITLE,
      description: PAIR_UP_CONNECT_PHOTO_PROMPT_DESCRIPTION,
      onContinue: () => {
        void runConnect();
      },
      onDismiss: () => {
        setConnectBusy(false);
      },
    });
    if (!opened) {
      await runConnect();
    }
  }, [
    ensureAuthed,
    connectBusy,
    viewerUserId,
    isSelf,
    heartActive,
    pendingMatchOpportunityId,
    markProfileInterestOnly,
    markProfileConnected,
    duoJoined,
    viewerDuoJoined,
    duoPayload,
    row,
    profileUserId,
    runComplete,
    clearProfilePairActionState,
    navigate,
  ]);

  const handleComment = useCallback(() => {
    if (!ensureAuthed()) return;
    if (isSelf || !hasOwnerDuo || !duoPayload || !viewerUserId) return;
    const recipientUserId = profileUserId.trim();
    const sourcePostId = row.source_post_id.trim();
    if (!recipientUserId || !sourcePostId || !profileIdentity) {
      toast.error(peopleUiCopy.commentComposerUnavailable);
      return;
    }
    const displayName =
      profileIdentity.display_name?.trim() ||
      profileIdentity.username?.trim() ||
      "Someone";
    const identity = {
      surface: "duo" as const,
      opportunityId: duoPayload.opportunity_id,
      sourcePostId,
      recipientUserId,
      displayName,
      identitySource: profileIdentity,
      caption: row.source_caption,
      scheduleLabel: schedule.label || null,
      scheduleLabelKind: schedule.kind,
      sourceType: row.source_type,
    };
    const openWritable = () => {
      openPeopleCommentComposer({
        ...identity,
        expressedByMe: false,
      });
    };
    void routeDuoCommentTap({
      rowCommented: null,
      identity,
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
  }, [
    ensureAuthed,
    isSelf,
    hasOwnerDuo,
    duoPayload,
    viewerUserId,
    profileUserId,
    profileIdentity,
    row.source_post_id,
    row.source_caption,
    row.source_type,
    schedule.label,
    schedule.kind,
  ]);

  const datePillLabel = schedule.label;
  const railLabelClassName = getPostScheduleLabelClasses(schedule.kind, "rail");
  const usesDatePill = railScheduleLabelUsesPill(schedule.kind);

  const dateLabelClassName = [
    DATE_PILL_FACE_CLASS,
    usesDatePill
      ? ["rounded-full border px-2.5 font-medium", DATE_PILL_LIFT_CLASS, railLabelClassName].join(
          " "
        )
      : railLabelClassName,
  ].join(" ");

  // Own Profile hosted pills follow rail payload only — never stale join/own stores.
  const ownDuoActive = hasOwnerDuo;
  const ownGroupActive = hasOwnerGroup;
  // Profile row.group ⇒ discoverable hosted Group ⇒ count truth ≥ 1.
  const ownGroupDisplayCount = hasOwnerGroup
    ? (groupAction.displayCount ?? 1)
    : groupAction.displayCount;

  const heartConfirmedRef = useRef<PeopleActionConfirmedState>("idle");
  const heartButtonState = !hasOwnerDuo
    ? "disabled"
    : connectBusy
      ? "pending"
      : heartActive
        ? "active"
        : "idle";
  if (heartButtonState === "active") {
    heartConfirmedRef.current = "active";
  } else if (heartButtonState === "idle" || heartButtonState === "disabled") {
    heartConfirmedRef.current = "idle";
  }
  const heartAriaLabel = heartActive
    ? peopleUiCopy.deckConnectedLabel
    : pendingMatchOpportunityId
      ? peopleUiCopy.deckRetryComplete
      : peopleUiCopy.deckConnectLabel;

  const commentSnapshot = commentKey
    ? getDuoCommentSnapshot(commentKey)
    : null;
  void duoCommentRevision;
  const commentVisual = !hasOwnerDuo
    ? {
        state: "disabled" as const,
        confirmedState: "idle" as const,
        disabled: true,
      }
    : duoCommentVisual({
        snapshot: commentSnapshot ?? {
          state: "unknown",
          pending: false,
          body: null,
          viewerHasActivePairUp: null,
          confirmedBySend: false,
        },
        listCommented: null,
      });
  const commentPressBlocked =
    !hasOwnerDuo ||
    commentVisual.disabled ||
    commentVisual.state === "pending" ||
    commentVisual.state === "disabled";

  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openDetail();
  };

  return (
    <>
      <article
        className="relative w-[38vw] min-w-[180px] max-w-[240px] shrink-0 cursor-pointer"
        data-profile-social-card
        role="link"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={onCardKeyDown}
      >
        <div className="relative mb-3 overflow-visible rounded-[14px] border border-[var(--border)] ui-card pt-2 px-3 pb-2">
          <div className="relative z-10 flex flex-col">
            <div className={RAIL_LABEL_ROW_CLASS}>
              <span
                className={dateLabelClassName}
                data-profile-social-date-pill
              >
                {datePillLabel}
              </span>
            </div>

            <div
              className="mt-2.5 flex min-w-0 items-center gap-1.5"
              data-profile-social-author
            >
              <Avatar
                url={row.source_author_avatar_url}
                name={authorName}
                userId={row.source_author_id}
                size={24}
                className="shrink-0"
                disableInnerPointer
                tightLineBox
              />
              <span className="min-w-0 truncate text-[11px] font-normal leading-none text-[var(--text)]/70">
                {authorName}
              </span>
            </div>

            <div className="mt-2.5 text-left" data-profile-social-caption>
              <div
                className="whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--text)]/95"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  minHeight: "60px",
                }}
              >
                {caption}
              </div>
            </div>

            <div
              className="mt-2.5 flex min-w-0 items-center overflow-visible pr-8"
              data-profile-social-actions
              onClick={(e) => {
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
            >
              <SocialShelfSurfaceProvider surface="rail">
                {/*
                  Match Home rail: inline-flex cluster wraps the bare row so
                  w-full + justify-between only spans content (Duo↔Group gap-2),
                  not the full card width.
                */}
                {isSelf ? (
                  <div
                    className={socialContrastShelfClusterClassName()}
                    data-profile-social-own-actions
                  >
                    <div className={socialRailBareRowClassName()}>
                      <SocialDuoPill
                        active={ownDuoActive}
                        resolving={hasOwnerDuo ? false : duoAction.resolving}
                        onPress={handleOwnDuo}
                        size="compact"
                      />
                      <SocialGroupPill
                        displayCount={ownGroupDisplayCount}
                        active={ownGroupActive}
                        // Hosted Own Group must remain tappable while count hydrates.
                        resolving={hasOwnerGroup ? false : groupAction.resolving}
                        onPress={handleOwnGroup}
                        size="compact"
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2"
                    data-profile-social-other-actions
                  >
                    <span data-profile-social-heart>
                      <PeopleActionStateButton
                        kind="heart"
                        size={44}
                        state={heartButtonState}
                        confirmedState={heartConfirmedRef.current}
                        disabled={!hasOwnerDuo}
                        ariaLabel={heartAriaLabel}
                        onClick={() => {
                          if (!hasOwnerDuo) return;
                          void handleConnect();
                        }}
                      />
                    </span>
                    <span data-profile-social-comment>
                      <PeopleActionStateButton
                        kind="comment"
                        size={44}
                        state={commentVisual.state}
                        confirmedState={commentVisual.confirmedState}
                        disabled={commentPressBlocked && commentVisual.state !== "pending"}
                        ariaLabel="Comment"
                        onClick={() => {
                          if (commentPressBlocked) return;
                          handleComment();
                        }}
                      />
                    </span>
                  </div>
                )}
              </SocialShelfSurfaceProvider>
            </div>
          </div>

          <button
            type="button"
            aria-label="Report"
            className="absolute bottom-0 right-3 z-20 flex h-5 w-7 translate-y-1/2 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/80 px-2 shadow-lg hover:bg-[var(--surface)]/90"
            onClick={(e) => {
              e.stopPropagation();
              setReportDraft({
                reportKind: "post",
                targetPostId: row.source_post_id,
                targetOwnerUserId: row.source_author_id,
                targetOwnerProfileId: row.source_author_profile_id,
                postType: row.source_type,
              });
            }}
          >
            <PiDotsThreeBold className="text-[var(--text)]/70" size={14} />
          </button>
        </div>
      </article>

      <ReportModal
        open={reportDraft !== null}
        draft={reportDraft}
        onClose={() => setReportDraft(null)}
      />
    </>
  );
}
