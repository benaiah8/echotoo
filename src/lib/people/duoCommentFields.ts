/** Absent or non-boolean list values stay unknown. They are not a confirmed false. */
export function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}
