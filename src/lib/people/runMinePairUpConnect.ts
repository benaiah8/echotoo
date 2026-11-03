/**
 * Single Mine/Discover Pair Up Connect orchestration.
 * Dock Connect and Profile-from-Mine Connect both call this — one mutation path.
 *
 * Mine (my_plans): express_pair_up_interest
 * Discover: connect_discover_pair_up
 * Organic Profile rail stays on its own connect_profile path (not used here).
 */
import toast from "react-hot-toast";
import { connectDiscoverPairUp } from "../../api/services/pairUp";
import type { PairUpCandidate, PairUpExpressResult } from "./types";
import {
  isPeopleConnectStaleEligibilityError,
  logPeopleConnectFailureDev,
  peopleConnectUserToastKind,
  type PeopleConnectRpcName,
} from "./peopleConnectHardening";
import {
  beginDiscoverHeartPending,
  cancelDiscoverHeartPending,
  clearDiscoverHeartOpportunity,
  confirmDiscoverHeart,
} from "./discoverHeartState";
import { isPeoplePhotoPromptBypassed } from "../peoplePhotoPromptSession";
import { resolvePhotoPromptOffer } from "../peoplePhotoPromptPolicy";
import {
  PAIR_UP_CONNECT_PHOTO_PROMPT_DESCRIPTION,
  PAIR_UP_CONNECT_PHOTO_PROMPT_TITLE,
} from "../pairUpPhotoPromptCopy";
import { openPairUpPhotoPrompt } from "../pairUpPhotoPromptStore";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

export type MinePairUpConnectScope = "my_plans" | "discover";

export type MinePairUpConnectExpress = (
  toOpportunityId: string
) => Promise<PairUpExpressResult>;

export type MinePairUpConnectHost = {
  /** Guard: already in flight / locked / photo prompt open. */
  shouldAbortBeforeStart: () => boolean;
  isDevMock: (target: PairUpCandidate) => boolean;
  ensureAuthed: () => boolean;
  authUserId: string | null;
  express: MinePairUpConnectExpress;
  applyUnmatchedRemoval: (leavingId: string) => void;
  /**
   * Matched: remove opp, advance neighbor, suspend session; then host runs
   * completePairUpMatch + DM navigate.
   */
  applyMatchedAndComplete: (leavingId: string) => Promise<void>;
  setPinned: (target: PairUpCandidate | null) => void;
  setPhaseExpressing: () => void;
  setPhaseIdle: () => void;
  beginFlight: () => void;
  endFlight: () => void;
  /** Discover unmatched Heart: keep the card and mark this opportunity active. */
  onDiscoverHeartExpressed?: (opportunityId: string, expressed: boolean) => void;
  /** Duo unmatched Connect succeeded. Not called for a match or a failure. */
  onDuoUnmatchedConfirmed?: (opportunityId: string) => void;
};

export type MinePairUpConnectRequest = {
  target: PairUpCandidate;
  scope: MinePairUpConnectScope;
  host: MinePairUpConnectHost;
  /**
   * Discover Heart button. The runner marks this opportunity pending and
   * does not take the deck-wide Connect lock.
   */
  heartAlreadyPending?: boolean;
};

export type MinePairUpConnectStatus =
  | "matched"
  | "open"
  | "failed"
  | "aborted"
  | "ignored";

/**
 * Starts Connect for a captured target. Photo-gate may defer the mutation;
 * flight stays held until Continue completes or dismiss releases.
 */
export async function runMinePairUpConnect(
  request: MinePairUpConnectRequest
): Promise<MinePairUpConnectStatus> {
  const { target, scope, host } = request;
  const trackHeart = scope === "discover" && request.heartAlreadyPending === true;
  if (scope !== "my_plans" && scope !== "discover") return "ignored";
  if (host.shouldAbortBeforeStart()) return "ignored";

  if (host.isDevMock(target)) {
    host.applyUnmatchedRemoval(target.opportunity_id);
    return "open";
  }

  if (!host.ensureAuthed()) return "aborted";
  const userId = host.authUserId;
  if (!userId) return "aborted";

  if (trackHeart) {
    const started = beginDiscoverHeartPending(
      userId,
      target.opportunity_id,
      target.expressed_by_me
    );
    if (!started) return "ignored";
  }

  const releaseFlight = () => {
    if (trackHeart) {
      cancelDiscoverHeartPending(userId, target.opportunity_id);
      return;
    }
    host.endFlight();
  };

  const runMutation = async (): Promise<MinePairUpConnectStatus> => {
    const rpc: PeopleConnectRpcName =
      scope === "discover"
        ? "connect_discover_pair_up"
        : "express_pair_up_interest";
    host.setPinned(target);
    if (trackHeart) {
      /* Pending is already scoped to this opportunity. */
    } else {
      host.setPhaseExpressing();
    }
    try {
      const result =
        scope === "discover"
          ? await connectDiscoverPairUp(target.opportunity_id)
          : await host.express(target.opportunity_id);
      if (result.matched) {
        if (scope === "discover") {
          clearDiscoverHeartOpportunity(target.opportunity_id);
        }
        await host.applyMatchedAndComplete(target.opportunity_id);
        return "matched";
      }
      host.setPinned(null);
      if (!trackHeart) host.setPhaseIdle();
      if (scope === "discover") {
        confirmDiscoverHeart(userId, target.opportunity_id, true);
        host.onDiscoverHeartExpressed?.(target.opportunity_id, true);
        toast.success(peopleUiCopy.discoverAddedToP2p);
      } else {
        host.onDuoUnmatchedConfirmed?.(target.opportunity_id);
      }
      return "open";
    } catch (err) {
      host.setPinned(null);
      if (!trackHeart) host.setPhaseIdle();
      if (trackHeart) {
        cancelDiscoverHeartPending(userId, target.opportunity_id);
      }
      logPeopleConnectFailureDev({
        rpc,
        err,
        opportunityId: target.opportunity_id,
        sourcePostId: target.source_post_id,
        scope,
      });
      const toastKind = peopleConnectUserToastKind(err);
      toast.error(
        toastKind === "stale"
          ? peopleUiCopy.deckConnectUnavailable
          : peopleUiCopy.deckExpressError
      );
      if (isPeopleConnectStaleEligibilityError(err)) {
        if (scope === "discover") {
          clearDiscoverHeartOpportunity(target.opportunity_id);
        }
        host.applyUnmatchedRemoval(target.opportunity_id);
      }
      return "failed";
    } finally {
      releaseFlight();
    }
  };

  if (!trackHeart) host.beginFlight();

  if (isPeoplePhotoPromptBypassed()) {
    return runMutation();
  }

  const profile = resolvePhotoPromptOffer(userId, "people_connect", false);
  if (!profile) {
    return runMutation();
  }

  const opened = openPairUpPhotoPrompt({
    intentKey: `connect:${target.opportunity_id}:${scope}`,
    profileId: profile.profileId,
    userId: profile.userId,
    photos: profile.photos,
    title: PAIR_UP_CONNECT_PHOTO_PROMPT_TITLE,
    description: PAIR_UP_CONNECT_PHOTO_PROMPT_DESCRIPTION,
    onContinue: () => {
      void runMutation();
    },
    onDismiss: () => {
      releaseFlight();
    },
  });
  if (!opened) {
    /* Another connect/join intent already owns the singleton prompt. */
    releaseFlight();
    return "aborted";
  }
  return "ignored";
}
