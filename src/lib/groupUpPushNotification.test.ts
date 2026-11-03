import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGroupUpFcmPayload,
  buildOpenPlanRequestFcmPayload,
  GROUP_UP_REQUEST_ACCEPTED_PUSH_BODY,
  GROUP_UP_REQUEST_PUSH_BODY,
} from "../../supabase/functions/_shared/push/payloadBuilders";
import { inAppNotificationFromPushData } from "./notifications/inAppNotificationFromPushData";
import { NOTIFICATION_KINDS } from "./notifications/notificationKinds";
import { resolveNotificationRoute } from "./notifications/notificationRouteResolver";

const SQL = resolve(
  __dirname,
  "../../supabase/migrations/20261106120000_group_up_request_approval_push.sql"
);
const OPEN_PLAN_PUSH = resolve(
  __dirname,
  "../../supabase/migrations/20260907120000_open_plan_request_push.sql"
);
const DM_PUSH = resolve(
  __dirname,
  "../../supabase/functions/send-dm-push/index.ts"
);

function functionBody(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.",
    start + needle.length
  );
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("Group Up push SQL", () => {
  const sql = readFileSync(SQL, "utf8").replace(/\r\n/g, "\n");
  const requestBody = functionBody(sql, "request_group_up");
  const acceptBody = functionBody(sql, "accept_group_up_request");
  const enqueueBody = functionBody(sql, "enqueue_group_up_push");

  it("enqueues one organizer event only after a new pending insert", () => {
    const insertAt = requestBody.indexOf("INSERT INTO public.group_up_requests");
    const createdAt = requestBody.indexOf("v_created := true");
    const enqueueAt = requestBody.indexOf(
      "PERFORM public.enqueue_group_up_push(v_req.id, 'request')"
    );
    expect(insertAt).toBeGreaterThan(0);
    expect(createdAt).toBeGreaterThan(insertAt);
    expect(enqueueAt).toBeGreaterThan(createdAt);
    expect(requestBody.slice(0, insertAt)).not.toContain("enqueue_group_up_push");
    const reuse = requestBody.slice(
      requestBody.indexOf("IF FOUND THEN"),
      insertAt
    );
    expect(reuse).toContain("RETURN jsonb_build_object");
    expect(reuse).not.toContain("enqueue_group_up_push");
    const race = requestBody.slice(
      requestBody.indexOf("WHEN unique_violation THEN"),
      requestBody.indexOf("IF v_created THEN")
    );
    expect(race).toContain("v_created := false");
    expect(race).not.toContain("enqueue_group_up_push");
    expect(requestBody.match(/enqueue_group_up_push/g)?.length).toBe(1);
    expect(requestBody).toContain("Group member limit is 200");
    expect(requestBody).toContain("users_are_blocked_pair");
  });

  it("enqueues one requester event only after membership is granted", () => {
    const grantAt = acceptBody.indexOf("v_membership_granted := true");
    const memberInsert = acceptBody.indexOf(
      "INSERT INTO public.conversation_members"
    );
    const enqueueAt = acceptBody.indexOf(
      "PERFORM public.enqueue_group_up_push(v_req.id, 'accepted')"
    );
    expect(memberInsert).toBeGreaterThan(0);
    expect(grantAt).toBeGreaterThan(0);
    expect(enqueueAt).toBeGreaterThan(memberInsert);
    expect(acceptBody.slice(0, memberInsert)).not.toContain(
      "enqueue_group_up_push"
    );
    const earlyAccept = acceptBody.slice(
      acceptBody.indexOf("IF v_req.status = 'accepted'"),
      acceptBody.indexOf("IF v_req.status IN ('withdrawn'")
    );
    expect(earlyAccept).toContain("RETURN jsonb_build_object");
    expect(earlyAccept).not.toContain("enqueue_group_up_push");
    const unavailableAt = acceptBody.indexOf("'group_unavailable'");
    expect(unavailableAt).toBeGreaterThan(0);
    expect(enqueueAt).toBeGreaterThan(unavailableAt);
    expect(
      acceptBody.slice(unavailableAt, unavailableAt + 500)
    ).not.toContain("enqueue_group_up_push");
    expect(acceptBody).toContain("Group member limit is %");
    expect(acceptBody.match(/enqueue_group_up_push/g)?.length).toBe(1);
    expect(acceptBody).toContain("c_max_active_members integer := 200");
  });

  it("does not notify decline, withdraw, or unrelated pipelines", () => {
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.decline_group_up_request/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.withdraw_group_up_request/
    );
    expect(sql).not.toContain("enqueue_open_plan_request_push");
    expect(sql).not.toContain("request_open_plan");
    expect(sql).not.toContain("display_name");
    expect(sql).not.toContain("username");
    expect(enqueueBody).toContain("ON CONFLICT (request_id, event_kind) DO NOTHING");
    expect(enqueueBody).toContain("Someone wants to join your group.");
    expect(enqueueBody).toContain(
      "You''re in! Your Group Up request was accepted."
    );
    expect(sql).toContain("UNIQUE (request_id, event_kind)");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("leaves the Open Plan and DM push senders unchanged", () => {
    const openPlan = readFileSync(OPEN_PLAN_PUSH, "utf8");
    expect(openPlan).toContain("Someone is interested in your open plan.");
    expect(openPlan).toContain("enqueue_open_plan_request_push");
    expect(openPlan).not.toContain("group_up_push_outbox");
    const dm = readFileSync(DM_PUSH, "utf8");
    expect(dm).toContain("notifications_muted");
    expect(dm).not.toContain("group_up_request");
    expect(dm).not.toContain("send-group-up-push");
  });
});

function classifyGroupUpPushVerification(input: {
  rpcError: boolean;
  state: string | null;
}): "send" | "stale" | "retry" {
  if (input.rpcError) return "retry";
  if (input.state === "current") return "send";
  if (input.state === "stale") return "stale";
  return "retry";
}

describe("Group Up push freshness", () => {
  const sql = readFileSync(SQL, "utf8").replace(/\r\n/g, "\n");
  const stateBody = functionBody(sql, "group_up_push_delivery_state");
  const claimBody = functionBody(sql, "claim_group_up_push_outbox_batch");
  const finishBody = functionBody(sql, "finish_group_up_push_outbox_row");
  const edge = readFileSync(
    resolve(__dirname, "../../supabase/functions/send-group-up-push/index.ts"),
    "utf8"
  );

  it("sends a pending request and skips withdrawn, declined, closed, and accepted", () => {
    const requestBranch = stateBody.slice(
      stateBody.indexOf("IF p_event_kind = 'request'"),
      stateBody.indexOf("IF v_status IS DISTINCT FROM 'accepted'")
    );
    expect(requestBranch).toContain("v_status = 'pending'");
    expect(requestBranch).toContain("v_creator = p_recipient_user_id");
    expect(requestBranch).toContain("RETURN 'current'");
    expect(requestBranch).toContain("RETURN 'stale'");
    expect(requestBranch.match(/RETURN 'current'/g)?.length).toBe(1);
    expect(classifyGroupUpPushVerification({ rpcError: false, state: "current" })).toBe(
      "send"
    );
    expect(classifyGroupUpPushVerification({ rpcError: false, state: "stale" })).toBe(
      "stale"
    );
  });

  it("sends approval only for the accepted requester who is still an active member", () => {
    expect(stateBody).toContain("v_status IS DISTINCT FROM 'accepted'");
    expect(stateBody).toContain("v_requester IS DISTINCT FROM p_recipient_user_id");
    expect(stateBody).toContain("v_conversation IS DISTINCT FROM p_conversation_id");
    expect(stateBody).toContain("cm.left_at IS NULL");
    expect(stateBody).toContain("IF NOT FOUND THEN");
    expect(stateBody).toContain("RETURN 'stale'");
    expect(stateBody).not.toContain("display_name");
    expect(stateBody).not.toContain("username");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.group_up_push_delivery_state(uuid, text, uuid, uuid)"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.group_up_push_delivery_state(uuid, text, uuid, uuid)"
    );
    expect(sql).toContain("TO postgres, service_role");
  });

  it("retries a verification error and does not reclaim skipped_stale", () => {
    expect(
      classifyGroupUpPushVerification({ rpcError: true, state: null })
    ).toBe("retry");
    expect(
      classifyGroupUpPushVerification({ rpcError: false, state: null })
    ).toBe("retry");
    expect(
      classifyGroupUpPushVerification({ rpcError: false, state: "unknown" })
    ).toBe("retry");
    expect(edge.indexOf("group_up_push_delivery_state")).toBeLessThan(
      edge.indexOf("sendPushToDeviceTargets")
    );
    expect(edge).toContain('finishOutboxRow(supabaseAdmin, row.id, "skipped_stale", 0)');
    expect(edge).toContain('"pending"');
    expect(edge).toContain("freshness_check_failed");
    const retrySlice = edge.slice(
      edge.indexOf('freshness === "retry"'),
      edge.indexOf('freshness === "stale"')
    );
    expect(retrySlice).toContain('"pending"');
    expect(retrySlice).not.toContain("skipped_stale");
    expect(claimBody).not.toContain("skipped_stale");
    expect(claimBody).toContain("o.status = 'pending'");
    expect(finishBody).toContain("'skipped_stale'");
    expect(sql).toContain("'skipped_stale'");
    expect(sql).toContain("UNIQUE (request_id, event_kind)");
  });
});

