import { supabase } from "../supabaseClient";

export type MyDuoCommentLookup =
  | {
      ok: true;
      status: "sent";
      body: string;
      messageId: string;
      conversationId: string;
      referenceId: string;
    }
  | { ok: true; status: "absent" | "unavailable" }
  | { ok: false; userMessage: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Read the signed-in viewer's own Duo comment for one post and one person.
 * Does not page the conversation and does not create one.
 */
export async function getMyDuoComment(
  postId: string,
  otherUserId: string
): Promise<MyDuoCommentLookup> {
  const p_post_id = postId.trim();
  const p_other_user_id = otherUserId.trim();
  if (!p_post_id || !p_other_user_id) {
    return { ok: true, status: "unavailable" };
  }
  const { data, error } = await supabase.rpc("get_my_duo_comment", {
    p_post_id,
    p_other_user_id,
  });
  if (error) {
    return { ok: false, userMessage: "Couldn't open that comment." };
  }
  const row = asRecord(data);
  const status = row?.status;
  if (status === "unavailable") return { ok: true, status: "unavailable" };
  if (status !== "sent") return { ok: true, status: "absent" };
  const message = asRecord(row?.message);
  const body = typeof message?.body === "string" ? message.body.trim() : "";
  const referenceId =
    typeof message?.reference_id === "string" ? message.reference_id.trim() : "";
  const messageId = typeof message?.id === "string" ? message.id : "";
  const conversationId =
    typeof message?.conversation_id === "string" ? message.conversation_id : "";
  if (!body || !referenceId || referenceId !== p_post_id) {
    return { ok: true, status: "absent" };
  }
  return {
    ok: true,
    status: "sent",
    body,
    messageId,
    conversationId,
    referenceId,
  };
}
