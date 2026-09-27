import { describe, expect, it } from "vitest";
import { isRequestCursorAfter } from "./groupUpRequestCursor";
import {
  applyMarkSeenUpsert,
  isValidMarkSeenCursor,
  resolveConcurrentFirstMarks,
  type MarkSeenRequestIdentity,
} from "./groupUpMarkSeenSafety";

const HOST = "host-1";
const CONV = "conv-1";
const OTHER_CONV = "conv-other";

const atE = "2026-09-04T10:00:00.000Z";
const atF = "2026-09-04T12:00:00.000Z";
const idE = "00000000-0000-4000-8000-00000000000e";
const idF = "00000000-0000-4000-8000-00000000000f";

function req(
  partial: Partial<MarkSeenRequestIdentity> &
    Pick<MarkSeenRequestIdentity, "requestId" | "createdAt">
): MarkSeenRequestIdentity {
  return {
    conversationId: CONV,
    creatorId: HOST,
    status: "pending",
    ...partial,
  };
}

describe("mark_group_up_requests_seen safety (SQL mirror)", () => {
  it("concurrent first marks: later tuple wins; no unique failure in merge model", () => {
    const earlier = { at: atE, id: idE };
    const later = { at: atF, id: idF };
    expect(resolveConcurrentFirstMarks(earlier, later)).toEqual(later);
    expect(resolveConcurrentFirstMarks(later, earlier)).toEqual(later);
  });

  it("existing newer watermark + stale mark: no rewind", () => {
    const result = applyMarkSeenUpsert({
      existing: { at: atF, id: idF },
      supplied: { at: atE, id: idE },
    });
    expect(result.advanced).toBe(false);
    expect(result.watermark).toEqual({ at: atF, id: idF });
  });

  it("same cursor twice: idempotent", () => {
    const cursor = { at: atE, id: idE };
    const first = applyMarkSeenUpsert({ existing: null, supplied: cursor });
    expect(first.advanced).toBe(true);
    const second = applyMarkSeenUpsert({
      existing: first.watermark,
      supplied: cursor,
    });
    expect(second.advanced).toBe(false);
    expect(second.watermark).toEqual(cursor);
  });

  it("accepted/declined request remains a valid mark cursor", () => {
    const through = { at: atE, id: idE };
    expect(
      isValidMarkSeenCursor({
        hostUserId: HOST,
        conversationId: CONV,
        through,
        request: req({
          requestId: idE,
          createdAt: atE,
          status: "accepted",
        }),
      })
    ).toBe(true);
    expect(
      isValidMarkSeenCursor({
        hostUserId: HOST,
        conversationId: CONV,
        through,
        request: req({
          requestId: idE,
          createdAt: atE,
          status: "declined",
        }),
      })
    ).toBe(true);
  });

  it("request id from another conversation: rejected", () => {
    expect(
      isValidMarkSeenCursor({
        hostUserId: HOST,
        conversationId: CONV,
        through: { at: atE, id: idE },
        request: req({
          requestId: idE,
          createdAt: atE,
          conversationId: OTHER_CONV,
        }),
      })
    ).toBe(false);
  });

  it("correct request id but wrong created_at: rejected", () => {
    expect(
      isValidMarkSeenCursor({
        hostUserId: HOST,
        conversationId: CONV,
        through: { at: atE, id: idE },
        request: req({
          requestId: idE,
          createdAt: atF,
        }),
      })
    ).toBe(false);
  });

  it("arbitrary future timestamp / random id: rejected", () => {
    expect(
      isValidMarkSeenCursor({
        hostUserId: HOST,
        conversationId: CONV,
        through: {
          at: "2099-01-01T00:00:00.000Z",
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
        request: null,
      })
    ).toBe(false);
  });

  it("mark-through E leaves F new (composite compare)", () => {
    const watermark = applyMarkSeenUpsert({
      existing: null,
      supplied: { at: atE, id: idE },
    }).watermark;
    expect(
      isRequestCursorAfter({ at: atF, id: idF }, watermark)
    ).toBe(true);
  });
});