describe("Group Up push routing", () => {
  it("routes a new request to Messages Requests without identity fields", () => {
    const data = buildGroupUpFcmPayload({
      eventKind: "request",
      requestId: "req-1",
      opportunityId: "opp-1",
      conversationId: "should-not-leak",
      body: GROUP_UP_REQUEST_PUSH_BODY,
    });
    expect(data.type).toBe("group_up_request");
    expect(data.body).toBe("Someone wants to join your group.");
    expect(data.targetPath).toBe("/messages?tab=requests&requestId=req-1");
    expect(data).not.toHaveProperty("conversationId");
    expect(JSON.stringify(data)).not.toMatch(/display_name|username|requester/i);
    const route = resolveNotificationRoute(data);
    expect(route.supported).toBe(true);
    if (route.supported) {
      expect(route.kind).toBe(NOTIFICATION_KINDS.GROUP_UP_REQUEST);
      expect(route.path).toBe("/messages?tab=requests&requestId=req-1");
    }
  });

  it("routes an approval to the existing group conversation", () => {
    const data = buildGroupUpFcmPayload({
      eventKind: "accepted",
      requestId: "req-1",
      opportunityId: "opp-1",
      conversationId: "conv-9",
      body: GROUP_UP_REQUEST_ACCEPTED_PUSH_BODY,
    });
    expect(data.type).toBe("group_up_request_accepted");
    expect(data.body).toBe(
      "You're in! Your Group Up request was accepted."
    );
    expect(data.targetPath).toBe("/messages/conv-9");
    expect(data.conversationId).toBe("conv-9");
    expect(JSON.stringify(data)).not.toMatch(/display_name|username|member/i);
    const route = resolveNotificationRoute(data);
    expect(route.supported).toBe(true);
    if (route.supported) {
      expect(route.path).toBe("/messages/conv-9");
    }
    const banner = inAppNotificationFromPushData(data);
    expect(banner?.id).toBe("group_up_request_accepted:req-1");
    expect(banner?.kind).toBe(NOTIFICATION_KINDS.GROUP_UP_REQUEST_ACCEPTED);
  });

  it("keeps Open Plan request routing on its own kind", () => {
    const data = buildOpenPlanRequestFcmPayload({
      requestId: "req-op",
      opportunityId: "opp-op",
    });
    expect(data.type).toBe("open_plan_request");
    expect(data.body).toBe("Someone is interested in your open plan.");
    const route = resolveNotificationRoute(data);
    expect(route.supported).toBe(true);
    if (route.supported) {
      expect(route.kind).toBe(NOTIFICATION_KINDS.OPEN_PLAN_REQUEST);
      expect(route.path).toContain("tab=requests");
    }
    const banner = inAppNotificationFromPushData(data);
    expect(banner?.id).toBe("open_plan_request:req-op");
  });
});
