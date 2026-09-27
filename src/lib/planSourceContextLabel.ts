import { formatPlanScheduleReadableLabel } from "./planScheduleReadableLabel";
import type { GroupUpSourceContext } from "./people/types";
import { getPostScheduleLabel } from "./postScheduleLabel";

/** Schedule line for pinned source-context UI (Group Up G1.3). */
export function getPlanSourceContextScheduleLabel(
  ctx: GroupUpSourceContext
): string | null {
  const occursAt = ctx.group_up_occurs_at?.trim();
  if (occursAt) {
    const instant = new Date(occursAt);
    if (!Number.isNaN(instant.getTime())) {
      return formatPlanScheduleReadableLabel({ instant }) ?? null;
    }
  }

  const result = getPostScheduleLabel({
    type: ctx.post_type,
    createdAt: new Date().toISOString(),
    selectedDates: ctx.selected_dates ?? [],
    isRecurring: ctx.is_recurring ?? false,
    recurrenceDays: ctx.recurrence_days ?? [],
  });
  const label = result.label?.trim();
  return label || null;
}
