/**
 * Profile social-opportunity card — Home Event-rail geometry.
 * One card per source_post_id; always shows Duo + Group.
 * Own: manage/create via shared social pills/hooks.
 * Other: viewer Duo join/leave + Connect; hosted Group Request/Requested/Member.
 * No source cover image (avoids Profile-rail image egress).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PiCheck, PiDotsThreeBold, PiHandPeace } from "react-icons/pi";
import {
  completePairUpMatch,
  expressPairUpInterest,
  joinPairUp,
  leavePairUp,
} from "../../api/services/pairUp";
import { connectProfilePairUp } from "../../api/services/profileSocialOpportunities";
import {
  requestGroupUp,
  withdrawGroupUpRequest,
} from "../../api/services/groupUp";
import type { ProfileSocialOpportunity } from "../../lib/people/types";
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
import {
  dismissProfileConnectToast,
  showProfileConnectToast,
  showProfileDisconnectedToast,
} from "../../lib/showProfileConnectToast";
import { setOptimisticPairUpJoinState } from "../../lib/pairUpJoinStore";
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
import { socialUiCopy } from "../../lib/social/socialUiCopy";
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
  socialPillActiveGlowClassName,
  socialPillExtrusionClassName,
  socialPillHitClassName,
  socialPillRippleClassName,
  socialPillStackClassName,
  socialRailBareRowClassName,
  SOCIAL_PILL_RADIUS,
  type SocialPillTone,
} from "../../lib/socialActionUi";
import Avatar from "../ui/Avatar";

/** Home Event rail date row footprint. */
const RAIL_LABEL_ROW_CLASS =
  "flex h-[26px] w-full min-w-0 items-center justify-center";

const DATE_PILL_FACE_CLASS =
  "inline-flex h-full w-full min-w-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap text-center text-[9px] leading-none";

const DATE_PILL_LIFT_CLASS =
  "shadow-[var(--rail-card-pill-shadow)] backdrop-blur-[var(--glass-blur)]";

/**
 * Compact Connect secondary control (Other + owner Duo only).
 * Kept distinct from shared yellow Duo/Group pills.
 */
function ProfileConnectPill({
  label,
  icon,
  active,
  busy,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const tone: SocialPillTone = busy
    ? "loading"
    : active
      ? "active"
      : "inactive";

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || active) return;
    onPress();
  };

  const faceBase = [
    "relative z-[1] inline-flex h-7 items-center justify-center",
    SOCIAL_PILL_RADIUS,
    "border box-border gap-0.5 px-2 text-[10px] leading-none",
    "min-w-[3.25rem]",
  ];

  const faceClass =
    tone === "active"
      ? [
          ...faceBase,
          "font-bold border-[#1a1a1c] bg-white text-[#0a0a0a]",
        ].join(" ")
      : tone === "loading"
        ? [
            ...faceBase,
            "font-semibold opacity-55 border-[#b8b8c0] bg-[#cfd0d6]",
          ].join(" ")
        : [
            ...faceBase,
            "font-semibold border-[#9a9aa2] bg-[#c8c9d0] text-[#1a1a1c]",
          ].join(" ");

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={!!active}
      aria-busy={busy === true}
      aria-disabled={busy === true || active === true}
      aria-label={label}
      disabled={busy || active}
      data-social-pill="profile-connect"
      data-profile-social-connect
      className={[
        socialPillHitClassName("shrink-0"),
        busy || active ? "pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={socialPillStackClassName()}>
        {tone === "active" ? (
          <span
            data-social-glow
            className={socialPillActiveGlowClassName()}
            aria-hidden
          />
        ) : null}
        <span
          data-social-ripple
          className={socialPillRippleClassName()}
          aria-hidden
        />
        <span
          className={
            tone === "active"
              ? socialPillExtrusionClassName("active")
              : [
                  "pointer-events-none absolute inset-0 z-0",
                  SOCIAL_PILL_RADIUS,
                  "border box-border translate-x-[-2.5px] translate-y-[2.5px]",
                  "bg-[#d8d8de] border-[#c8c8d0]",
                ].join(" ")
          }
          aria-hidden
        />
        <span data-social-face className={faceClass} aria-hidden>
          {icon ? (
            <span className="inline-flex items-center gap-0.5">
              {icon}
              <span>{label}</span>
            </span>
          ) : (
            label
          )}
        </span>
      </span>
    </button>
  );
}

