/**
 * Comment reopen and pool-join recovery.
 * Send stays in the composer. This module never calls the shared-post send RPC by name.
 */
import type { PostScheduleLabelKind } from "../postScheduleLabel";
import type { ProfileIdentityMediaSource } from "../profileIdentityMedia";
import { joinPairUp } from "../../api/services/pairUp";
import { getMyDuoComment, type MyDuoCommentLookup } from "./getMyDuoComment";
import { joinDuoPoolAfterCreatedComment } from "./commentJoinsDuoPool";
import {
  duoCommentStateKey,
  getDuoCommentSnapshot,
  getDuoCommentViewerId,
  markDuoCommentIdle,
  markDuoCommentPoolJoined,
  markDuoCommentPoolNotJoined,
  markDuoCommentSent,
  markDuoCommentUnavailable,
  setDuoCommentPending,
} from "./duoCommentState";
import { openPeopleCommentComposer } from "./peopleCommentComposerStore";

export type DuoCommentIdentity = {
  surface: "discover" | "duo";
  opportunityId: string;
  sourcePostId: string;
  recipientUserId: string;
  displayName: string;
  identitySource: ProfileIdentityMediaSource;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind: PostScheduleLabelKind | null;
  sourceType: "hangout" | "experience" | null;
};

function keyFor(identity: DuoCommentIdentity, viewerId: string): string {
  return duoCommentStateKey(
    viewerId,
    identity.sourcePostId,
    identity.recipientUserId
  );
}

function openSent(identity: DuoCommentIdentity, body: string): void {
  openPeopleCommentComposer({
    surface: identity.surface,
    presentation: "sent",
    sentBody: body,
    opportunityId: identity.opportunityId,
    sourcePostId: identity.sourcePostId,
    recipientUserId: identity.recipientUserId,
    displayName: identity.displayName,
    identitySource: identity.identitySource,
    caption: identity.caption,
    scheduleLabel: identity.scheduleLabel,
    scheduleLabelKind: identity.scheduleLabelKind,
    sourceType: identity.sourceType,
    expressedByMe: false,
  });
}

async function joinUnlessAlreadyInPool(input: {
  key: string;
  sourcePostId: string;
  join: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
}): Promise<"joined" | "skipped" | "failed"> {
  if (getDuoCommentSnapshot(input.key).viewerHasActivePairUp === true) {
    return "skipped";
  }
  const result = await joinDuoPoolAfterCreatedComment({
    created: true,
    sourcePostId: input.sourcePostId,
    join: input.join,
  });
  if (result === "joined") {
    markDuoCommentPoolJoined(input.key);
    input.onJoined?.();
  } else if (result === "failed") {
    markDuoCommentPoolNotJoined(input.key);
  }
  return result;
}

async function retryJoinOnly(input: {
  key: string;
  sourcePostId: string;
  join: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
}): Promise<"joined" | "skipped" | "failed"> {
  if (getDuoCommentSnapshot(input.key).viewerHasActivePairUp !== false) {
    return "skipped";
  }
  return joinUnlessAlreadyInPool(input);
}

export async function reopenSentDuoComment(input: {
  identity: DuoCommentIdentity;
  lookup?: (postId: string, otherUserId: string) => Promise<MyDuoCommentLookup>;
  join?: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
}): Promise<"opened" | "compose" | "unavailable" | "failed"> {
  const viewerId = getDuoCommentViewerId();
  if (!viewerId) return "failed";
  const key = keyFor(input.identity, viewerId);
  const lookup = input.lookup ?? getMyDuoComment;
  const join = input.join ?? joinPairUp;
  setDuoCommentPending(key, true);
  try {
    const cached = getDuoCommentSnapshot(key).body;
    let body = cached;
    if (!body) {
      const looked = await lookup(
        input.identity.sourcePostId,
        input.identity.recipientUserId
      );
      if (!looked.ok) return "failed";
      if (looked.status === "unavailable") {
        markDuoCommentUnavailable(key);
        return "unavailable";
      }
      if (looked.status !== "sent") {
        markDuoCommentIdle(key);
        return "compose";
      }
      body = looked.body;
      markDuoCommentSent(key, body);
    } else {
      setDuoCommentPending(key, false);
    }
    openSent(input.identity, body);
    await retryJoinOnly({
      key,
      sourcePostId: input.identity.sourcePostId,
      join,
      onJoined: input.onJoined,
    });
    return "opened";
  } finally {
    setDuoCommentPending(key, false);
  }
}

