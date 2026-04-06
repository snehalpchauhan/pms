/** Parse API / DB numeric or string into hours, or undefined if missing/invalid. */
export function parseTaskHoursField(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

/** True when actual logged time exceeds a positive estimate (small tolerance for floats). */
export function isTaskOverInvested(estimatedHours: number | undefined, actualHours: number): boolean {
  if (estimatedHours == null || estimatedHours <= 0) return false;
  return actualHours > estimatedHours + 0.02;
}
