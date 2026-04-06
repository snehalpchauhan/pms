/**
 * Time entries store an optional "[Work type label] narrative" prefix so the UI can show work type
 * consistently (task Time tab, Timecards, exports).
 */

export const WORK_CATEGORIES = [
  { value: "feature", label: "Feature Development" },
  { value: "bug", label: "Bug Fix" },
  { value: "review", label: "Code Review" },
  { value: "rnd", label: "Research & Development" },
  { value: "docs", label: "Documentation" },
  { value: "testing", label: "Testing & QA" },
  { value: "meeting", label: "Meeting / Planning" },
  { value: "design", label: "Design" },
  { value: "devops", label: "DevOps / Deployment" },
  { value: "support", label: "Support" },
  { value: "refactor", label: "Refactoring" },
  { value: "other", label: "Other" },
] as const;

export type WorkCategoryValue = (typeof WORK_CATEGORIES)[number]["value"];

export function workCategoryLabelForValue(value: string): string {
  const row = WORK_CATEGORIES.find((c) => c.value === value);
  return row?.label ?? value;
}

/** Stored description format used across the app (matches Timecards "Log Time" dialog). */
export function buildStoredTimeDescription(categoryValue: string, note: string): string {
  const label = workCategoryLabelForValue(categoryValue);
  const n = note.trim();
  return n ? `[${label}] ${n}` : `[${label}]`;
}

export function parseStoredTimeDescription(description: string | null | undefined): {
  categoryLabel: string | null;
  note: string;
} {
  if (description == null || String(description).trim() === "") {
    return { categoryLabel: null, note: "" };
  }
  const s = String(description).trim();
  const m = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(s);
  if (m) {
    return { categoryLabel: m[1], note: m[2].trim() };
  }
  return { categoryLabel: null, note: s };
}

export function countWordsInText(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/** Minimum applies to the narrative note only (text after "[Work type]" if present). */
export function timeLogNoteWordCount(description: string | null | undefined): number {
  return countWordsInText(parseStoredTimeDescription(description).note);
}

export function timeLogNoteMeetsMinWords(description: string | null | undefined, minWords: number): boolean {
  if (minWords <= 0) return true;
  return timeLogNoteWordCount(description) >= minWords;
}
