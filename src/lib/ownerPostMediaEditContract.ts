/**
 * Pure contract helpers for Edit post_media commit (local docs + unit tests).
 * Wired into owner Edit Save via editPublishedMedia + createFlowPublish.
 */

export const EDIT_VIDEO_OPS = ["ADD", "REPLACE", "REMOVE", "UNCHANGED"] as const;
export type EditVideoOp = (typeof EDIT_VIDEO_OPS)[number];

export const RETIRED_UNATTACHED_SORT_ORDER_START = 1000;

export type VideoEditPayload = {
  op: EditVideoOp;
  staged_media_id?: string | null;
  expected_attached_media_id?: string | null;
};

export type VideoEditValidationResult =
  | { ok: true; data: VideoEditPayload }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Validate client video_edit object before RPC (mirrors SQL contract).
 */
export function validateVideoEditPayload(
  raw: unknown,
): VideoEditValidationResult {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid video_edit: expected JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const opRaw = typeof obj.op === "string" ? obj.op.trim().toUpperCase() : "";
  if (!EDIT_VIDEO_OPS.includes(opRaw as EditVideoOp)) {
    return { ok: false, error: "Invalid video_edit.op" };
  }
  const op = opRaw as EditVideoOp;

  let staged: string | null = null;
  if (obj.staged_media_id != null && obj.staged_media_id !== "") {
    if (typeof obj.staged_media_id !== "string" || !isUuid(obj.staged_media_id)) {
      return { ok: false, error: "Invalid video_edit.staged_media_id" };
    }
    staged = obj.staged_media_id;
  }

  let expected: string | null = null;
  if (
    obj.expected_attached_media_id != null &&
    obj.expected_attached_media_id !== ""
  ) {
    if (
      typeof obj.expected_attached_media_id !== "string" ||
      !isUuid(obj.expected_attached_media_id)
    ) {
      return {
        ok: false,
        error: "Invalid video_edit.expected_attached_media_id",
      };
    }
    expected = obj.expected_attached_media_id;
  }

  if ((op === "ADD" || op === "REPLACE") && !staged) {
    return { ok: false, error: `${op} requires staged_media_id` };
  }
  if (op === "REMOVE" && staged) {
    return { ok: false, error: "REMOVE must not include staged_media_id" };
  }

  return {
    ok: true,
    data: {
      op,
      staged_media_id: staged,
      expected_attached_media_id: expected,
    },
  };
}

/**
 * Model REPLACE detach sort allocation without touching DB.
 * Never returns 0 while staging occupies unattached slot 0.
 */
export function allocateRetiredUnattachedSortOrder(
  occupiedUnattachedSortOrders: readonly number[],
  start: number = RETIRED_UNATTACHED_SORT_ORDER_START,
): number {
  const occupied = new Set(occupiedUnattachedSortOrders);
  let sort = start;
  while (occupied.has(sort) || sort === 0) {
    sort += 1;
  }
  return sort;
}

/**
 * Index-safe REPLACE step order (documentation + regression).
 * Detach former primary to retired sort BEFORE attaching staging at 0.
 */
export function replaceDetachAttachOrder(): readonly [
  "detach_old_to_retired_sort",
  "attach_staging_at_sort_0",
] {
  return ["detach_old_to_retired_sort", "attach_staging_at_sort_0"];
}
