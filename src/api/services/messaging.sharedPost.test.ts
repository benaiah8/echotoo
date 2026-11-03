import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const messageRow = {
  id: "m1",
  conversation_id: "conv-1",
  sender_user_id: "user-1",
  body: "Hello",
  client_message_id: "client-1",
  created_at: "2026-10-27T00:00:00.000Z",
  message_kind: "shared_post",
  reference_type: "post",
  reference_id: "post-1",
  reference_snapshot: { v: 1, post_type: "hangout" },
};

describe("sendSharedPostMessage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends ordinary shares with the original four named RPC parameters", async () => {
    const { supabase } = await import("../../lib/supabaseClient");
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { message: messageRow, created: true },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });
    const { sendSharedPostMessage } = await import("./messaging");

    const result = await sendSharedPostMessage(
      "conv-1",
      "post-1",
      "Hello",
      "client-1"
    );

    expect(result.error).toBeNull();
    expect(result.data?.created).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("send_shared_post_message", {
      p_conversation_id: "conv-1",
      p_post_id: "post-1",
      p_note: "Hello",
      p_client_message_id: "client-1",
    });
    const args = vi.mocked(supabase.rpc).mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(args).not.toHaveProperty("p_duo_comment");
  });

  it("includes p_duo_comment only for a Duo comment", async () => {
    const { supabase } = await import("../../lib/supabaseClient");
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        message: {
          ...messageRow,
          reference_snapshot: { v: 1, post_type: "hangout", origin: "duo" },
        },
        created: false,
      },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });
    const { sendSharedPostMessage } = await import("./messaging");

    const result = await sendSharedPostMessage(
      "conv-1",
      "post-1",
      "Hello",
      "client-1",
      true
    );

    expect(result.data?.created).toBe(false);
    expect(result.data?.message.reference_snapshot).toEqual({
      v: 1,
      post_type: "hangout",
      origin: "duo",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("send_shared_post_message", {
      p_conversation_id: "conv-1",
      p_post_id: "post-1",
      p_note: "Hello",
      p_client_message_id: "client-1",
      p_duo_comment: true,
    });
  });
});

describe("shared post snapshot origin", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function parse(snapshot: unknown) {
    const { parseRealtimeMessageRow } = await import("./messaging");
    return parseRealtimeMessageRow({
      ...messageRow,
      reference_snapshot: snapshot,
    });
  }

  it("treats a missing origin as an ordinary share", async () => {
    const row = await parse({ v: 1, post_type: "experience" });
    expect(row?.reference_snapshot).toEqual({
      v: 1,
      post_type: "experience",
    });
  });

  it("keeps origin only when it is exactly duo", async () => {
    const row = await parse({ v: 1, post_type: "hangout", origin: "duo" });
    expect(row?.reference_snapshot).toEqual({
      v: 1,
      post_type: "hangout",
      origin: "duo",
    });
  });

  it("ignores an unknown origin", async () => {
    const row = await parse({
      v: 1,
      post_type: "hangout",
      origin: "discover",
    });
    expect(row?.reference_snapshot).toEqual({
      v: 1,
      post_type: "hangout",
    });
  });
});