export async function noteConfirmedDuoComment(input: {
  identity: DuoCommentIdentity;
  body: string;
  created: boolean;
  join?: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
}): Promise<"joined" | "skipped" | "failed"> {
  const viewerId = getDuoCommentViewerId();
  if (!viewerId || !input.body.trim()) return "skipped";
  const key = keyFor(input.identity, viewerId);
  markDuoCommentSent(key, input.body);
  if (!input.created) return "skipped";
  return joinUnlessAlreadyInPool({
    key,
    sourcePostId: input.identity.sourcePostId,
    join: input.join ?? joinPairUp,
    onJoined: input.onJoined,
  });
}

export async function recoverDuplicateDuoComment(input: {
  identity: DuoCommentIdentity;
  lookup?: (postId: string, otherUserId: string) => Promise<MyDuoCommentLookup>;
  join?: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
}): Promise<"opened" | "unavailable" | "failed"> {
  const viewerId = getDuoCommentViewerId();
  if (!viewerId) return "failed";
  const key = keyFor(input.identity, viewerId);
  const lookup = input.lookup ?? getMyDuoComment;
  setDuoCommentPending(key, true);
  try {
    const looked = await lookup(
      input.identity.sourcePostId,
      input.identity.recipientUserId
    );
    if (!looked.ok) return "failed";
    if (looked.status === "unavailable") {
      markDuoCommentUnavailable(key);
      return "unavailable";
    }
    if (looked.status !== "sent") return "failed";
    markDuoCommentSent(key, looked.body);
    openSent(input.identity, looked.body);
    await retryJoinOnly({
      key,
      sourcePostId: input.identity.sourcePostId,
      join: input.join ?? joinPairUp,
      onJoined: input.onJoined,
    });
    return "opened";
  } finally {
    setDuoCommentPending(key, false);
  }
}

export type DuoCommentTapRoute =
  | "reopened"
  | "reopened-join-failed"
  | "composer"
  | "ignored"
  | "unavailable"
  | "failed";

const duoTapInFlight = new Set<string>();
const activatedCommentLookups = new Set<string>();

export function resetActivatedDuoCommentLookupsForTests(): void {
  activatedCommentLookups.clear();
}

/**
 * One lookup for the activated candidate when the list flag is missing.
 * A boolean from the candidate list is authoritative and skips the lookup.
 * A newer confirmed send is left in place if it lands while the lookup is in flight.
 */