/** Other Profile hosted-Group Request / Requested / Member. */
function ProfileGroupRequestPill({
  label,
  active,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  active?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tone: SocialPillTone = busy
    ? "loading"
    : disabled
      ? "disabled"
      : active
        ? "active"
        : "inactive";

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || disabled) return;
    onPress();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={!!active}
      aria-busy={busy === true}
      aria-disabled={busy === true || disabled === true}
      aria-label={label}
      disabled={busy || disabled}
      data-social-pill="profile-group-request"
      className={[
        socialPillHitClassName("shrink-0"),
        busy || disabled ? "pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={socialPillStackClassName()}>
        {tone === "active" ? (
          <span
            data-social-glow
            className={socialPillActiveGlowClassName()}
            aria-hidden
          />
        ) : null}
        <span
          data-social-ripple
          className={socialPillRippleClassName()}
          aria-hidden
        />
        <span
          className={
            tone === "active"
              ? socialPillExtrusionClassName("active")
              : [
                  "pointer-events-none absolute inset-0 z-0",
                  SOCIAL_PILL_RADIUS,
                  "border box-border translate-x-[-2.5px] translate-y-[2.5px]",
                  "bg-[#d8d8de] border-[#c8c8d0]",
                ].join(" ")
          }
          aria-hidden
        />
        <span
          data-social-face
          className={[
            "relative z-[1] inline-flex h-7 items-center justify-center",
            SOCIAL_PILL_RADIUS,
            "border box-border px-2.5 text-[10px] leading-none font-semibold",
            "min-w-[3.25rem]",
            tone === "active"
              ? "border-[#1a1a1c] bg-white text-[#0a0a0a] font-bold"
              : tone === "disabled"
                ? "opacity-40 border-[#b8b8c0] bg-[#cfd0d6]"
                : "border-[#9a9aa2] bg-[#c8c9d0] text-[#1a1a1c]",
          ].join(" ")}
          aria-hidden
        >
          {label}
        </span>
      </span>
    </button>
  );
}

export default function ProfileSocialOpportunityCard({
  row,
  profileUserId,
  viewerUserId,
}: {
  row: ProfileSocialOpportunity;
  profileUserId: string;
  viewerUserId: string | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ensureAuthed } = useAuthActionGate();
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [duoBusy, setDuoBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);

  const duoPayload = row.duo;
  const groupPayload = row.group;
  const hasOwnerDuo = duoPayload != null;
  const hasOwnerGroup = groupPayload != null;
  const viewerDuoJoined = duoPayload?.viewer_duo_joined === true;
  const viewerProfileConnected =
    duoPayload?.viewer_profile_connected === true;
  const viewerGroupState = groupPayload?.viewer_group_state ?? null;
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

  const connectActive = duoJoined && viewerProfileConnected;

  const clearProfilePairActionState = useCallback(() => {
    if (!viewerUserId || !duoPayload) return;
    patchCachedProfileSocialOpportunity(
      viewerUserId,
      profileUserId,
      duoPayload.opportunity_id,
      { viewer_duo_joined: false, viewer_profile_connected: false }
    );
  }, [viewerUserId, profileUserId, duoPayload]);

  const markProfileDuoJoined = useCallback(() => {
    if (!viewerUserId || !duoPayload) return;
    patchCachedProfileSocialOpportunity(
      viewerUserId,
      profileUserId,
      duoPayload.opportunity_id,
      { viewer_duo_joined: true }
    );
  }, [viewerUserId, profileUserId, duoPayload]);

  const restoreProfilePairActionState = useCallback(
    (state: {
      viewer_duo_joined: true;
      viewer_profile_connected: boolean;
    }) => {
      if (!viewerUserId || !duoPayload) return;
      patchCachedProfileSocialOpportunity(
        viewerUserId,
        profileUserId,
        duoPayload.opportunity_id,
        state
      );
    },
    [viewerUserId, profileUserId, duoPayload]
  );

  const openDetail = useCallback(() => {
    navigateToPostDetailInApp(
      navigate,
      location,
      row.source_type,
      row.source_post_id
    );
  }, [navigate, location, row.source_post_id, row.source_type]);

  const handleOwnDuo = useCallback(() => {
    if (!ensureAuthed()) return;
    if (hasOwnerDuo || duoAction.active) {
      openPairUpManage(row.source_post_id);
      return;
    }
    void duoAction.onPress();
  }, [ensureAuthed, hasOwnerDuo, duoAction, row.source_post_id]);

  const handleOwnGroup = useCallback(() => {
    if (!ensureAuthed()) return;
    if (hasOwnerGroup || groupAction.ownsActive) {
      openGroupUpManage(
        row.source_post_id,
        groupTitle || row.source_caption,
        sourceSchedule
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
  ]);

  const handleOtherDuo = useCallback(async () => {
    if (!ensureAuthed()) return;
    if (duoBusy || !hasOwnerDuo || !duoPayload) return;

    const duoOppId = duoPayload.opportunity_id;

    if (duoJoined) {
      const restoreConnect = connectActive;
      setDuoBusy(true);
      const revert = setOptimisticPairUpJoinState(row.source_post_id, false);
      try {
        await leavePairUp(row.source_post_id);
        clearProfilePairActionState();
        dismissProfileConnectToast(duoOppId);
        showProfileDisconnectedToast({
          opportunityId: duoOppId,
          sourcePostId: row.source_post_id,
          restoreConnect,
          onRestored: restoreProfilePairActionState,
        });
      } catch {
        revert?.();
        toast.error(peopleUiCopy.leaveError);
      } finally {
        setDuoBusy(false);
      }
      return;
    }

    setDuoBusy(true);
    const revert = setOptimisticPairUpJoinState(row.source_post_id, true);
    try {
      await joinPairUp(row.source_post_id);
      showPairUpJoinToast(row.source_post_id, {
        onLeft: clearProfilePairActionState,
      });
      markProfileDuoJoined();
      const uid = viewerUserId;
      if (uid) {
        const profile = resolvePhotoPromptOffer(uid, "pair_up_join", false);
        if (profile) {
          openPairUpPhotoPrompt({
            intentKey: `join-done:${row.source_post_id}`,
            profileId: profile.profileId,
            userId: profile.userId,
            photos: profile.photos,
            onContinue: () => {},
          });
        }
      }
    } catch {
      revert?.();
      toast.error(peopleUiCopy.joinError);
    } finally {
      setDuoBusy(false);
    }
  }, [
    ensureAuthed,
    duoBusy,
    hasOwnerDuo,
    duoPayload,
    duoJoined,
    connectActive,
    row.source_post_id,
    clearProfilePairActionState,
    restoreProfilePairActionState,
    markProfileDuoJoined,
    viewerUserId,
  ]);

  const runComplete = useCallback(
    async (opportunityId: string) => {
      try {
        const done = await completePairUpMatch(opportunityId);
        navigate(messagesConversationPath(done.conversation_id), {
          state: { fromPeopleMatch: true },
        });
      } catch {
        toast.error(peopleUiCopy.deckCompleteError);
      }
    },
    [navigate]
  );

  const handleConnect = useCallback(async () => {
    if (!ensureAuthed()) return;
    if (connectBusy || !viewerUserId || isSelf || !duoPayload) return;
    if (connectActive) return;

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

        patchCachedProfileSocialOpportunity(
          viewerUserId,
          profileUserId,
          duoOppId,
          { viewer_duo_joined: true, viewer_profile_connected: true }
        );

        if (result.matched) {
          await runComplete(duoOppId);
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
    connectActive,
    duoJoined,
    viewerDuoJoined,
    duoPayload,
    row,
    profileUserId,
    runComplete,
    clearProfilePairActionState,
  ]);

  const handleGroupRequest = useCallback(async () => {
    if (!ensureAuthed()) return;
    if (groupBusy || !viewerUserId || !groupPayload) return;

    const state = viewerGroupState ?? "none";
    if (state === "member") return;
    const groupOppId = groupPayload.opportunity_id;

    const run = async () => {
      setGroupBusy(true);
      try {
        if (state === "pending") {
          patchCachedProfileSocialOpportunity(
            viewerUserId,
            profileUserId,
            groupOppId,
            { viewer_group_state: "none", request_id: null }
          );
          await withdrawGroupUpRequest(groupOppId);
          toast.success(socialUiCopy.sourceGroupsRequestRemoved);
        } else {
          patchCachedProfileSocialOpportunity(
            viewerUserId,
            profileUserId,
            groupOppId,
            { viewer_group_state: "pending", request_id: null }
          );
          const request = await requestGroupUp(groupOppId);
          patchCachedProfileSocialOpportunity(
            viewerUserId,
            profileUserId,
            groupOppId,
            {
              viewer_group_state: "pending",
              request_id: request.id,
            }
          );
          toast.success(peopleUiCopy.groupUpRequestSentToast);
        }
      } catch {
        invalidateProfileSocialOpportunities(viewerUserId, profileUserId);
        toast.error(
          state === "pending"
            ? peopleUiCopy.groupUpBrowseWithdrawError
            : peopleUiCopy.groupUpBrowseRequestError
        );
      } finally {
        setGroupBusy(false);
      }
    };

    if (state === "pending" || isPeoplePhotoPromptBypassed()) {
      await run();
      return;
    }

    const profile = resolvePhotoPromptOffer(
      viewerUserId,
      "group_up_request",
      false
    );
    if (!profile) {
      await run();
      return;
    }

    setGroupBusy(true);
    const opened = openPairUpPhotoPrompt({
      intentKey: `group-request:${groupOppId}:profile`,
      profileId: profile.profileId,
      userId: profile.userId,
      photos: profile.photos,
      onContinue: () => {
        void run();
      },
      onDismiss: () => {
        setGroupBusy(false);
      },
    });
    if (!opened) await run();
  }, [
    ensureAuthed,
    groupBusy,
    viewerUserId,
    groupPayload,
    viewerGroupState,
    profileUserId,
  ]);

  const datePillLabel = schedule.label;
  const railLabelClassName = getPostScheduleLabelClasses(schedule.kind, "rail");
  const usesDatePill = railScheduleLabelUsesPill(schedule.kind);

  const groupPending = viewerGroupState === "pending";
  const groupMember = viewerGroupState === "member";

  const dateLabelClassName = [
    DATE_PILL_FACE_CLASS,
    usesDatePill
      ? ["rounded-full border px-2.5 font-medium", DATE_PILL_LIFT_CLASS, railLabelClassName].join(
          " "
        )
      : railLabelClassName,
  ].join(" ");

  const ownDuoActive = hasOwnerDuo || duoAction.active;
  const ownGroupActive = hasOwnerGroup || groupAction.ownsActive;
  const otherDuoActive = hasOwnerDuo ? duoJoined : false;

  return (
    <>
      <article
        className="relative w-[38vw] min-w-[180px] max-w-[240px] shrink-0 cursor-default"
        data-profile-social-card
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

            <button
              type="button"
              onClick={openDetail}
              className="mt-2.5 text-left"
              data-profile-social-caption
            >
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
            </button>

            <div
              className={[
                "mt-2.5 flex min-w-0 items-center overflow-visible",
                /* Report control sits on the card's bottom edge. One-row
                   actions keep the gutter. Connect's second row clears it
                   itself so Duo+Group can use the full inner width. */
                isSelf || !hasOwnerDuo ? "pr-8" : "",
              ].join(" ")}
              data-profile-social-actions
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
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
                        resolving={duoAction.resolving}
                        onPress={handleOwnDuo}
                        size="compact"
                      />
                      <SocialGroupPill
                        displayCount={groupAction.displayCount}
                        active={ownGroupActive}
                        resolving={groupAction.resolving}
                        onPress={handleOwnGroup}
                        size="compact"
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className={[
                      socialContrastShelfClusterClassName(),
                      hasOwnerDuo ? "w-full" : "",
                    ].join(" ")}
                    data-profile-social-other-actions
                  >
                    {hasOwnerDuo ? (
                      <div
                        className="grid w-full grid-cols-[max-content_max-content_minmax(0,1fr)] items-center justify-start gap-x-2 gap-y-1.5"
                        data-profile-social-other-action-rows
                      >
                        <SocialDuoPill
                          active={otherDuoActive}
                          resolving={duoBusy}
                          onPress={() => {
                            void handleOtherDuo();
                          }}
                          size="compact"
                        />
                        {hasOwnerGroup ? (
                          <ProfileGroupRequestPill
                            label={
                              groupMember
                                ? peopleUiCopy.groupUpBrowseMemberLabel
                                : groupPending
                                  ? socialUiCopy.groupRequested
                                  : socialUiCopy.groupRequest
                            }
                            active={groupPending}
                            busy={groupBusy}
                            disabled={groupMember}
                            onPress={() => {
                              void handleGroupRequest();
                            }}
                          />
                        ) : (
                          <SocialGroupPill
                            displayCount={null}
                            active={false}
                            resolving={false}
                            onPress={() => {
                              /* Owner has no hosted Group — inactive; no viewer create/manage. */
                            }}
                            size="compact"
                            className="pointer-events-none opacity-55"
                          />
                        )}
                        {/* Connect sits on its own row, clear of the report control. */}
                        <div className="col-span-3 flex min-w-0 justify-start pr-8">
                          <ProfileConnectPill
                            label={
                              connectActive
                                ? peopleUiCopy.deckConnectedLabel
                                : peopleUiCopy.deckConnectLabel
                            }
                            icon={
                              connectActive ? (
                                <PiCheck size={11} aria-hidden />
                              ) : (
                                <PiHandPeace size={11} aria-hidden />
                              )
                            }
                            active={connectActive}
                            busy={connectBusy}
                            onPress={() => {
                              void handleConnect();
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className={socialRailBareRowClassName()}>
                        <SocialDuoPill
                          active={false}
                          resolving={false}
                          onPress={() => {
                            /* Owner has no Duo — inactive; no viewer create/manage. */
                          }}
                          size="compact"
                          className="pointer-events-none opacity-55"
                        />
                        {hasOwnerGroup ? (
                          <ProfileGroupRequestPill
                            label={
                              groupMember
                                ? peopleUiCopy.groupUpBrowseMemberLabel
                                : groupPending
                                  ? socialUiCopy.groupRequested
                                  : socialUiCopy.groupRequest
                            }
                            active={groupPending}
                            busy={groupBusy}
                            disabled={groupMember}
                            onPress={() => {
                              void handleGroupRequest();
                            }}
                          />
                        ) : (
                          <SocialGroupPill
                            displayCount={null}
                            active={false}
                            resolving={false}
                            onPress={() => {
                              /* Owner has no hosted Group — inactive; no viewer create/manage. */
                            }}
                            size="compact"
                            className="pointer-events-none opacity-55"
                          />
                        )}
                      </div>
                    )}
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
