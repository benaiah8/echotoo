/**
 * RSVP capacity for create/republish payloads.
 * New posts never enable RSVP. Published edits pass through historical
 * capacity unless a confirmed Event/Post type conversion runs.
 */
export function resolveCreateFlowPublishRsvpCapacity(args: {
  isEditMode: boolean;
  existingCapacity: number | null | undefined;
  confirmedTypeConversion?: "experience" | "hangout" | null;
}): number | null {
  if (!args.isEditMode) return null;
  if (args.confirmedTypeConversion) return null;
  return typeof args.existingCapacity === "number"
    ? args.existingCapacity
    : null;
}
