/**
 * Duo Heart action notice. Shown only after a confirmed unmatched Connect
 * or a confirmed withdrawal. A mutual match keeps the top match toast.
 */

export const DUO_HEART_FEEDBACK_MS = 3000;

export type DuoHeartFeedbackKind = "sent" | "withdrawn";

export type DuoHeartFeedback = {
  kind: DuoHeartFeedbackKind;
  opportunityId: string;
  viewerId: string;
  generation: number;
};

export function duoHeartFeedbackAfterConnect(input: {
  scope: string;
  status: "matched" | "open" | "failed" | "aborted" | "ignored";
}): DuoHeartFeedbackKind | null {
  if (input.scope !== "my_plans" || input.status !== "open") return null;
  return "sent";
}

export function duoHeartFeedbackAfterWithdraw(resultType: string): DuoHeartFeedbackKind | null {
  if (resultType !== "withdrawn") return null;
  return "withdrawn";
}

export function duoHeartFeedbackText(kind: DuoHeartFeedbackKind): string {
  if (kind === "sent") return "Connection sent.";
  return "Connection withdrawn.";
}

/** An older timer must not clear a newer notice. */
export function duoHeartFeedbackDismissAllowed(input: {
  timerGeneration: number;
  liveGeneration: number;
}): boolean {
  return input.timerGeneration === input.liveGeneration;
}

/**
 * Error toasts are global. Show one only while the pressed Duo candidate
 * is still the committed slide for the same viewer.
 */
export function duoHeartErrorFeedbackVisible(input: {
  capturedViewerId: string;
  capturedOpportunityId: string;
  liveViewerId: string | null;
  scope: string;
  mode: string;
  currentOpportunityId: string | null;
}): boolean {
  if (!input.capturedViewerId || !input.capturedOpportunityId) return false;
  if (input.liveViewerId !== input.capturedViewerId) return false;
  if (input.mode !== "p2p" || input.scope !== "my_plans") return false;
  return input.currentOpportunityId === input.capturedOpportunityId;
}

/** Hide a notice that belongs to another viewer, scope, or candidate. */
export function duoHeartFeedbackShouldClear(input: {
  feedback: Pick<DuoHeartFeedback, "opportunityId" | "viewerId"> | null;
  viewerId: string | null;
  scope: string;
  currentOpportunityId: string | null;
}): boolean {
  if (!input.feedback) return false;
  if (input.scope !== "my_plans") return true;
  if (!input.viewerId || input.feedback.viewerId !== input.viewerId) return true;
  if (input.currentOpportunityId !== input.feedback.opportunityId) return true;
  return false;
}
