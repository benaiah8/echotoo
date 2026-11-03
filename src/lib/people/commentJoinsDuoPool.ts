/**
 * After a newly created contextual comment, join the sender's Duo pool
 * for that source post. Does not express interest or complete a match.
 * A same-id retry (created: false) must not join again.
 */
export async function joinDuoPoolAfterCreatedComment(input: {
  created: boolean;
  sourcePostId: string;
  join: (sourcePostId: string) => Promise<unknown>;
}): Promise<"skipped" | "joined" | "failed"> {
  if (!input.created) return "skipped";
  const sourcePostId = input.sourcePostId.trim();
  if (!sourcePostId) return "failed";
  try {
    await input.join(sourcePostId);
    return "joined";
  } catch {
    return "failed";
  }
}
