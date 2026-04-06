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

/**
 * Checked (quick menu) ids first, in the order they appear in `ids`; unchecked ids after, A–Z by name.
 */
export function normalizeOrderedIdsCheckedFirst(
  ids: string[],
  projects: Project[],
  quickChecked: Set<string>,
): string[] {
  const valid = new Set(projects.map((p) => p.id));
  const checked: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!valid.has(id) || !quickChecked.has(id) || seen.has(id)) continue;
    checked.push(id);
    seen.add(id);
  }
  for (const p of projects) {
    if (quickChecked.has(p.id) && !seen.has(p.id)) {
      checked.push(p.id);
      seen.add(p.id);
    }
  }
  const unchecked = projects
    .filter((p) => !quickChecked.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((p) => p.id);
  return [...checked, ...unchecked];
}

/** Build id list from saved sidebar order, then move unchecked projects to the bottom. */
export function orderedProjectIdsForDisplay(
  projects: Project[],
  sidebarOrder: number[] | null | undefined,
  quickChecked: Set<string>,
): string[] {
  const base = sortProjectsBySidebarOrder(projects, sidebarOrder ?? null).map((p) => p.id);
  return normalizeOrderedIdsCheckedFirst(base, projects, quickChecked);
}

/** Full project list: same as sidebar file order, but unchecked rows sit at the bottom (A–Z). */
export function partitionProjectsCheckedFirst(
  projectsOrdered: Project[],
  quickMenuIds: number[] | null | undefined,
): Project[] {
  if (quickMenuIds == null) return projectsOrdered;
  const quick = new Set(quickMenuIds.map(Number));
  const inQ = projectsOrdered.filter((p) => quick.has(Number(p.id)));
  const outQ = projectsOrdered
    .filter((p) => !quick.has(Number(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return [...inQ, ...outQ];
}