export async function resolveActivatedDuoComment(input: {
  viewerId: string;
  sourcePostId: string;
  recipientUserId: string;
  listCommented: boolean | null;
  lookup?: (postId: string, otherUserId: string) => Promise<MyDuoCommentLookup>;
}): Promise<"skipped" | "sent" | "idle" | "unavailable" | "failed"> {
  if (input.listCommented !== null) return "skipped";
  const viewer = input.viewerId.trim();
  const sourcePostId = input.sourcePostId.trim();
  const recipientUserId = input.recipientUserId.trim();
  if (!viewer || !sourcePostId || !recipientUserId) return "skipped";
  if (getDuoCommentViewerId() !== viewer) return "skipped";
  const key = duoCommentStateKey(viewer, sourcePostId, recipientUserId);
  const snap = getDuoCommentSnapshot(key);
  if (snap.confirmedBySend || snap.pending || snap.state !== "unknown") {
    return "skipped";
  }
  if (activatedCommentLookups.has(key)) return "skipped";
  activatedCommentLookups.add(key);
  setDuoCommentPending(key, true);
  try {
    const looked = await (input.lookup ?? getMyDuoComment)(
      sourcePostId,
      recipientUserId
    );
    if (getDuoCommentViewerId() !== viewer) return "skipped";
    const latest = getDuoCommentSnapshot(key);
    if (latest.confirmedBySend || latest.state === "sent") return "sent";
    if (latest.state === "unavailable") return "unavailable";
    if (latest.state === "idle") return "idle";
    if (!looked.ok) {
      activatedCommentLookups.delete(key);
      return "failed";
    }
    if (looked.status === "unavailable") {
      markDuoCommentUnavailable(key);
      return "unavailable";
    }
    if (looked.status === "sent") {
      markDuoCommentSent(key, looked.body);
      return "sent";
    }
    markDuoCommentIdle(key);
    return "idle";
  } catch {
    activatedCommentLookups.delete(key);
    return "failed";
  } finally {
    if (getDuoCommentViewerId() === viewer) {
      const latest = getDuoCommentSnapshot(key);
      if (latest.pending) setDuoCommentPending(key, false);
    }
  }
}

/**
 * Duo comment button routing. A sent comment reopens. An unknown flag
 * is looked up before a writable composer can open. This does not send.
 */
export async function routeDuoCommentTap(input: {
  rowCommented: boolean | null;
  identity: DuoCommentIdentity;
  lookup?: (postId: string, otherUserId: string) => Promise<MyDuoCommentLookup>;
  join?: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
  openComposer: () => void;
}): Promise<DuoCommentTapRoute> {
  const viewerId = getDuoCommentViewerId();
  const key = viewerId ? keyFor(input.identity, viewerId) : "";
  const snapshot = key ? getDuoCommentSnapshot(key) : null;
  if ((key && duoTapInFlight.has(key)) || snapshot?.pending) return "ignored";
  if (key) duoTapInFlight.add(key);

  try {
    const knownSent = snapshot?.state === "sent" || input.rowCommented === true;
    if (knownSent) return await reopenForTap(input);

    if (snapshot?.state === "unavailable") return "unavailable";

    if (snapshot?.state === "idle" || input.rowCommented === false) {
      input.openComposer();
      return "composer";
    }

    if (key) setDuoCommentPending(key, true);
    try {
      const lookup = input.lookup ?? getMyDuoComment;
      const looked = await lookup(
        input.identity.sourcePostId,
        input.identity.recipientUserId
      );
      if (!looked.ok) return "failed";
      if (looked.status === "unavailable") {
        if (key) markDuoCommentUnavailable(key);
        return "unavailable";
      }
      if (looked.status === "sent") {
        if (key) markDuoCommentSent(key, looked.body);
        return await reopenForTap(input);
      }
      if (key) markDuoCommentIdle(key);
      input.openComposer();
      return "composer";
    } finally {
      if (key) setDuoCommentPending(key, false);
    }
  } catch {
    return "failed";
  } finally {
    if (key) duoTapInFlight.delete(key);
  }
}

async function reopenForTap(input: {
  identity: DuoCommentIdentity;
  lookup?: (postId: string, otherUserId: string) => Promise<MyDuoCommentLookup>;
  join?: (sourcePostId: string) => Promise<unknown>;
  onJoined?: () => void;
  openComposer: () => void;
}): Promise<DuoCommentTapRoute> {
  const outcome = await reopenSentDuoComment({
    identity: input.identity,
    lookup: input.lookup,
    join: input.join,
    onJoined: input.onJoined,
  });
  if (outcome === "compose") {
    input.openComposer();
    return "composer";
  }
  if (outcome === "unavailable") return "unavailable";
  if (outcome !== "opened") return "failed";
  const viewerId = getDuoCommentViewerId();
  const key = viewerId ? keyFor(input.identity, viewerId) : "";
  if (key && getDuoCommentSnapshot(key).viewerHasActivePairUp === false) {
    return "reopened-join-failed";
  }
  return "reopened";
}
