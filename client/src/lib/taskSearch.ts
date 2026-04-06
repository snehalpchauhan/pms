import type { Task } from "@/lib/mockData";

function descriptionSearchText(htmlOrText: string): string {
  if (!htmlOrText) return "";
  const raw = htmlOrText.trim();
  if (!raw) return "";
  if (typeof document !== "undefined" && raw.includes("<")) {
    const d = document.createElement("div");
    d.innerHTML = raw;
    const text = (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim();
    return text.toLowerCase();
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Match task title and description (HTML stripped to text) against the query.
 * Query is split on whitespace; every token must appear somewhere in title or description.
 */
export function taskMatchesSearch(task: Task, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const title = (task.title || "").toLowerCase();
  const desc = descriptionSearchText(task.description || "");
  const haystack = `${title} ${desc}`;
  return tokens.every((t) => haystack.includes(t));
}
