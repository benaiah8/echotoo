/**
 * M1B.1 — Compose text send orchestration (people → DMs).
 * No shared_post / Share destination coupling.
 */

import {
  createClientMessageId,
  DM_MESSAGING_UNAVAILABLE_COPY,
  getOrCreateDirectConversation,
  isDmDirectAccessDeniedError,
  isDmStrangerLimitError,
  sendMessage,
} from "../../api/services/messaging";

export const SEND_SEPARATELY_MAX = 15;
export const COMPOSE_SEND_CONCURRENCY = 3;

export type ComposeSendMode = "separate" | "new_group" | "direct";

/** Per Send click — sticky client ids + successes only within this attempt. */
export type ComposeSendAttempt = {
  mode: ComposeSendMode;
  clientIdsByConversation: Map<string, string>;
  succeededConversationIds: Set<string>;
  failedUserIds: string[];
  /** person userId → conversationId once resolved this attempt */
  resolvedConversationByUserId: Map<string, string>;
  createdGroupConversationId?: string;
};

export function createComposeSendAttempt(
  mode: ComposeSendMode
): ComposeSendAttempt {
  return {
    mode,
    clientIdsByConversation: new Map(),
    succeededConversationIds: new Set(),
    failedUserIds: [],
    resolvedConversationByUserId: new Map(),
  };
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, concurrency);

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await worker(items[i]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    runOne()
  );
  await Promise.all(runners);
  return results;
}

export function ensureClientMessageId(
  attemptClientIds: Map<string, string>,
  conversationId: string
): string {
  const existing = attemptClientIds.get(conversationId);
  if (existing) return existing;
  const id = createClientMessageId();
  attemptClientIds.set(conversationId, id);
  return id;
}

export type ComposePersonSendResult = {
  userId: string;
  label: string;
  conversationId?: string;
  ok: boolean;
  /** Resolve failed before send. */
  resolveFailed?: boolean;
  error?: unknown;
};

/**
 * Resolve each person to a DM (reuse attempt cache), then send the same text.
 * Skips conversations already in attempt.succeededConversationIds.
 */
export async function sendTextToPeopleSeparately(input: {
  userIds: string[];
  labelsByUserId: Map<string, string>;
  body: string;
  attempt: ComposeSendAttempt;
  concurrency?: number;
}): Promise<ComposePersonSendResult[]> {
  const {
    userIds,
    labelsByUserId,
    body,
    attempt,
    concurrency = COMPOSE_SEND_CONCURRENCY,
  } = input;

  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of userIds) {
    const id = (raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
  }

  return runWithConcurrency(uniqueIds, concurrency, async (userId) => {
    const label = labelsByUserId.get(userId)?.trim() || "chat";

    let conversationId =
      attempt.resolvedConversationByUserId.get(userId)?.trim() || "";

    if (!conversationId) {
      const { data, error } = await getOrCreateDirectConversation(userId);
      if (error || !data?.conversation_id) {
        return {
          userId,
          label,
          ok: false,
          resolveFailed: true,
          error: error ?? new Error("Could not open conversation"),
        };
      }
      conversationId = data.conversation_id;
      attempt.resolvedConversationByUserId.set(userId, conversationId);
    }

    if (attempt.succeededConversationIds.has(conversationId)) {
      return { userId, label, conversationId, ok: true };
    }

    const clientMessageId = ensureClientMessageId(
      attempt.clientIdsByConversation,
      conversationId
    );
    const { data, error } = await sendMessage(
      conversationId,
      body,
      clientMessageId
    );
    if (error || !data) {
      return {
        userId,
        label,
        conversationId,
        ok: false,
        error: error ?? new Error("Send failed"),
      };
    }
    return { userId, label, conversationId, ok: true };
  });
}

export function composeWaitingForReplyCopy(label: string): string {
  const name = label.trim();
  if (!name) return "Waiting for them to reply.";
  return `Waiting for ${name} to reply.`;
}

export function composeFailureCopy(label: string, error?: unknown): string {
  if (isDmStrangerLimitError(error)) {
    return composeWaitingForReplyCopy(label);
  }
  if (isDmDirectAccessDeniedError(error)) {
    return DM_MESSAGING_UNAVAILABLE_COPY;
  }
  return `Couldn't send to ${label}`;
}
