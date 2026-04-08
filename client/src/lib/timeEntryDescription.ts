/** Human-readable full text for a stored time log description (`[workType] note`). */

export function parseTimeEntryDescription(desc: string | null | undefined): {
  workType: string;
  note: string;
  fullText: string;
} {
  const raw = desc?.trim() ?? "";
  if (!raw) {
    return { workType: "", note: "", fullText: "—" };
  }
  const match = raw.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (match) {
    const workType = match[1] ?? "";
    const note = (match[2] ?? "").trim();
    const fullText = note ? `[${workType}] ${note}` : `[${workType}]`;
    return { workType, note, fullText };
  }
  return { workType: "", note: raw, fullText: raw };
}
