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
};

export type MinePairUpConnectRequest = {
  target: PairUpCandidate;
  scope: MinePairUpConnectScope;
  host: MinePairUpConnectHost;
};

/**
 * Starts Connect for a captured target. Photo-gate may defer the mutation;
 * flight stays held until Continue completes or dismiss releases.
 */
export async function runMinePairUpConnect(
  request: MinePairUpConnectRequest
): Promise<void> {
  const { target, scope, host } = request;
  if (scope !== "my_plans" && scope !== "discover") return;
  if (host.shouldAbortBeforeStart()) return;

  if (host.isDevMock(target)) {
    host.applyUnmatchedRemoval(target.opportunity_id);
    return;
  }

  if (!host.ensureAuthed()) return;
  const userId = host.authUserId;
  if (!userId) return;

  const releaseFlight = () => {
    host.endFlight();
  };

  const runMutation = async () => {
    const rpc: PeopleConnectRpcName =
      scope === "discover"
        ? "connect_discover_pair_up"
        : "express_pair_up_interest";
    host.setPinned(target);
    host.setPhaseExpressing();
    try {
      const result =
        scope === "discover"
          ? await connectDiscoverPairUp(target.opportunity_id)
          : await host.express(target.opportunity_id);
      if (result.matched) {
        await host.applyMatchedAndComplete(target.opportunity_id);
        return;
      }
      host.setPinned(null);
      host.setPhaseIdle();
      host.applyUnmatchedRemoval(target.opportunity_id);
      if (scope === "discover") {
        toast.success(peopleUiCopy.discoverAddedToP2p);
      }
    } catch (err) {
      host.setPinned(null);
      host.setPhaseIdle();
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
        host.applyUnmatchedRemoval(target.opportunity_id);
      }
    } finally {
      releaseFlight();
    }
  };

  host.beginFlight();

  if (isPeoplePhotoPromptBypassed()) {
    await runMutation();
    return;
  }

  const profile = resolvePhotoPromptOffer(userId, "people_connect", false);
  if (!profile) {
    await runMutation();
    return;
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
  }
}
