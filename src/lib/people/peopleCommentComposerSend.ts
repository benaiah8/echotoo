/**
 * People Comment Composer — shared_post delivery (no category UI).
 */
import {
  createClientMessageId,
  getOrCreateDirectConversation,
  sendSharedPostMessage,
} from "../../api/services/messaging";
import { shareFailureCopy } from "../shareToMessagesSend";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

export type PeopleCommentSendResult =
  | {
      ok: true;
      conversationId: string;
      created: boolean;
      /** Stored message body from the send response. Empty when the payload omitted it. */
      body: string;
    }
  | {
      ok: false;
      error: unknown;
      userMessage: string;
    };

export async function sendPeopleContextComment(input: {
  recipientUserId: string;
  sourcePostId: string;
  note: string;
  clientMessageId: string;
  recipientLabel: string;
}): Promise<PeopleCommentSendResult> {
  const recipientUserId = input.recipientUserId.trim();
  const sourcePostId = input.sourcePostId.trim();
  const note = input.note.trim();
  const recipientLabel = input.recipientLabel.trim() || "them";

  if (!recipientUserId || !sourcePostId || !note) {
    return {
      ok: false,
      error: new Error("Missing send args"),
      userMessage: "Couldn't send your comment.",
    };
  }

  const { data: conv, error: convError } =
    await getOrCreateDirectConversation(recipientUserId);
  if (convError || !conv?.conversation_id) {
    return {
      ok: false,
      error: convError ?? new Error("No conversation"),
      userMessage: shareFailureCopy(recipientLabel, convError),
    };
  }

  const clientMessageId =
    input.clientMessageId.trim() || createClientMessageId();

  const { data, error } = await sendSharedPostMessage(
    conv.conversation_id,
    sourcePostId,
    note,
    clientMessageId,
    true
  );

  if (error || !data?.message) {
    return {
      ok: false,
      error: error ?? new Error("Send failed"),
      userMessage: peopleCommentFailureCopy(recipientLabel, error),
    };
  }

  return {
    ok: true,
    conversationId: conv.conversation_id,
    created: data.created,
    body: typeof data.message.body === "string" ? data.message.body : "",
  };
}

function peopleCommentErrorText(error: unknown): string {
  if (typeof (error as { message?: unknown })?.message === "string") {
    return (error as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * Duo-comment RPC failures stay on this path. They are not retried as an
 * ordinary share.
 */
function peopleCommentFailureCopy(label: string, error: unknown): string {
  const raw = peopleCommentErrorText(error);
  if (raw.includes("DUO_COMMENT_ALREADY_SENT")) {
    return "You've already commented on this opportunity.";
  }
  if (raw.includes("DUO_COMMENT_NOT_AVAILABLE")) {
    return "This opportunity isn't available to comment on.";
  }
  return shareFailureCopy(label, error);
}

/** Max recipient label length embedded in the textarea placeholder. */
const PLACEHOLDER_RECIPIENT_LABEL_MAX = 22;

/**
 * Permitted display name for placeholder copy only — does not mutate stored names.
 */
export function commentComposerPlaceholderRecipientLabel(
  displayName: string | null | undefined
): string | null {
  const raw = typeof displayName === "string" ? displayName.trim() : "";
  if (!raw || /^someone$/i.test(raw)) return null;

  if (raw.length <= PLACEHOLDER_RECIPIENT_LABEL_MAX) return raw;

  const firstToken = raw.split(/\s+/).find((part) => part.length > 0);
  if (
    firstToken &&
    firstToken.length <= PLACEHOLDER_RECIPIENT_LABEL_MAX
  ) {
    return firstToken;
  }

  return `${raw.slice(0, PLACEHOLDER_RECIPIENT_LABEL_MAX - 1)}…`;
}

export function peopleCommentComposerPlaceholder(
  displayName: string | null | undefined
): string {
  const label = commentComposerPlaceholderRecipientLabel(displayName);
  if (!label) {
    return peopleUiCopy.commentComposerPlaceholderBreakTheIce;
  }
  return peopleUiCopy.commentComposerPlaceholderBreakTheIceWith.replace(
    "{name}",
    label
  );
}
