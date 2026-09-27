/**
 * Canonical Group Up opportunity for a conversation (matches G3 SQL rule).
 * 1) newest status=active (created_at DESC, id DESC)
 * 2) else newest historical any status
 */

export type GroupUpOppRef = {
  id: string;
  conversation_id: string;
  status: string;
  created_at: string;
};

function newer(a: GroupUpOppRef, b: GroupUpOppRef): boolean {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.id > b.id;
}

export function selectCanonicalGroupUpOpportunity(
  rows: readonly GroupUpOppRef[],
  conversationId: string
): GroupUpOppRef | null {
  const forConv = rows.filter((r) => r.conversation_id === conversationId);
  if (forConv.length === 0) return null;

  let bestActive: GroupUpOppRef | null = null;
  let bestAny: GroupUpOppRef | null = null;
  for (const row of forConv) {
    if (!bestAny || newer(row, bestAny)) bestAny = row;
    if (row.status === "active") {
      if (!bestActive || newer(row, bestActive)) bestActive = row;
    }
  }
  return bestActive ?? bestAny;
}
