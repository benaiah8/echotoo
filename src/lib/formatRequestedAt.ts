/**
 * Open Plan requester sent label — relative day, never a bare clock time.
 * - today → "Sent today"
 * - yesterday → "Sent yesterday"
 * - else → short month+day (e.g. "Nov 2")
 */
export function formatRequestedAt(
  iso: string,
  now: Date = new Date()
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(d)) / dayMs
  );

  if (diffDays === 0) return "Sent today";
  if (diffDays === 1) return "Sent yesterday";

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
