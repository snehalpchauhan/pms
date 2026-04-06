import type { Project } from "@/lib/mockData";

/**
 * Apply the user's saved sidebar order; projects missing from the list are appended alphabetically.
 */
export function sortProjectsBySidebarOrder(
  projects: Project[],
  order: number[] | null | undefined,
): Project[] {
  const byId = new Map(projects.map((p) => [Number(p.id), p]));
  const seen = new Set<number>();
  const ordered: Project[] = [];
  if (order?.length) {
    for (const rawId of order) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) continue;
      const p = byId.get(id);
      if (p) {
        ordered.push(p);
        seen.add(id);
      }
    }
  }
  const rest = projects
    .filter((p) => !seen.has(Number(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return [...ordered, ...rest];
}

/**
 * Collapsed rail chips: all projects when `quickMenuIds` is null/undefined; otherwise only listed ids (order follows `projects`).
 */
export function filterProjectsForQuickMenu(
  projects: Project[],
  quickMenuIds: number[] | null | undefined,
): Project[] {
  if (quickMenuIds == null) return projects;
  const set = new Set(quickMenuIds.map(Number));
  return projects.filter((p) => set.has(Number(p.id)));
}

/**
 * Persist null when every project is on the quick menu; otherwise explicit numeric ids (may be empty).
 */
export function quickMenuPreferencePayload(
  projects: Project[],
  checkedProjectIds: Set<string>,
): number[] | null {
  const all = projects.map((p) => p.id);
  if (all.length === 0) return null;
  if (all.every((id) => checkedProjectIds.has(id))) return null;
  return all.filter((id) => checkedProjectIds.has(id)).map((id) => Number(id));
}
