/**
 * People Connect hardening helpers (pure).
 * Keep Discover / My Plans RPC contracts elsewhere — this only classifies
 * errors and shapes diagnostics.
 */

export type PeopleConnectRpcName =
  | "connect_discover_pair_up"
  | "connect_profile_pair_up"
  | "express_pair_up_interest";

export type PeopleConnectErrorFields = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

const STALE_MESSAGE_PATTERNS = [
  /source is not eligible/i,
  /target is not an active pair up/i,
  /target opportunity not found/i,
  /no longer available/i,
  /expired/i,
  /not available in discover/i,
] as const;

/** Extract PostgREST / Error fields without throwing. */
export function extractPeopleConnectErrorFields(
  err: unknown
): PeopleConnectErrorFields {
  if (err instanceof Error) {
    const anyErr = err as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    return {
      message: err.message || "Unknown error",
      code: typeof anyErr.code === "string" ? anyErr.code : null,
      details: typeof anyErr.details === "string" ? anyErr.details : null,
      hint: typeof anyErr.hint === "string" ? anyErr.hint : null,
    };
  }
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    return {
      message:
        typeof o.message === "string" && o.message.trim()
          ? o.message
          : "Unknown error",
      code: typeof o.code === "string" ? o.code : null,
      details: typeof o.details === "string" ? o.details : null,
      hint: typeof o.hint === "string" ? o.hint : null,
    };
  }
  return { message: String(err), code: null, details: null, hint: null };
}

/** True when backend indicates the candidate/source should leave the deck. */
export function isPeopleConnectStaleEligibilityError(err: unknown): boolean {
  const { message, details, hint } = extractPeopleConnectErrorFields(err);
  const blob = `${message}\n${details ?? ""}\n${hint ?? ""}`;
  return STALE_MESSAGE_PATTERNS.some((re) => re.test(blob));
}

export type PeopleConnectUserToastKind = "stale" | "generic";

export function peopleConnectUserToastKind(
  err: unknown
): PeopleConnectUserToastKind {
  return isPeopleConnectStaleEligibilityError(err) ? "stale" : "generic";
}

/** Dev-only structured log payload (no tokens). */
export function buildPeopleConnectFailureLog(input: {
  rpc: PeopleConnectRpcName;
  err: unknown;
  opportunityId: string;
  sourcePostId: string;
  scope: string;
}): Record<string, string | null> {
  const fields = extractPeopleConnectErrorFields(input.err);
  return {
    rpc: input.rpc,
    message: fields.message,
    code: fields.code,
    details: fields.details,
    hint: fields.hint,
    opportunity_id: input.opportunityId,
    source_post_id: input.sourcePostId,
    scope: input.scope,
  };
}

export function logPeopleConnectFailureDev(
  input: Parameters<typeof buildPeopleConnectFailureLog>[0]
): void {
  if (!import.meta.env.DEV) return;
  console.warn("[people-connect]", buildPeopleConnectFailureLog(input));
}
