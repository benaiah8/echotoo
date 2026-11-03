/**
 * Profile Connect after interest is recorded.
 * A mutual match is connected only after completePairUpMatch succeeds.
 * Retry must call complete again and must not express interest.
 */
export async function settleProfileConnect<T>(input: {
  matched: boolean;
  opportunityId: string;
  markInterestOnly: () => void;
  markConnected: () => void;
  complete: (opportunityId: string) => Promise<T>;
}): Promise<
  | { status: "interest" }
  | { status: "completed"; completion: T }
  | { status: "needs_retry"; opportunityId: string }
> {
  if (!input.matched) {
    input.markConnected();
    return { status: "interest" };
  }

  const opportunityId = input.opportunityId.trim();
  input.markInterestOnly();
  try {
    const completion = await input.complete(opportunityId);
    input.markConnected();
    return { status: "completed", completion };
  } catch {
    return { status: "needs_retry", opportunityId };
  }
}

export async function retryProfileMatchCompletion<T>(input: {
  opportunityId: string;
  complete: (opportunityId: string) => Promise<T>;
  markConnected: () => void;
}): Promise<{ ok: true; completion: T } | { ok: false; opportunityId: string }> {
  const opportunityId = input.opportunityId.trim();
  try {
    const completion = await input.complete(opportunityId);
    input.markConnected();
    return { ok: true, completion };
  } catch {
    return { ok: false, opportunityId };
  }
}
